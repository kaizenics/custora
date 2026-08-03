import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { useLiveActivity } from "@/lib/use-live-activity";
import { WorkspaceProvider } from "@/lib/workspace";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	ssr: false,
	component: AuthLayout,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
			});
		}
		return { session };
	},
});

function AuthLayout() {
	// One connection for the whole dashboard rather than one per page.
	const { connected } = useLiveActivity();

	return (
		// Wraps the sidebar as well as the pages — the switcher is part of the
		// workspace, not a consumer sitting outside it.
		<WorkspaceProvider>
			<div className="flex h-svh overflow-hidden">
				<AppSidebar live={connected} />
				<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<Outlet />
				</main>
			</div>
		</WorkspaceProvider>
	);
}
