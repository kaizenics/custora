import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	// The dashboard is the product; the auth guard on /_auth bounces signed-out
	// visitors to /login from here.
	beforeLoad: () => {
		throw redirect({ to: "/overview" });
	},
});
