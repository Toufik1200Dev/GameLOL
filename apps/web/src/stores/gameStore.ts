/**
 * In-match HUD/UI state. The authoritative gameplay lives in NetGameClient (and
 * is read per-frame via refs); this store holds only what the React HUD needs to
 * render: hearts, ammo, scores, timer, kill feed, scoreboard roster, and a few
 * transient effect timestamps (hit marker / damage flash).
 */
import { create } from 'zustand';
import {
  DEFAULT_MAX_HEARTS,
  type NetPlayerState,
  type TeamId,
  type TurretState,
} from '@game/shared';

export interface KillFeedEntry {
  id: number;
  killerName: string;
  killerTeam: TeamId;
  victimName: string;
  victimTeam: TeamId;
}

interface GameStore {
  selfId: string | null;
  hearts: number;
  maxHearts: number;
  alive: boolean;
  respawnIn: number;

  ammo: number;
  magazine: number;
  reloading: boolean;
  weaponName: string;

  kills: number;
  deaths: number;
  scores: Record<TeamId, number>;
  timeRemaining: number;

  fps: number;
  ping: number;

  roster: NetPlayerState[];
  turrets: TurretState[];
  killFeed: KillFeedEntry[];

  hitMarkerAt: number;
  headshotAt: number;
  damageAt: number;

  scoreboardOpen: boolean;
  paused: boolean;
  ended: null | { winner: TeamId | 'draw'; scores: Record<TeamId, number> };

  // setters
  setSelfId: (id: string) => void;
  setHud: (patch: Partial<GameStore>) => void;
  pushKill: (entry: Omit<KillFeedEntry, 'id'>) => void;
  markHit: (headshot?: boolean) => void;
  markDamage: () => void;
  setScoreboard: (open: boolean) => void;
  setPaused: (paused: boolean) => void;
  setEnded: (ended: GameStore['ended']) => void;
  resetMatch: () => void;
}

let killId = 0;

const initial = {
  selfId: null,
  hearts: DEFAULT_MAX_HEARTS,
  maxHearts: DEFAULT_MAX_HEARTS,
  alive: true,
  respawnIn: 0,
  ammo: 30,
  magazine: 30,
  reloading: false,
  weaponName: 'Rifle',
  kills: 0,
  deaths: 0,
  scores: { red: 0, blue: 0 } as Record<TeamId, number>,
  timeRemaining: 0,
  fps: 0,
  ping: 0,
  roster: [] as NetPlayerState[],
  turrets: [] as TurretState[],
  killFeed: [] as KillFeedEntry[],
  hitMarkerAt: 0,
  headshotAt: 0,
  damageAt: 0,
  scoreboardOpen: false,
  paused: false,
  ended: null as GameStore['ended'],
};

export const useGameStore = create<GameStore>((set) => ({
  ...initial,
  setSelfId: (selfId) => set({ selfId }),
  setHud: (patch) => set(patch),
  pushKill: (entry) =>
    set((s) => ({ killFeed: [...s.killFeed.slice(-4), { id: ++killId, ...entry }] })),
  markHit: (headshot = false) =>
    set(headshot ? { hitMarkerAt: performance.now(), headshotAt: performance.now() } : { hitMarkerAt: performance.now() }),
  markDamage: () => set({ damageAt: performance.now() }),
  setScoreboard: (scoreboardOpen) => set({ scoreboardOpen }),
  setPaused: (paused) => set({ paused }),
  setEnded: (ended) => set({ ended }),
  resetMatch: () => set({ ...initial }),
}));
