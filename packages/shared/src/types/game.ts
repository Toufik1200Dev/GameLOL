/**
 * In-match networking types: the authoritative per-player state, world snapshots
 * (delta), and the shoot/hit/kill events that drive combat + VFX + the kill feed.
 */
import type { Vec3 } from '../math/vec3';
import type { TeamId } from './lobby';

/** Authoritative per-player state broadcast in snapshots. */
export interface NetPlayerState {
  id: string;
  name: string;
  team: TeamId;
  // Kinematics
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vy: number;
  moving: boolean;
  crouching: boolean;
  onGround: boolean;
  // Combat / status
  health: number; // hearts remaining
  alive: boolean;
  kills: number;
  deaths: number;
  characterId: string | null;
  weaponId: string | null;
  /** Seconds until respawn (0 when alive). */
  respawnIn: number;
}

/**
 * A world snapshot. `players` is a DELTA — only entries that changed since the
 * recipient's last snapshot (a freshly joined client receives a full set first).
 * `lastProcessedInput` is per-recipient (used by client reconciliation).
 */
export interface GameSnapshot {
  tick: number;
  serverTime: number;
  lastProcessedInput: number;
  full: boolean;
  players: NetPlayerState[];
  removed: string[];
  scores: Record<TeamId, number>;
  timeRemaining: number;
}

/** Fire request from the client (server validates + resolves authoritatively). */
export interface ShootCommand {
  seq: number;
  origin: Vec3;
  dir: Vec3;
  clientTime: number;
}

/** Hit notification (to shooter for hitmarker, to victim for damage indicator). */
export interface HitEvent {
  shooterId: string;
  victimId: string;
  damage: number;
  victimHealth: number;
  killed: boolean;
  point: Vec3;
}

/** A kill, for the kill feed + scoreboard. */
export interface KillEvent {
  killerId: string;
  killerName: string;
  killerTeam: TeamId;
  victimId: string;
  victimName: string;
  victimTeam: TeamId;
  weaponId: string | null;
}

/** Sent to the winning condition / end of match. */
export interface MatchEndPayload {
  winner: TeamId | 'draw';
  scores: Record<TeamId, number>;
  players: NetPlayerState[];
}
