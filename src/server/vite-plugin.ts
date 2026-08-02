import { getRequestListener } from "@hono/node-server";
import type { Plugin } from "vite";

import { isApiPath } from "./paths";

/**
 * Serves the Hono API inside the Vite dev server.
 *
 * Without this the collector, tRPC and auth would only exist in production
 * (where server.js mounts them), and dev would need a second process on a
 * second port — which is exactly the split this restructure removed.
 *
 * The app is imported through Vite's module graph rather than statically, so
 * editing a router or the collector hot-reloads instead of needing a restart.
 */
export function apiPlugin(): Plugin {
	return {
		name: "custora:api",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const pathname = (req.url ?? "/").split("?")[0] ?? "/";
				if (!isApiPath(pathname)) {
					next();
					return;
				}

				server
					.ssrLoadModule("/src/server/app.ts")
					.then((mod) => {
						const listener = getRequestListener(mod.api.fetch, {
							// Vite serves over http locally; the origin is only used to
							// build an absolute URL for the Request object.
							hostname: req.headers.host ?? "localhost",
						});
						return listener(req, res);
					})
					.catch((error) => {
						server.ssrFixStacktrace(error as Error);
						next(error);
					});
			});
		},
	};
}
