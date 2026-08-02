import { env } from "@/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";
import { resolveDatabaseUrl } from "./url";

export function createDb() {
	const client = createClient({
		url: resolveDatabaseUrl(env.DATABASE_URL),
		authToken: env.DATABASE_AUTH_TOKEN,
	});

	return drizzle({ client, schema });
}

export const db = createDb();
