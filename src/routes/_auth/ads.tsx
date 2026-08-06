import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Info, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Toolbar } from "@/components/app-sidebar";
import { TableScroll } from "@/components/table-scroll";
import { RangePicker } from "@/components/range-picker";
import { StackedAreaChart } from "@/components/stacked-area-chart";
import { useIsAdmin } from "@/lib/auth-client";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { Range } from "@/api/lib/range";
import { useWorkspace } from "@/lib/workspace";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/ads")({
	component: AdsPage,
});

/** A figure that is genuinely unknown reads as "—", never as zero. */
function Money({ cents, currency }: { cents: number | null; currency: string }) {
	if (cents == null) return <span className="text-muted-foreground">—</span>;
	return <span className="tabular-nums">{formatCurrency(cents, currency)}</span>;
}

function AdsPage() {
	const trpc = useTRPC();
	const isAdmin = useIsAdmin();
	const { siteId, isEmpty } = useWorkspace();
	const [range, setRange] = useState<Range>("30d");

	const enabled = { retry: false, enabled: Boolean(siteId) };
	const summary = useQuery(
		trpc.ads.summary.queryOptions({ siteId, range }, enabled),
	);
	const campaigns = useQuery(
		trpc.ads.campaigns.queryOptions({ siteId, range }, enabled),
	);
	const series = useQuery(
		trpc.ads.series.queryOptions({ siteId, range }, enabled),
	);

	const currency = summary.data?.currency ?? "EUR";
	const rows = campaigns.data ?? [];

	return (
		<>
			<PageHeader
				title="Ad spend"
				action={
					<div className="flex items-center gap-2">
						<RangePicker value={range} onChange={setRange} />
						{isAdmin ? <ImportDialog siteId={siteId} /> : null}
					</div>
				}
			/>

			<div className="flex flex-1 flex-col overflow-y-auto">
				<section className="grid grid-cols-2 border-b lg:grid-cols-5 [&>*]:border-r [&>*]:border-b lg:[&>*]:border-b-0">
					{summary.isPending && !isEmpty
						? Array.from({ length: 5 }, (_, i) => (
								<div key={i} className="p-4">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="mt-2 h-6 w-20" />
								</div>
							))
						: (
								<>
									<Tile
										label="Spend"
										value={formatCurrency(summary.data?.spendCents ?? 0, currency)}
									/>
									<Tile
										label="Clicks"
										value={formatNumber(summary.data?.clicks ?? 0, "compact")}
										hint={`${formatNumber(summary.data?.impressions ?? 0, "compact")} impressions`}
									/>
									<Tile
										label="Conversions"
										value={formatNumber(summary.data?.conversions ?? 0)}
										hint="calls & WhatsApp taps"
									/>
									<Tile
										label="Cost per lead"
										value={
											summary.data?.costPerConversionCents == null
												? "—"
												: formatCurrency(summary.data.costPerConversionCents, currency)
										}
									/>
									<Tile
										label="Cost per click"
										value={
											summary.data?.costPerClickCents == null
												? "—"
												: formatCurrency(summary.data.costPerClickCents, currency)
										}
									/>
								</>
							)}
				</section>

				{summary.data?.campaignsMissingSpend ? (
					<div className="flex items-start gap-2 border-b bg-muted/30 px-5 py-3">
						<Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
						<p className="text-muted-foreground text-xs">
							{summary.data.campaignsMissingSpend}{" "}
							{summary.data.campaignsMissingSpend === 1
								? "campaign has"
								: "campaigns have"}{" "}
							conversions but no imported spend. Their leads still count above,
							so cost per lead reads lower than it really is until you import
							those days.
						</p>
					</div>
				) : null}

	
				<div className="border-b p-4">
					<Card>
						<CardHeader>
							<CardTitle>Spend over time</CardTitle>
							<CardDescription>
								Daily Google Ads spend, from the reports you have imported.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{series.isPending && !isEmpty ? (
								<Skeleton className="h-56 w-full" />
							) : (
								<StackedAreaChart
									data={series.data?.series ?? []}
									series={series.data?.names ?? []}
									emptyMessage="No spend imported for this range yet."
								/>
							)}
						</CardContent>
					</Card>
				</div>

				<Toolbar>
					<p className="text-[11px] text-muted-foreground">
						Conversions are counted from your own tracking — a Google click that
						produced a call or WhatsApp tap — not from Google's conversion
						column. Matching runs through the <code className="font-mono">gclid</code>{" "}
						on the visitor's first touch.
					</p>
				</Toolbar>

				{isEmpty || (!campaigns.isPending && !rows.length) ? (
					<div className="flex flex-1 items-center justify-center p-6">
						<div className="w-full max-w-md text-center">
							<p className="font-medium text-sm tracking-tight">
								No ad data yet
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								Export the Campaigns report from Google Ads segmented by day,
								then import the CSV. Spend appears here joined to the calls and
								WhatsApp taps those clicks produced.
							</p>
						</div>
					</div>
				) : campaigns.isPending ? (
					<div className="flex flex-1 flex-col gap-px p-5">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton key={i} className="h-10 w-full" />
						))}
					</div>
				) : (
					<TableScroll>
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-background">
								<TableRow>
									<TableHead className="pl-5">Campaign</TableHead>
									<TableHead className="text-right">Spend</TableHead>
									<TableHead className="text-right">Impressions</TableHead>
									<TableHead className="text-right">Clicks</TableHead>
									<TableHead className="text-right">Landed</TableHead>
									<TableHead className="text-right">Conversions</TableHead>
									<TableHead className="pr-5 text-right">Cost / lead</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.campaign ?? "(none)"}>
										<TableCell className="pl-5 font-medium">
											<div className="flex items-center gap-2">
												{row.campaign ?? (
													<span className="text-muted-foreground">
														(no campaign)
													</span>
												)}
												{row.spendMissing ? (
													<Badge variant="outline">no spend imported</Badge>
												) : null}
											</div>
										</TableCell>
										<TableCell className="text-right">
											<Money cents={row.spendCents} currency={row.currency} />
										</TableCell>
										<TableCell className="text-right text-muted-foreground tabular-nums">
											{row.impressions == null ? "—" : formatNumber(row.impressions)}
										</TableCell>
										<TableCell className="text-right text-muted-foreground tabular-nums">
											{row.clicks == null ? "—" : formatNumber(row.clicks)}
										</TableCell>
										<TableCell
											className="text-right text-muted-foreground tabular-nums"
											title="Visitors that actually reached the site, as a share of the clicks Google billed for"
										>
											{row.landedRate == null
												? "—"
												: `${Math.round(row.landedRate * 100)}%`}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatNumber(row.conversions)}
										</TableCell>
										<TableCell className="pr-5 text-right">
											<Money
												cents={row.costPerConversionCents}
												currency={row.currency}
											/>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableScroll>
				)}

				{isAdmin ? <ImportedRows siteId={siteId} range={range} /> : null}
			</div>
		</>
	);
}

