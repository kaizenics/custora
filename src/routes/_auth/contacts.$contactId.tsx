import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ChevronDown,
	MousePointerClick,
	Send,
	Tag,
	UserCheck,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-sidebar";
import {
	formatCurrency,
	formatDateTime,
	formatNumber,
	shortenUrl,
} from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/contacts/$contactId")({
	component: ContactDetailPage,
});

const STATUSES = ["lead", "qualified", "customer", "churned"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
	lead: "Lead",
	qualified: "Qualified",
	customer: "Customer",
	churned: "Churned",
};

const EVENT_ICON = {
	pageview: Tag,
	click: MousePointerClick,
	form_submit: Send,
	identify: UserCheck,
	custom: Tag,
} as const;

function ContactDetailPage() {
	const { contactId } = Route.useParams();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const contact = useQuery(
		trpc.contacts.get.queryOptions({ contactId }, { retry: false }),
	);

	const updateStatus = useMutation(
		trpc.contacts.updateStatus.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.contacts.pathKey() });
				toast.success("Status updated");
			},
		}),
	);

	if (contact.isPending) {
		return (
			<>
				<PageHeader title="Contact" />
				<div className="flex-1 p-5">
					<Skeleton className="h-64 w-full" />
				</div>
			</>
		);
	}

	if (contact.error || !contact.data) {
		return (
			<>
				<PageHeader title="Contact" />
				<div className="flex flex-1 items-center justify-center">
					<p className="text-muted-foreground text-xs">
						This contact no longer exists.
					</p>
				</div>
			</>
		);
	}

	const {
		contact: person,
		touches,
		events,
		deals,
		deviceCount,
		revenueCents,
		firstTouch,
		daysToConvert,
	} = contact.data;

	// Marketing touches and product interactions read as one story, so they are
	// merged into a single chronological stream rather than two parallel lists.
	const timeline = [
		...touches.map((touch) => ({
			kind: "touch" as const,
			at: new Date(touch.createdAt).getTime(),
			touch,
		})),
		...events.map((event) => ({
			kind: "event" as const,
			at: new Date(event.createdAt).getTime(),
			event,
		})),
	].sort((a, b) => a.at - b.at);

	return (
		<>
			<PageHeader
				title={person.email ?? person.name ?? "Contact"}
				action={
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant="outline" size="sm" />}
						>
							{STATUS_LABEL[person.status as Status]}
							<ChevronDown data-icon="inline-end" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							{STATUSES.map((status) => (
								<DropdownMenuItem
									key={status}
									onClick={() => updateStatus.mutate({ contactId, status })}
								>
									{STATUS_LABEL[status]}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				}
			>
				<Button
					variant="ghost"
					size="icon-sm"
					render={<Link to="/contacts" />}
					aria-label="Back to contacts"
				>
					<ArrowLeft />
				</Button>
			</PageHeader>

			<div className="grid flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[1fr_320px]">
				<div className="overflow-y-auto border-r">
					<div className="grid grid-cols-2 border-b sm:grid-cols-4 [&>*:last-child]:border-r-0 [&>*]:border-r">
						<Fact
							label="Revenue"
							value={revenueCents > 0 ? formatCurrency(revenueCents) : "—"}
						/>
						<Fact label="Touches" value={formatNumber(touches.length)} />
						<Fact label="Devices" value={formatNumber(deviceCount)} />
						<Fact
							label="Days to convert"
							value={daysToConvert === null ? "—" : formatNumber(daysToConvert)}
							hint={
								daysToConvert !== null && daysToConvert > 7
									? "Past third-party cookie life"
									: undefined
							}
						/>
					</div>

					<section className="p-5">
						<h2 className="mb-4 font-medium text-xs">Journey</h2>

						{timeline.length === 0 ? (
							<p className="py-8 text-center text-muted-foreground text-xs">
								No recorded activity for this person yet.
							</p>
						) : (
							<ol className="relative flex flex-col gap-4 border-l pl-5">
								{timeline.map((item) => {
									if (item.kind === "touch") {
										return (
											<li key={item.touch.id} className="relative">
												<span
													className="absolute top-1 -left-[23px] size-1.5 bg-chart-2"
													aria-hidden
												/>
												<Card className="gap-0 p-3">
													<div className="flex flex-wrap items-center gap-2">
														<span className="font-medium text-xs">
															{item.touch.source ?? "direct"}
														</span>
														<Badge variant="outline">
															{item.touch.medium ?? "none"}
														</Badge>
														{item.touch.clickIdProvider ? (
															<Badge variant="secondary">
																{item.touch.clickIdProvider} click ID
															</Badge>
														) : null}
													</div>
													{item.touch.campaign ? (
														<p className="mt-1 text-[11px] text-muted-foreground">
															Campaign: {item.touch.campaign}
														</p>
													) : null}
													{item.touch.landingUrl ? (
														<p className="mt-0.5 truncate text-[11px] text-muted-foreground">
															Landed on {shortenUrl(item.touch.landingUrl, 60)}
														</p>
													) : null}
													<p className="mt-1 text-[11px] text-muted-foreground">
														{formatDateTime(item.touch.createdAt)}
													</p>
												</Card>
											</li>
										);
									}

									const Icon =
										EVENT_ICON[item.event.type as keyof typeof EVENT_ICON] ??
										Tag;
									return (
										<li key={item.event.id} className="relative">
											<span
												className="absolute top-1.5 -left-[22px] size-1 rounded-full bg-border"
												aria-hidden
											/>
											<div className="flex items-baseline gap-2">
												<Icon className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" />
												<span className="text-xs">
													{item.event.name ?? item.event.type}
												</span>
												<span className="truncate text-[11px] text-muted-foreground">
													{item.event.path ?? ""}
												</span>
												<span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
													{formatDateTime(item.event.createdAt)}
												</span>
											</div>
										</li>
									);
								})}
							</ol>
						)}
					</section>
				</div>

				<aside className="overflow-y-auto">
					<section className="border-b p-5">
						<h2 className="mb-3 font-medium text-xs">Details</h2>
						<dl className="flex flex-col gap-2 text-xs">
							<Detail label="Email" value={person.email ?? "—"} />
							<Detail label="Phone" value={person.phone ?? "—"} />
							<Detail label="Name" value={person.name ?? "—"} />
							<Detail label="Company" value={person.company ?? "—"} />
							<Detail
								label="Created"
								value={formatDateTime(person.createdAt)}
							/>
						</dl>
					</section>

					<section className="border-b p-5">
						<h2 className="mb-3 font-medium text-xs">Attribution</h2>
						{firstTouch ? (
							<dl className="flex flex-col gap-2 text-xs">
								<Detail
									label="First touch"
									value={person.firstTouchSource ?? "—"}
								/>
								<Detail
									label="First campaign"
									value={person.firstTouchCampaign ?? "—"}
								/>
								<Detail
									label="Last touch"
									value={person.lastTouchSource ?? "—"}
								/>
								<Detail
									label="Last campaign"
									value={person.lastTouchCampaign ?? "—"}
								/>
							</dl>
						) : (
							<p className="text-muted-foreground text-xs">
								No attributable touch. This person arrived with no referrer,
								campaign, or click ID.
							</p>
						)}
					</section>

					<section className="p-5">
						<h2 className="mb-3 font-medium text-xs">Deals</h2>
						{deals.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								No deals yet. Create one from the Deals page to attach revenue.
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{deals.map((deal) => (
									<li key={deal.id}>
										<Card className="gap-0 p-3">
											<div className="flex items-center justify-between gap-2">
												<span className="truncate font-medium text-xs">
													{deal.title}
												</span>
												<Badge
													variant={deal.stage === "won" ? "default" : "outline"}
												>
													{deal.stage}
												</Badge>
											</div>
											<p className="mt-1 text-xs tabular-nums">
												{formatCurrency(deal.valueCents, deal.currency)}
											</p>
										</Card>
									</li>
								))}
							</ul>
						)}
					</section>
				</aside>
			</div>
		</>
	);
}

function Fact({
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
			<p className="mt-1 font-medium text-lg tabular-nums tracking-tight">
				{value}
			</p>
			{hint ? (
				<p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

function Detail({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="truncate text-right">{value}</dd>
		</div>
	);
}
