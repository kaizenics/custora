import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
/** Enough to cover <head> and a script before </body> on any sane page. */
const MAX_BODY_BYTES = 512 * 1024;

export type InstallStatus =
	/** Snippet on the page and events arriving. Nothing to do. */
	| "live"
	/** Snippet on the page, nothing reported yet. */
	| "installed_no_events"
	/** Events arriving but no snippet in the served HTML — tag manager or SPA injection. */
	| "reporting_not_found"
	/** A Custora snippet is present, but with a different write key. */
	| "wrong_key"
	/** Nothing found and nothing reported. */
	| "not_found"
	/** Could not fetch the page at all. */
	| "unreachable";

export type InstallCheck = {
	url: string;
	status: InstallStatus;
	httpStatus: number | null;
	snippetFound: boolean;
	keyMatches: boolean;
	/** Set when a snippet is present under some other key — usually a stale key after a rotate. */
	foundKey: string | null;
	/** "script" for a tag in the HTML, "injected" for a framework that mounts it from JS. */
	installedVia: "script" | "injected" | null;
	eventCount: number;
	lastEventAt: Date | null;
	error: string | null;
};

/** Hosts that must never be fetched on behalf of a user-supplied domain. */
function isBlockedAddress(address: string): boolean {
	const version = isIP(address);

	if (version === 4) {
		const parts = address.split(".").map(Number);
		const [a = 0, b = 0] = parts;
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true; // link-local / cloud metadata
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		if (a >= 224) return true; // multicast + reserved
		return false;
	}

	if (version === 6) {
		const normalized = address.toLowerCase();
		if (normalized === "::1" || normalized === "::") return true;
		if (normalized.startsWith("fe80")) return true; // link-local
		if (/^f[cd]/.test(normalized)) return true; // unique local
		// IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded address.
		const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped?.[1]) return isBlockedAddress(mapped[1]);
		return false;
	}

	return true;
}

/**
 * Resolves a hostname and rejects anything on a private or loopback range.
 *
 * This endpoint fetches a URL the user typed, so without this it is a
 * server-side request forgery hole pointed straight at the internal network and
 * the cloud metadata endpoint.
 *
 * Note: this validates at resolve time, so a hostname that re-resolves to a
 * private address between the check and the request (DNS rebinding) is not
 * covered. Acceptable for an internal, authenticated-only tool.
 */
async function assertPublicHost(hostname: string): Promise<void> {
	const literal = isIP(hostname);
	if (literal) {
		if (isBlockedAddress(hostname)) {
			throw new Error("Refusing to check a private or loopback address");
		}
		return;
	}

	if (hostname === "localhost" || hostname.endsWith(".localhost")) {
		throw new Error("Refusing to check a private or loopback address");
	}

	let resolved: Array<{ address: string }>;
	try {
		resolved = await lookup(hostname, { all: true });
	} catch {
		throw new Error("Domain does not resolve");
	}

	if (!resolved.length) throw new Error("Domain does not resolve");
	if (resolved.some((entry) => isBlockedAddress(entry.address))) {
		throw new Error("Refusing to check a private or loopback address");
	}
}

/** Reads at most MAX_BODY_BYTES so a huge or endless response cannot exhaust memory. */
async function readCapped(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return "";

	const decoder = new TextDecoder();
	const chunks: string[] = [];
	let total = 0;

	while (total < MAX_BODY_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		chunks.push(decoder.decode(value, { stream: true }));
	}

	await reader.cancel().catch(() => {});
	return chunks.join("");
}

async function fetchPage(
	startUrl: string,
): Promise<{ html: string; status: number; url: string }> {
	let url = startUrl;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error("Only http and https are supported");
		}
		await assertPublicHost(parsed.hostname);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				redirect: "manual",
				signal: controller.signal,
				headers: {
					// Identify honestly; some WAFs block unknown agents outright.
					"User-Agent":
						"Custora-InstallCheck/1.0 (+attribution setup verification)",
					Accept: "text/html,application/xhtml+xml",
				},
			});

			const location = response.headers.get("location");
			if (response.status >= 300 && response.status < 400 && location) {
				// Re-validate the next hop rather than letting fetch follow blindly.
				url = new URL(location, url).toString();
				continue;
			}

			return { html: await readCapped(response), status: response.status, url };
		} finally {
			clearTimeout(timer);
		}
	}

	throw new Error("Too many redirects");
}

