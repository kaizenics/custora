import type { AppRouter } from "@/api/routers/index";
import { Toaster } from "@/components/ui/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { ThemeProvider } from "next-themes";

import appCss from "../index.css?url";

export interface RouterAppContext {
	trpc: TRPCOptionsProxy<AppRouter>;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Custora",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				href: "/favicon.svg",
				type: "image/svg+xml",
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	return (
		// suppressHydrationWarning is required: next-themes stamps the resolved
		// theme onto <html> before React hydrates, so the server and client markup
		// legitimately differ on this one element.
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<Outlet />
					{/* Inside the provider — Toaster reads useTheme() to match its surface. */}
					<Toaster richColors />
				</ThemeProvider>
				{/* Dev only: devtools render differently on server and client, which
				    shows up as a hydration error in a production build. */}
				{import.meta.env.DEV ? (
					<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				) : null}
				<Scripts />
			</body>
		</html>
	);
}
