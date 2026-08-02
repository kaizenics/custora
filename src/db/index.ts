import { env } from "@/env/server";
import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";
import { resolveDatabaseUrl } from "./url";

/**
 * Turso bills on rows read, and a query that looks cheap in code can be
 * expensive in rows — a COUNT reads every row it counts, and a helper called by
 * every procedure multiplies quietly across a page load.
 *
 * This client does not report rowsRead, so DEBUG_QUERIES=1 counts statements
 * instead. Statements are the lever anyway: the cheapest query is the one that
 * is never sent, and duplicates are what this exposes.
 */
function instrument(client: Client): Client {
	if (process.env.DEBUG_QUERIES !== "1") return client;

	const totals = { queries: 0, written: 0 };
	const execute = client.execute.bind(client);

	client.execute = (async (...args: Parameters<Client["execute"]>) => {
		const result = await execute(...args);
		totals.queries++;
		totals.written += result.rowsAffected ?? 0;

		const first = args[0] as string | { sql?: string };
		const stmt = typeof first === "string" ? first : (first?.sql ?? "");
		console.log(
			`[db] q=${String(totals.queries).padStart(3)} ` +
				`rows=${String(result.rows.length).padStart(4)} ` +
				`written=${String(totals.written).padStart(4)} | ` +
				stmt.replace(/\s+/g, " ").slice(0, 100),
		);
		return result;
	}) as Client["execute"];

	return client;
}

export function createDb() {
	const client = instrument(
		createClient({
			url: resolveDatabaseUrl(env.DATABASE_URL),
			authToken: env.DATABASE_AUTH_TOKEN,
		}),
	);

	return drizzle({ client, schema });
}

export const db = createDb();
