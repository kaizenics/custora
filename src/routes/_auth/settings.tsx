import { createFileRoute, Outlet } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-sidebar";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsLayout,
});

/**
 * Shell for the settings area. Which section is on screen is the router's
 * business — the sidebar swaps to a settings menu while inside here, and each
 * menu item is a real route with a real active state.
 */
function SettingsLayout() {
	return (
		<>
			<PageHeader title="Settings" />
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
					<Outlet />
				</div>
			</div>
		</>
	);
}
