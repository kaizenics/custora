import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { PageHeader, TableFooterBar, Toolbar } from "@/components/app-sidebar";
import { FilterSelect } from "@/components/filter-select";
import { type Range, RangePicker } from "@/components/range-picker";
import { TableScroll } from "@/components/table-scroll";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";
import { useWorkspace } from "@/lib/workspace";

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
	const { siteId, isEmpty } = useWorkspace();
	const [range, setRange] = useState<Range>("30d");
	const [status, setStatus] = useState<Status | undefined>();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);

	const counts = useQuery(
		trpc.contacts.countsByStatus.queryOptions({ siteId, range }, { retry: false, enabled: Boolean(siteId) }),
	);
	const contacts = useQuery(
		trpc.contacts.list.queryOptions(
			{ siteId, range, status, search: search.trim() || undefined, page, limit: 25 },
			{ retry: false, enabled: Boolean(siteId) },
		),
	);

	const rows = contacts.data?.items ?? [];

	return (
		<>
			<PageHeader
				title="Contacts"
				action={
					<div className="flex items-center gap-2">
						<RangePicker value={range} onChange={setRange} />
						<NewContactDialog siteId={siteId} />
					</div>
				}
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

			{contacts.isPending && !isEmpty ? (
				<div className="flex flex-1 flex-col gap-px p-5">
					{Array.from({ length: 10 }, (_, i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			) : rows.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6">
					<div className="w-full max-w-sm text-center">
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

/**
 * Adds a contact by hand — someone who phoned in, or a customer from before the
 * tracking existed.
 *
 * Email or phone, either one. A business whose leads arrive as calls knows the
 * number and often nothing else, so demanding an address would make the form
 * unusable for the most common case.
 */
function NewContactDialog({ siteId }: { siteId?: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [name, setName] = useState("");
	const [company, setCompany] = useState("");
	const [status, setStatus] = useState<string>("lead");

	const create = useMutation(
		trpc.contacts.create.mutationOptions({
			onSuccess: (contact) => {
				queryClient.invalidateQueries({ queryKey: trpc.contacts.pathKey() });
				queryClient.invalidateQueries({ queryKey: trpc.analytics.pathKey() });
				toast.success(`${contact.name ?? contact.email ?? contact.phone} added.`);
				setOpen(false);
				setEmail("");
				setPhone("");
				setName("");
				setCompany("");
				setStatus("lead");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	// Mirrors the server's rule, so the button explains itself before a round trip.
	const ready = Boolean(email.trim() || phone.trim());

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<Plus data-icon="inline-start" />
				New contact
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a contact</DialogTitle>
					<DialogDescription>
						Email or phone — whichever you have. If this person later submits a
						form with the same details, their browsing history is stitched onto
						this record automatically.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-contact"
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (!ready) return;
						create.mutate({
							siteId,
							email: email.trim() || undefined,
							phone: phone.trim() || undefined,
							name: name.trim() || undefined,
							company: company.trim() || undefined,
							status: status as "lead" | "qualified" | "customer" | "churned",
						});
					}}
				>
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-2">
							<Label htmlFor="contact-email">Email</Label>
							<Input
								id="contact-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="sam@example.com"
								autoComplete="off"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="contact-phone">Phone</Label>
							<Input
								id="contact-phone"
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="+34 600 000 000"
								autoComplete="off"
							/>
						</div>
					</div>

					{!ready ? (
						<p className="text-[11px] text-muted-foreground">
							Enter at least one of the two.
						</p>
					) : null}

					<div className="flex flex-col gap-2">
						<Label htmlFor="contact-name">Name</Label>
						<Input
							id="contact-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Sam Okafor"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="contact-company">Company</Label>
						<Input
							id="contact-company"
							value={company}
							onChange={(e) => setCompany(e.target.value)}
							placeholder="Optional"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="contact-status">Status</Label>
						<FilterSelect
							id="contact-status"
							label="Status"
							value={status}
							onChange={(next) => setStatus(next ?? "lead")}
							options={STATUSES.map((option) => ({
								label: STATUS_LABEL[option],
								value: option,
							}))}
						/>
					</div>
				</form>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
					<Button
						type="submit"
						form="new-contact"
						disabled={!ready || create.isPending}
					>
						{create.isPending ? "Adding" : "Add contact"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
