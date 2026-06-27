/**
 * Lobby domain types shared by client and server. The server owns the canonical
 * `LobbyState`; the client renders a mirror of it. Keeping these definitions in
 * one place guarantees the UI and the authority never drift apart.
 */

export type TeamId = 'red' | 'blue';

export const TEAMS: readonly TeamId[] = ['red', 'blue'];

/** Player data safe to broadcast to every client in the lobby. */
export interface PlayerPublic {
  id: string;
  name: string;
  team: TeamId;
  isHost: boolean;
  ready: boolean;
  /** Round-trip latency in milliseconds (server-measured). */
  ping: number;
  characterId: string | null;
  weaponId: string | null;
  /** Carried into matches for the scoreboard. */
  kills: number;
  deaths: number;
  /** False while a socket is temporarily disconnected (grace period). */
  connected: boolean;
}

/** Host-configurable lobby + match settings. */
export interface LobbySettings {
  maxPlayers: number;
  mapId: string;
  matchDurationSec: number;
  respawnDelaySec: number;
  scoreLimit: number;
  friendlyFire: boolean;
  autoBalance: boolean;
}

export type LobbyPhase = 'lobby' | 'in-game';

/** Full, broadcastable lobby snapshot. */
export interface LobbyState {
  code: string;
  hostId: string;
  players: PlayerPublic[];
  settings: LobbySettings;
  phase: LobbyPhase;
  createdAt: number;
}

/**
 * Payload sent when the host starts the match. Phase 1 carries the essentials
 * (seed + settings + roster); Phase 3 extends it with spawn assignments etc.
 */
export interface GameStartPayload {
  mapId: string;
  /** Seed string → both server and every client generate the identical world. */
  mapSeed: string;
  settings: LobbySettings;
  players: PlayerPublic[];
  startedAt: number;
}
