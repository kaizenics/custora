import { Hono } from "hono";

import { db } from "@/db";
import { createId } from "@/db/ids";
import { adSpend, site } from "@/db/schema";
import { eq } from "drizzle-orm";

import { allowRequest } from "./collector/guard";
import { clientAddress } from "./collector/geo";

/**
 * Push endpoint for ad spend.
 *
 * Exists because pulling from Google's API needs a developer token that takes
 * days of review to obtain, while a Google Ads Script running inside the
 * advertiser's own account can post here today with no approval at all. Meta,
 * TikTok and anything else can use the same endpoint — ad_spend is keyed by
 * source, so the reports do not care which filled it.
 *
 * Authenticated by the site's spend key, which is secret. The collector's write
 * key is deliberately not accepted: that one ships inside the page.
 */
export const spendIngest = new Hono();

type IncomingRow = {
	date?: string;
	campaign?: string | null;
	cost?: number | string;
	spend?: number | string;
	impressions?: number | string;
	clicks?: number | string;
};

/** Tolerates the numbers arriving as strings, which JSON from a script often does. */
function num(value: number | string | undefined): number | null {
	if (value == null || value === "") return null;
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

spendIngest.post("/api/spend/ingest", async (c) => {
	const header = c.req.header("authorization") ?? "";
	const key = header.replace(/^Bearer\s+/i, "").trim();
	if (!key) {
		return c.json({ error: "Missing Authorization: Bearer <spend key>." }, 401);
	}

	// Bounded before the key is looked up, so guessing costs the caller too.
	const address = clientAddress(c.req.raw.headers) ?? "unknown";
	if (!allowRequest(key, address)) {
		return c.json({ error: "Too many requests." }, 429);
	}

	const [target] = await db
		.select({ id: site.id })
		.from(site)
		.where(eq(site.spendKey, key))
		.limit(1);
	if (!target) {
		return c.json({ error: "Unknown spend key." }, 403);
	}

	let body: { source?: string; currency?: string; rows?: IncomingRow[] };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Body must be JSON." }, 400);
	}

	const source = (body.source ?? "google").toLowerCase().slice(0, 40);
	const currency = (body.currency ?? "USD").toUpperCase().slice(0, 3);
	const rows = Array.isArray(body.rows) ? body.rows : [];
	if (!rows.length) {
		return c.json({ error: "No rows supplied." }, 400);
	}
	if (rows.length > 5000) {
		return c.json({ error: "Too many rows in one request (max 5000)." }, 413);
	}

	let written = 0;
	const skipped: Array<{ index: number; reason: string }> = [];

	for (const [index, row] of rows.entries()) {
		const day = typeof row.date === "string" ? row.date.trim() : "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			skipped.push({ index, reason: "date must be YYYY-MM-DD" });
			continue;
		}

		const amount = num(row.cost ?? row.spend);
		if (amount == null) {
			skipped.push({ index, reason: "missing cost" });
			continue;
		}

		const impressions = num(row.impressions);
		const clicks = num(row.clicks);
		const spendCents = Math.round(amount * 100);
		const date = new Date(`${day}T00:00:00.000Z`);
		const campaign = row.campaign ? String(row.campaign).slice(0, 200) : null;

		/**
		 * Same upsert as the CSV import and the API sync, on the same unique
		 * index — so a day pushed here, imported by hand, and later synced from
		 * the API converge on one row instead of three.
		 */
		await db
			.insert(adSpend)
			.values({
				id: createId("spd"),
				siteId: target.id,
				source,
				campaign,
				date,
				spendCents,
				currency,
				impressions: impressions == null ? null : Math.round(impressions),
				clicks: clicks == null ? null : Math.round(clicks),
			})
			.onConflictDoUpdate({
				target: [adSpend.siteId, adSpend.source, adSpend.campaign, adSpend.date],
				set: {
					spendCents,
					currency,
					impressions: impressions == null ? null : Math.round(impressions),
					clicks: clicks == null ? null : Math.round(clicks),
				},
			});
		written++;
	}

	return c.json({ written, skipped });
});
