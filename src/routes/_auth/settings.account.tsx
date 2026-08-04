import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { SettingsSection } from "@/components/settings-section";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/settings/account")({
	component: AccountPage,
});

function AccountPage() {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();

	return (
		<SettingsSection
			title="Account"
			description="Signed in to the Custora dashboard."
		>
			{session ? (
				<div className="flex items-center gap-3">
					<Avatar>
						<AvatarFallback>{session.user.name.slice(0, 2)}</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<p className="flex items-center gap-2 truncate font-medium text-xs">
							{session.user.name}
							<Badge
								variant={session.user.role === "admin" ? "default" : "outline"}
							>
								{session.user.role}
							</Badge>
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
		</SettingsSection>
	);
}
