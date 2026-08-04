import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Info } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-sidebar";
import { SettingsSection } from "@/components/settings-section";
import { useIsAdmin } from "@/lib/auth-client";
import { getBaseUrl } from "@/lib/base-url";
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
							. Connect an ad account from the Ad spend page.
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
