import { db } from "@/db";
import { createId, createWriteKey } from "@/db/ids";
import { contact, deal, event, eventRule, site, visitor } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { count, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import { resolveSite } from "../lib/site";
import { checkInstallation, probeDomain } from "../lib/verify-install";

/** Accepts a pasted URL as well as a bare host. */
const domainSchema = z
	.string()
	.min(1)
	.max(253)
	.transform((value) =>
		value
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/.*$/, "")
			.replace(/:\d+$/, ""),
	)
	.refine((value) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value), {
		message: "Enter a valid domain, for example northgate.dev",
	});

async function siteStats(siteId: string) {
	const [events] = await db
		.select({ total: count(), last: max(event.createdAt) })
		.from(event)
		.where(eq(event.siteId, siteId));

	return {
		eventCount: events?.total ?? 0,
		lastEventAt: events?.last ? new Date(events.last) : null,
	};
}

export const sitesRouter = router({
	list: protectedProcedure.query(async () => {
		const rows = await db.select().from(site).orderBy(site.createdAt);

		return Promise.all(
			rows.map(async (row) => {
				const [events] = await db
					.select({ value: count() })
					.from(event)
					.where(eq(event.siteId, row.id));
				const [visitors] = await db
					.select({ value: count() })
					.from(visitor)
					.where(eq(visitor.siteId, row.id));

				return {
					...row,
					eventCount: events?.value ?? 0,
					visitorCount: visitors?.value ?? 0,
				};
			}),
		);
	}),

	current: protectedProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.query(async ({ input }) => resolveSite(input?.siteId)),

	/**
	 * Pre-flight for the add form: is the domain already tracked here, does it
	 * resolve, and is a Custora snippet already on the page?
	 *
	 * Finding an existing snippet usually means someone installed it before, or
	 * the site was removed and re-added — worth surfacing before creating a
	 * second key that would split the data.
	 */
	checkDomain: protectedProcedure
		.input(z.object({ domain: domainSchema }))
		.mutation(async ({ input }) => {
			const [existing] = await db
				.select({ id: site.id, name: site.name, writeKey: site.writeKey })
				.from(site)
				.where(eq(site.domain, input.domain))
				.limit(1);

			const probe = await probeDomain(input.domain);

			return {
				domain: input.domain,
				alreadyTracked: Boolean(existing),
				existingSiteId: existing?.id ?? null,
				existingSiteName: existing?.name ?? null,
				/** True when the snippet on the page belongs to the site we already have. */
				snippetMatchesExisting: Boolean(
					existing && probe.existingSnippetKey === existing.writeKey,
				),
				...probe,
			};
		}),

	/**
	 * Fetches the live site and reports whether the snippet is actually deployed
	 * and reporting. Combines two independent signals because either alone lies:
	 * HTML misses tag-manager and SPA injection, and events miss a fresh install.
	 */
	verify: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.mutation(async ({ input }) => {
			const [row] = await db
				.select()
				.from(site)
				.where(eq(site.id, input.siteId))
				.limit(1);
			if (!row)
				throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

			const stats = await siteStats(row.id);
			const result = await checkInstallation({
				domain: row.domain,
				writeKey: row.writeKey,
				eventCount: stats.eventCount,
				lastEventAt: stats.lastEventAt,
			});

			await db
				.update(site)
				.set({ lastCheckedAt: new Date(), lastCheckStatus: result.status })
				.where(eq(site.id, row.id));

			return result;
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(120),
				domain: domainSchema,
			}),
		)
		.mutation(async ({ input }) => {
			const [existing] = await db
				.select({ id: site.id, name: site.name })
				.from(site)
				.where(eq(site.domain, input.domain))
				.limit(1);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `${input.domain} is already tracked as "${existing.name}". Adding it twice would split its visitors across two keys.`,
				});
			}

			const [created] = await db
				.insert(site)
				.values({
					id: createId("site"),
					name: input.name,
					domain: input.domain,
					writeKey: createWriteKey(),
				})
				.returning();
			return created;
		}),

	/** Invalidates the old snippet — the site stops reporting until it is updated. */
	rotateKey: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.mutation(async ({ input }) => {
			const [updated] = await db
				.update(site)
				.set({
					writeKey: createWriteKey(),
					lastCheckedAt: null,
					lastCheckStatus: null,
				})
				.where(eq(site.id, input.siteId))
				.returning();
			return updated;
		}),

	/**
	 * What deleting this site would destroy. Shown in the confirmation so the
	 * decision is made against real numbers rather than a generic warning.
	 */
	deletionImpact: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.query(async ({ input }) => {
			const [row] = await db
				.select({ domain: site.domain })
				.from(site)
				.where(eq(site.id, input.siteId))
				.limit(1);
			if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

			const scoped = (table: typeof event | typeof visitor | typeof contact | typeof deal | typeof eventRule) =>
				db
					.select({ value: count() })
					.from(table)
					.where(eq(table.siteId, input.siteId));

			const [events, visitors, contacts, deals, rules] = await Promise.all([
				scoped(event),
				scoped(visitor),
				scoped(contact),
				scoped(deal),
				scoped(eventRule),
			]);

			return {
				domain: row.domain,
				events: events[0]?.value ?? 0,
				visitors: visitors[0]?.value ?? 0,
				contacts: contacts[0]?.value ?? 0,
				deals: deals[0]?.value ?? 0,
				rules: rules[0]?.value ?? 0,
			};
		}),

	/**
	 * Deletes a site and, by foreign-key cascade, every visitor, session, event,
	 * touchpoint, contact, deal and rule belonging to it. There is no undo and no
	 * soft delete: the attribution history for that domain is gone.
	 *
	 * The domain has to be typed back. The check lives here rather than only in
	 * the dialog, because a confirmation the client can skip is not one.
	 */
	remove: protectedProcedure
		.input(z.object({ siteId: z.string(), confirmDomain: z.string() }))
		.mutation(async ({ input }) => {
			const [row] = await db
				.select({ id: site.id, name: site.name, domain: site.domain })
				.from(site)
				.where(eq(site.id, input.siteId))
				.limit(1);
			if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });

			if (input.confirmDomain.trim().toLowerCase() !== row.domain.toLowerCase()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Type ${row.domain} exactly to confirm deletion.`,
				});
			}

			const [events] = await db
				.select({ value: count() })
				.from(event)
				.where(eq(event.siteId, row.id));

			await db.delete(site).where(eq(site.id, row.id));

			return { name: row.name, domain: row.domain, events: events?.value ?? 0 };
		}),

	/** Most recent events for a site, used to confirm data is flowing after install. */
	recentActivity: protectedProcedure
		.input(
			z.object({
				siteId: z.string(),
				limit: z.number().min(1).max(20).default(5),
			}),
		)
		.query(async ({ input }) => {
			return db
				.select({
					id: event.id,
					type: event.type,
					name: event.name,
					path: event.path,
					createdAt: event.createdAt,
				})
				.from(event)
				.where(eq(event.siteId, input.siteId))
				.orderBy(desc(event.createdAt))
				.limit(input.limit);
		}),
});
