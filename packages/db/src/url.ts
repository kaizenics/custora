import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** <repo>/packages/db/src → <repo> */
const REPO_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
);

/**
 * Anchors a relative `file:` database URL to the repository root.
 *
 * Without this, `DATABASE_URL=file:local.db` resolves against the current
 * working directory — so `drizzle-kit push` (run from packages/db), the dev
 * server (apps/server), and any script would each quietly open a *different*
 * database file. Remote URLs are passed through untouched.
 */
export function resolveDatabaseUrl(raw: string): string {
	if (!raw.startsWith("file:")) return raw;

	const path = decodeURIComponent(raw.slice("file:".length));
	if (isAbsolute(path)) return raw;

	return pathToFileURL(resolve(REPO_ROOT, path)).href;
}
