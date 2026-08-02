import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
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
	return (
		<div className="flex h-svh overflow-hidden">
			<AppSidebar />
			<main className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<Outlet />
			</main>
		</div>
	);
}
