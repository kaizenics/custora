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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	Copy,
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
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/sites")({
	component: SitesPage,
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

function SitesPage() {
	const trpc = useTRPC();
	const sites = useQuery(trpc.sites.list.queryOptions());

	return (
		<>
			<PageHeader title="Sites" action={<NewSiteDialog />} />

			<div className="flex-1 overflow-y-auto">
				{sites.isPending ? (
					<div className="flex flex-col gap-4 p-5">
						<Skeleton className="h-40 w-full" />
					</div>
				) : sites.data?.length ? (
					<div className="flex flex-col gap-4 p-4">
						{sites.data.map((site) => (
							<SiteCard key={site.id} site={site} />
						))}
					</div>
				) : (
					<div className="flex h-full items-center justify-center p-6">
						<Card className="w-full max-w-md text-center">
							<CardHeader>
								<CardTitle>No sites yet</CardTitle>
								<CardDescription>
									Add the domain you want to track. You get a snippet to paste
									before the closing &lt;/body&gt; tag, and attribution starts
									on the first pageview.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex justify-center">
								<NewSiteDialog />
							</CardContent>
						</Card>
					</div>
				)}
			</div>
		</>
	);
}

type SiteRow = {
	id: string;
	name: string;
	domain: string;
	writeKey: string;
	/** Dates arrive as ISO strings — no superjson transformer on the tRPC link. */
	createdAt: string;
	lastCheckedAt: string | null;
	lastCheckStatus: string | null;
	eventCount: number;
	visitorCount: number;
};

function SiteCard({ site }: { site: SiteRow }) {
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
				<CardDescription>
					{formatNumber(site.visitorCount)} visitors ·{" "}
					{formatNumber(site.eventCount)} events · added{" "}
					{formatDate(site.createdAt)}
					{site.lastCheckedAt
						? ` · checked ${formatRelative(site.lastCheckedAt)}`
						: ""}
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

			<CardContent className="flex flex-col gap-3">
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
							<p className="text-[11px] text-destructive">{check.error}</p>
						) : null}
						<Separator />
					</>
				) : null}

				<div>
					<div className="mb-1.5 flex items-center justify-between">
						<p className="font-medium text-[11px] text-muted-foreground">
							Paste before the closing &lt;/body&gt; tag
						</p>
						<CopyButton
							value={snippetFor(site.writeKey)}
							label="Copy snippet"
						/>
					</div>
					<pre className="overflow-x-auto border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
						{snippetFor(site.writeKey)}
					</pre>
				</div>

				<Separator />

				<details>
					<summary className="cursor-pointer font-medium text-[11px] text-muted-foreground">
						Tracking calls you can make from your own code
					</summary>
					<pre className="mt-2 overflow-x-auto border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
						{`// Identify a person — this is what stitches their anonymous
// history to a contact, retroactively.
custora.identify({ email: "sam@northgate.dev", name: "Sam Okafor" })

// Any interaction worth reporting on.
custora.track("Booked a call", { plan: "pro" })

// Mark a button without writing any JS.
<button data-custora-event="Pricing CTA">Start free</button>`}
					</pre>
				</details>

				<Separator />

				<p className="text-[11px] text-muted-foreground">
					For production, point{" "}
					<code className="font-mono">track.{site.domain}</code> at this server
					and serve the snippet from there. A first-party subdomain is what
					keeps the visitor cookie alive past Safari&apos;s 7-day cap on
					script-set cookies.
				</p>
			</CardContent>
		</Card>
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
