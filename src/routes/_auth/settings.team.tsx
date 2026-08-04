import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings-section";
import { authClient, useIsAdmin } from "@/lib/auth-client";
import { FilterSelect } from "@/components/filter-select";
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
		<>
			<SettingsSection
				title="Team"
				description="Admins manage sites, click-tracking rules and roles. Members see every report and work the pipeline."
			>
				<TeamList selfId={session?.user.id} />
			</SettingsSection>

			<Separator />

			<SettingsSection
				title="Invitations"
				description="Invite someone by link instead of opening public sign-up — that door stays shut, and the role is fixed when the invite is issued."
			>
				<InvitePanel />
			</SettingsSection>
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

/**
 * Issue and manage invitation links.
 *
 * The link is shown once, immediately after creating it, because only its hash
 * is stored — there is nothing to show again later. That is deliberate, and the
 * panel says so rather than letting someone close the page and wonder.
 */
function InvitePanel() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("member");
	const [issued, setIssued] = useState<{ email: string; link: string } | null>(
		null,
	);

	const invites = useQuery(trpc.invites.list.queryOptions());

	const create = useMutation(
		trpc.invites.create.mutationOptions({
			onSuccess: (invite) => {
				queryClient.invalidateQueries({ queryKey: trpc.invites.pathKey() });
				setIssued({
					email: invite.email,
					link: new URL(`/invite/${invite.token}`, window.location.origin).toString(),
				});
				setEmail("");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const revoke = useMutation(
		trpc.invites.revoke.mutationOptions({
			onSuccess: (removed) => {
				queryClient.invalidateQueries({ queryKey: trpc.invites.pathKey() });
				toast.success(`Invitation for ${removed.email} revoked.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<div className="flex flex-col gap-4">
			<form
				className="flex flex-col gap-3 border p-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (!email.trim()) return;
					create.mutate({
						email: email.trim(),
						role: role as "admin" | "member",
					});
				}}
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor="invite-email">Email address</Label>
					<Input
						id="invite-email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="colleague@example.com"
						required
					/>
				</div>
				<div className="flex items-end gap-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="invite-role">Role</Label>
						<FilterSelect
							id="invite-role"
							label="Role"
							value={role}
							onChange={(next) => setRole(next ?? "member")}
							options={[
								{ value: "member", label: "Member" },
								{ value: "admin", label: "Admin" },
							]}
						/>
					</div>
					<Button
						type="submit"
						size="sm"
						disabled={!email.trim() || create.isPending}
					>
						{create.isPending ? "Creating" : "Create invite link"}
					</Button>
				</div>
			</form>

			{issued ? (
				<div className="flex flex-col gap-2 border border-primary/40 bg-muted/30 p-3">
					<p className="font-medium text-xs">
						Send this link to {issued.email}
					</p>
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate border bg-background p-2 font-mono text-[11px]">
							{issued.link}
						</code>
						<CopyLinkButton value={issued.link} />
					</div>
					<p className="text-[11px] text-muted-foreground">
						Shown once — only a hash of it is stored. Expires in 7 days, works a
						single time. Lost it? Revoke below and invite again.
					</p>
				</div>
			) : null}

			{invites.isPending ? (
				<Skeleton className="h-12 w-full" />
			) : invites.data?.length ? (
				<ul className="flex flex-col gap-2">
					{invites.data.map((pending) => (
						<li
							key={pending.id}
							className="flex items-center justify-between gap-3 border p-3"
						>
							<div className="min-w-0">
								<p className="flex items-center gap-2 truncate font-medium text-xs">
									{pending.email}
									<Badge
										variant={pending.role === "admin" ? "default" : "outline"}
									>
										{pending.role}
									</Badge>
								</p>
								<p className="truncate text-[11px] text-muted-foreground">
									Invited {formatRelative(pending.createdAt)} · expires{" "}
									{formatRelative(pending.expiresAt)}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={revoke.isPending}
								onClick={() => revoke.mutate({ inviteId: pending.id })}
							>
								<Trash2 data-icon="inline-start" />
								Revoke
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-xs">
					No invitations waiting to be claimed.
				</p>
			)}
		</div>
	);
}

function CopyLinkButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="outline"
			size="sm"
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
			{copied ? "Copied" : "Copy"}
		</Button>
	);
}
