import { isIP } from "node:net";

export type Location = {
	country: string | null;
	region: string | null;
	city: string | null;
};

const EMPTY: Location = { country: null, region: null, city: null };

/**
 * Extracts the client address from proxy headers.
 *
 * X-Forwarded-For is a chain the client can prepend to, so only the last entry
 * is added by infrastructure you control. Traefik appends the real peer, which
 * makes the rightmost value the trustworthy one.
 */
export function clientAddress(headers: Headers): string | null {
	const direct = headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
	if (direct && isIP(direct)) return direct;

	const chain = headers.get("x-forwarded-for");
	if (!chain) return null;

	const hops = chain
		.split(",")
		.map((hop) => hop.trim())
		.filter((hop) => isIP(hop));

	return hops.at(-1) ?? null;
}

/**
 * Drops the host portion of an address.
 *
 * A full IP identifies a household and is personal data under GDPR — which
 * applies here, since this tracks visitors in the EU. Truncating keeps the
 * address useful for geography and abuse investigation without identifying
 * anyone, which is the same trade Google Analytics makes by default.
 */
export function anonymiseIp(address: string): string | null {
	const version = isIP(address);

	if (version === 4) {
		const octets = address.split(".");
		if (octets.length !== 4) return null;
		return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
	}

	if (version === 6) {
		// Keep the first 48 bits (the routing prefix), zero the rest.
		const groups = address.split(":");
		return `${groups.slice(0, 3).join(":")}::`;
	}

	return null;
}

export function storableIp(address: string | null): string | null {
	if (!address) return null;
	return process.env.STORE_FULL_IP === "1" ? address : anonymiseIp(address);
}

/**
 * Location the edge already worked out.
 *
 * Cloudflare and Vercel set these; Traefik does not. Putting Cloudflare's free
 * proxy in front of the tracking domain is the cheapest way to get accurate
 * geography — it costs nothing, adds no latency, and needs no lookup.
 */
export function locationFromHeaders(headers: Headers): Location {
	const country =
		headers.get("cf-ipcountry") ?? headers.get("x-vercel-ip-country") ?? null;

	if (!country || country === "XX") return EMPTY;

	return {
		country: country.toUpperCase(),
		region:
			headers.get("cf-region") ?? headers.get("x-vercel-ip-country-region"),
		city: headers.get("cf-ipcity") ?? headers.get("x-vercel-ip-city"),
	};
}

/**
 * Cache keyed by network prefix rather than address, so one lookup covers
 * everyone behind the same ISP block. Bounded, because it is keyed on
 * attacker-influenced input.
 */
const CACHE_MAX = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; location: Location }>();

function cacheKey(address: string): string {
	return anonymiseIp(address) ?? address;
}

function readCache(address: string): Location | null {
	const hit = cache.get(cacheKey(address));
	if (!hit) return null;
	if (Date.now() - hit.at > CACHE_TTL_MS) {
		cache.delete(cacheKey(address));
		return null;
	}
	return hit.location;
}

function writeCache(address: string, location: Location) {
	if (cache.size >= CACHE_MAX) {
		// Cheapest useful eviction: drop the oldest insertion.
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	cache.set(cacheKey(address), { at: Date.now(), location });
}

/**
 * Looks the address up with an external service.
 *
 * Opt-in via GEO_LOOKUP=1, because it sends a visitor's address to a third
 * party and that is a decision with privacy consequences, not a default.
 *
 * Only ever called when a session is created — not per event — and only for an
 * uncached prefix, so the hot path almost never pays for it. The timeout is
 * short: a slow geo service must not hold up recording the event.
 */
async function lookup(address: string): Promise<Location> {
	if (process.env.GEO_LOOKUP !== "1") return EMPTY;

	const cached = readCache(address);
	if (cached) return cached;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 1_500);

	try {
		/**
		 * ipwho.is, not ipapi.co: ipapi.co refuses server-side callers outright —
		 * 429 for Node's user agent, a Cloudflare challenge for a spoofed one —
		 * so every lookup returned empty while looking like a soft failure.
		 * ipwho.is is keyless over HTTPS and answers non-browser clients.
		 */
		const res = await fetch(`https://ipwho.is/${encodeURIComponent(address)}`, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return EMPTY;

		// Failures arrive as HTTP 200 with success:false (reserved ranges, bad input).
		const body = (await res.json()) as {
			success?: boolean;
			country_code?: string;
			region?: string;
			city?: string;
		};
		if (!body.success || !body.country_code) return EMPTY;

		const location: Location = {
			country: body.country_code.toUpperCase(),
			region: body.region ?? null,
			city: body.city ?? null,
		};
		writeCache(address, location);
		return location;
	} catch {
		// Unreachable or too slow: geography is optional, the event is not.
		return EMPTY;
	} finally {
		clearTimeout(timer);
	}
}

/** Headers first because they are free and instant; the lookup only fills gaps. */
export async function resolveLocation(
	headers: Headers,
	address: string | null,
): Promise<Location> {
	const fromHeaders = locationFromHeaders(headers);
	if (fromHeaders.country) return fromHeaders;
	if (!address) return EMPTY;
	return lookup(address);
}

/** Test seam — the cache is module state. */
export function resetGeoCache(): void {
	cache.clear();
}
