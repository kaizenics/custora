import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings/")({
	// Bare /settings means nothing on its own — land on the first section.
	beforeLoad: () => {
		throw redirect({ to: "/settings/appearance" });
	},
});
