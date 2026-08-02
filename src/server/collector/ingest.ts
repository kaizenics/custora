import { db } from "@/db";
import { createId } from "@/db/ids";
import {
	contact,
	event,
	identityLink,
	site,
	touchpoint,
	visitor,
	visitSession,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { originAllowed } from "./guard";
import {
	channelFromReferrer,
	classifyUserAgent,
	hostOf,
	normalizeEmail,
	normalizePhone,
	sha256,
} from "./util";

/** A visit ends after this much inactivity, not when the browser closes. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export const traitsSchema = z.object({
	email: z.string().max(320).optional(),
	phone: z.string().max(40).optional(),
	name: z.string().max(200).optional(),
	company: z.string().max(200).optional(),
});

export const attributionSchema = z.object({
	source: z.string().max(200).optional(),
	medium: z.string().max(200).optional(),
	campaign: z.string().max(200).optional(),
	term: z.string().max(200).optional(),
	content: z.string().max(200).optional(),
	click_id: z.string().max(400).optional(),
	click_id_provider: z.string().max(40).optional(),
	landing_url: z.string().max(2000).optional(),
	referrer: z.string().max(2000).nullish(),
	at: z.number().optional(),
});

export const eventSchema = z.object({
	k: z.string().min(8).max(80),
	t: z.enum(["pageview", "click", "form_submit", "identify", "custom"]),
	n: z.string().max(300).nullish(),
	u: z.string().max(2000).nullish(),
	p: z.string().max(1000).nullish(),
	r: z.string().max(2000).nullish(),
	props: z.record(z.string(), z.unknown()).nullish(),
	traits: traitsSchema.nullish(),
	ctx: attributionSchema.nullish(),
	sw: z.number().nullish(),
	tz: z.string().max(80).nullish(),
	ts: z.number().optional(),
	value: z.number().nullish(),
	currency: z.string().length(3).nullish(),
});

export type EventPayload = z.infer<typeof eventSchema>;

export type IngestMeta = {
	visitorId: string | null;
	userAgent: string | null;
	country: string | null;
	origin?: string | null;
	referer?: string | null;
};

export type IngestResult =
	| { ok: true; visitorId: string; sessionId: string; contactId: string | null }
	| { ok: false; reason: "unknown_key" | "bot" | "foreign_origin" };

/**
 * The write path.
 *
 * Everything here is a small indexed statement, so it runs inline. When event
 * volume justifies it, this is the seam to move behind a queue: accept, append
 * to a durable buffer, return 204, and drain into these same functions.
 */
export async function ingest(
	payload: EventPayload,
	meta: IngestMeta,
): Promise<IngestResult> {
	const [siteRow] = await db
		.select()
		.from(site)
		.where(eq(site.writeKey, payload.k))
		.limit(1);
	if (!siteRow) return { ok: false, reason: "unknown_key" };

	/**
	 * The write key says which site this claims to be; the origin says where the
	 * request actually came from. Rejecting a mismatch stops a key lifted from
	 * one site's source being used to write events against it from elsewhere.
	 */
	if (!originAllowed(meta.origin ?? undefined, meta.referer ?? undefined, siteRow.domain)) {
		return { ok: false, reason: "foreign_origin" };
	}

	const device = classifyUserAgent(meta.userAgent);
	if (device === "bot") return { ok: false, reason: "bot" };

	const at = new Date(payload.ts ?? Date.now());
	const visitorRow = await resolveVisitor(siteRow.id, meta.visitorId, at);
	const sessionRow = await resolveSession(
		siteRow.id,
		visitorRow.id,
		payload,
		meta,
		device,
		at,
	);

	await recordTouchpoint(siteRow.id, visitorRow, sessionRow, payload);

	const eventId = createId("evt");
	await db.insert(event).values({
		id: eventId,
		siteId: siteRow.id,
		visitorId: visitorRow.id,
		sessionId: sessionRow.id,
		contactId: visitorRow.contactId,
		type: payload.t,
		name: payload.n ?? null,
		path: payload.p ?? null,
		url: payload.u ?? null,
		referrer: payload.r ?? null,
		props: (payload.props as Record<string, unknown> | null) ?? null,
		value: payload.value ?? null,
		currency: payload.currency ?? null,
		createdAt: at,
	});

	await db
		.update(visitSession)
		.set({ lastEventAt: at, eventCount: sql`${visitSession.eventCount} + 1` })
		.where(eq(visitSession.id, sessionRow.id));

	await db
		.update(visitor)
		.set({ lastSeenAt: at })
		.where(eq(visitor.id, visitorRow.id));

	let contactId = visitorRow.contactId;
	if (payload.traits && (payload.traits.email || payload.traits.phone)) {
		contactId = await stitchIdentity(
			siteRow.id,
			visitorRow.id,
			payload.traits,
			at,
		);
	}

	return {
		ok: true,
		visitorId: visitorRow.id,
		sessionId: sessionRow.id,
		contactId,
	};
}

async function resolveVisitor(
	siteId: string,
	cookieId: string | null,
	at: Date,
) {
	if (cookieId) {
		const [existing] = await db
			.select()
			.from(visitor)
			.where(and(eq(visitor.id, cookieId), eq(visitor.siteId, siteId)))
			.limit(1);
		if (existing) return existing;
	}

	const id = createId("vis");
	const [created] = await db
		.insert(visitor)
		.values({ id, siteId, firstSeenAt: at, lastSeenAt: at })
		.returning();
	if (!created) throw new Error("Failed to create visitor");
	return created;
}

async function resolveSession(
	siteId: string,
	visitorId: string,
	payload: EventPayload,
	meta: IngestMeta,
	device: string,
	at: Date,
) {
	const [latest] = await db
		.select()
		.from(visitSession)
		.where(eq(visitSession.visitorId, visitorId))
		.orderBy(sql`${visitSession.lastEventAt} desc`)
		.limit(1);

	if (
		latest &&
		at.getTime() - latest.lastEventAt.getTime() < SESSION_TIMEOUT_MS
	) {
		return latest;
	}

	const id = createId("ses");
	const [created] = await db
		.insert(visitSession)
		.values({
			id,
			siteId,
			visitorId,
			startedAt: at,
			lastEventAt: at,
			landingPath: payload.p ?? null,
			referrer: payload.r ?? null,
			referrerHost: hostOf(payload.r),
			userAgent: meta.userAgent,
			device,
			country: meta.country,
			eventCount: 0,
		})
		.returning();
	if (!created) throw new Error("Failed to create session");
	return created;
}

/**
 * One touchpoint per session, written only when the visit actually carries
 * provenance. Raw and never updated — attribution models read these rows and
 * decide for themselves which touch gets the credit.
 */
async function recordTouchpoint(
	siteId: string,
	visitorRow: typeof visitor.$inferSelect,
	sessionRow: typeof visitSession.$inferSelect,
	payload: EventPayload,
) {
	const [existing] = await db
		.select({ id: touchpoint.id })
		.from(touchpoint)
		.where(eq(touchpoint.sessionId, sessionRow.id))
		.limit(1);
	if (existing) return;

	const ctx = payload.ctx;
	const hasProvenance = Boolean(ctx?.source || ctx?.click_id || ctx?.campaign);

	let source = ctx?.source ?? null;
	let medium = ctx?.medium ?? null;

	if (!hasProvenance) {
		const derived = channelFromReferrer(payload.r ?? null, hostOf(payload.u));
		// Internal navigation — nothing to attribute.
		if (!derived) return;
		source = derived.source;
		medium = derived.medium;
	}

	await db.insert(touchpoint).values({
		id: createId("tp"),
		siteId,
		visitorId: visitorRow.id,
		sessionId: sessionRow.id,
		contactId: visitorRow.contactId,
		source,
		medium,
		campaign: ctx?.campaign ?? null,
		term: ctx?.term ?? null,
		content: ctx?.content ?? null,
		clickId: ctx?.click_id ?? null,
		clickIdProvider: ctx?.click_id_provider ?? null,
		landingUrl: ctx?.landing_url ?? payload.u ?? null,
		referrer: ctx?.referrer ?? payload.r ?? null,
		createdAt: sessionRow.startedAt,
	});
}

/**
 * Anonymous device becomes a known person.
 *
 * This is the part of the system everything else depends on, so it does the
 * unglamorous work properly: match deterministically on a hash, backfill the
 * visitor's entire prior history onto the contact, and record what happened in
 * identity_link so a wrong-looking report can be traced back.
 */
export async function stitchIdentity(
	siteId: string,
	visitorId: string,
	traits: z.infer<typeof traitsSchema>,
	at: Date,
): Promise<string | null> {
	const email = traits.email ? normalizeEmail(traits.email) : null;
	const phone = traits.phone ? normalizePhone(traits.phone) : null;
	if (!email && !phone) return null;

	const emailHash = email ? await sha256(email) : null;
	const phoneHash = phone ? await sha256(phone) : null;

	let contactRow: typeof contact.$inferSelect | undefined;

	if (emailHash) {
		[contactRow] = await db
			.select()
			.from(contact)
			.where(and(eq(contact.siteId, siteId), eq(contact.emailHash, emailHash)))
			.limit(1);
	}
	if (!contactRow && phoneHash) {
		[contactRow] = await db
			.select()
			.from(contact)
			.where(and(eq(contact.siteId, siteId), eq(contact.phoneHash, phoneHash)))
			.limit(1);
	}

	if (contactRow) {
		// Fill gaps without clobbering anything already known.
		await db
			.update(contact)
			.set({
				email: contactRow.email ?? email,
				emailHash: contactRow.emailHash ?? emailHash,
				phone: contactRow.phone ?? phone,
				phoneHash: contactRow.phoneHash ?? phoneHash,
				name: contactRow.name ?? traits.name ?? null,
				company: contactRow.company ?? traits.company ?? null,
			})
			.where(eq(contact.id, contactRow.id));
	} else {
		const id = createId("con");
		[contactRow] = await db
			.insert(contact)
			.values({
				id,
				siteId,
				email,
				emailHash,
				phone,
				phoneHash,
				name: traits.name ?? null,
				company: traits.company ?? null,
				status: "lead",
				createdAt: at,
			})
			.returning();
	}

	if (!contactRow) return null;
	const contactId = contactRow.id;

	const [alreadyLinked] = await db
		.select({ id: identityLink.id })
		.from(identityLink)
		.where(
			and(
				eq(identityLink.visitorId, visitorId),
				eq(identityLink.contactId, contactId),
			),
		)
		.limit(1);

	if (alreadyLinked) {
		await db
			.update(visitor)
			.set({ contactId })
			.where(eq(visitor.id, visitorId));
		return contactId;
	}

	// Backfill: every anonymous event and touch this device produced before the
	// person was known now belongs to them. Without this the ad click that
	// started the journey stays orphaned.
	const backfilled = await db
		.update(event)
		.set({ contactId })
		.where(and(eq(event.visitorId, visitorId), isNull(event.contactId)))
		.returning({ id: event.id });

	await db
		.update(touchpoint)
		.set({ contactId })
		.where(
			and(eq(touchpoint.visitorId, visitorId), isNull(touchpoint.contactId)),
		);

	await db.update(visitor).set({ contactId }).where(eq(visitor.id, visitorId));

	await db.insert(identityLink).values({
		id: createId("idl"),
		siteId,
		visitorId,
		contactId,
		method: email ? "email" : "phone",
		backfilledEvents: backfilled.length,
		createdAt: at,
	});

	await refreshContactAttribution(contactId);

	return contactId;
}

/**
 * Denormalises first and last touch onto the contact so list views stay a single
 * query. The touchpoint rows remain the source of truth.
 */
export async function refreshContactAttribution(contactId: string) {
	const touches = await db
		.select({
			source: touchpoint.source,
			campaign: touchpoint.campaign,
			createdAt: touchpoint.createdAt,
		})
		.from(touchpoint)
		.where(eq(touchpoint.contactId, contactId))
		.orderBy(touchpoint.createdAt);

	const first = touches[0];
	const last = touches[touches.length - 1];
	if (!first || !last) return;

	await db
		.update(contact)
		.set({
			firstTouchSource: first.source,
			firstTouchCampaign: first.campaign,
			lastTouchSource: last.source,
			lastTouchCampaign: last.campaign,
		})
		.where(eq(contact.id, contactId));
}
