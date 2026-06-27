/**
 * Global game + networking constants shared by client and server.
 * Changing a value here changes behaviour on BOTH sides consistently — this is
 * the single source of truth for all tunable simulation/network parameters.
 */

/** Authoritative server simulation rate (Hz). One fixed step per tick. */
export const TICK_RATE = 30;

/** Length of a single simulation step in seconds. */
export const TICK_DURATION = 1 / TICK_RATE;

/** Rate at which the client samples + sends input frames to the server (Hz). */
export const INPUT_SEND_RATE = 60;

/** Rate at which the server broadcasts world snapshots (Hz). */
export const SNAPSHOT_RATE = 20;

/**
 * Render-delay buffer for remote-player interpolation (ms). Remote entities are
 * rendered this far in the past so we always have two snapshots to interpolate
 * between — the core trick for jitter-free movement.
 */
export const INTERPOLATION_DELAY_MS = 100;

/** How many past world states the server keeps for lag-compensated hit checks. */
export const LAG_COMP_HISTORY_TICKS = TICK_RATE; // ~1 second

/** Default hearts every player spawns with. */
export const DEFAULT_MAX_HEARTS = 10;

/** Room code configuration. Ambiguous characters (0/O, 1/I) are excluded. */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Lobby sizing. */
export const MIN_PLAYERS = 1;
export const DEFAULT_MAX_PLAYERS = 8;
export const HARD_MAX_PLAYERS = 16;

/** Default match settings (overridable by the host in lobby). */
export const DEFAULT_MATCH_DURATION_SEC = 600; // 10 minutes
export const DEFAULT_RESPAWN_DELAY_SEC = 5;
export const DEFAULT_SCORE_LIMIT = 50;

/** Network/connection constants. */
export const DEFAULT_SERVER_PORT = 4000;
export const HEARTBEAT_INTERVAL_MS = 2000;
