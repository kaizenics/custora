import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { useLiveActivity } from "@/lib/use-live-activity";
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
		<div className="flex h-svh overflow-hidden">
			<AppSidebar live={connected} />
			<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<Outlet />
			</main>
		</div>
	);
}
