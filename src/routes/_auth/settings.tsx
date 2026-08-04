import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient, useIsAdmin } from "@/lib/auth-client";
import { formatRelative } from "@/lib/format";
import { formatNumber } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const trpc = useTRPC();
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const isAdmin = useIsAdmin();
	const sites = useQuery(trpc.sites.list.queryOptions());

	return (
		<>
			<PageHeader title="Settings" />

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
					<Section
						title="Appearance"
						description="Applies to this browser only — the preference is stored locally, not on your account."
					>
						<ThemeToggle />
					</Section>

					<Separator />

					<Section
						title="Account"
						description="Signed in to the Custora dashboard."
					>
						{session ? (
							<div className="flex items-center gap-3">
								<Avatar>
									<AvatarFallback>
										{session.user.name.slice(0, 2)}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-xs">
										{session.user.name}
									</p>
									<p className="truncate text-[11px] text-muted-foreground">
										{session.user.email}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										authClient.signOut({
											fetchOptions: {
												onSuccess: () => navigate({ to: "/login" }),
											},
										});
									}}
								>
									<LogOut data-icon="inline-start" />
									Sign out
								</Button>
							</div>
						) : (
							<Skeleton className="h-10 w-full" />
						)}
					</Section>

					<Separator />

					<Section
						title="Tracking"
						description="Sites currently reporting into this workspace."
					>
						{sites.isPending ? (
							<Skeleton className="h-16 w-full" />
						) : sites.data?.length ? (
							<ul className="flex flex-col gap-2">
								{sites.data.map((site) => (
									<li
										key={site.id}
										className="flex items-center justify-between gap-3 border p-3"
									>
										<div className="min-w-0">
											<p className="truncate font-medium text-xs">
												{site.name}
											</p>
											<p className="truncate text-[11px] text-muted-foreground">
												{site.domain} · {formatNumber(site.eventCount)} events
											</p>
										</div>
										<Button
											variant="ghost"
											size="sm"
											render={<Link to="/install" />}
										>
											Manage
											<ExternalLink data-icon="inline-end" />
										</Button>
									</li>
								))}
							</ul>
						) : (
							<div className="flex items-center justify-between gap-3 border p-3">
								<p className="text-muted-foreground text-xs">
									No sites connected yet.
								</p>
								<Button size="sm" render={<Link to="/install" />}>
									Add a site
								</Button>
							</div>
						)}
					</Section>

						{isAdmin ? (
							<>
								<Separator />
								<Section
									title="Team"
									description="Admins manage sites, click-tracking rules and roles. Members see every report and work the pipeline."
								>
									<TeamList selfId={session?.user.id} />
								</Section>
							</>
						) : null}
					</div>
			</div>
		</>
	);
}

function TeamList({ selfId }: { selfId?: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const users = useQuery(trpc.users.list.queryOptions());

	const setRole = useMutation(
		trpc.users.setRole.mutationOptions({
			onSuccess: (updated) => {
				queryClient.invalidateQueries({ queryKey: trpc.users.pathKey() });
				toast.success(`${updated.email} is now ${updated.role === "admin" ? "an admin" : "a member"}.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (users.isPending) return <Skeleton className="h-16 w-full" />;
	if (!users.data?.length) return null;

	return (
		<ul className="flex flex-col gap-2">
			{users.data.map((person) => (
				<li
					key={person.id}
					className="flex items-center justify-between gap-3 border p-3"
				>
					<div className="min-w-0">
						<p className="flex items-center gap-2 truncate font-medium text-xs">
							{person.name}
							<Badge variant={person.role === "admin" ? "default" : "outline"}>
								{person.role}
							</Badge>
							{person.id === selfId ? (
								<span className="text-[11px] text-muted-foreground">you</span>
							) : null}
						</p>
						<p className="truncate text-[11px] text-muted-foreground">
							{person.email} · joined {formatRelative(person.createdAt)}
						</p>
					</div>
					{person.role === "admin" ? (
						<Button
							variant="outline"
							size="sm"
							disabled={setRole.isPending}
							onClick={() =>
								setRole.mutate({ userId: person.id, role: "member" })
							}
						>
							<ShieldOff data-icon="inline-start" />
							Make member
						</Button>
					) : (
						<Button
							variant="outline"
							size="sm"
							disabled={setRole.isPending}
							onClick={() =>
								setRole.mutate({ userId: person.id, role: "admin" })
							}
						>
							<ShieldCheck data-icon="inline-start" />
							Make admin
						</Button>
					)}
				</li>
			))}
		</ul>
	);
}

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h2 className="font-medium text-sm tracking-tight">{title}</h2>
				<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
			</div>
			{children}
		</section>
	);
}
