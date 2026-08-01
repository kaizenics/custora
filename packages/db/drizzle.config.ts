import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

import { resolveDatabaseUrl } from "./src/url";

dotenv.config({
  path: "../../apps/server/.env",
});

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "turso",
  dbCredentials: {
    // Same anchoring as the runtime client, so drizzle-kit and the app always
    // agree on which file a relative `file:` URL points at.
    url: resolveDatabaseUrl(process.env.DATABASE_URL || ""),
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
