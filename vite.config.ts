import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { apiPlugin } from "./src/server/vite-plugin";

export default defineConfig({
	server: {
		// Dedicated to custora so it does not collide with another local project.
		// strictPort makes a busy port fail loudly at startup instead of silently
		// moving the app to a different origin.
		port: 3100,
		strictPort: true,
	},
	resolve: {
		tsconfigPaths: true,
	},
	// apiPlugin must run before tanstackStart so /api, /trpc and /c are handled
	// before the SSR catch-all tries to render them as pages.
	plugins: [apiPlugin(), tailwindcss(), tanstackStart(), viteReact()],
});
