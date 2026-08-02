import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { PageHeader, TableFooterBar, Toolbar } from "@/components/app-sidebar";
import { FilterSelect } from "@/components/filter-select";
import { type Range, RangePicker } from "@/components/range-picker";
import { TableScroll } from "@/components/table-scroll";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/contacts/")({
	component: ContactsPage,
});

const STATUSES = ["lead", "qualified", "customer", "churned"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
	lead: "Lead",
	qualified: "Qualified",
	customer: "Customer",
	churned: "Churned",
};

function ContactsPage() {
	const trpc = useTRPC();
	const [range, setRange] = useState<Range>("30d");
	const [status, setStatus] = useState<Status | undefined>();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);

	const counts = useQuery(
		trpc.contacts.countsByStatus.queryOptions({ range }, { retry: false }),
	);
	const contacts = useQuery(
		trpc.contacts.list.queryOptions(
			{ range, status, search: search.trim() || undefined, page, limit: 25 },
			{ retry: false },
		),
	);

	const rows = contacts.data?.items ?? [];

	return (
		<>
			<PageHeader
				title="Contacts"
				action={<RangePicker value={range} onChange={setRange} />}
			/>

			<Toolbar>
				<FilterSelect
					label="Filter by status"
					value={status ?? null}
					onChange={(next) => {
						setStatus((next as Status | null) ?? undefined);
						setPage(0);
					}}
					options={[
						{ label: "All statuses", value: null },
						...STATUSES.map((option) => ({
							label: STATUS_LABEL[option],
							value: option,
							count: counts.data?.[option] ?? 0,
						})),
					]}
				/>

				<div className="relative ml-auto w-full max-w-xs">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(0);
						}}
						placeholder="Search by email, name, company"
						className="h-8 pl-8"
						aria-label="Search contacts"
					/>
				</div>
			</Toolbar>

			{contacts.isPending ? (
				<div className="flex flex-1 flex-col gap-px p-5">
					{Array.from({ length: 10 }, (_, i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			) : rows.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<div className="max-w-sm text-center">
						<p className="font-medium text-sm tracking-tight">
							No contacts yet
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							A contact is created the first time a tracked visitor submits an
							email or phone number. Everything they did before that gets
							attached retroactively.
						</p>
					</div>
				</div>
			) : (
				<TableScroll>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-background">
							<TableRow>
								<TableHead className="pl-5">Person</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>First touch</TableHead>
								<TableHead className="text-right">Touches</TableHead>
								<TableHead className="text-right">Revenue</TableHead>
								<TableHead className="pr-5 text-right">Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="pl-5">
										<Link
											to="/contacts/$contactId"
											params={{ contactId: row.id }}
											className="font-medium underline-offset-2 hover:underline"
										>
											{row.email ?? row.name ?? row.id}
										</Link>
										{row.company ? (
											<p className="text-[11px] text-muted-foreground">
												{row.company}
											</p>
										) : null}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												row.status === "customer" ? "default" : "outline"
											}
										>
											{STATUS_LABEL[row.status as Status]}
										</Badge>
									</TableCell>
									<TableCell>
										{row.firstTouchSource ? (
											<>
												<span>{row.firstTouchSource}</span>
												{row.firstTouchCampaign ? (
													<p className="truncate text-[11px] text-muted-foreground">
														{row.firstTouchCampaign}
													</p>
												) : null}
											</>
										) : (
											<span className="text-muted-foreground">
												Unattributed
											</span>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatNumber(row.touchCount)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.dealValueCents > 0
											? formatCurrency(row.dealValueCents)
											: "—"}
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

			<TableFooterBar
				label={`Viewing ${formatNumber(rows.length)} of ${formatNumber(contacts.data?.total ?? 0)} contacts`}
				page={page}
				pageCount={contacts.data?.pageCount ?? 1}
				onPageChange={setPage}
			/>
		</>
	);
}
