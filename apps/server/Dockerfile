# Authoritative Socket.IO server image.
#
# Multi-stage: install the workspace, build the server into a self-contained
# tsup bundle (@game/shared is inlined), then `pnpm deploy` a production-only,
# dependency-resolved package for a small runtime image.
#
# Build from the REPO ROOT:
#   docker build -f apps/server/Dockerfile -t gameonline-server .
# (or: docker compose build server)

# ---- Build stage -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable

# Root + every workspace manifest first (so --frozen-lockfile validates and
# layers cache well).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json

# Install only what the server needs (its workspace deps included via "...").
RUN pnpm install --frozen-lockfile --filter "@game/server..."

# Build the server bundle.
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @game/server build

# Produce a self-contained, production-only deployment of the server.
RUN pnpm --filter @game/server deploy --prod /prod

# Bundle ONLY the JSON the server reads at runtime (map colliders + map/weapon/
# turret configs). The large GLB binaries are never opened by the server, so we
# strip them — but the colliders MUST ship so the authoritative sim's collision
# (and turret spawns) match the GLB maps the client renders. Without this the
# server falls back to a procedural world and players spawn under the GLB floor.
COPY apps/web/public/assets /assets-full
RUN mkdir -p /assets && cd /assets-full && \
    find . -name '*.json' -exec sh -c 'mkdir -p "/assets/$(dirname "$1")" && cp "$1" "/assets/$1"' _ {} \;

# ---- Runtime stage -----------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# Where the server reads authoritative map colliders + asset configs from.
ENV ASSETS_DIR=/app/assets

COPY --from=build /prod ./
COPY --from=build /assets ./assets

EXPOSE 4000
CMD ["node", "dist/index.js"]
