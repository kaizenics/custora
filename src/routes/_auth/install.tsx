import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	ChevronRight,
	Copy,
	Info,
	Plus,
	RefreshCw,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-sidebar";
import { NewSiteDialog } from "@/components/new-site-dialog";
import { getBaseUrl } from "@/lib/base-url";
import {
	INSTALL_STATUS,
	InstallBadge,
	InstallDetail,
	type InstallStatus,
} from "@/components/install-status";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { type WorkspaceSite, useWorkspace } from "@/lib/workspace";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/install")({
	component: InstallPage,
});

/**
 * The collector is served by this same app, so the snippet points back at
 * whatever origin the dashboard is on. In production that should be swapped for
 * a track.* subdomain of the site being tracked — see the note on each card.
 */
function collectorOrigin() {
	return getBaseUrl();
}


function snippetFor(writeKey: string) {
	return `<script defer\n  src="${collectorOrigin()}/c/v1/custora.js"\n  data-key="${writeKey}"></script>`;
}

/**
 * One workspace is one site, so this shows the site of the workspace you are
 * in rather than a list. A second site means a second workspace, which is what
 * the switcher is for — there is deliberately no way to add one from here.
 */
function InstallPage() {
	const { site, isPending, isEmpty } = useWorkspace();
	const [addOpen, setAddOpen] = useState(false);

	return (
		<>
			<PageHeader title="Install" />

			<div className="flex-1 overflow-y-auto">
				{isEmpty ? (
					<div className="flex h-full items-center justify-center p-6">
						<Card className="w-full max-w-md text-center">
							<CardHeader>
								<CardTitle>No site yet</CardTitle>
								<CardDescription>
									Add the domain you want to track. You get a snippet to paste
									before the closing &lt;/body&gt; tag, and attribution starts
									on the first pageview.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex justify-center">
								<Button size="sm" onClick={() => setAddOpen(true)}>
									<Plus data-icon="inline-start" />
									Add site
								</Button>
							</CardContent>
						</Card>
						<NewSiteDialog open={addOpen} onOpenChange={setAddOpen} />
					</div>
				) : isPending || !site ? (
					<div className="max-w-4xl p-6">
						<Skeleton className="h-64 w-full" />
					</div>
				) : (
					// Capped: prose and code run to ~1700px otherwise, and a line that
					// wide is hard to track back to the start of the next one.
					<div className="max-w-4xl p-6">
						<SiteCard site={site} />
					</div>
				)}
			</div>
		</>
	);
}

