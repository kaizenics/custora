import { db } from "@/db";
import { createId, createSpendKey } from "@/db/ids";
import { adAccount, adSpend, site } from "@/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "../index";
import { parseGoogleAdsCsv } from "../lib/ads-csv";
import {
	accessTokenFor,
	fetchCampaignDays,
	microsToCents,
	normaliseCustomerId,
	readCredentials,
} from "../lib/google-ads";
import { open } from "../lib/secret-box";
import { rangeSchema, rangeStart } from "../lib/range";
import { zeroFillByDay } from "../lib/series";
import { invalidateSiteCache, resolveSite } from "../lib/site";

/**
 * A conversion, for ad-performance purposes, is a click-type event — which on a
 * service site means a phone or WhatsApp tap.
 *
 * Deliberately not `contact`: the existing channels report attributes through
 * contact_id, and a tap identifies nobody, so that report reads zero on a site
 * whose entire conversion path is anonymous. Counting the taps is the only way
 * these numbers describe reality. When conversion events become a flag on a
 * rule, this becomes "events the site marked as conversions" instead.
 */
const CONVERSION_SQL = sql`e.type = 'click'`;

/**
 * Campaign performance, spend joined to conversions.
 *
 * The join runs through touchpoint, not through Google's own conversion count.
 * That is the whole point: Google reports the clicks it billed for, this
 * reports which of those clicks produced a tap on your site, so cost per lead
 * is measured rather than inferred.
 *
 * Matching is by campaign name, with a fallback to source for rows that carry
 * no campaign. Google-attributed traffic is any touchpoint whose click-id
 * provider is google (a gclid) or whose UTM source says so.
 */
async function campaignRows(siteId: string, since: Date) {
	return db.all<{
		campaign: string | null;
		spend_cents: number;
		currency: string;
		impressions: number | null;
		clicks: number | null;
		visitors: number;
		conversions: number;
		revenue_cents: number;
	}>(sql`
		WITH spend AS (
			SELECT
				campaign,
				SUM(spend_cents) AS spend_cents,
				MIN(currency) AS currency,
				SUM(impressions) AS impressions,
				SUM(clicks) AS clicks
			FROM ad_spend
			WHERE site_id = ${siteId} AND source = 'google' AND date >= ${since}
			GROUP BY campaign
		),
		-- One row per visitor that arrived through Google, carrying the campaign
		-- it arrived on. DISTINCT because a visitor can have several touchpoints.
		arrivals AS (
			SELECT DISTINCT t.visitor_id, t.campaign
			FROM touchpoint t
			WHERE t.site_id = ${siteId}
			  AND (t.click_id_provider = 'google' OR t.source = 'google')
		),
		performance AS (
			SELECT
				a.campaign AS campaign,
				COUNT(DISTINCT a.visitor_id) AS visitors,
				COUNT(DISTINCT CASE WHEN ${CONVERSION_SQL} THEN e.id END) AS conversions,
				COALESCE(SUM(CASE WHEN d.stage = 'won' THEN d.value_cents ELSE 0 END), 0) AS revenue_cents
			FROM arrivals a
			LEFT JOIN event e
			       ON e.visitor_id = a.visitor_id
			      AND e.site_id = ${siteId}
			      AND e.created_at >= ${since}
			LEFT JOIN contact c ON c.id = e.contact_id
			LEFT JOIN deal d ON d.contact_id = c.id
			GROUP BY a.campaign
		)
		SELECT
			COALESCE(s.campaign, p.campaign) AS campaign,
			COALESCE(s.spend_cents, 0) AS spend_cents,
			COALESCE(s.currency, 'USD') AS currency,
			s.impressions AS impressions,
			s.clicks AS clicks,
			COALESCE(p.visitors, 0) AS visitors,
			COALESCE(p.conversions, 0) AS conversions,
			COALESCE(p.revenue_cents, 0) AS revenue_cents
		FROM spend s
		-- FULL OUTER via two halves: SQLite has no FULL JOIN, and both sides
		-- matter — spend with no conversions is the finding, and conversions
		-- with no spend mean the import is missing a day.
		LEFT JOIN performance p ON p.campaign IS s.campaign
		UNION
		SELECT
			p.campaign, 0, 'USD', NULL, NULL,
			p.visitors, p.conversions, p.revenue_cents
		FROM performance p
		WHERE p.campaign NOT IN (SELECT COALESCE(campaign, '') FROM spend)
		  AND NOT (p.campaign IS NULL AND EXISTS (SELECT 1 FROM spend WHERE campaign IS NULL))
		ORDER BY spend_cents DESC, conversions DESC
	`);
}

