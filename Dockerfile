# Single service: dashboard, API, auth and the tracking collector in one process.
#
# In Coolify: Build Pack = Dockerfile, Base Directory = /, Port = 3000.
# No build arguments are needed — nothing about the deployment is baked into the
# client bundle any more, because the app only ever talks to its own origin.
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY . .

# Config is read at runtime; the build only needs to compile.
ENV SKIP_ENV_VALIDATION=1

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY --from=builder /app ./

# Default location for the SQLite file when not using Turso cloud. Mount a
# Coolify volume here or the database is lost on every redeploy.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
	CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
