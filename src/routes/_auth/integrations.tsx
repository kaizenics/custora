import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	CircleCheck,
	Info,
	Link2,
	Link2Off,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-sidebar";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { SettingsSection } from "@/components/settings-section";
import { useIsAdmin } from "@/lib/auth-client";
import { getBaseUrl } from "@/lib/base-url";
import { formatRelative } from "@/lib/format";
import { googleAdsScript } from "@/lib/google-ads-script";
import { useWorkspace } from "@/lib/workspace";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/integrations")({
	component: IntegrationsPage,
});

function IntegrationsPage() {
	const isAdmin = useIsAdmin();

	return (
		<>
			<PageHeader title="Integrations" />
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
					{isAdmin ? (
						<GoogleAdsSettings />
					) : (
						<SettingsSection
							title="Integrations"
							description="Connections to outside platforms."
						>
							<p className="border p-3 text-muted-foreground text-xs">
								Only admins can configure integrations.
							</p>
						</SettingsSection>
					)}
				</div>
			</div>
		</>
	);
}

function GoogleAdsSettings() {
	const trpc = useTRPC();
	const { siteId } = useWorkspace();
	const queryClient = useQueryClient();
	const config = useQuery(trpc.integrations.googleAds.queryOptions());

	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [developerToken, setDeveloperToken] = useState("");
	const [apiVersion, setApiVersion] = useState("");
	const [touched, setTouched] = useState(false);

	const save = useMutation(
		trpc.integrations.saveGoogleAds.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.integrations.pathKey() });
				queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
				toast.success("Google Ads credentials saved.");
				setClientSecret("");
				setDeveloperToken("");
				setTouched(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const clear = useMutation(
		trpc.integrations.clearGoogleAds.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: trpc.integrations.pathKey() });
				queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
				toast.success(
					result.stillFromEnv
						? "Saved values cleared. Environment variables are still supplying credentials."
						: "Google Ads credentials cleared.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (config.isPending) return <Skeleton className="h-64 w-full" />;

	const data = config.data;
	const redirectUri = new URL(
		"/api/ads/google/callback",
		getBaseUrl(),
	).toString();

	// Pre-fill the client id once, then leave the field alone so typing is not
	// clobbered by a refetch.
	const clientIdValue = touched ? clientId : (clientId || data?.clientId || "");

	return (
		<>
			<SettingsSection
				title="Google Ads"
				description="Credentials for this deployment. Stored encrypted, and used by every workspace that connects an ad account."
			>
				{data?.complete ? (
					<div className="flex items-center gap-2 border p-3">
						<CircleCheck className="size-4 shrink-0 text-chart-2" />
						<p className="text-xs">
							Configured
							{data.source.clientSecret === "env" ? (
								<span className="text-muted-foreground">
									{" "}
									— from environment variables
								</span>
							) : null}
							. Connect an ad account below.
						</p>
					</div>
				) : (
					<div className="flex items-start gap-2 border p-3">
						<Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
						<p className="text-muted-foreground text-xs">
							Not configured yet. Until it is, spend can still be imported from
							the Google Ads CSV export — the reports are identical either way.
						</p>
					</div>
				)}

				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (!clientIdValue.trim()) return;
						save.mutate({
							clientId: clientIdValue.trim(),
							clientSecret: clientSecret.trim() || undefined,
							developerToken: developerToken.trim() || undefined,
							apiVersion: apiVersion.trim() || undefined,
						});
					}}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor="gads-client-id">
							Client ID
							<Source from={data?.source.clientId} />
						</Label>
						<Input
							id="gads-client-id"
							value={clientIdValue}
							onChange={(e) => {
								setTouched(true);
								setClientId(e.target.value);
							}}
							placeholder="123456789-abc.apps.googleusercontent.com"
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="gads-client-secret">
							Client secret
							<Source from={data?.source.clientSecret} />
						</Label>
						<Input
							id="gads-client-secret"
							type="password"
							value={clientSecret}
							onChange={(e) => setClientSecret(e.target.value)}
							placeholder={data?.clientSecret ?? "GOCSPX-…"}
							autoComplete="off"
						/>
						{data?.clientSecret ? (
							<p className="text-[11px] text-muted-foreground">
								Currently {data.clientSecret}. Leave blank to keep it.
							</p>
						) : null}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="gads-dev-token">
							Developer token
							<Source from={data?.source.developerToken} />
						</Label>
						<Input
							id="gads-dev-token"
							type="password"
							value={developerToken}
							onChange={(e) => setDeveloperToken(e.target.value)}
							placeholder={data?.developerToken ?? "from the MCC API Center"}
							autoComplete="off"
						/>
						{data?.developerToken ? (
							<p className="text-[11px] text-muted-foreground">
								Currently {data.developerToken}. Leave blank to keep it.
							</p>
						) : null}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="gads-version">API version</Label>
						<Input
							id="gads-version"
							value={apiVersion}
							onChange={(e) => setApiVersion(e.target.value)}
							placeholder={data?.apiVersion ?? data?.defaultApiVersion}
							className="w-32"
						/>
						<p className="text-[11px] text-muted-foreground">
							Google retires versions about once a year. Change this if syncing
							starts returning a 404 — the error names the version it tried.
						</p>
					</div>

					<div className="flex items-center gap-2">
						<Button type="submit" size="sm" disabled={save.isPending}>
							{save.isPending ? "Saving" : "Save credentials"}
						</Button>
						{data?.complete ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={clear.isPending}
								onClick={() => clear.mutate()}
							>
								Clear
							</Button>
						) : null}
					</div>
				</form>
			</SettingsSection>

			<Separator />

			<SettingsSection
				title="Connect an ad account"
				description="With the credentials above in place, authorise the Google account that manages your campaigns. Spend then syncs into the Ad spend reports."
			>
				<GoogleConnection siteId={siteId} />
			</SettingsSection>

			<Separator />

			<SettingsSection
				title="Or push from Google Ads"
				description="Skips the developer token entirely — a script inside your own Ads account posts spend here every day. Nothing to apply for."
			>
				<ScriptPush siteId={siteId} />
			</SettingsSection>

			<Separator />

			<SettingsSection
				title="Setting this up in Google"
				description="Three things are needed, and one of them takes days — start it first."
			>
				<ol className="flex flex-col gap-3 text-xs">
					<Step n={1}>
						Create a <span className="font-medium">Manager (MCC) account</span>{" "}
						at ads.google.com if you do not have one. Free, a few minutes.
					</Step>
					<Step n={2}>
						In the MCC open <span className="font-medium">API Center</span> and
						apply for a developer token.{" "}
						<span className="font-medium">
							The token granted immediately is Test access
						</span>{" "}
						and returns nothing for real campaigns — you need Basic access,
						which Google reviews. This is the slow step, so start it first.
					</Step>
					<Step n={3}>
						Create a Google Cloud project, enable the Google Ads API, and add an
						OAuth client of type <span className="font-medium">Web application</span>.
					</Step>
					<Step n={4}>
						Add this exact redirect URI to that OAuth client:
						<code className="mt-1 block border bg-muted/40 p-2 font-mono text-[11px]">
							{redirectUri}
						</code>
						It has to match character for character, or Google rejects the sign-in
						with <span className="font-mono">redirect_uri_mismatch</span>.
					</Step>
				</ol>
			</SettingsSection>
		</>
	);
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
	return (
		<li className="flex gap-3">
			<span className="flex size-5 shrink-0 items-center justify-center bg-muted font-medium text-[10px]">
				{n}
			</span>
			<span className="text-muted-foreground leading-relaxed">{children}</span>
		</li>
	);
}

