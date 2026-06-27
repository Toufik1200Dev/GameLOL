/**
 * Factory helpers for default settings objects. Centralised so the server and
 * any client-side preview use identical baselines.
 */
import {
  DEFAULT_MATCH_DURATION_SEC,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_RESPAWN_DELAY_SEC,
  DEFAULT_SCORE_LIMIT,
} from '../constants';
import type { LobbySettings } from '../types/lobby';

export const DEFAULT_MAP_ID = 'plaza-night-time';

export const createDefaultLobbySettings = (): LobbySettings => ({
  maxPlayers: DEFAULT_MAX_PLAYERS,
  mapId: DEFAULT_MAP_ID,
  matchDurationSec: DEFAULT_MATCH_DURATION_SEC,
  respawnDelaySec: DEFAULT_RESPAWN_DELAY_SEC,
  scoreLimit: DEFAULT_SCORE_LIMIT,
  friendlyFire: false,
  autoBalance: true,
});
