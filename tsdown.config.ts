import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

/**
 * Bundles the Hono API for production.
 *
 * `vite build` only produces the client and SSR page bundles; the API that
 * server.js mounts in front of them is plain TypeScript and needs its own
 * build. Runs after vite (see the `build` script) because vite clears dist/.
 */
export default defineConfig({
	entry: "./src/server/app.ts",
	format: "esm",
	outDir: "./dist/api",
	// vite build already wrote dist/client and dist/server.
	clean: false,
	dts: false,
	alias: {
		"@": fileURLToPath(new URL("./src", import.meta.url)),
	},
});
