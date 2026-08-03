import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { formatNumber } from "@/lib/format";

/**
 * Categorical slots, assigned in fixed order and never cycled.
 *
 * These are a separate scale from --chart-*, which is a sequential ramp for
 * magnitude. Here the series are the subject, so the hues have to be
 * distinguishable rather than ordered.
 */
const SERIES_COLORS = [
	"var(--chart-cat-1)",
	"var(--chart-cat-2)",
	"var(--chart-cat-3)",
	"var(--chart-cat-4)",
	"var(--chart-cat-5)",
] as const;

export const MAX_SERIES = SERIES_COLORS.length;

/**
 * Stacked area over time, for "what is the total and what is it made of".
 *
 * Stacked rather than overlaid because these series are parts of one whole —
 * every event has exactly one type, so the bands sum to the total rather than
 * competing for the same space.
 *
 * The legend is not optional. Three of the light-mode slots fall below 3:1
 * against the surface, which is legible as a filled band but not as a colour
 * to identify from memory, so identity is never carried by colour alone.
 */
export function StackedAreaChart({
	data,
	series,
	labels,
	className,
	emptyMessage = "No activity in this range yet.",
}: {
	data: Array<Record<string, number | string>>;
	/** Keys to stack, in the order they should be assigned colours. */
	series: string[];
	/** Optional display names, when the key is not what the reader should see. */
	labels?: Record<string, string>;
	className?: string;
	emptyMessage?: string;
}) {
	const visible = series.slice(0, MAX_SERIES);

	/**
	 * Series keys become CSS custom properties (--color-<key>), and real ones are
	 * arbitrary text — a rule called "WhatsApp click" would emit an invalid
	 * variable name and the band would render uncoloured. Each key gets a
	 * positional alias, with the original kept as the label.
	 */
	const slots = visible.map((key, index) => ({
		key,
		alias: `s${index}`,
		label: labels?.[key] ?? key,
		color: SERIES_COLORS[index],
	}));

	const config = Object.fromEntries(
		slots.map((slot) => [slot.alias, { label: slot.label, color: slot.color }]),
	) satisfies ChartConfig;

	const rows = data.map((point) => {
		const next: Record<string, number | string> = { day: String(point.day) };
		for (const slot of slots) next[slot.alias] = Number(point[slot.key] ?? 0);
		return next;
	});

	const hasData = rows.some((point) =>
		slots.some((slot) => Number(point[slot.alias] ?? 0) > 0),
	);

	if (!data.length || !hasData) {
		return (
			<div
				className={cn(
					"flex h-56 items-center justify-center text-muted-foreground text-xs",
					className,
				)}
			>
				{emptyMessage}
			</div>
		);
	}

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto h-56 w-full", className)}
		>
			<AreaChart
				accessibilityLayer
				data={rows}
				margin={{ left: 4, right: 4, top: 8 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="day"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={24}
					tickFormatter={(value: string) => String(value).slice(5)}
				/>
				{/* allowDecimals={false}: counts of events are whole numbers. */}
				<YAxis
					width={32}
					tickLine={false}
					axisLine={false}
					allowDecimals={false}
					tickFormatter={(value: number) => formatNumber(value, "compact")}
				/>
				<ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
				<ChartLegend content={<ChartLegendContent />} />
				{slots.map((slot) => (
					<Area
						key={slot.alias}
						dataKey={slot.alias}
						type="monotone"
						stackId="a"
						stroke={`var(--color-${slot.alias})`}
						fill={`var(--color-${slot.alias})`}
						fillOpacity={0.35}
						strokeWidth={2}
					/>
				))}
			</AreaChart>
		</ChartContainer>
	);
}