function Tile({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="p-4">
			<p className="font-medium text-[11px] text-muted-foreground">{label}</p>
			<p className="mt-1 font-medium text-xl tabular-nums tracking-tight">
				{value}
			</p>
			{hint ? (
				<p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

/**
 * The imported rows, so a bad import can be found and removed. Admin-only —
 * this is the edit surface, the tables above are the report.
 */
function ImportedRows({ siteId, range }: { siteId?: string; range: Range }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const entries = useQuery(
		trpc.ads.entries.queryOptions(
			{ siteId, range },
			{ retry: false, enabled: Boolean(siteId) },
		),
	);

	const remove = useMutation(
		trpc.ads.remove.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
				toast.success("Spend entry removed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!entries.data?.length) return null;

	return (
		<div className="p-4">
			<Card>
				<CardHeader>
					<CardTitle>Imported rows</CardTitle>
					<CardDescription>
						One row per campaign per day. Re-importing the same days overwrites
						these rather than adding to them.
					</CardDescription>
				</CardHeader>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-5">Date</TableHead>
								<TableHead>Campaign</TableHead>
								<TableHead className="text-right">Spend</TableHead>
								<TableHead className="text-right">Clicks</TableHead>
								<TableHead className="pr-5 text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.data.map((entry) => (
								<TableRow key={entry.id}>
									<TableCell className="pl-5 whitespace-nowrap">
										{formatDate(entry.date)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{entry.campaign ?? "—"}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatCurrency(entry.spendCents, entry.currency)}
									</TableCell>
									<TableCell className="text-right text-muted-foreground tabular-nums">
										{entry.clicks == null ? "—" : formatNumber(entry.clicks)}
									</TableCell>
									<TableCell className="pr-5 text-right">
										<Button
											variant="ghost"
											size="xs"
											disabled={remove.isPending}
											onClick={() => remove.mutate({ entryId: entry.id })}
										>
											<Trash2 />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

function ImportDialog({ siteId }: { siteId?: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [csv, setCsv] = useState("");
	const [fallbackDate, setFallbackDate] = useState("");

	const importCsv = useMutation(
		trpc.ads.importCsv.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
				const skipped = result.skipped.length
					? ` ${result.skipped.length} row(s) skipped: ${result.skipped
							.slice(0, 3)
							.map((s) => `line ${s.line} (${s.reason})`)
							.join(", ")}`
					: "";
				toast.success(`Imported ${result.imported} day(s).${skipped}`);
				setOpen(false);
				setCsv("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<Upload data-icon="inline-start" />
				Import CSV
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Import Google Ads spend</DialogTitle>
					<DialogDescription>
						In Google Ads open Campaigns, segment by Day, then Download as CSV.
						Paste the file's contents below — importing the same days again
						corrects them rather than doubling them.
					</DialogDescription>
				</DialogHeader>

				<form
					id="import-ads"
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (!csv.trim()) return;
						importCsv.mutate({
							siteId,
							csv,
							fallbackDate: fallbackDate
								? new Date(`${fallbackDate}T00:00:00Z`).getTime()
								: undefined,
						});
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="ads-csv">CSV contents</Label>
						<textarea
							id="ads-csv"
							value={csv}
							onChange={(e) => setCsv(e.target.value)}
							rows={10}
							spellCheck={false}
							placeholder={"Day,Campaign,Impr.,Clicks,Cost\n2026-08-01,Emergency Marbella,1240,86,48.20"}
							className="w-full resize-y border bg-transparent p-3 font-mono text-[13px] leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="ads-fallback">
							Date, only if the export has no Day column
						</Label>
						<Input
							id="ads-fallback"
							type="date"
							value={fallbackDate}
							onChange={(e) => setFallbackDate(e.target.value)}
						/>
						<p className="text-[11px] text-muted-foreground">
							A report covering a date range with no Day column has to be
							assigned to a single day, or the totals would be attributed to
							whatever day the import happened to run.
						</p>
					</div>
				</form>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
					<Button
						type="submit"
						form="import-ads"
						disabled={!csv.trim() || importCsv.isPending}
					>
						{importCsv.isPending ? "Importing" : "Import"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
