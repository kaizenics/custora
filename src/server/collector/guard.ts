/**
 * Abuse controls for the public collector.
 *
 * The write key is embedded in the tracked site's HTML, so it is readable by
 * anyone who views source. It identifies a site; it does not authenticate one.
 * Without these guards a single reader can flood the database with junk events
 * or fabricate conversions against a competitor's campaign.
 */

/** Tokens refilled per minute, per (write key, client) pair. */
const RATE_LIMIT_PER_MINUTE = 120;
/** Allows a normal page load's burst of events without tripping. */
const BURST = 40;
/** Hard ceiling on tracked buckets — an unbounded map is its own denial of service. */
const MAX_BUCKETS = 50_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/**
 * Drops buckets that have refilled completely — they carry no state worth
 * keeping, and this is what stops the map growing without limit.
 */
function sweep(now: number) {
	if (now - lastSweep < SWEEP_INTERVAL_MS && buckets.size < MAX_BUCKETS) return;
	lastSweep = now;

	for (const [key, bucket] of buckets) {
		const refilled =
			bucket.tokens + ((now - bucket.updatedAt) / 60_000) * RATE_LIMIT_PER_MINUTE;
		if (refilled >= BURST) buckets.delete(key);
	}

	// Still oversized after sweeping: shed oldest first rather than grow forever.
	if (buckets.size >= MAX_BUCKETS) {
		const ordered = [...buckets.entries()].sort(
			(a, b) => a[1].updatedAt - b[1].updatedAt,
		);
		for (const [key] of ordered.slice(0, Math.floor(MAX_BUCKETS / 4))) {
			buckets.delete(key);
		}
	}
}

/**
 * Token bucket keyed by write key and client address.
 *
 * In-process, so the budget is per container rather than per cluster. That is
 * honest for a single-instance deployment; running several would need this in
 * Redis to be exact, though a per-instance cap still bounds the damage.
 */
export function allowRequest(writeKey: string, client: string): boolean {
	const now = Date.now();
	sweep(now);

	const id = `${writeKey}:${client}`;
	const bucket = buckets.get(id);

	if (!bucket) {
		buckets.set(id, { tokens: BURST - 1, updatedAt: now });
		return true;
	}

	const refill = ((now - bucket.updatedAt) / 60_000) * RATE_LIMIT_PER_MINUTE;
	const tokens = Math.min(BURST, bucket.tokens + refill);

	if (tokens < 1) {
		bucket.updatedAt = now;
		bucket.tokens = tokens;
		return false;
	}

	bucket.tokens = tokens - 1;
	bucket.updatedAt = now;
	return true;
}

function hostOf(value: string | undefined | null): string | null {
	if (!value) return null;
	try {
		return new URL(value).hostname.toLowerCase();
	} catch {
		return null;
	}
}

/**
 * Whether a request may report events for a site.
 *
 * A missing Origin is allowed: server-to-server calls and some privacy modes
 * strip it, and rejecting those would break legitimate installs. This check
 * therefore stops misconfigured installs and casual cross-site misuse, not a
 * determined forger — the rate limit is what bounds that.
 *
 * Subdomains pass, because track.example.com and www.example.com are both
 * normal places for a site registered as example.com.
 */
export function originAllowed(
	origin: string | undefined,
	referer: string | undefined,
	siteDomain: string,
): boolean {
	const host = hostOf(origin) ?? hostOf(referer);
	if (!host) return true;

	const domain = siteDomain.toLowerCase();
	return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Whether the caller and the collector share a registrable domain.
 *
 * Decides how the visitor cookie has to be scoped. Serving the collector from
 * track.example.com for a site on example.com keeps this same-site, which is
 * what lets the cookie use SameSite=Lax and survive Safari's ITP. Serving it
 * from an unrelated host makes every request cross-site, where Lax cookies are
 * never sent back at all.
 */
export function isSameSite(
	origin: string | undefined,
	collectorHost: string,
): boolean {
	const host = hostOf(origin);
	if (!host) return true;

	const registrable = (value: string) => value.split(".").slice(-2).join(".");
	return registrable(host) === registrable(collectorHost.toLowerCase());
}

/** Test seam — the bucket map is module state. */
export function resetRateLimiter() {
	buckets.clear();
	lastSweep = Date.now();
}

export const RATE_LIMIT = { perMinute: RATE_LIMIT_PER_MINUTE, burst: BURST };
