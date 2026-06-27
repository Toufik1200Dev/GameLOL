import { TICK_RATE } from '@game/shared';

/**
 * Phase 0 placeholder landing page. It imports a value from `@game/shared` to
 * prove the workspace wiring (transpilePackages) is correct end-to-end. Phase 1
 * replaces this with the full animated Main Menu (Create / Join / Settings).
 */
export default function HomePage() {
  return (
    <div className="menu-grid-bg flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-6xl font-bold tracking-tight">
        <span className="text-accent">GAME</span>ONLINE
      </h1>
      <p className="max-w-md text-sm text-white/60">
        Private-lobby multiplayer 3D shooter. Monorepo scaffold is live — server tick rate is{' '}
        <span className="text-accent">{TICK_RATE}Hz</span>.
      </p>
      <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2 text-xs text-white/50">
        Phase 0 complete · Lobby system arrives in Phase 1
      </p>
    </div>
  );
}
