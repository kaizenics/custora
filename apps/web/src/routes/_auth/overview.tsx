import { Badge } from "@custora/ui/components/badge";
import { Button } from "@custora/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@custora/ui/components/card";
import { Separator } from "@custora/ui/components/separator";
import { Skeleton } from "@custora/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@custora/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@custora/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/app-sidebar";
import { MetricChart, StatTile } from "@/components/metric-chart";
import { type Range, RangePicker } from "@/components/range-picker";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/overview")({
	component: OverviewPage,
});

type Metric = "visitors" | "pageviews" | "leads";

const METRIC_LABEL: Record<Metric, string> = {
	visitors: "Visitors",
	pageviews: "Pageviews",
	leads: "Leads",
};

function OverviewPage() {
	const trpc = useTRPC();
	const [range, setRange] = useState<Range>("30d");
	const [metric, setMetric] = useState<Metric>("visitors");
	const [model, setModel] = useState<"first" | "last">("last");

	const summary = useQuery(
		trpc.analytics.summary.queryOptions({ range }, { retry: false }),
	);
	const series = useQuery(
		trpc.analytics.series.queryOptions({ range }, { retry: false }),
	);
	const channels = useQuery(
		trpc.analytics.channels.queryOptions({ range, model }, { retry: false }),
	);
	const topPages = useQuery(
		trpc.analytics.topPages.queryOptions({ range }, { retry: false }),
	);
	const coverage = useQuery(
		trpc.analytics.coverage.queryOptions({ range }, { retry: false }),
	);

	// Every query fails the same way when no site exists yet, so one check covers it.
	if (summary.error) {
		return (
			<>
				<PageHeader title="Overview" />
				<div className="flex flex-1 items-center justify-center p-6">
					<Card className="max-w-sm text-center">
						<CardHeader>
							<CardTitle>No site connected</CardTitle>
							<CardDescription>
								Add the site you want to track and install the snippet.
								Attribution starts the moment the first pageview lands.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button render={<Link to="/sites" />}>Add a site</Button>
						</CardContent>
					</Card>
				</div>
			</>
		);
	}

	const points = (series.data ?? []).map((row) => ({
		day: row.day.slice(5),
		value: row[metric],
	}));

	return (
		<>
			<PageHeader
				title="Overview"
				action={<RangePicker value={range} onChange={setRange} />}
			/>

			<div className="flex-1 overflow-y-auto">
				{/* Full-bleed KPI strip with hairline dividers, then carded panels below. */}
				<section className="grid grid-cols-2 border-b lg:grid-cols-5 [&>*]:border-r [&>*]:border-b lg:[&>*]:border-b-0">
					{summary.isPending
						? Array.from({ length: 5 }, (_, i) => (
								<div key={i} className="p-4">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="mt-2 h-6 w-20" />
								</div>
							))
						: null}
					{summary.isPending ? null : (
						<>
							<StatTile
								label="Visitors"
								value={formatNumber(summary.data?.visitors ?? 0, "compact")}
								hint={`${formatNumber(summary.data?.sessions ?? 0)} sessions`}
								active={metric === "visitors"}
								onClick={() => setMetric("visitors")}
							/>
							<StatTile
								label="Pageviews"
								value={formatNumber(summary.data?.pageviews ?? 0, "compact")}
								active={metric === "pageviews"}
								onClick={() => setMetric("pageviews")}
							/>
							<StatTile
								label="Leads"
								value={formatNumber(summary.data?.leads ?? 0)}
								hint={`${formatPercent(summary.data?.conversionRate ?? 0)} of visitors`}
								active={metric === "leads"}
								onClick={() => setMetric("leads")}
							/>
							<StatTile
								label="Revenue"
								value={formatCurrency(summary.data?.revenueCents ?? 0)}
								hint={`${formatNumber(summary.data?.dealsWon ?? 0)} deals won`}
							/>
							<StatTile
								label="Pipeline"
								value={formatCurrency(summary.data?.pipelineCents ?? 0)}
								hint={`${formatNumber(summary.data?.pipelineDeals ?? 0)} open deals`}
							/>
						</>
					)}
				</section>

				<div className="flex flex-col gap-4 p-4">
					<Card>
						<CardHeader>
							<CardTitle>{METRIC_LABEL[metric]} over time</CardTitle>
							<CardDescription>
								Select a tile above to change the measure.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{series.isPending ? (
								<Skeleton className="h-56 w-full" />
							) : (
								<MetricChart points={points} label={METRIC_LABEL[metric]} />
							)}
						</CardContent>
					</Card>

					<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Where leads come from</CardTitle>
								<CardDescription>
									Recomputed from raw touchpoints, so the two models can credit
									different channels for the same deal.
								</CardDescription>
								<CardAction>
									<Tabs
										value={model}
										onValueChange={(value) =>
											setModel(value as "first" | "last")
										}
									>
										<TabsList aria-label="Attribution model">
											<TabsTrigger value="first">First touch</TabsTrigger>
											<TabsTrigger value="last">Last touch</TabsTrigger>
										</TabsList>
									</Tabs>
								</CardAction>
							</CardHeader>
							<CardContent>
								<ChannelTable
									rows={channels.data ?? []}
									isPending={channels.isPending}
									model={model}
								/>

								{coverage.data && coverage.data.totalLeads > 0 ? (
									<>
										<Separator className="mt-3" />
										<p className="mt-3 text-[11px] text-muted-foreground">
											{formatPercent(coverage.data.coverage)} of leads in this
											range have a known source.{" "}
											{coverage.data.unattributedLeads > 0
												? `${formatNumber(coverage.data.unattributedLeads)} arrived with no referrer, campaign, or click ID.`
												: "Every lead is attributed."}
										</p>
									</>
								) : null}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Top pages</CardTitle>
								<CardDescription>
									Which content actually carries traffic.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{topPages.isPending ? (
									<div className="flex flex-col gap-2">
										{Array.from({ length: 5 }, (_, i) => (
											<Skeleton key={i} className="h-7 w-full" />
										))}
									</div>
								) : topPages.data?.length ? (
									<MagnitudeList
										rows={topPages.data.map((row) => ({
											key: row.path ?? "—",
											label: row.path ?? "—",
											value: row.views,
											meta: `${formatNumber(row.visitors)} visitors`,
										}))}
									/>
								) : (
									<p className="py-6 text-center text-muted-foreground text-xs">
										No pageviews yet.
									</p>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</>
	);
}

type ChannelRow = {
	source: string;
	medium: string;
	campaign: string | null;
	leads: number;
	customers: number;
	dealsWon: number;
	revenueCents: number;
};

function ChannelTable({
	rows,
	isPending,
	model,
}: {
	rows: ChannelRow[];
	isPending: boolean;
	model: "first" | "last";
}) {
	if (isPending) {
		return (
			<div className="flex flex-col gap-2">
				{Array.from({ length: 5 }, (_, i) => (
					<Skeleton key={i} className="h-7 w-full" />
				))}
			</div>
		);
	}

	if (!rows.length) {
		return (
			<p className="py-6 text-center text-muted-foreground text-xs">
				No attributed leads yet. Once a tracked visitor submits an email, their
				originating campaign shows up here.
			</p>
		);
	}

	const maxRevenue = Math.max(1, ...rows.map((row) => row.revenueCents));

	return (
		<Table>
			<TableCaption className="sr-only">
				Leads and revenue by acquisition channel, {model} touch attribution
			</TableCaption>
			<TableHeader>
				<TableRow>
					<TableHead>Source</TableHead>
					<TableHead className="text-right">Leads</TableHead>
					<TableHead className="text-right">Won</TableHead>
					<TableHead className="text-right">Revenue</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={`${row.source}-${row.medium}-${row.campaign}`}>
						<TableCell>
							<div className="flex items-center gap-2">
								<span className="font-medium">{row.source}</span>
								<Badge variant="outline">{row.medium}</Badge>
							</div>
							{row.campaign ? (
								<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
									{row.campaign}
								</p>
							) : null}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(row.leads)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatNumber(row.dealsWon)}
						</TableCell>
						<TableCell className="text-right">
							<div className="flex items-center justify-end gap-2">
								<span
									className="h-1.5 bg-chart-2"
									style={{
										width: `${(row.revenueCents / maxRevenue) * 48}px`,
									}}
									aria-hidden
								/>
								<span className="tabular-nums">
									{formatCurrency(row.revenueCents)}
								</span>
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/** Ranked rows with a proportional bar. Sequential, single hue — magnitude only. */
function MagnitudeList({
	rows,
}: {
	rows: Array<{ key: string; label: string; value: number; meta?: string }>;
}) {
	const max = Math.max(1, ...rows.map((row) => row.value));

	return (
		<ul className="flex flex-col">
			{rows.map((row) => (
				<li
					key={row.key}
					className="relative flex items-center justify-between gap-3 border-b py-2 last:border-0"
				>
					<span
						className="absolute inset-y-0 left-0 -z-10 bg-muted"
						style={{ width: `${(row.value / max) * 100}%` }}
						aria-hidden
					/>
					<span className="truncate text-xs">{row.label}</span>
					<span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
						{row.meta ? (
							<span className="text-muted-foreground">{row.meta}</span>
						) : null}
						{formatNumber(row.value)}
					</span>
				</li>
			))}
		</ul>
	);
}
