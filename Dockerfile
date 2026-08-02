# Single service: dashboard, API, auth and the tracking collector in one process.
#
# In Coolify: Build Pack = Dockerfile, Base Directory = /, Port = 3000.
#
# Nothing here needs a build argument. Every value is read at runtime, so all
# environment variables — including the secrets — must be plain runtime
# variables in Coolify, NOT build variables. Marking them as build variables
# makes Coolify inject them as ARG/ENV, which bakes them into image layers where
# anyone with the image can read them back.
FROM node:22-alpine AS builder

WORKDIR /app

# The lockfile is written by the pnpm version pinned in package.json's
# packageManager field. Without the pin corepack fetches the latest major, and a
# newer pnpm can reject a lockfile its predecessor produced — pnpm 11 enforces a
# 24-hour minimumReleaseAge by default and fails on recently published packages.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY . .

# Config is read at runtime; the build only needs to compile.
ENV SKIP_ENV_VALIDATION=1

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
ENV NODE_ENV=production

COPY --from=builder /app ./

# Default location for the SQLite file when not using Turso cloud. Mount a
# Coolify volume here or the database is lost on every redeploy. Not needed when
# DATABASE_URL points at Turso.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
	CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
