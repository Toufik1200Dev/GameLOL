# GameOnline — Private-Lobby Multiplayer 3D Shooter

A browser-based multiplayer 3D shooter with **private lobbies** (no matchmaking,
no public servers). One player hosts a lobby and shares a room code; friends join
and play. Built with an **authoritative server** and a data-driven, asset-folder
architecture so new characters, weapons, and maps drop in without code changes.

## Tech Stack

| Layer      | Tech                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| Frontend   | Next.js (App Router), React 19, TypeScript, React Three Fiber, drei, Rapier   |
| State / UI | Zustand, Framer Motion, Tailwind CSS v4                                        |
| Backend    | Node.js, Express, Socket.IO, TypeScript                                        |
| Networking | Authoritative server, fixed tick, client prediction + reconciliation, interp  |
| Tooling    | pnpm workspaces + Turborepo, ESLint, Prettier, Vitest                         |

## Repository Layout

```
apps/
  web/      Next.js client (UI + React Three Fiber game engine)
  server/   Authoritative Socket.IO server (lobbies + game simulation)
packages/
  shared/   Types, protocol, constants, seeded RNG, deterministic sim (used by BOTH)
scripts/
  build-asset-manifest.mjs   Scans public/assets and emits manifest.json
```

## Getting Started

Prerequisites: **Node ≥ 20** and **pnpm 9** (`npm i -g pnpm`).

```bash
pnpm install

# Copy env templates (optional for local defaults)
cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env

# Run web (:3000) + server (:4000) together
pnpm dev
```

Open <http://localhost:3000>. To test multiplayer, open a second browser tab/window.

### Useful scripts

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Run web + server with hot reload (Turborepo). |
| `pnpm build`      | Build all packages.                           |
| `pnpm typecheck`  | Type-check every workspace.                   |
| `pnpm lint`       | Lint every workspace.                         |
| `pnpm test`       | Run Vitest suites.                            |
| `pnpm format`     | Format with Prettier.                         |

## Adding Content (no code changes)

Drop folders into `apps/web/public/assets/{characters,weapons,maps}/<id>/`
following the contract in [`apps/web/public/assets/README.md`](apps/web/public/assets/README.md).
The manifest regenerates on `pnpm dev` / `pnpm build`, and the dev route handler
re-scans on refresh.

## Deployment

- **Web** → Vercel (`apps/web/vercel.json`). Set `NEXT_PUBLIC_SERVER_URL` to your
  server's public URL.
- **Server** → any Node host / container. Build the image with
  `docker compose build server` (or `apps/server/Dockerfile`) and set
  `CLIENT_ORIGIN` to your web origin.

## Build Status

Implemented incrementally. See `.claude/plans` for the roadmap. Current: **Phase 0
— monorepo scaffold** (both apps boot, shared package wired, asset pipeline +
deployment configs in place). Phase 1 (lobby + networking) next.
