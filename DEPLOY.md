# Deploying to Coolify

Custora is one service. The dashboard, tRPC API, auth, and the tracking
collector all run in a single Node process.

## Create the application

**New Resource → Application →** point it at this repository.

| Setting | Value |
| --- | --- |
| Build Pack | **Dockerfile** |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `3000` |
| Health Check Path | `/healthz` |

There are **no build arguments**. The app only ever calls its own origin, so
nothing about the deployment is compiled into the browser bundle — changing a
URL later is a restart, not a rebuild.

## Domains

Give the service two:

- `app.yourdomain.com` — the dashboard
- `track.yourdomain.com` — what the tracking snippet points at

The second one is not cosmetic. Serving the collector from a subdomain of the
site being tracked is what makes the visitor cookie first-party, which is what
keeps it alive past Safari's 7-day cap on script-set cookies. Both hostnames hit
the same service; the collector accepts any origin by design.

## Environment variables

```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://app.yourdomain.com
DATABASE_URL=libsql://<your-db>-<org>.turso.io
DATABASE_AUTH_TOKEN=<turso token>
NODE_ENV=production
```

`BETTER_AUTH_URL` must match the dashboard's public origin exactly — scheme,
host, no trailing slash. It is both the auth base URL and the trusted origin, so
getting it wrong makes every sign-in fail with `403 INVALID_ORIGIN` and nothing
else to go on. Leaving the example's `http://localhost:3100` in place is the
usual cause; the app now refuses to boot in production if it is still localhost.

If the dashboard answers on more than one hostname, add the others to the
optional `TRUSTED_ORIGINS` as a comma-separated list.

### Using a local SQLite file instead of Turso

Add a volume mounted at `/app/data`, then:

```
DATABASE_URL=file:/app/data/custora.db
DATABASE_AUTH_TOKEN=unused
```

Without the volume the database is wiped on every redeploy.

## Schema

Set a pre-deployment command so migrations run before the new container takes
traffic:

```
pnpm db:push
```

## After the first deploy

1. Open `https://app.yourdomain.com` and create your account.
2. **Sites** → add the domain you want to track.
3. Copy the snippet onto that site before `</body>` and deploy it.
4. Press **Verify install** — it reports whether the snippet is actually live
   and reporting, or sitting there under a stale key.

Close registration once your accounts exist. Anyone who can reach `/login` can
currently create an account and read all of your attribution and CRM data.

## Notes

- **The image is not minimal.** The runner copies the whole tree including dev
  dependencies. Worth revisiting if image size becomes a problem; not worth the
  fragility for an internal tool.
- **Zero-downtime matters here.** A restart mid-redeploy drops events that were
  in flight, and dropped events cannot be backfilled. The tracker retries from
  `localStorage` on the next pageview, which covers a short window.
- **`vite preview` is not a production server.** `pnpm start` runs `server.js`,
  which mounts the API, serves the built assets, and falls through to the SSR
  handler.
