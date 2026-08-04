import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings-section";
import { authClient, useIsAdmin } from "@/lib/auth-client";
import { formatRelative } from "@/lib/format";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/team")({
	component: TeamPage,
});

function TeamPage() {
	const isAdmin = useIsAdmin();
	const { data: session } = authClient.useSession();

	// The sidebar hides this section from members, but a URL can be typed. The
	// server refuses them anyway; this just says so politely instead of erroring.
	if (!isAdmin) {
		return (
			<SettingsSection
				title="Team"
				description="Who can see and change what."
			>
				<p className="border p-3 text-muted-foreground text-xs">
					Only admins can manage the team. Ask one to promote you if you need
					access.
				</p>
			</SettingsSection>
		);
	}

	return (
		<SettingsSection
			title="Team"
			description="Admins manage sites, click-tracking rules and roles. Members see every report and work the pipeline."
		>
			<TeamList selfId={session?.user.id} />
		</SettingsSection>
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
				toast.success(
					`${updated.email} is now ${updated.role === "admin" ? "an admin" : "a member"}.`,
				);
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
