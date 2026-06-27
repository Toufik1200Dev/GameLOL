# GameOnline — Private-Lobby Multiplayer 3D Shooter

A browser-based multiplayer 3D shooter with **private lobbies** (no matchmaking,
no public servers). One player hosts a lobby and shares a room code; friends join
and play. Built with an **authoritative server** and a data-driven, asset-folder
architecture so new characters, weapons, and maps drop in without code changes.

## Tech Stack

| Layer      | Tech                                                                         |
| ---------- | ---------------------------------------------------------------------------- |
| Frontend   | Next.js (App Router), React 19, TypeScript, React Three Fiber, drei, Rapier  |
| State / UI | Zustand, Framer Motion, Tailwind CSS v4                                      |
| Backend    | Node.js, Express, Socket.IO, TypeScript                                      |
| Networking | Authoritative server, fixed tick, client prediction + reconciliation, interp |
| Tooling    | pnpm workspaces + Turborepo, ESLint, Prettier, Vitest                        |

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

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `pnpm dev`       | Run web + server with hot reload (Turborepo). |
| `pnpm build`     | Build all packages.                           |
| `pnpm typecheck` | Type-check every workspace.                   |
| `pnpm lint`      | Lint every workspace.                         |
| `pnpm test`      | Run Vitest suites.                            |
| `pnpm format`    | Format with Prettier.                         |

## Adding Content (no code changes)

Drop folders into `apps/web/public/assets/{characters,weapons,maps}/<id>/`
following the contract in [`apps/web/public/assets/README.md`](apps/web/public/assets/README.md).
The manifest regenerates on `pnpm dev` / `pnpm build`, and the dev route handler
re-scans on refresh.

## How to Play

1. Open the app, set your callsign, **Create Lobby** (you become host) and share
   the 6-character code, or **Join Lobby** with a friend's code.
2. Pick teams, choose a character/weapon (once assets are uploaded), ready up.
3. The host presses **Start Game**. Click the scene to lock the mouse and play.

### Controls

| Action           | Key                      |
| ---------------- | ------------------------ |
| Move             | W A S D                  |
| Jump / Crouch    | Space / C (or Ctrl)      |
| Sprint           | Shift                    |
| Look             | Mouse                    |
| Shoot / Aim      | Left click / Right click |
| Reload           | R                        |
| Camera (1st/3rd) | V                        |
| Scoreboard       | Tab (hold)               |
| Pause            | Esc                      |

## Architecture Highlights

- **Authoritative server**: a fixed 30 Hz `GameInstance` per lobby drains buffered
  inputs through a shared deterministic movement step. It never trusts client
  position, health, or hits.
- **`packages/shared/src/sim`** is the keystone: one movement function used by
  **client prediction**, **server authority**, and **client reconciliation** —
  so corrections stay tiny and motion is smooth.
- **Netcode**: client-side prediction + server reconciliation for the local
  player, ~100 ms snapshot interpolation for remotes, delta snapshots, and
  basic lag-compensated hitscan.
- **Seeded world**: the procedural arena is generated from the lobby code, so the
  server and every client build identical geometry and collision.
- **Data-driven assets**: characters/weapons/maps are discovered from
  `public/assets` and validated with Zod — no code changes to add content.

## Deployment

- **Web** → Vercel (`apps/web/vercel.json`). Set `NEXT_PUBLIC_SERVER_URL` to your
  server's public URL.
- **Server** → any Node host / container. Build the image from the repo root with
  `docker compose build server` (or `docker build -f apps/server/Dockerfile .`)
  and set `CLIENT_ORIGIN` to your web origin. _(The Dockerfile uses `pnpm deploy`;
  it has not been built in this environment — verify locally before shipping.)_

## Build Status

Implemented incrementally (one commit per system). **Vertical slice complete:**

- ✅ Monorepo + tooling
- ✅ Lobby system + authoritative networking
- ✅ Asset auto-discovery + character/weapon selection
- ✅ Playable networked 3D match (movement, shooting, hearts, respawn, HUD,
  scoreboard, victory)

**Roadmap** (additive, no core rewrites): full animation state machines, richer
combat VFX (blood/impact/muzzle/smoke/shells), audio, SSAO/LOD tuning,
day-night + weather, more maps/modes. Netcode + server sim are verified with
unit/integration tests; in-browser visual feel is best confirmed by playing it.
