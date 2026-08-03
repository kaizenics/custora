import { db } from "@/db";
import { createId } from "@/db/ids";
import {
	RULE_MATCHERS,
	RULE_TRIGGERS,
	event,
	eventRule,
} from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { rangeSchema, rangeStart } from "../lib/range";
import { zeroFillByDay } from "../lib/series";
import { resolveSite } from "../lib/site";

const patternSchema = z.string().min(1).max(500);

const ruleInput = z.object({
	name: z.string().min(1).max(120),
	trigger: z.enum(RULE_TRIGGERS),
	matcher: z.enum(RULE_MATCHERS),
	pattern: patternSchema,
});

/**
 * A rule's pattern is interpolated into querySelector in the browser. Invalid
 * CSS is caught there, but rejecting it here means a typo never reaches live
 * traffic in the first place.
 */
function assertUsablePattern(matcher: string, pattern: string) {
	if (matcher !== "selector") return;
	// Cheap structural checks — the DOM is not available on the server.
	const balanced =
		(pattern.match(/\[/g)?.length ?? 0) === (pattern.match(/\]/g)?.length ?? 0) &&
		(pattern.match(/\(/g)?.length ?? 0) === (pattern.match(/\)/g)?.length ?? 0);
	if (!balanced) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "That CSS selector has unbalanced brackets.",
		});
	}
}

export const rulesRouter = router({
	/**
	 * Rules with how many events each has produced, so a rule that never matches
	 * anything is obvious rather than silently doing nothing.
	 */
	list: protectedProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.query(async ({ input }) => {
			const site = await resolveSite(input?.siteId);

			return db
				.select({
					id: eventRule.id,
					name: eventRule.name,
					trigger: eventRule.trigger,
					matcher: eventRule.matcher,
					pattern: eventRule.pattern,
					enabled: eventRule.enabled,
					createdAt: eventRule.createdAt,
					fireCount: sql<number>`
						coalesce((
							select count(*) from event e
							where e.site_id = "event_rule"."site_id"
							  and e.name = "event_rule"."name"
						), 0)
					`.as("fire_count"),
				})
				.from(eventRule)
				.where(eq(eventRule.siteId, site.id))
				.orderBy(desc(eventRule.createdAt));
		}),

	create: protectedProcedure
		.input(ruleInput.extend({ siteId: z.string().optional() }))
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			assertUsablePattern(input.matcher, input.pattern);

			const [existing] = await db
				.select({ id: eventRule.id })
				.from(eventRule)
				.where(
					and(eq(eventRule.siteId, site.id), eq(eventRule.name, input.name)),
				)
				.limit(1);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `A rule named "${input.name}" already exists. Two rules with one name would be indistinguishable in reports.`,
				});
			}

			const [created] = await db
				.insert(eventRule)
				.values({
					id: createId("rule"),
					siteId: site.id,
					name: input.name,
					trigger: input.trigger,
					matcher: input.matcher,
					pattern: input.pattern,
				})
				.returning();
			return created;
		}),

	update: protectedProcedure
		.input(ruleInput.partial().extend({ ruleId: z.string() }))
		.mutation(async ({ input }) => {
			const { ruleId, ...patch } = input;
			if (patch.matcher && patch.pattern) {
				assertUsablePattern(patch.matcher, patch.pattern);
			}

			const [updated] = await db
				.update(eventRule)
				.set(patch)
				.where(eq(eventRule.id, ruleId))
				.returning();
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
			}
			return updated;
		}),

	/** Disabling keeps the historical events but stops the rule matching. */
	setEnabled: protectedProcedure
		.input(z.object({ ruleId: z.string(), enabled: z.boolean() }))
		.mutation(async ({ input }) => {
			const [updated] = await db
				.update(eventRule)
				.set({ enabled: input.enabled })
				.where(eq(eventRule.id, input.ruleId))
				.returning();
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
			}
			return updated;
		}),

	remove: protectedProcedure
		.input(z.object({ ruleId: z.string() }))
		.mutation(async ({ input }) => {
			const [removed] = await db
				.delete(eventRule)
				.where(eq(eventRule.id, input.ruleId))
				.returning({ id: eventRule.id, name: eventRule.name });
			if (!removed) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
			}
			// Events already recorded under this name are deliberately kept — the
			// rule is the recipe, not the data.
			return removed;
		}),

	/**
	 * Daily fires per rule, for the overview chart.
	 *
	 * Capped at the five busiest rules with the rest folded into "Other" — past
	 * that the reader cannot tell the bands apart by colour anyway, and adding
	 * more hues would make it worse rather than better.
	 */
	series: protectedProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = rangeStart(input.range);

			const names = await db
				.select({ name: eventRule.name })
				.from(eventRule)
				.where(eq(eventRule.siteId, site.id));
			if (!names.length) return { series: [], names: [] as string[] };

			const ruleNames = names.map((row) => row.name);

			const rows = await db.all<{ day: string; type: string; total: number }>(sql`
				SELECT
					strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day,
					name AS type,
					COUNT(*) AS total
				FROM event
				WHERE site_id = ${site.id}
				  AND created_at >= ${since}
				  AND name IN (${sql.join(ruleNames.map((n) => sql`${n}`), sql`, `)})
				GROUP BY day, name
				ORDER BY day
			`);

			// Busiest first, so the cap keeps what the reader cares about.
			const totals = new Map<string, number>();
			for (const row of rows) {
				totals.set(row.type, (totals.get(row.type) ?? 0) + Number(row.total));
			}
			const ranked = [...totals.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([name]) => name);
			const top = ranked.slice(0, 5);
			const rest = new Set(ranked.slice(5));

			const folded = rows.map((row) => ({
				...row,
				type: rest.has(row.type) ? "Other" : row.type,
			}));
			const categories = rest.size ? [...top, "Other"] : top;

			return {
				series: zeroFillByDay(folded, since, categories),
				names: categories,
			};
		}),

	/** Distinct event names already seen, to spot rules duplicating existing tracking. */
	existingNames: protectedProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.query(async ({ input }) => {
			const site = await resolveSite(input?.siteId);
			return db
				.select({ name: event.name, total: count() })
				.from(event)
				.where(and(eq(event.siteId, site.id), eq(event.type, "click")))
				.groupBy(event.name)
				.orderBy(desc(count()))
				.limit(20);
		}),
});
