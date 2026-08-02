const compact = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});
const plain = new Intl.NumberFormat("en-US");

export function formatNumber(
	value: number,
	style: "plain" | "compact" = "plain",
) {
	return style === "compact" && value >= 10_000
		? compact.format(value)
		: plain.format(value);
}

export function formatCurrency(cents: number, currency = "USD") {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
	}).format(cents / 100);
}

export function formatPercent(ratio: number) {
	return new Intl.NumberFormat("en-US", {
		style: "percent",
		maximumFractionDigits: ratio < 0.1 ? 2 : 1,
	}).format(ratio);
}

export function formatDate(value: Date | string | number) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(value));
}

export function formatDateTime(value: Date | string | number) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(value));
}

/** Compact relative time for stream views, where absolute dates are noise. */
export function formatRelative(value: Date | string | number) {
	const then = new Date(value).getTime();
	const seconds = Math.round((Date.now() - then) / 1000);

	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
	return formatDate(value);
}

/** Trims a URL down to something that fits a table cell. */
export function shortenUrl(url: string | null | undefined, max = 44) {
	if (!url) return "—";
	const stripped = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
	return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}
