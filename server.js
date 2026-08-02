/**
 * Production entry. One process serves everything:
 *
 *   /api/*, /trpc/*, /c/*  → the Hono API (auth, tRPC, tracking collector)
 *   /assets/*              → fingerprinted client bundles
 *   everything else        → the TanStack Start SSR handler
 *
 * `vite build` emits a fetch handler rather than a listening server, and
 * `vite preview` is a dev tool, so this wrapper is what actually runs in
 * production.
 *
 * Run after `pnpm build`:
 *   node server.js
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import { api } from "./dist/api/app.mjs";
import ssr from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3000);
const app = new Hono();

// API first — these paths must never reach the SSR renderer.
app.route("/", api);

/**
 * Vite fingerprints everything under /assets, so those are safe to cache
 * forever. A stale hashed asset is impossible by construction.
 */
app.use(
	"/assets/*",
	serveStatic({
		root: "./dist/client",
		onFound: (_path, c) => {
			c.header("Cache-Control", "public, max-age=31536000, immutable");
		},
	}),
);

// Unfingerprinted public files (favicon, robots.txt, …).
app.use("*", serveStatic({ root: "./dist/client" }));

// Anything left is a page route.
app.all("*", (c) => ssr.fetch(c.req.raw));

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
	console.log(`Custora running on http://0.0.0.0:${info.port}`);
});
