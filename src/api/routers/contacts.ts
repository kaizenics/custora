import { db } from "@/db";
import { createId } from "@/db/ids";
import {
	CONTACT_STATUSES,
	contact,
	deal,
	event,
	touchpoint,
	visitor,
} from "@/db/schema";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	like,
	or,
	sql,
	sum,
} from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { rangeSchema, rangeStart } from "../lib/range";
import {
	normalizeEmail,
	normalizePhone,
	sha256,
} from "@/server/collector/util";
import { resolveSite } from "../lib/site";

export const contactsRouter = router({
	list: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				range: rangeSchema,
				status: z.enum(CONTACT_STATUSES).optional(),
				search: z.string().max(200).optional(),
				page: z.number().min(0).default(0),
				limit: z.number().min(1).max(100).default(25),
			}),
		)
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));

			const filters = [
				eq(contact.siteId, site.id),
				gte(contact.createdAt, since),
			];
			if (input.status) filters.push(eq(contact.status, input.status));
			if (input.search) {
				const term = `%${input.search}%`;
				const match = or(
					like(contact.email, term),
					like(contact.name, term),
					like(contact.company, term),
				);
				if (match) filters.push(match);
			}

			const where = and(...filters);

			const [total] = await db
				.select({ value: count() })
				.from(contact)
				.where(where);

			const items = await db
				.select({
					id: contact.id,
					email: contact.email,
					name: contact.name,
					company: contact.company,
					status: contact.status,
					firstTouchSource: contact.firstTouchSource,
					firstTouchCampaign: contact.firstTouchCampaign,
					lastTouchSource: contact.lastTouchSource,
					createdAt: contact.createdAt,
					// The outer column is written out in full rather than interpolated:
					// drizzle renders `${contact.id}` as a bare "id", which a correlated
					// subquery silently resolves against its own table instead.
					dealValueCents: sql<number>`
            coalesce((
              select sum(d.value_cents) from deal d
              where d.contact_id = "contact"."id" and d.stage = 'won'
            ), 0)
          `.as("deal_value_cents"),
					touchCount: sql<number>`
            coalesce((
              select count(*) from touchpoint t where t.contact_id = "contact"."id"
            ), 0)
          `.as("touch_count"),
				})
				.from(contact)
				.where(where)
				.orderBy(desc(contact.createdAt))
				.limit(input.limit)
				.offset(input.page * input.limit);

			return {
				items,
				total: total?.value ?? 0,
				page: input.page,
				pageCount: Math.max(1, Math.ceil((total?.value ?? 0) / input.limit)),
			};
		}),

	countsByStatus: protectedProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));

			const rows = await db
				.select({ status: contact.status, total: count() })
				.from(contact)
				.where(and(eq(contact.siteId, site.id), gte(contact.createdAt, since)))
				.groupBy(contact.status);

			return Object.fromEntries(
				rows.map((row) => [row.status, row.total]),
			) as Record<string, number>;
		}),

	/**
	 * The full journey for one person: every marketing touch and every tracked
	 * interaction, including everything that happened before they were known.
	 *
	 * This view is the reason the tracking spine exists — it is the thing Google
	 * Analytics structurally cannot show you.
	 */
	get: protectedProcedure
		.input(z.object({ contactId: z.string() }))
		.query(async ({ input }) => {
			const [row] = await db
				.select()
				.from(contact)
				.where(eq(contact.id, input.contactId))
				.limit(1);
			if (!row)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Contact not found",
				});

			const [touches, events, deals, devices, revenue] = await Promise.all([
				db
					.select()
					.from(touchpoint)
					.where(eq(touchpoint.contactId, row.id))
					.orderBy(asc(touchpoint.createdAt)),
				db
					.select({
						id: event.id,
						type: event.type,
						name: event.name,
						path: event.path,
						url: event.url,
						props: event.props,
						createdAt: event.createdAt,
					})
					.from(event)
					.where(eq(event.contactId, row.id))
					.orderBy(asc(event.createdAt))
					.limit(500),
				db
					.select()
					.from(deal)
					.where(eq(deal.contactId, row.id))
					.orderBy(desc(deal.createdAt)),
				db
					.select({ value: count() })
					.from(visitor)
					.where(eq(visitor.contactId, row.id)),
				db
					.select({ value: sum(deal.valueCents) })
					.from(deal)
					.where(and(eq(deal.contactId, row.id), eq(deal.stage, "won"))),
			]);

			const firstTouch = touches[0] ?? null;
			const lastTouch = touches[touches.length - 1] ?? null;

			/**
			 * The gap a pixel-based tool cannot see. On a long sales cycle this is
			 * routinely weeks, which is exactly where third-party cookies expire.
			 */
			const daysToConvert = firstTouch
				? Math.round(
						(row.createdAt.getTime() - firstTouch.createdAt.getTime()) /
							86_400_000,
					)
				: null;

			return {
				contact: row,
				touches,
				events,
				deals,
				deviceCount: devices[0]?.value ?? 0,
				revenueCents: Number(revenue[0]?.value ?? 0),
				firstTouch,
				lastTouch,
				daysToConvert,
			};
		}),

	updateStatus: protectedProcedure
		.input(
			z.object({ contactId: z.string(), status: z.enum(CONTACT_STATUSES) }),
		)
		.mutation(async ({ input }) => {
			const [updated] = await db
				.update(contact)
				.set({ status: input.status })
				.where(eq(contact.id, input.contactId))
				.returning();
			if (!updated)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Contact not found",
				});
			return updated;
		}),

	/**
	 * Adds a contact by hand — someone who phoned in, or a customer who predates
	 * the tracking.
	 *
	 * Email or phone, at least one. Requiring email would be wrong for a business
	 * whose leads arrive as calls: you know the number and often nothing else.
	 *
	 * Both are normalised and hashed with the collector's own helpers rather than
	 * a local copy, because these hashes are the keys identity stitching matches
	 * on. A different normalisation here would create a contact that can never be
	 * joined to the visitor who later submits a form with the same details.
	 */
	create: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				email: z.email().optional().or(z.literal("")),
				phone: z.string().max(40).optional(),
				name: z.string().max(200).optional(),
				company: z.string().max(200).optional(),
				status: z.enum(CONTACT_STATUSES).default("lead"),
			}),
		)
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);

			/**
			 * Checked here rather than as a zod refinement: a schema failure is
			 * serialised as the raw issues array, which reaches the user as a JSON
			 * blob in a toast. This is a rule worth stating in a sentence.
			 */
			if (!input.email?.trim() && !input.phone?.trim()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Enter an email address or a phone number.",
				});
			}

			const email = input.email?.trim() ? normalizeEmail(input.email) : null;
			const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
			const emailHash = email ? await sha256(email) : null;
			const phoneHash = phone ? await sha256(phone) : null;

			/**
			 * Checked rather than left to the unique index: the constraint fires as
			 * an opaque SQLITE_CONSTRAINT, and the useful answer is which existing
			 * contact this is, so the caller can open it instead of guessing.
			 */
			const clauses = [];
			if (emailHash) clauses.push(eq(contact.emailHash, emailHash));
			if (phoneHash) clauses.push(eq(contact.phoneHash, phoneHash));

			const [existing] = await db
				.select({ id: contact.id, email: contact.email, phone: contact.phone })
				.from(contact)
				.where(
					and(
						eq(contact.siteId, site.id),
						clauses.length > 1 ? or(...clauses) : clauses[0],
					),
				)
				.limit(1);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `${existing.email ?? existing.phone} is already a contact here. Open it rather than adding a second record — two records for one person split their history.`,
					cause: existing.id,
				});
			}

			const [created] = await db
				.insert(contact)
				.values({
					id: createId("con"),
					siteId: site.id,
					email,
					emailHash,
					phone,
					phoneHash,
					name: input.name?.trim() || null,
					company: input.company?.trim() || null,
					status: input.status,
				})
				.returning();

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not create the contact.",
				});
			}
			return created;
		}),
});
