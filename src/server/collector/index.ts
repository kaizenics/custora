import { db } from "@/db";
import { eventRule, site } from "@/db/schema";
import { env } from "@/env/server";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";

import { clientAddress, resolveLocation } from "./geo";
import { allowRequest, isSameSite } from "./guard";
import { eventSchema, ingest } from "./ingest";
import { TRACKER_SCRIPT } from "./script";

/**
 * The public collector.
 *
 * Deliberately not behind tRPC: this is an open, unauthenticated firehose that
 * needs to stay fast and boring. It validates a write key, does the minimum
 * work, and returns 204.
 */
const VISITOR_COOKIE = "_cst_vid";
/**
 * 400 days is the hard ceiling — Chrome clamps anything longer and Hono throws
 * outright rather than silently truncating. This is the longest a visitor can
 * be recognised, and it is why re-identifying via email matters so much.
 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const isProduction = env.NODE_ENV === "production";

export const collector = new Hono();

/**
 * Origin is reflected rather than allow-listed because the script runs on
 * whatever domain the site is installed on. The write key is what scopes a
 * request to a site; the origin header is not a security boundary here.
 */
collector.use(
	"/*",
	cors({
		origin: (origin) => origin ?? "*",
		allowMethods: ["POST", "GET", "OPTIONS"],
		allowHeaders: ["Content-Type"],
		credentials: true,
		maxAge: 86400,
	}),
);

collector.get("/v1/custora.js", (c) => {
	c.header("Content-Type", "application/javascript; charset=utf-8");
	c.header(
		"Cache-Control",
		"public, max-age=300, stale-while-revalidate=86400",
	);
	return c.body(TRACKER_SCRIPT);
});

/**
 * Tracking rules for one site, in the compact shape the tracker expects.
 *
 * Public and keyed by the write key, exactly like ingest. Rules are not secret:
 * they are CSS selectors describing a page the visitor is already looking at.
 *
 * Cached for a minute so a rule change reaches live traffic quickly without the
 * script re-fetching on every pageview.
 */
collector.get("/v1/config", async (c) => {
	const writeKey = c.req.query("k");
	c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

	if (!writeKey) return c.json({ rules: [] });

	const [siteRow] = await db
		.select({ id: site.id })
		.from(site)
		.where(eq(site.writeKey, writeKey))
		.limit(1);

	if (!siteRow) return c.json({ rules: [] });

	const rules = await db
		.select({
			n: eventRule.name,
			t: eventRule.trigger,
			m: eventRule.matcher,
			p: eventRule.pattern,
		})
		.from(eventRule)
		.where(and(eq(eventRule.siteId, siteRow.id), eq(eventRule.enabled, true)));

	return c.json({ rules });
});

collector.post("/v1/e", async (c) => {
	// The tracker posts as text/plain to stay a CORS-simple request and skip the
	// preflight round trip, so the body is parsed by hand.
	let parsed: unknown;
	try {
		parsed = JSON.parse(await c.req.text());
	} catch {
		return c.body(null, 204);
	}

	const result = eventSchema.safeParse(parsed);
	if (!result.success) {
		return c.body(null, 204);
	}

	/**
	 * Throttle before touching the database. The write key is public, so this is
	 * what bounds how much damage a reader of the page source can do — both to
	 * the data and to the database itself.
	 *
	 * 429 rather than a silent 204: the tracker's retry queue should not replay
	 * events that were rejected for volume, and a real client that trips this is
	 * misbehaving and should see it.
	 */
	const client =
		c.req.header("cf-connecting-ip") ??
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown";

	if (!allowRequest(result.data.k, client)) {
		return c.text("Too many requests", 429);
	}

	const cookieId = getCookie(c, VISITOR_COOKIE) ?? null;

	const address = clientAddress(c.req.raw.headers);
	const location = await resolveLocation(c.req.raw.headers, address);

	const ingested = await ingest(result.data, {
		// The cookie wins when present; the remembered id only fills the gap left
		// by a browser that refused to store or return it. resolveVisitor still
		// checks the id belongs to this site, so a forged one cannot reach
		// another site's visitor.
		visitorId: cookieId ?? result.data.vid ?? null,
		userAgent: c.req.header("user-agent") ?? null,
		origin: c.req.header("origin") ?? null,
		referer: c.req.header("referer") ?? null,
		ipAddress: address,
		location,
	});

	if (!ingested.ok) {
		return c.body(null, 204);
	}

	/**
	 * Set server-side rather than from JS: Safari's ITP caps a document.cookie
	 * lifetime at 7 days, but leaves a Set-Cookie from a first-party subdomain
	 * alone. This is the whole reason the collector wants to live on
	 * track.yourdomain.com rather than a third-party host.
	 */
	if (ingested.visitorId !== cookieId) {
		try {
			/**
			 * SameSite has to match how the collector is actually deployed.
			 *
			 * Same-site (collector on track.example.com, site on example.com) uses
			 * Lax: stricter, and the reason a server-set cookie survives Safari's
			 * 7-day cap. Cross-site (collector on an unrelated host) must use None,
			 * because a Lax cookie is never sent back on a cross-site request — the
			 * cookie gets stored and then ignored, and every pageview looks like a
			 * new visitor.
			 */
			const sameSite = isSameSite(
				c.req.header("origin"),
				new URL(c.req.url).hostname,
			);

			setCookie(c, VISITOR_COOKIE, ingested.visitorId, {
				path: "/",
				httpOnly: true,
				// None is only honoured on a secure connection.
				secure: isProduction || !sameSite,
				sameSite: sameSite ? "Lax" : "None",
				maxAge: COOKIE_MAX_AGE,
			});
		} catch (error) {
			// The event is already durable at this point, so a cookie failure must
			// not fail the request — but it silently breaks visitor continuity, so
			// it has to be loud in the logs.
			console.error("[collector] failed to set visitor cookie", error);
		}
	}

	/**
	 * Returns the visitor id so the tracker can persist it. The cookie is
	 * httpOnly and unreadable from JavaScript by design, so without this the
	 * page has no way to recover its identity when the cookie is blocked.
	 */
	return c.json({ v: ingested.visitorId });
});
