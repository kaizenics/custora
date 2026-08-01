import { Badge } from "@custora/ui/components/badge";
import { Button } from "@custora/ui/components/button";
import { Input } from "@custora/ui/components/input";
import { Skeleton } from "@custora/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@custora/ui/components/table";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { PageHeader, Toolbar } from "@/components/app-sidebar";
import { FilterSelect } from "@/components/filter-select";
import { type Range, RangePicker } from "@/components/range-picker";
import { TableScroll } from "@/components/table-scroll";
import { formatNumber, formatRelative, shortenUrl } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/events")({
	component: EventsPage,
});

const EVENT_TYPES = [
	"pageview",
	"click",
	"form_submit",
	"identify",
	"custom",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

const TYPE_LABEL: Record<EventType, string> = {
	pageview: "Pageview",
	click: "Click",
	form_submit: "Form submit",
	identify: "Identify",
	custom: "Custom",
};

function EventsPage() {
	const trpc = useTRPC();
	const [range, setRange] = useState<Range>("30d");
	const [type, setType] = useState<EventType | undefined>();
	const [search, setSearch] = useState("");

	const counts = useQuery(
		trpc.events.countsByType.queryOptions({ range }, { retry: false }),
	);

	const events = useInfiniteQuery(
		trpc.events.list.infiniteQueryOptions(
			{ range, type, search: search.trim() || undefined, limit: 50 },
			{
				retry: false,
				getNextPageParam: (last) => last.nextCursor ?? undefined,
			},
		),
	);

	const rows = events.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<>
			<PageHeader
				title="Events"
				action={<RangePicker value={range} onChange={setRange} />}
			/>

			<Toolbar>
				<FilterSelect
					label="Filter by event type"
					value={type ?? null}
					onChange={(next) => setType((next as EventType | null) ?? undefined)}
					options={[
						{ label: "All events", value: null },
						...EVENT_TYPES.map((option) => ({
							label: TYPE_LABEL[option],
							value: option,
							count: counts.data?.[option] ?? 0,
						})),
					]}
				/>

				<div className="relative ml-auto w-full max-w-xs">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search by name or path"
						className="h-8 pl-8"
						aria-label="Search events"
					/>
				</div>
			</Toolbar>

			{events.isPending ? (
				<div className="flex flex-1 flex-col gap-px p-5">
					{Array.from({ length: 12 }, (_, i) => (
						<Skeleton key={i} className="h-9 w-full" />
					))}
				</div>
			) : rows.length === 0 ? (
				<EmptyEvents hasFilters={Boolean(type || search)} />
			) : (
				<TableScroll>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-background">
							<TableRow>
								<TableHead className="pl-5">Event</TableHead>
								<TableHead>Person</TableHead>
								<TableHead>Path</TableHead>
								<TableHead>Device</TableHead>
								<TableHead className="pr-5 text-right">When</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="pl-5">
										<div className="flex items-center gap-2">
											<Badge variant="outline">
												{TYPE_LABEL[row.type as EventType]}
											</Badge>
											<span className="truncate font-medium">
												{row.name ?? "—"}
											</span>
										</div>
									</TableCell>
									<TableCell>
										{row.contactId ? (
											<Link
												to="/contacts/$contactId"
												params={{ contactId: row.contactId }}
												className="underline underline-offset-2 hover:text-foreground"
											>
												{row.contactEmail ?? row.contactName ?? "Known"}
											</Link>
										) : (
											<span className="text-muted-foreground">Anonymous</span>
										)}
									</TableCell>
									<TableCell className="max-w-[220px] truncate text-muted-foreground">
										{row.path ?? shortenUrl(row.url)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{row.device ?? "—"}
										{row.country ? ` · ${row.country}` : ""}
									</TableCell>
									<TableCell className="pr-5 text-right text-muted-foreground">
										{formatRelative(row.createdAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableScroll>
			)}

			<div className="flex items-center justify-between gap-4 border-t px-5 py-2.5">
				<p className="text-muted-foreground text-xs">
					Viewing {formatNumber(rows.length)}{" "}
					{rows.length === 1 ? "event" : "events"}
				</p>
				<Button
					variant="outline"
					size="sm"
					disabled={!events.hasNextPage || events.isFetchingNextPage}
					onClick={() => events.fetchNextPage()}
				>
					{events.isFetchingNextPage
						? "Loading"
						: events.hasNextPage
							? "Load more"
							: "End of range"}
				</Button>
			</div>
		</>
	);
}

function EmptyEvents({ hasFilters }: { hasFilters: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<div className="max-w-sm text-center">
				<p className="font-medium text-sm tracking-tight">
					{hasFilters ? "No events match those filters" : "No events yet"}
				</p>
				<p className="mt-1 text-muted-foreground text-xs">
					{hasFilters
						? "Try a wider date range or clear the search."
						: "Install the snippet on your site and the stream fills up on the first pageview."}
				</p>
				{!hasFilters ? (
					<Button
						className="mt-4"
						variant="outline"
						render={<Link to="/sites" />}
					>
						Get the snippet
					</Button>
				) : null}
			</div>
		</div>
	);
}
