import { Badge } from "@custora/ui/components/badge";
import { Button } from "@custora/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@custora/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@custora/ui/components/dropdown-menu";
import { Input } from "@custora/ui/components/input";
import { Label } from "@custora/ui/components/label";
import { Skeleton } from "@custora/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@custora/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, TableFooterBar, Toolbar } from "@/components/app-sidebar";
import { FilterSelect } from "@/components/filter-select";
import { TableScroll } from "@/components/table-scroll";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/deals")({
	component: DealsPage,
});

const STAGES = ["open", "won", "lost"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
	open: "Open",
	won: "Won",
	lost: "Lost",
};

function DealsPage() {
	const trpc = useTRPC();
	const [stage, setStage] = useState<Stage | undefined>();
	const [page, setPage] = useState(0);

	const totals = useQuery(trpc.deals.totals.queryOptions({}, { retry: false }));
	const deals = useQuery(
		trpc.deals.list.queryOptions({ stage, page, limit: 25 }, { retry: false }),
	);

	const rows = deals.data?.items ?? [];

	return (
		<>
			<PageHeader title="Deals" action={<NewDealDialog />} />

			<section className="grid grid-cols-3 border-b [&>*:last-child]:border-r-0 [&>*]:border-r">
				<Total
					label="Open pipeline"
					data={totals.data?.open}
					isPending={totals.isPending}
				/>
				<Total
					label="Won"
					data={totals.data?.won}
					isPending={totals.isPending}
				/>
				<Total
					label="Lost"
					data={totals.data?.lost}
					isPending={totals.isPending}
				/>
			</section>

			<Toolbar>
				<FilterSelect
					label="Filter by stage"
					value={stage ?? null}
					onChange={(next) => {
						setStage((next as Stage | null) ?? undefined);
						setPage(0);
					}}
					options={[
						{ label: "All stages", value: null },
						...STAGES.map((option) => ({
							label: STAGE_LABEL[option],
							value: option,
						})),
					]}
				/>
			</Toolbar>

			{deals.isPending ? (
				<div className="flex flex-1 flex-col gap-px p-5">
					{Array.from({ length: 8 }, (_, i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			) : rows.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<div className="max-w-sm text-center">
						<p className="font-medium text-sm tracking-tight">No deals yet</p>
						<p className="mt-1 text-muted-foreground text-xs">
							A deal is what turns a tracked lead into revenue. Attach one to a
							contact and its originating campaign starts showing a return.
						</p>
					</div>
				</div>
			) : (
				<TableScroll>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-background">
							<TableRow>
								<TableHead className="pl-5">Deal</TableHead>
								<TableHead>Contact</TableHead>
								<TableHead>Attributed to</TableHead>
								<TableHead className="text-right">Value</TableHead>
								<TableHead>Stage</TableHead>
								<TableHead className="pr-5 text-right">Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="pl-5 font-medium">
										{row.title}
									</TableCell>
									<TableCell>
										<Link
											to="/contacts/$contactId"
											params={{ contactId: row.contactId }}
											className="underline-offset-2 hover:underline"
										>
											{row.contactEmail ?? row.contactName ?? row.contactId}
										</Link>
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
										{formatCurrency(row.valueCents, row.currency)}
									</TableCell>
									<TableCell>
										<StagePicker dealId={row.id} stage={row.stage as Stage} />
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
				label={`Viewing ${formatNumber(rows.length)} of ${formatNumber(deals.data?.total ?? 0)} deals`}
				page={page}
				pageCount={deals.data?.pageCount ?? 1}
				onPageChange={setPage}
			/>
		</>
	);
}

function Total({
	label,
	data,
	isPending,
}: {
	label: string;
	data?: { deals: number; valueCents: number };
	isPending: boolean;
}) {
	return (
		<div className="p-4">
			<p className="font-medium text-[11px] text-muted-foreground">{label}</p>
			{isPending ? (
				<Skeleton className="mt-2 h-6 w-24" />
			) : (
				<>
					<p className="mt-1 font-medium text-xl tabular-nums tracking-tight">
						{formatCurrency(data?.valueCents ?? 0)}
					</p>
					<p className="mt-0.5 text-[11px] text-muted-foreground">
						{formatNumber(data?.deals ?? 0)} deals
					</p>
				</>
			)}
		</div>
	);
}

function StagePicker({ dealId, stage }: { dealId: string; stage: Stage }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const updateStage = useMutation(
		trpc.deals.updateStage.mutationOptions({
			onSuccess: (deal) => {
				queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() });
				queryClient.invalidateQueries({ queryKey: trpc.analytics.pathKey() });
				queryClient.invalidateQueries({ queryKey: trpc.contacts.pathKey() });
				toast.success(`Deal marked ${deal.stage}`);
			},
		}),
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Badge
						variant={stage === "won" ? "default" : "outline"}
						render={<button type="button" />}
					/>
				}
			>
				{STAGE_LABEL[stage]}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-32">
				{STAGES.map((option) => (
					<DropdownMenuItem
						key={option}
						onClick={() => updateStage.mutate({ dealId, stage: option })}
					>
						{STAGE_LABEL[option]}
						{option === stage ? <Check className="ml-auto" /> : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NewDealDialog() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [contactId, setContactId] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [value, setValue] = useState("");

	const contacts = useQuery(
		trpc.contacts.list.queryOptions(
			{ range: "all", limit: 100 },
			{ retry: false },
		),
	);

	const create = useMutation(
		trpc.deals.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() });
				queryClient.invalidateQueries({ queryKey: trpc.analytics.pathKey() });
				toast.success("Deal created");
				setOpen(false);
				setContactId(null);
				setTitle("");
				setValue("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const contactOptions = [
		{ label: "Select a contact", value: null },
		...(contacts.data?.items ?? []).map((item) => ({
			label: item.email ?? item.name ?? item.id,
			value: item.id,
		})),
	];

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<Plus data-icon="inline-start" />
				New deal
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New deal</DialogTitle>
					<DialogDescription>
						Attaching revenue to a contact is what makes their originating
						campaign measurable.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-deal"
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (!contactId || !title.trim()) return;
						create.mutate({
							contactId,
							title: title.trim(),
							value: Number(value) || 0,
						});
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="deal-contact">Contact</Label>
						<FilterSelect
							id="deal-contact"
							label="Contact"
							className="w-full"
							value={contactId}
							onChange={setContactId}
							options={contactOptions}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="deal-title">Title</Label>
						<Input
							id="deal-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Annual retainer"
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="deal-value">Value (USD)</Label>
						<Input
							id="deal-value"
							type="number"
							min="0"
							step="0.01"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="4800"
						/>
					</div>
				</form>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>
						Cancel
					</DialogClose>
					<Button
						type="submit"
						form="new-deal"
						disabled={!contactId || !title.trim() || create.isPending}
					>
						{create.isPending ? "Creating" : "Create deal"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
