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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Check,
	Copy,
	Plus,
	RefreshCw,
	Trash2,
	SearchCheck,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-sidebar";
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

/** Mirrors the server's domain normalisation so the stale-result check lines up. */
function normalizeDomain(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/.*$/, "")
		.replace(/:\d+$/, "");
}

function Row({ tone, text }: { tone: "good" | "warn" | "bad"; text: string }) {
	const Icon =
		tone === "good" ? Check : tone === "warn" ? TriangleAlert : ShieldCheck;
	return (
		<div className="flex items-start gap-2">
			<Icon
				className={cn(
					"mt-0.5 size-3.5 shrink-0",
					tone === "bad" && "text-destructive",
					tone === "warn" && "text-muted-foreground",
				)}
			/>
			<p className={cn("text-[11px]", tone === "bad" && "text-destructive")}>
				{text}
			</p>
		</div>
	);
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

function NewSiteDialog() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");

	const checkDomain = useMutation(trpc.sites.checkDomain.mutationOptions());

	const create = useMutation(
		trpc.sites.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.sites.pathKey() });
				toast.success("Site added");
				setOpen(false);
				setName("");
				setDomain("");
				checkDomain.reset();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const probe = checkDomain.data;
	// Re-checking is required after an edit — a stale result for a different
	// domain is worse than no result at all.
	const probeIsStale =
		probe != null && probe.domain !== normalizeDomain(domain);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<Plus data-icon="inline-start" />
				Add site
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a site</DialogTitle>
					<DialogDescription>
						Every visitor, event, and contact is scoped to a site, so a second
						brand stays cleanly separated.
					</DialogDescription>
				</DialogHeader>

				<form
					id="new-site"
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						if (!name.trim() || !domain.trim()) return;
						create.mutate({ name: name.trim(), domain: domain.trim() });
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="site-name">Name</Label>
						<Input
							id="site-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Marketing site"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="site-domain">Domain</Label>
						<div className="flex gap-2">
							<Input
								id="site-domain"
								value={domain}
								onChange={(e) => setDomain(e.target.value)}
								placeholder="northgate.dev"
								required
							/>
							<Button
								type="button"
								variant="outline"
								disabled={!domain.trim() || checkDomain.isPending}
								onClick={() => checkDomain.mutate({ domain: domain.trim() })}
							>
								<SearchCheck data-icon="inline-start" />
								{checkDomain.isPending ? "Checking" : "Check"}
							</Button>
						</div>
					</div>

					{checkDomain.error ? (
						<p className="text-[11px] text-destructive">
							{checkDomain.error.message}
						</p>
					) : null}

					{probe && !probeIsStale ? (
						<div className="flex flex-col gap-2 border p-3">
							{probe.alreadyTracked ? (
								<Row
									tone="bad"
									text={`Already tracked as "${probe.existingSiteName}". Adding it again would split its visitors across two keys.`}
								/>
							) : (
								<Row tone="good" text="Not tracked here yet." />
							)}

							{probe.reachable ? (
								<Row
									tone="good"
									text={`Reachable — responded ${probe.httpStatus} at https://${probe.domain}/`}
								/>
							) : (
								<Row
									tone="warn"
									text={`Could not fetch the site: ${probe.error}. You can still add it — the snippet may just not be deployed yet.`}
								/>
							)}

							{probe.existingSnippetKey ? (
								<Row
									tone={probe.snippetMatchesExisting ? "good" : "warn"}
									text={
										probe.snippetMatchesExisting
											? "A Custora snippet is already live on this page, using the existing site's key."
											: "A Custora snippet is already on this page under a different key. Reuse that site instead of adding a second one, or rotate the key after adding."
									}
								/>
							) : probe.reachable ? (
								<Row
									tone="warn"
									text="No Custora snippet on the page yet. You will get one to paste after adding."
								/>
							) : null}
						</div>
					) : null}
				</form>

				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>
						Cancel
					</DialogClose>
					<Button
						type="submit"
						form="new-site"
						disabled={
							!name.trim() ||
							!domain.trim() ||
							create.isPending ||
							// Hard block: the server rejects it anyway, so do not let the
							// form pretend it might work.
							Boolean(probe && !probeIsStale && probe.alreadyTracked)
						}
					>
						{create.isPending ? "Adding" : "Add site"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
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