function SiteCard({ site }: { site: WorkspaceSite }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const rotate = useMutation(
		trpc.sites.rotateKey.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.sites.pathKey() });
				toast.success("Key rotated. Update the snippet on your site.");
			},
		}),
	);

	const verify = useMutation(
		trpc.sites.verify.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: trpc.sites.pathKey() });
				const descriptor = INSTALL_STATUS[result.status as InstallStatus];
				if (
					result.status === "live" ||
					result.status === "reporting_not_found"
				) {
					toast.success(`${site.domain}: ${descriptor.label}`);
				} else {
					toast.warning(`${site.domain}: ${descriptor.label}`);
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const check = verify.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{site.name}
					<Badge variant="outline">{site.domain}</Badge>
					<InstallBadge
						status={
							(check?.status ?? site.lastCheckStatus) as InstallStatus | null
						}
					/>
				</CardTitle>
				{/* Counts carry the meaning here, so they take the weight and the
				    words around them stay quiet. */}
				<CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
					<Stat value={formatNumber(site.visitorCount)} label="visitors" />
					<Dot />
					<Stat value={formatNumber(site.eventCount)} label="events" />
					<Dot />
					<span>added {formatDate(site.createdAt)}</span>
					{site.lastCheckedAt ? (
						<>
							<Dot />
							<span>checked {formatRelative(site.lastCheckedAt)}</span>
						</>
					) : null}
				</CardDescription>
				<CardAction>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							disabled={verify.isPending}
							onClick={() => verify.mutate({ siteId: site.id })}
						>
							<ShieldCheck data-icon="inline-start" />
							{verify.isPending ? "Checking" : "Verify install"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={rotate.isPending}
							onClick={() => rotate.mutate({ siteId: site.id })}
						>
							<RefreshCw data-icon="inline-start" />
							Rotate key
						</Button>
						<DeleteSiteDialog siteId={site.id} name={site.name} domain={site.domain} />
					</div>
				</CardAction>
			</CardHeader>

			<CardContent className="flex flex-col gap-6">
				{check ? (
					<>
						<InstallDetail
							status={check.status as InstallStatus}
							url={check.url}
							httpStatus={check.httpStatus}
							foundKey={check.foundKey}
							eventCount={check.eventCount}
							installedVia={check.installedVia}
						/>
						{check.error ? (
							<p className="text-destructive text-sm">{check.error}</p>
						) : null}
						<Separator />
					</>
				) : null}

				<CodeBlock
					title={
						<>
							Paste before the closing <code className="font-mono">&lt;/body&gt;</code>{" "}
							tag
						</>
					}
					action={
						<CopyButton value={snippetFor(site.writeKey)} label="Copy snippet" />
					}
					code={snippetFor(site.writeKey)}
				/>

				<details className="group">
					<summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-foreground text-sm [&::-webkit-details-marker]:hidden">
						<ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
						Tracking calls you can make from your own code
					</summary>
					<CodeBlock
						className="mt-3"
						code={`// Identify a person — this is what stitches their anonymous
// history to a contact, retroactively.
custora.identify({ email: "sam@northgate.dev", name: "Sam Okafor" })

// Any interaction worth reporting on.
custora.track("Booked a call", { plan: "pro" })

// Mark a button without writing any JS.
<button data-custora-event="Pricing CTA">Start free</button>`}
					/>
				</details>

				{/* Advice worth acting on, so it gets a surface of its own rather
				    than trailing off as grey text under the code. */}
				<div className="flex gap-3 border bg-muted/30 p-4">
					<Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<div className="flex flex-col gap-1">
						<p className="font-medium text-foreground text-sm">
							Before going to production
						</p>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Point <code className="font-mono text-foreground">track.{site.domain}</code>{" "}
							at this server and serve the snippet from there. A first-party
							subdomain is what keeps the visitor cookie alive past Safari&apos;s
							7-day cap on script-set cookies.
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

/** A number worth reading, with its unit kept out of the way. */
function Stat({ value, label }: { value: string; label: string }) {
	return (
		<span>
			<span className="font-medium text-foreground tabular-nums">{value}</span>{" "}
			{label}
		</span>
	);
}

function Dot() {
	return <span aria-hidden className="text-muted-foreground/50">·</span>;
}

/**
 * Label and code as one object rather than two floating pieces — the label
 * previously read as body text that happened to sit above a box.
 *
 * The code is set larger than the surrounding UI on purpose: it is the thing
 * on this page that has to be read character by character.
 */
function CodeBlock({
	title,
	action,
	code,
	className,
}: {
	title?: React.ReactNode;
	action?: React.ReactNode;
	code: string;
	className?: string;
}) {
	return (
		<div className={cn("border", className)}>
			{title || action ? (
				<div className="flex items-center justify-between gap-2 border-b bg-muted/40 py-1.5 pr-1.5 pl-3">
					<p className="font-medium text-foreground text-xs">{title}</p>
					{action}
				</div>
			) : null}
			<pre className="overflow-x-auto bg-muted/30 p-4 font-mono text-[13px] leading-6">
				{code}
			</pre>
		</div>
	);
}

function CopyButton({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<Button
			variant="ghost"
			size="xs"
			onClick={async () => {
				await navigator.clipboard.writeText(value);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? (
				<Check data-icon="inline-start" />
			) : (
				<Copy data-icon="inline-start" />
			)}
			{copied ? "Copied" : label}
		</Button>
	);
}


/**
 * Deleting a site cascades to every visitor, session, event, touchpoint,
 * contact, deal and rule under it. There is no undo, so the confirmation shows
 * the real numbers and requires the domain to be typed back — the same guard
 * the server enforces.
 */
function DeleteSiteDialog({
	siteId,
	name,
	domain,
}: {
	siteId: string;
	name: string;
	domain: string;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState("");

	const impact = useQuery(
		trpc.sites.deletionImpact.queryOptions({ siteId }, { enabled: open }),
	);

	const remove = useMutation(
		trpc.sites.remove.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries();
				toast.success(
					`${result.name} deleted along with ${formatNumber(result.events)} events`,
				);
				setOpen(false);
				setConfirm("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const matches = confirm.trim().toLowerCase() === domain.toLowerCase();

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setConfirm("");
			}}
		>
			<DialogTrigger render={<Button variant="outline" size="sm" />}>
				<Trash2 data-icon="inline-start" />
				Delete
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete {name}?</DialogTitle>
					<DialogDescription>
						This removes the site and everything recorded for it. It cannot be
						undone.
					</DialogDescription>
				</DialogHeader>

				{impact.isPending ? (
					<Skeleton className="h-20 w-full" />
				) : impact.data ? (
					<ul className="flex flex-col gap-1 border p-3 text-xs">
						<li className="flex justify-between">
							<span className="text-muted-foreground">Visitors</span>
							<span className="tabular-nums">
								{formatNumber(impact.data.visitors)}
							</span>
						</li>
						<li className="flex justify-between">
							<span className="text-muted-foreground">Events</span>
							<span className="tabular-nums">
								{formatNumber(impact.data.events)}
							</span>
						</li>
						<li className="flex justify-between">
							<span className="text-muted-foreground">Contacts</span>
							<span className="tabular-nums">
								{formatNumber(impact.data.contacts)}
							</span>
						</li>
						<li className="flex justify-between">
							<span className="text-muted-foreground">Deals</span>
							<span className="tabular-nums">
								{formatNumber(impact.data.deals)}
							</span>
						</li>
						<li className="flex justify-between">
							<span className="text-muted-foreground">Tracking rules</span>
							<span className="tabular-nums">
								{formatNumber(impact.data.rules)}
							</span>
						</li>
					</ul>
				) : null}

				<Field>
					<FieldLabel htmlFor={`confirm-${siteId}`}>
						Type <span className="font-mono">{domain}</span> to confirm
					</FieldLabel>
					<Input
						id={`confirm-${siteId}`}
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						placeholder={domain}
						autoComplete="off"
					/>
				</Field>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
					<Button
						variant="destructive"
						disabled={!matches || remove.isPending}
						onClick={() => remove.mutate({ siteId, confirmDomain: confirm.trim() })}
					>
						{remove.isPending ? "Deleting" : "Delete permanently"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
