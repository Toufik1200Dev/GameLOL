# ---- Build stage -------------------------------------------------------------
# Builds the authoritative Socket.IO server into a self-contained bundle
# (@game/shared is inlined via tsup), then ships only production artifacts.
FROM node:20-alpine AS build
WORKDIR /repo

RUN corepack enable

# Copy manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --frozen-lockfile

# Copy sources and build the server bundle.
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @game/server build

# ---- Runtime stage -----------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The tsup bundle is dependency-free except socket.io/express runtime deps, so
# install just the server's production deps.
COPY apps/server/package.json ./package.json
RUN corepack enable && pnpm install --prod --no-frozen-lockfile

COPY --from=build /repo/apps/server/dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
