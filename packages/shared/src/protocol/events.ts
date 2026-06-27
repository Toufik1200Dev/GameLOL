/**
 * The wire protocol: strongly-typed Socket.IO event maps used to parameterize
 * BOTH `Server<...>` (server) and `Socket<...>` (client). This is the single
 * source of truth for every message that crosses the network — change it here
 * and both sides get compile errors until they agree.
 */
import type { GameStartPayload, LobbySettings, LobbyState, TeamId } from '../types/lobby';
import type {
  GameSnapshot,
  HitEvent,
  KillEvent,
  MatchEndPayload,
  ShootCommand,
} from '../types/game';
import type { PlayerInput } from '../sim/types';

/** Acknowledgement callback shape used for request/response style events. */
export type Ack<T> = (response: T) => void;

/** Discriminated result returned via acks. */
export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  /** Full lobby snapshot, broadcast on any change (lobbies are small). */
  'lobby:state': (state: LobbyState) => void;
  /** The lobby was closed by the host or emptied. */
  'lobby:closed': (payload: { reason: string }) => void;
  /** This client was removed by the host. */
  'lobby:kicked': (payload: { reason: string }) => void;
  /** Non-fatal error feedback (toast-able). */
  'lobby:error': (payload: { message: string }) => void;
  /** Host started the match — clients transition into the game. */
  'game:starting': (payload: GameStartPayload) => void;
  /**
   * Server-driven latency probe. The client simply invokes the ack; the server
   * times the round trip to populate each player's `ping`. Sent with a timeout,
   * so the client's ack must take no arguments.
   */
  'net:probe': (payload: { serverTime: number }, ack: () => void) => void;

  // --- In-match ---
  /** Authoritative world snapshot (delta) at the snapshot rate. */
  'game:snapshot': (snapshot: GameSnapshot) => void;
  /** A shot landed (sent to shooter + victim). */
  'game:hit': (event: HitEvent) => void;
  /** A kill occurred (kill feed). */
  'game:kill': (event: KillEvent) => void;
  /** The match ended; show the victory screen. */
  'game:ended': (payload: MatchEndPayload) => void;
}

/** Events clients emit to the server. */
export interface ClientToServerEvents {
  'lobby:create': (
    payload: { playerName: string },
    ack: Ack<Result<{ playerId: string; state: LobbyState }>>,
  ) => void;
  'lobby:join': (
    payload: { code: string; playerName: string },
    ack: Ack<Result<{ playerId: string; state: LobbyState }>>,
  ) => void;
  'lobby:leave': () => void;
  'lobby:setReady': (payload: { ready: boolean }) => void;
  'lobby:selectTeam': (payload: { team: TeamId }) => void;
  'lobby:selectCharacter': (payload: { characterId: string | null }) => void;
  'lobby:selectWeapon': (payload: { weaponId: string | null }) => void;
  /** Host-only: patch lobby/match settings. */
  'lobby:updateSettings': (payload: { settings: Partial<LobbySettings> }) => void;
  /** Host-only: remove a player. */
  'lobby:kick': (payload: { playerId: string }) => void;
  /** Host-only: close the lobby for everyone. */
  'lobby:close': () => void;
  /** Host-only: begin the match. */
  'lobby:start': () => void;
  /** Latency probe; ack echoes client time + adds server time. */
  'net:ping': (
    payload: { clientTime: number },
    ack: Ack<{ clientTime: number; serverTime: number }>,
  ) => void;

  // --- In-match ---
  /** A sampled input frame (sent ~60 Hz, fire-and-forget). */
  'game:input': (input: PlayerInput) => void;
  /** A fire request; the server validates + resolves the hit authoritatively. */
  'game:shoot': (command: ShootCommand) => void;
  /** Leave the active match and return to the lobby. */
  'game:leaveMatch': () => void;
}

/** Reserved for inter-server events (unused; kept for socket.io generics). */
export type InterServerEvents = Record<string, never>;

/** Per-socket attached data (server-side session). */
export interface SocketData {
  playerId: string;
  lobbyCode: string | null;
}