export const adsRouter = router({
	/** Headline numbers for the ad-spend cards. */
	summary: protectedProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));
			const rows = await campaignRows(site.id, since);

			const totals = rows.reduce(
				(acc, row) => ({
					spendCents: acc.spendCents + Number(row.spend_cents),
					impressions: acc.impressions + Number(row.impressions ?? 0),
					clicks: acc.clicks + Number(row.clicks ?? 0),
					conversions: acc.conversions + Number(row.conversions),
					revenueCents: acc.revenueCents + Number(row.revenue_cents),
				}),
				{
					spendCents: 0,
					impressions: 0,
					clicks: 0,
					conversions: 0,
					revenueCents: 0,
				},
			);

			/**
			 * Campaigns that produced conversions but have no spend imported. Their
			 * conversions still count toward the blended figures, which makes cost
			 * per lead look better than it is — so the UI can say so rather than
			 * quietly reporting a flattering number.
			 */
			const missingSpend = rows.filter(
				(row) => Number(row.conversions) > 0 && Number(row.spend_cents) === 0,
			).length;

			return {
				...totals,
				currency: rows[0]?.currency ?? "USD",
				/**
				 * Both sides must be non-zero. Zero spend over real conversions is
				 * not a cost of nothing, it is a missing import — and rendering it
				 * as "0.00" claims the leads were free.
				 */
				costPerConversionCents:
					totals.spendCents && totals.conversions
						? Math.round(totals.spendCents / totals.conversions)
						: null,
				costPerClickCents:
					totals.spendCents && totals.clicks
						? Math.round(totals.spendCents / totals.clicks)
						: null,
				roas:
					totals.spendCents && totals.revenueCents
						? totals.revenueCents / totals.spendCents
						: null,
				hasSpend: totals.spendCents > 0,
				campaignsMissingSpend: missingSpend,
			};
		}),

	campaigns: protectedProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));
			const rows = await campaignRows(site.id, since);

			return rows.map((row) => {
				const spendCents = Number(row.spend_cents);
				const conversions = Number(row.conversions);
				const clicks = Number(row.clicks ?? 0);
				return {
					campaign: row.campaign,
					spendCents,
					currency: row.currency,
					impressions: row.impressions == null ? null : Number(row.impressions),
					clicks: row.clicks == null ? null : Number(row.clicks),
					visitors: Number(row.visitors),
					conversions,
					revenueCents: Number(row.revenue_cents),
					// null, not 0: see the note on the summary's guards.
					costPerConversionCents:
						spendCents && conversions
							? Math.round(spendCents / conversions)
							: null,
					costPerClickCents:
						spendCents && clicks ? Math.round(spendCents / clicks) : null,
					/** No spend row for a campaign that produced conversions. */
					spendMissing: spendCents === 0 && conversions > 0,
					/**
					 * Google counts the clicks it billed; this counts the visitors that
					 * actually reached the site. A wide gap means click fraud, bounced
					 * redirects, or a tracking template that drops the gclid.
					 */
					landedRate: clicks ? Number(row.visitors) / clicks : null,
				};
			});
		}),

	/** Daily spend, for the chart. */
	series: protectedProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = rangeStart(input.range);

			const rows = await db.all<{ day: string; type: string; total: number }>(sql`
				SELECT
					strftime('%Y-%m-%d', date / 1000, 'unixepoch') AS day,
					'Spend' AS type,
					SUM(spend_cents) / 100.0 AS total
				FROM ad_spend
				WHERE site_id = ${site.id} AND date >= ${since}
				GROUP BY day
				ORDER BY day
			`);

			return { series: zeroFillByDay(rows, since, ["Spend"]), names: ["Spend"] };
		}),

	/** Imported rows, so a mistaken import can be found and undone. */
	entries: adminProcedure
		.input(z.object({ siteId: z.string().optional(), range: rangeSchema }))
		.query(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const since = new Date(rangeStart(input.range));

			return db
				.select({
					id: adSpend.id,
					date: adSpend.date,
					source: adSpend.source,
					campaign: adSpend.campaign,
					spendCents: adSpend.spendCents,
					currency: adSpend.currency,
					impressions: adSpend.impressions,
					clicks: adSpend.clicks,
				})
				.from(adSpend)
				.where(and(eq(adSpend.siteId, site.id), gte(adSpend.date, since)))
				.orderBy(sql`${adSpend.date} DESC`)
				.limit(200);
		}),

	/**
	 * Imports a Google Ads report export.
	 *
	 * Upserts on (site, source, campaign, date) — the table's unique index — so
	 * re-importing an overlapping range corrects the existing days rather than
	 * doubling them. Re-importing the same file is therefore safe, which matters
	 * because the obvious way to fix a partial import is to export again.
	 */
	importCsv: adminProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				csv: z.string().min(1).max(2_000_000),
				/** For exports that are not segmented by day. */
				fallbackDate: z.number().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);

			let parsed: ReturnType<typeof parseGoogleAdsCsv>;
			try {
				parsed = parseGoogleAdsCsv(
					input.csv,
					input.fallbackDate ? new Date(input.fallbackDate) : undefined,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}

			for (const row of parsed.rows) {
				await db
					.insert(adSpend)
					.values({
						id: createId("spd"),
						siteId: site.id,
						source: "google",
						campaign: row.campaign,
						date: row.date,
						spendCents: row.spendCents,
						currency: row.currency,
						impressions: row.impressions,
						clicks: row.clicks,
					})
					.onConflictDoUpdate({
						target: [
							adSpend.siteId,
							adSpend.source,
							adSpend.campaign,
							adSpend.date,
						],
						set: {
							spendCents: row.spendCents,
							currency: row.currency,
							impressions: row.impressions,
							clicks: row.clicks,
						},
					});
			}

			return {
				imported: parsed.rows.length,
				skipped: parsed.skipped,
				currency: parsed.rows[0]?.currency ?? "USD",
			};
		}),

	/** Manual entry, for a day that predates the export or a non-Google source. */
	upsert: adminProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				source: z.string().min(1).max(40).default("google"),
				campaign: z.string().max(200).optional(),
				/** Epoch ms; floored to UTC midnight so a day cannot be stored twice. */
				date: z.number(),
				spend: z.number().min(0).max(10_000_000),
				currency: z.string().length(3).default("EUR"),
				impressions: z.number().int().min(0).optional(),
				clicks: z.number().int().min(0).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const at = new Date(input.date);
			const day = new Date(
				Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
			);

			const [saved] = await db
				.insert(adSpend)
				.values({
					id: createId("spd"),
					siteId: site.id,
					source: input.source,
					campaign: input.campaign || null,
					date: day,
					spendCents: Math.round(input.spend * 100),
					currency: input.currency.toUpperCase(),
					impressions: input.impressions ?? null,
					clicks: input.clicks ?? null,
				})
				.onConflictDoUpdate({
					target: [
						adSpend.siteId,
						adSpend.source,
						adSpend.campaign,
						adSpend.date,
					],
					set: {
						spendCents: Math.round(input.spend * 100),
						currency: input.currency.toUpperCase(),
						impressions: input.impressions ?? null,
						clicks: input.clicks ?? null,
					},
				})
				.returning();

			return saved;
		}),

	/**
	 * Whether a Google Ads account is connected, and whether the server is even
	 * configured to offer it. Readable by any signed-in user so the page can
	 * explain itself; the secret never leaves the server.
	 */
	connection: protectedProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.query(async ({ input }) => {
			const site = await resolveSite(input?.siteId);
			const [account] = await db
				.select({
					customerId: adAccount.customerId,
					loginCustomerId: adAccount.loginCustomerId,
					descriptiveName: adAccount.descriptiveName,
					currencyCode: adAccount.currencyCode,
					connectedAt: adAccount.connectedAt,
					lastSyncedAt: adAccount.lastSyncedAt,
					lastSyncError: adAccount.lastSyncError,
				})
				.from(adAccount)
				.where(eq(adAccount.siteId, site.id))
				.limit(1);

			return {
				/** False when the server has no OAuth client configured. */
				configured: await readCredentials() !== null,
				account: account ?? null,
			};
		}),

	/**
	 * Pulls campaign spend from Google and writes it into the same table the CSV
	 * import fills, using the same upsert. The two paths are therefore
	 * interchangeable — importing a day by hand and syncing it later converge on
	 * one row rather than double-counting.
	 */
	sync: adminProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				/** Days back to pull. Google restates recent spend, so re-pulling matters. */
				days: z.number().int().min(1).max(365).default(30),
			}),
		)
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const credentials = await readCredentials();
			if (!credentials) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"Google Ads is not configured on this server. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET and GOOGLE_ADS_DEVELOPER_TOKEN, then restart.",
				});
			}

			const [account] = await db
				.select()
				.from(adAccount)
				.where(eq(adAccount.siteId, site.id))
				.limit(1);
			if (!account) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "No Google Ads account is connected to this workspace yet.",
				});
			}

			const until = new Date();
			const since = new Date(until.getTime() - input.days * 24 * 60 * 60 * 1000);

			try {
				const accessToken = await accessTokenFor(
					open(account.refreshToken),
					credentials,
				);
				const rows = await fetchCampaignDays({
					customerId: account.customerId,
					loginCustomerId: account.loginCustomerId,
					accessToken,
					credentials,
					since,
					until,
				});

				let written = 0;
				for (const row of rows) {
					// A day with no spend and no activity is noise, not data.
					if (!row.costMicros && !row.impressions && !row.clicks) continue;

					const date = new Date(`${row.date}T00:00:00.000Z`);
					const spendCents = microsToCents(row.costMicros);
					const currency = row.currencyCode ?? account.currencyCode ?? "USD";

					await db
						.insert(adSpend)
						.values({
							id: createId("spd"),
							siteId: site.id,
							source: "google",
							campaign: row.campaign,
							date,
							spendCents,
							currency,
							impressions: row.impressions,
							clicks: row.clicks,
						})
						.onConflictDoUpdate({
							target: [
								adSpend.siteId,
								adSpend.source,
								adSpend.campaign,
								adSpend.date,
							],
							set: {
								spendCents,
								currency,
								impressions: row.impressions,
								clicks: row.clicks,
							},
						});
					written++;
				}

				await db
					.update(adAccount)
					.set({
						lastSyncedAt: new Date(),
						lastSyncError: null,
						currencyCode: rows[0]?.currencyCode ?? account.currencyCode,
					})
					.where(eq(adAccount.id, account.id));

				return { written, days: input.days };
			} catch (error) {
				const message = (error as Error).message;
				/**
				 * Recorded rather than only thrown: a sync that starts failing after
				 * a token revocation would otherwise look like an account with no
				 * spend, which reads as "the ads stopped working".
				 */
				await db
					.update(adAccount)
					.set({ lastSyncError: message })
					.where(eq(adAccount.id, account.id));

				throw new TRPCError({ code: "BAD_GATEWAY", message });
			}
		}),

	/**
	 * Points the connection at a different customer id under the same grant —
	 * for a manager account that can reach several.
	 */
	setCustomer: adminProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				customerId: z.string().min(1),
				loginCustomerId: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const site = await resolveSite(input.siteId);
			const [updated] = await db
				.update(adAccount)
				.set({
					customerId: normaliseCustomerId(input.customerId),
					loginCustomerId: input.loginCustomerId
						? normaliseCustomerId(input.loginCustomerId)
						: null,
					lastSyncError: null,
				})
				.where(eq(adAccount.siteId, site.id))
				.returning({ customerId: adAccount.customerId });
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "No connected account to update.",
				});
			}
			return updated;
		}),

	/**
	 * Forgets the stored credential. Imported spend is deliberately kept — it is
	 * historical fact, and deleting it would rewrite past reports.
	 */
	disconnect: adminProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.mutation(async ({ input }) => {
			const site = await resolveSite(input?.siteId);
			const [removed] = await db
				.delete(adAccount)
				.where(eq(adAccount.siteId, site.id))
				.returning({ customerId: adAccount.customerId });
			if (!removed) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Nothing is connected.",
				});
			}
			return removed;
		}),

	/**
	 * The secret this workspace's push feeds authenticate with, minted on first
	 * request so a site that never uses it carries no credential.
	 *
	 * Admin-only, and returned in full: unlike a stored OAuth token there is
	 * nothing to reveal that the caller does not already have authority over,
	 * and it has to be pasted into the ad platform to be useful.
	 */
	spendKey: adminProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.mutation(async ({ input }) => {
			const target = await resolveSite(input?.siteId);
			if (target.spendKey) return { spendKey: target.spendKey };

			const spendKey = createSpendKey();
			await db.update(site).set({ spendKey }).where(eq(site.id, target.id));
			invalidateSiteCache();
			return { spendKey };
		}),

	/** Invalidates the old key immediately; any feed still using it starts failing. */
	rotateSpendKey: adminProcedure
		.input(z.object({ siteId: z.string().optional() }).optional())
		.mutation(async ({ input }) => {
			const target = await resolveSite(input?.siteId);
			const spendKey = createSpendKey();
			await db.update(site).set({ spendKey }).where(eq(site.id, target.id));
			invalidateSiteCache();
			return { spendKey };
		}),

	remove: adminProcedure
		.input(z.object({ entryId: z.string() }))
		.mutation(async ({ input }) => {
			const [removed] = await db
				.delete(adSpend)
				.where(eq(adSpend.id, input.entryId))
				.returning({ id: adSpend.id, date: adSpend.date });
			if (!removed) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "That spend entry no longer exists.",
				});
			}
			return removed;
		}),
});