/**
 * Looks for a Custora snippet in served HTML.
 *
 * Matches on the collector path rather than the full origin, so a site serving
 * the script from its own track.* subdomain still verifies.
 */
export function findSnippet(html: string): {
	found: boolean;
	key: string | null;
	/** How it was installed — worth reporting, because the two behave differently. */
	via: "script" | "injected" | null;
} {
	const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];

	for (const tag of scriptTags) {
		if (!/\/c\/v1\/custora\.js/i.test(tag)) continue;
		const key = tag.match(/data-key\s*=\s*["']([^"']+)["']/i);
		return { found: true, key: key?.[1] ?? null, via: "script" };
	}

	/**
	 * Frameworks that mount the script from JavaScript leave no <script> tag in
	 * the served HTML. Next.js <Script strategy="afterInteractive"> is the common
	 * case: the document carries a preload hint and the component's props inside
	 * a serialised payload, and the real tag only appears after hydration.
	 *
	 * Treating that as "not installed" is wrong and confusing — the snippet is
	 * there and will run.
	 */
	/**
	 * A bare mention of the path is not an install — documentation and blog posts
	 * quote it too. Require it to appear either as a link the browser will
	 * preload, or as the value of a `src` inside a serialised payload.
	 */
	const preloaded = /<link\b[^>]*\/c\/v1\/custora\.js[^>]*>/i.test(html);
	const inPayload = /\\?["']src\\?["']\s*:\s*\\?["'][^"'\\]*\/c\/v1\/custora\.js/i.test(html);

	if (!preloaded && !inPayload) {
		return { found: false, key: null, via: null };
	}

	// The key may be a plain attribute or escaped inside a JSON payload.
	const key =
		html.match(/data-key\s*=\s*["']([^"']+)["']/i)?.[1] ??
		html.match(/\\?["']data-key\\?["']\s*:\s*\\?["']([^"'\\]+)\\?["']/i)?.[1] ??
		null;

	return { found: true, key, via: "injected" };
}

export async function checkInstallation(params: {
	domain: string;
	writeKey: string;
	eventCount: number;
	lastEventAt: Date | null;
}): Promise<InstallCheck> {
	const url = `https://${params.domain}/`;

	const base = {
		url,
		httpStatus: null as number | null,
		snippetFound: false,
		keyMatches: false,
		foundKey: null as string | null,
		installedVia: null as "script" | "injected" | null,
		eventCount: params.eventCount,
		lastEventAt: params.lastEventAt,
	};

	let page: { html: string; status: number; url: string };
	try {
		page = await fetchPage(url);
	} catch (error) {
		return {
			...base,
			// Events are the stronger signal — a page we cannot fetch (WAF, auth
			// wall, geo-block) may still be reporting perfectly well.
			status: params.eventCount > 0 ? "reporting_not_found" : "unreachable",
			error:
				error instanceof Error ? error.message : "Could not reach the site",
		};
	}

	const snippet = findSnippet(page.html);
	const keyMatches = snippet.found && snippet.key === params.writeKey;

	const result = {
		...base,
		url: page.url,
		httpStatus: page.status,
		snippetFound: snippet.found,
		keyMatches,
		foundKey: snippet.key,
		installedVia: snippet.via,
		error: null as string | null,
	};

	if (snippet.found && !keyMatches) {
		return { ...result, status: "wrong_key" };
	}
	if (keyMatches) {
		return {
			...result,
			status: params.eventCount > 0 ? "live" : "installed_no_events",
		};
	}
	return {
		...result,
		status: params.eventCount > 0 ? "reporting_not_found" : "not_found",
	};
}

/** Pre-flight for the add-site form: is the host real and reachable? */
export async function probeDomain(domain: string): Promise<{
	reachable: boolean;
	httpStatus: number | null;
	existingSnippetKey: string | null;
	error: string | null;
}> {
	try {
		const page = await fetchPage(`https://${domain}/`);
		const snippet = findSnippet(page.html);
		return {
			reachable: true,
			httpStatus: page.status,
			existingSnippetKey: snippet.found ? (snippet.key ?? "unknown") : null,
			error: null,
		};
	} catch (error) {
		return {
			reachable: false,
			httpStatus: null,
			existingSnippetKey: null,
			error:
				error instanceof Error ? error.message : "Could not reach the site",
		};
	}
}
