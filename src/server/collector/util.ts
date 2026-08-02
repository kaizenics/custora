/** SHA-256 hex. Used for the deterministic matching keys on contacts. */
export async function sha256(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

/** E.164-ish: strip everything that is not a digit, keep a leading +. */
export function normalizePhone(raw: string): string {
	const trimmed = raw.trim();
	const digits = trimmed.replace(/\D/g, "");
	return trimmed.startsWith("+") ? `+${digits}` : digits;
}

const BOT_PATTERN =
	/bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|lighthouse|pingdom|uptime|curl|wget|axios|python-requests|facebookexternalhit|preview/i;

export type Device = "desktop" | "mobile" | "tablet" | "bot";

/**
 * Deliberately crude. The only job here is keeping obvious automated traffic out
 * of the reports — unfiltered bot hits are the fastest way to make attribution
 * numbers untrustworthy.
 */
export function classifyUserAgent(ua: string | null | undefined): Device {
	if (!ua) return "bot";
	if (BOT_PATTERN.test(ua)) return "bot";
	if (/iPad|Tablet/i.test(ua)) return "tablet";
	if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
	return "desktop";
}

export function hostOf(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/**
 * Maps a referrer host onto a channel name when there are no UTMs to go by.
 * Keeps organic and direct traffic from collapsing into one bucket.
 */
export function channelFromReferrer(
	referrer: string | null,
	selfHost: string | null,
) {
	const host = hostOf(referrer);
	if (!host) return { source: "direct", medium: "none" };
	if (selfHost && host === selfHost) return null;

	if (/google\./.test(host)) return { source: "google", medium: "organic" };
	if (/bing\.|duckduckgo\.|ecosia\./.test(host))
		return { source: host, medium: "organic" };
	if (
		/facebook\.|instagram\.|t\.co|x\.com|twitter\.|linkedin\.|tiktok\./.test(
			host,
		)
	) {
		return { source: host, medium: "social" };
	}
	return { source: host, medium: "referral" };
}
