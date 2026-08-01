import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Dedicated to custora so it does not collide with another local project.
    // strictPort matters: on a fallback port the origin no longer matches the
    // server's CORS_ORIGIN, and every auth request fails with an opaque CORS
    // error rather than a clear "port in use".
    port: 3100,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
