'use client';

/**
 * In-match DOM overlay HUD. Reads only the game store (updated from authoritative
 * snapshots). Covers: crosshair + hit marker, health hearts, ammo, FPS/ping,
 * K/D, team scores, match timer, minimap, kill feed, damage flash, and the
 * respawn countdown.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { TeamId } from '@game/shared';
import { useGameStore } from '../../stores/gameStore';

const TEAM_COLOR: Record<TeamId, string> = { red: '#ff4d5e', blue: '#4c8bff' };

const formatTime = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function Hearts() {
  const hearts = useGameStore((s) => s.hearts);
  const max = useGameStore((s) => s.maxHearts);
  return (
    <div className="flex flex-wrap gap-0.5" style={{ maxWidth: 220 }}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="text-lg leading-none"
          style={{ color: i < hearts ? 'var(--color-heart)' : 'rgba(255,255,255,0.18)' }}
        >
          ♥
        </span>
      ))}
    </div>
  );
}

function Crosshair() {
  const hitAt = useGameStore((s) => s.hitMarkerAt);
  const [showHit, setShowHit] = useState(false);
  useEffect(() => {
    if (!hitAt) return;
    setShowHit(true);
    const t = setTimeout(() => setShowHit(false), 150);
    return () => clearTimeout(t);
  }, [hitAt]);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative h-6 w-6">
        <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/80" />
        <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-white/80" />
        <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" />
        <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" />
        {showHit && (
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-red-400">
            ✕
          </span>
        )}
      </div>
    </div>
  );
}

function Minimap({ worldSize }: { worldSize: number }) {
  const roster = useGameStore((s) => s.roster);
  const selfId = useGameStore((s) => s.selfId);
  const toPct = (v: number) => 50 + (v / (worldSize * 2)) * 100;
  return (
    <div className="border-border bg-bg/70 relative h-32 w-32 overflow-hidden rounded-lg border">
      {roster.map((p) => (
        <span
          key={p.id}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${toPct(p.x)}%`,
            top: `${toPct(p.z)}%`,
            background: TEAM_COLOR[p.team],
            outline: p.id === selfId ? '2px solid white' : 'none',
            opacity: p.alive ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

function KillFeed() {
  const feed = useGameStore((s) => s.killFeed);
  return (
    <div className="flex flex-col items-end gap-1">
      <AnimatePresence>
        {feed.slice(-5).map((k) => (
          <motion.div
            key={k.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="bg-bg/70 rounded px-2 py-1 text-xs"
          >
            <span style={{ color: TEAM_COLOR[k.killerTeam] }}>{k.killerName}</span>
            <span className="px-1 text-white/40">✕</span>
            <span style={{ color: TEAM_COLOR[k.victimTeam] }}>{k.victimName}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function DamageFlash() {
  const damageAt = useGameStore((s) => s.damageAt);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!damageAt) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 250);
    return () => clearTimeout(t);
  }, [damageAt]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 160px 40px rgba(255,40,60,0.8)' }}
        />
      )}
    </AnimatePresence>
  );
}

function RespawnOverlay() {
  const alive = useGameStore((s) => s.alive);
  const respawnIn = useGameStore((s) => s.respawnIn);
  if (alive) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/40">
      <p className="font-display text-2xl font-bold text-white/80">You were eliminated</p>
      <p className="text-accent mt-2 text-5xl font-bold">{Math.ceil(respawnIn)}</p>
      <p className="text-sm text-white/50">respawning…</p>
    </div>
  );
}

export function HUD({ worldSize }: { worldSize: number }) {
  const scores = useGameStore((s) => s.scores);
  const timeRemaining = useGameStore((s) => s.timeRemaining);
  const ammo = useGameStore((s) => s.ammo);
  const magazine = useGameStore((s) => s.magazine);
  const reloading = useGameStore((s) => s.reloading);
  const weaponName = useGameStore((s) => s.weaponName);
  const kills = useGameStore((s) => s.kills);
  const deaths = useGameStore((s) => s.deaths);
  const fps = useGameStore((s) => s.fps);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <DamageFlash />
      <Crosshair />

      {/* Top center: scores + timer */}
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-4">
        <span className="font-display text-3xl font-bold" style={{ color: TEAM_COLOR.red }}>
          {scores.red}
        </span>
        <span className="bg-bg/70 rounded px-3 py-1 font-mono text-sm text-white/80">
          {formatTime(timeRemaining)}
        </span>
        <span className="font-display text-3xl font-bold" style={{ color: TEAM_COLOR.blue }}>
          {scores.blue}
        </span>
      </div>

      {/* Top right: minimap + kill feed */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <Minimap worldSize={worldSize} />
        <KillFeed />
      </div>

      {/* Top left: FPS / ping / KD */}
      <div className="bg-bg/60 absolute left-3 top-3 rounded px-2 py-1 font-mono text-xs text-white/70">
        <div>{fps} FPS</div>
        <div>
          K {kills} · D {deaths}
        </div>
      </div>

      {/* Bottom left: hearts */}
      <div className="absolute bottom-4 left-4">
        <Hearts />
      </div>

      {/* Bottom right: ammo */}
      <div className="absolute bottom-4 right-4 flex items-end gap-2">
        <div className="font-display text-right">
          <div className="text-4xl font-bold leading-none">
            {reloading ? '--' : ammo}
            <span className="ml-1 text-lg text-white/40">/ {magazine}</span>
          </div>
          <div className="text-xs uppercase tracking-wide text-white/40">
            {reloading ? 'reloading…' : weaponName}
          </div>
        </div>
      </div>

      <RespawnOverlay />
    </div>
  );
}
