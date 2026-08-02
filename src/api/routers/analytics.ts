import { db } from "@/db";
import {
	contact,
	deal,
	event,
	touchpoint,
	visitSession,
} from "@/db/schema";
import {
	and,
	count,
	countDistinct,
	eq,
	gte,
	isNotNull,
	sql,
	sum,
} from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { rangeSchema, rangeStart } from "../lib/range";
import { resolveSite } from "../lib/site";

/**
 * Attribution is computed here, at read time, from the raw touchpoint rows.
 * Nothing is baked in at write time — switching models is a query change, not a
 * reprocessing job.
 */
export const attributionModelSchema = z.enum(["first", "last"]).default("last");
export type AttributionModel = z.infer<typeof attributionModelSchema>;

const baseInput = z.object({
	siteId: z.string().optional(),
	range: rangeSchema,
});

type ChannelRow = {
	source: string | null;
	medium: string | null;
	campaign: string | null;
	leads: number;
	customers: number;
	deals_won: number;
	revenue_cents: number;
};

type SeriesRow = {
	day: string;
	visitors: number;
	pageviews: number;
};

type LeadSeriesRow = {
	day: string;
	leads: number;
};

export const analyticsRouter = router({
	/** Headline numbers for the overview cards. */
	summary: protectedProcedure.input(baseInput).query(async ({ input }) => {
		const site = await resolveSite(input.siteId);
		const since = new Date(rangeStart(input.range));

		/**
		 * Six separate counts became three statements. Each one scans the rows it
		 * counts and Turso bills per query, so measures over the same table are
		 * folded into one pass with conditional aggregation rather than asked for
		 * individually.
		 */
		const [eventTotals, sessionTotals, leadTotals, dealTotals] =
			await Promise.all([
				db
					.select({
						visitors: countDistinct(event.visitorId),
						pageviews: sql<number>`sum(case when ${event.type} = 'pageview' then 1 else 0 end)`,
					})
					.from(event)
					.where(and(eq(event.siteId, site.id), gte(event.createdAt, since))),
				db
					.select({ value: count() })
					.from(visitSession)
					.where(
						and(
							eq(visitSession.siteId, site.id),
							gte(visitSession.startedAt, since),
						),
					),
				db
					.select({ value: count() })
					.from(contact)
					.where(and(eq(contact.siteId, site.id), gte(contact.createdAt, since))),
				// Both stages in one grouped pass instead of a query each.
				db
					.select({
						stage: deal.stage,
						deals: count(),
						revenue: sum(deal.valueCents),
					})
					.from(deal)
					.where(eq(deal.siteId, site.id))
					.groupBy(deal.stage),
			]);

		const byStage = new Map(dealTotals.map((row) => [row.stage, row]));
		const won = byStage.get("won");
		const openDeals = byStage.get("open");
		const visitors = { value: eventTotals[0]?.visitors ?? 0 };
		const pageviews = { value: Number(eventTotals[0]?.pageviews ?? 0) };
		const sessions = sessionTotals[0];
		const leads = leadTotals[0];

		const visitorCount = visitors?.value ?? 0;
		const leadCount = leads?.value ?? 0;

		return {
			visitors: visitorCount,
			sessions: sessions?.value ?? 0,
			pageviews: pageviews?.value ?? 0,
			leads: leadCount,
			/** Visitor-to-lead rate. The number the whole tracking spine exists to produce. */
			conversionRate: visitorCount > 0 ? leadCount / visitorCount : 0,
			dealsWon: won?.deals ?? 0,
			revenueCents: Number(won?.revenue ?? 0),
			pipelineDeals: openDeals?.deals ?? 0,
			pipelineCents: Number(openDeals?.revenue ?? 0),
		};
	}),

	/** Daily visitors and pageviews, zero-filled so the chart has no gaps. */
	series: protectedProcedure.input(baseInput).query(async ({ input }) => {
		const site = await resolveSite(input.siteId);
		const since = rangeStart(input.range);

		const traffic = await db.all<SeriesRow>(sql`
      SELECT
        strftime('%Y-%m-%d', ${event.createdAt} / 1000, 'unixepoch') AS day,
        COUNT(DISTINCT ${event.visitorId}) AS visitors,
        SUM(CASE WHEN ${event.type} = 'pageview' THEN 1 ELSE 0 END) AS pageviews
      FROM ${event}
      WHERE ${event.siteId} = ${site.id} AND ${event.createdAt} >= ${since}
      GROUP BY day
      ORDER BY day
    `);

		const leads = await db.all<LeadSeriesRow>(sql`
      SELECT
        strftime('%Y-%m-%d', ${contact.createdAt} / 1000, 'unixepoch') AS day,
        COUNT(*) AS leads
      FROM ${contact}
      WHERE ${contact.siteId} = ${site.id} AND ${contact.createdAt} >= ${since}
      GROUP BY day
      ORDER BY day
    `);

		const leadsByDay = new Map(leads.map((row) => [row.day, row.leads]));
		const trafficByDay = new Map(traffic.map((row) => [row.day, row]));

		const days: Array<{
			day: string;
			visitors: number;
			pageviews: number;
			leads: number;
		}> = [];
		const from = since === 0 ? firstDay(traffic, leads) : since;
		const cursor = new Date(from);
		cursor.setUTCHours(0, 0, 0, 0);
		const end = new Date();
		end.setUTCHours(0, 0, 0, 0);

		while (cursor <= end) {
			const key = cursor.toISOString().slice(0, 10);
			const row = trafficByDay.get(key);
			days.push({
				day: key,
				visitors: row?.visitors ?? 0,
				pageviews: row?.pageviews ?? 0,
				leads: leadsByDay.get(key) ?? 0,
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}

		return days;
	}),

	/**
	 * Leads and revenue grouped by acquisition channel under the selected model.
	 * This is the closed loop: ad click on one end, won deal on the other.
	 */
	channels: protectedProcedure
		.input(baseInput.extend({ model: attributionModelSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = rangeStart(input.range);
			// Safe to interpolate: the value comes from a closed zod enum.
			const direction =
				input.model === "first" ? sql.raw("ASC") : sql.raw("DESC");

			const rows = await db.all<ChannelRow>(sql`
        WITH ranked AS (
          SELECT
            contact_id,
            source,
            medium,
            campaign,
            ROW_NUMBER() OVER (
              PARTITION BY contact_id
              ORDER BY created_at ${direction}, id ${direction}
            ) AS rn
          FROM touchpoint
          WHERE site_id = ${site.id} AND contact_id IS NOT NULL
        ),
        attributed AS (
          SELECT contact_id, source, medium, campaign FROM ranked WHERE rn = 1
        )
        SELECT
          a.source AS source,
          a.medium AS medium,
          a.campaign AS campaign,
          COUNT(DISTINCT a.contact_id) AS leads,
          COUNT(DISTINCT CASE WHEN c.status = 'customer' THEN a.contact_id END) AS customers,
          COUNT(DISTINCT CASE WHEN d.stage = 'won' THEN d.id END) AS deals_won,
          COALESCE(SUM(CASE WHEN d.stage = 'won' THEN d.value_cents ELSE 0 END), 0) AS revenue_cents
        FROM attributed a
        JOIN contact c ON c.id = a.contact_id
        LEFT JOIN deal d ON d.contact_id = a.contact_id
        WHERE c.created_at >= ${since}
        GROUP BY a.source, a.medium, a.campaign
        ORDER BY revenue_cents DESC, leads DESC
      `);

			return rows.map((row) => ({
				source: row.source ?? "direct",
				medium: row.medium ?? "none",
				campaign: row.campaign,
				leads: row.leads,
				customers: row.customers,
				dealsWon: row.deals_won,
				revenueCents: row.revenue_cents,
			}));
		}),

	/** Highest-traffic pages, for spotting which content actually produces leads. */
	topPages: protectedProcedure.input(baseInput).query(async ({ input }) => {
		const site = await resolveSite(input.siteId);
		const since = new Date(rangeStart(input.range));

		return db
			.select({
				path: event.path,
				views: count(),
				visitors: countDistinct(event.visitorId),
			})
			.from(event)
			.where(
				and(
					eq(event.siteId, site.id),
					eq(event.type, "pageview"),
					gte(event.createdAt, since),
				),
			)
			.groupBy(event.path)
			.orderBy(sql`count(*) desc`)
			.limit(10);
	}),

	/** Which tracked interactions fire most. Drives what is worth a conversion event. */
	topEvents: protectedProcedure.input(baseInput).query(async ({ input }) => {
		const site = await resolveSite(input.siteId);
		const since = new Date(rangeStart(input.range));

		return db
			.select({
				name: event.name,
				type: event.type,
				total: count(),
			})
			.from(event)
			.where(and(eq(event.siteId, site.id), gte(event.createdAt, since)))
			.groupBy(event.name, event.type)
			.orderBy(sql`count(*) desc`)
			.limit(10);
	}),

	/**
	 * Where visits physically originate. Sessions rather than events, because a
	 * visitor browsing five pages is one location, not five.
	 */
	topLocations: protectedProcedure.input(baseInput).query(async ({ input }) => {
		const site = await resolveSite(input.siteId);
		const since = new Date(rangeStart(input.range));

		return db
			.select({
				country: visitSession.country,
				city: visitSession.city,
				sessions: count(),
			})
			.from(visitSession)
			.where(
				and(
					eq(visitSession.siteId, site.id),
					gte(visitSession.startedAt, since),
					isNotNull(visitSession.country),
				),
			)
			.groupBy(visitSession.country, visitSession.city)
			.orderBy(sql`count(*) desc`)
			.limit(10);
	}),

	/** Unattributed share — the honest counterpart to every attribution report. */
	coverage: protectedProcedure.input(baseInput).query(async ({ input }) => {
		const site = await resolveSite(input.siteId);
		const since = new Date(rangeStart(input.range));

		const [total] = await db
			.select({ value: count() })
			.from(contact)
			.where(and(eq(contact.siteId, site.id), gte(contact.createdAt, since)));

		const [attributed] = await db
			.select({ value: countDistinct(touchpoint.contactId) })
			.from(touchpoint)
			.innerJoin(contact, eq(contact.id, touchpoint.contactId))
			.where(
				and(eq(touchpoint.siteId, site.id), gte(contact.createdAt, since)),
			);

		const totalLeads = total?.value ?? 0;
		const attributedLeads = attributed?.value ?? 0;

		return {
			totalLeads,
			attributedLeads,
			unattributedLeads: Math.max(0, totalLeads - attributedLeads),
			coverage: totalLeads > 0 ? attributedLeads / totalLeads : 0,
		};
	}),
});

function firstDay(traffic: SeriesRow[], leads: LeadSeriesRow[]): number {
	const candidates = [traffic[0]?.day, leads[0]?.day].filter(
		Boolean,
	) as string[];
	if (!candidates.length) return Date.now();
	const earliest = candidates.sort()[0];
	return new Date(`${earliest}T00:00:00Z`).getTime();
}
