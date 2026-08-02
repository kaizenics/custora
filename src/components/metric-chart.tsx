import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { formatNumber } from "@/lib/format";

export type MetricPoint = {
	day: string;
	value: number;
};

/**
 * Single-series column chart.
 *
 * Deliberately one measure at a time, switched from the tiles above, rather
 * than plotting visitors and leads together: they differ by an order of
 * magnitude and the only way to share one frame is a second y-axis, which is
 * the single most misread thing in dashboard charting.
 */
export function MetricChart({
	points,
	label,
	className,
}: {
	points: MetricPoint[];
	label: string;
	className?: string;
}) {
	const config = {
		value: {
			label,
			color: "var(--chart-2)",
		},
	} satisfies ChartConfig;

	if (!points.length) {
		return (
			<div
				className={cn(
					"flex h-56 items-center justify-center text-muted-foreground text-xs",
					className,
				)}
			>
				No data in this range yet.
			</div>
		);
	}

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto h-56 w-full", className)}
		>
			<BarChart
				accessibilityLayer
				data={points}
				margin={{ left: 4, right: 4, top: 8 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="day"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={24}
				/>
				{/*
				 * allowDecimals={false} matters on low-volume ranges: without it a
				 * max of 3 produces a "1.5" tick, or worse a tick rounded to a value
				 * the gridline does not actually sit at.
				 */}
				<YAxis
					width={32}
					tickLine={false}
					axisLine={false}
					allowDecimals={false}
					tickFormatter={(value: number) => formatNumber(value, "compact")}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							formatter={(value) => (
								<span className="flex w-full justify-between gap-4">
									<span className="text-muted-foreground">{label}</span>
									<span className="font-medium tabular-nums">
										{formatNumber(Number(value))}
									</span>
								</span>
							)}
						/>
					}
				/>
				<Bar
					dataKey="value"
					fill="var(--color-value)"
					radius={[4, 4, 0, 0]}
					maxBarSize={48}
				/>
			</BarChart>
		</ChartContainer>
	);
}

/** KPI tile. A number and its label — no sparkline, no fake delta. */
export function StatTile({
	label,
	value,
	hint,
	active,
	onClick,
}: {
	label: string;
	value: string;
	hint?: string;
	active?: boolean;
	onClick?: () => void;
}) {
	const content = (
		<>
			<p className="font-medium text-[11px] text-muted-foreground">{label}</p>
			<p className="mt-1 font-medium text-xl tabular-nums tracking-tight">
				{value}
			</p>
			{hint ? (
				<p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
			) : null}
		</>
	);

	if (!onClick) {
		return <div className="p-4">{content}</div>;
	}

	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"p-4 text-left transition-colors hover:bg-muted/50",
				active && "bg-muted/60",
			)}
		>
			{content}
		</button>
	);
}