/** Says where a value is coming from, so an env-configured deployment is not confusing. */
function Source({ from }: { from?: "app" | "env" | "unset" }) {
	if (from !== "env") return null;
	return (
		<Badge variant="outline" className="ml-2">
			from environment
		</Badge>
	);
}

/**
 * Connect / sync / disconnect for Google Ads.
 *
 * The OAuth handshake is a browser redirect rather than a fetch, so connecting
 * is a plain link out to the server route; the result comes back as a query
 * parameter on the way in.
 */
function GoogleConnection({ siteId }: { siteId?: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [days, setDays] = useState(30);

	const connection = useQuery(
		trpc.ads.connection.queryOptions(
			{ siteId },
			{ retry: false, enabled: Boolean(siteId) },
		),
	);

	// The callback redirects back with the outcome; report it once, then strip
	// it so a refresh does not repeat the toast.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const status = params.get("google");
		if (!status) return;

		const detail = params.get("detail");
		if (status === "connected") {
			toast.success(detail ?? "Google Ads connected.");
		} else {
			toast.error(detail ?? "Could not connect Google Ads.");
		}
		queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
		window.history.replaceState({}, "", window.location.pathname);
	}, [queryClient, trpc]);

	const sync = useMutation(
		trpc.ads.sync.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
				toast.success(
					`Synced ${result.written} campaign-day(s) from the last ${result.days} days.`,
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const disconnect = useMutation(
		trpc.ads.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.ads.pathKey() });
				toast.success("Google Ads disconnected. Imported spend was kept.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (connection.isPending) {
		return (
			<Skeleton className="h-24 w-full" />
		);
	}

	const account = connection.data?.account;

	// Nothing to offer until the server has an OAuth client — say why rather
	// than showing a button that returns a 501.
	if (!connection.data?.configured) {
		return (
			<div className="border-b p-4">
				<Card>
					<CardHeader>
						<CardTitle>Google Ads</CardTitle>
						<CardDescription>
							Not configured on this server. Set{" "}
							<code className="font-mono">GOOGLE_ADS_CLIENT_ID</code>,{" "}
							<code className="font-mono">GOOGLE_ADS_CLIENT_SECRET</code> and{" "}
							<code className="font-mono">GOOGLE_ADS_DEVELOPER_TOKEN</code>, then
							restart. Until then, import the CSV export instead — the reports
							are identical either way.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	return (
		<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Google Ads
						<Badge variant={account ? "default" : "outline"}>
							{account ? "connected" : "not connected"}
						</Badge>
					</CardTitle>
					<CardDescription>
						{account
							? `Customer ${account.customerId}${
									account.lastSyncedAt
										? ` · last synced ${formatRelative(account.lastSyncedAt)}`
										: " · never synced"
								}`
							: "Authorise the Google account that manages your campaigns. Spend syncs into the same reports the CSV import fills."}
					</CardDescription>
				</CardHeader>

				<CardContent className="flex flex-col gap-3">
					{account?.lastSyncError ? (
						<div className="flex items-start gap-2 border border-destructive/40 p-3">
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
							<div>
								<p className="font-medium text-destructive text-xs">
									Last sync failed
								</p>
								<p className="mt-0.5 text-muted-foreground text-xs">
									{account.lastSyncError}
								</p>
							</div>
						</div>
					) : null}

					<div className="flex flex-wrap items-center gap-2">
						{account ? (
							<>
								<Button
									size="sm"
									disabled={sync.isPending}
									onClick={() => sync.mutate({ siteId, days })}
								>
									<RefreshCw data-icon="inline-start" />
									{sync.isPending ? "Syncing" : `Sync last ${days} days`}
								</Button>
								<Input
									type="number"
									min={1}
									max={365}
									value={days}
									onChange={(e) => setDays(Number(e.target.value) || 30)}
									className="w-20"
									aria-label="Days to sync"
								/>
								<Button
									variant="outline"
									size="sm"
									disabled={disconnect.isPending}
									onClick={() => disconnect.mutate({ siteId })}
								>
									<Link2Off data-icon="inline-start" />
									Disconnect
								</Button>
							</>
						) : (
							<a
								href={`/api/ads/google/connect${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ""}`}
								className={buttonVariants({ size: "sm" })}
							>
								<Link2 data-icon="inline-start" />
								Connect Google Ads
							</a>
						)}
					</div>
				</CardContent>
		</Card>
	);
}

/**
 * The no-approval path: a script pasted into Google Ads that pushes spend here
 * daily. Shown alongside the OAuth connection because for most people it is the
 * one that works today — the API route waits on Google's review.
 */
function ScriptPush({ siteId }: { siteId?: string }) {
	const trpc = useTRPC();
	const [key, setKey] = useState<string | null>(null);

	const reveal = useMutation(
		trpc.ads.spendKey.mutationOptions({
			onSuccess: (result) => setKey(result.spendKey),
			onError: (error) => toast.error(error.message),
		}),
	);

	const rotate = useMutation(
		trpc.ads.rotateSpendKey.mutationOptions({
			onSuccess: (result) => {
				setKey(result.spendKey);
				toast.success("Key rotated. Update the script in Google Ads — the old one stops working now.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const endpoint = new URL("/api/spend/ingest", getBaseUrl()).toString();

	return (
		<Card>
				<CardHeader>
					<CardTitle>Push from Google Ads (no developer token)</CardTitle>
					<CardDescription>
						A script that runs inside your own Google Ads account and sends
						spend here every day. No manager account, no API review — this
						works immediately.
					</CardDescription>
				</CardHeader>

				<CardContent className="flex flex-col gap-4">
					{!key ? (
						<div>
							<Button
								size="sm"
								disabled={reveal.isPending}
								onClick={() => reveal.mutate({ siteId })}
							>
								{reveal.isPending ? "Preparing" : "Generate the script"}
							</Button>
							<p className="mt-2 text-[11px] text-muted-foreground">
								Creates a secret key for this workspace and builds the script
								around it. Different from the tracking snippet's key, which is
								public.
							</p>
						</div>
					) : (
						<>
							<ol className="flex flex-col gap-2 text-xs text-muted-foreground">
								<li>
									<span className="font-medium text-foreground">1.</span> In
									Google Ads: <span className="font-medium text-foreground">Tools → Bulk actions → Scripts</span>,
									then <span className="font-medium text-foreground">+</span>.
								</li>
								<li>
									<span className="font-medium text-foreground">2.</span> Replace
									everything in the editor with the script below, then Save.
								</li>
								<li>
									<span className="font-medium text-foreground">3.</span> Run it
									once — Google asks you to authorise it the first time.
								</li>
								<li>
									<span className="font-medium text-foreground">4.</span> Set its
									frequency to <span className="font-medium text-foreground">Daily</span>.
									Spend appears here after the first run.
								</li>
							</ol>

							<CodeBlock
								language="javascript"
								title="Google Ads script"
								action={
									<CopyButton
										value={googleAdsScript({ endpoint, spendKey: key })}
										label="Copy script"
									/>
								}
								code={googleAdsScript({ endpoint, spendKey: key })}
							/>

							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={rotate.isPending}
									onClick={() => rotate.mutate({ siteId })}
								>
									<RefreshCw data-icon="inline-start" />
									Rotate key
								</Button>
								<p className="text-[11px] text-muted-foreground">
									The key is embedded in the script above — treat it like a
									password. Rotating breaks any script still using the old one.
								</p>
							</div>
						</>
					)}
				</CardContent>
		</Card>
	);
}
