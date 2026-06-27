# Deploy

Two services:

| Part | What | Host |
|------|------|------|
| **Frontend** | Next.js static export (`apps/web/out`) | **Firebase Hosting** |
| **Backend** | Express + Socket.IO (authoritative server) | **Render** (Docker) |

Your Firebase project is **`lol-game-de44b`** (already wired in `.firebaserc`).

---

## 0. Push the repo to GitHub (needed for Render)

```powershell
gh auth login          # one-time, browser login
gh repo create gameonline --private --source=. --remote=origin --push
```

---

## 1. Backend → Render

1. **render.com** → **New +** → **Web Service** → connect GitHub → pick `gameonline`.
2. Settings:
   - **Language / Runtime:** `Docker`
   - **Dockerfile Path:** `apps/server/Dockerfile`
   - **Docker Build Context Directory:** `.`  (repo root — the Dockerfile copies `packages/shared`)
   - **Root Directory:** *(leave blank)*
   - **Health Check Path:** `/health`
   - **Instance Type:** Free (spins down when idle) or Starter ($7/mo, always on)
3. **Environment Variables:**
   - `CLIENT_ORIGIN` = `https://lol-game-de44b.web.app,https://lol-game-de44b.firebaseapp.com`
   - *(Do not set `PORT` — Render injects it and the server already reads `process.env.PORT`.)*
4. **Create Web Service.** When it's live you get a URL like
   `https://gameonline-server.onrender.com`. Verify: open `…/health` → `{"status":"ok",…}`.

> Free tier sleeps after ~15 min idle; the first connection then takes ~50s and any
> in-progress lobby is lost. Use the Starter plan to keep it warm.

---

## 2. Frontend → Firebase Hosting

Install the CLI once: `npm install -g firebase-tools` then `firebase login`
(use the Google account that owns the `lol-game-de44b` project).

**Build with the backend URL baked in** (it's a `NEXT_PUBLIC_*` var → compiled in at build time):

```powershell
$env:NEXT_PUBLIC_SERVER_URL = "https://gameonline-server.onrender.com"
pnpm --filter @game/web build      # regenerates apps/web/out
firebase deploy --only hosting
```

You'll get `https://lol-game-de44b.web.app`.

> Tip: to avoid re-typing the URL, put it in `apps/web/.env.local`:
> `NEXT_PUBLIC_SERVER_URL=https://gameonline-server.onrender.com` (gitignored).

---

## 3. Verify

Open `https://lol-game-de44b.web.app` in two tabs → Create Lobby in one, Join with the
code in the other (live ping = the WebSocket reached Render) → pick character/weapon
(proves the static manifest loaded) → Start → move/shoot.

---

## Updating later

- **Code or asset change:** rebuild (`pnpm --filter @game/web build`) → `firebase deploy --only hosting`.
  Backend changes deploy automatically when you push to GitHub.
- **New map GLB:** run `node scripts/build-map-colliders.mjs` first, then rebuild + deploy.

## Notes / limits

- **Firebase Spark (free):** 10 GB stored, **360 MB/day egress**. Each new player downloads
  the GLBs they use (~10–30 MB); browser cache (immutable headers) makes repeat visits free.
  Heavy traffic → upgrade to Blaze (pay-as-you-go).
- **Single backend instance only** — lobbies live in memory; don't scale Render to >1 instance
  without adding a Socket.IO Redis adapter.
- **Weapon stats** use server defaults (the Docker image doesn't bundle the asset configs).
  Optional: bake `apps/web/public/assets` into the image and set `ASSETS_DIR` for per-weapon stats.
