import { z } from "zod";

export const rangeSchema = z
	.enum(["24h", "7d", "30d", "90d", "all"])
	.default("30d");
export type Range = z.infer<typeof rangeSchema>;

const RANGE_MS: Record<Exclude<Range, "all">, number> = {
	"24h": 24 * 60 * 60 * 1000,
	"7d": 7 * 24 * 60 * 60 * 1000,
	"30d": 30 * 24 * 60 * 60 * 1000,
	"90d": 90 * 24 * 60 * 60 * 1000,
};

export const RANGE_LABEL: Record<Range, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
	all: "All time",
};

/** Epoch ms floor for a range. Returns 0 for "all" so it can be compared unconditionally. */
export function rangeStart(range: Range): number {
	if (range === "all") return 0;
	return Date.now() - RANGE_MS[range];
}

export function rangeDays(range: Range): number {
	if (range === "all") return 90;
	return Math.max(1, Math.round(RANGE_MS[range] / (24 * 60 * 60 * 1000)));
}
