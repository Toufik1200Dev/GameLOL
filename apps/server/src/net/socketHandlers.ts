/**
 * Wires the typed Socket.IO server to the lobby domain. This is the authoritative
 * boundary: every client request is validated here before mutating lobby state,
 * and every change is broadcast as a full `lobby:state` snapshot (lobbies are
 * small, so full snapshots are simpler and perfectly cheap).
 */
import type { Server, Socket } from 'socket.io';
import {
  HEARTBEAT_INTERVAL_MS,
  type ClientToServerEvents,
  type GameStartPayload,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@game/shared';
import { LobbyManager } from '../lobby/LobbyManager';
import type { Lobby } from '../lobby/Lobby';
import { logger } from '../logger';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function attachSocketHandlers(io: GameServer): LobbyManager {
  const manager = new LobbyManager();

  const broadcast = (lobby: Lobby): void => {
    io.to(lobby.code).emit('lobby:state', lobby.getState());
  };

  const currentLobby = (socket: GameSocket): Lobby | undefined => {
    const code = socket.data.lobbyCode;
    return code ? manager.get(code) : undefined;
  };

  /** Resolve the caller's lobby and assert host privileges. */
  const requireHost = (socket: GameSocket): Lobby | null => {
    const lobby = currentLobby(socket);
    if (!lobby) return null;
    if (!lobby.isHost(socket.id)) {
      socket.emit('lobby:error', { message: 'Only the host can do that.' });
      return null;
    }
    return lobby;
  };

  /** Detach a socket from its lobby, migrating host / disposing as needed. */
  const handleLeave = (socket: GameSocket): void => {
    const code = socket.data.lobbyCode;
    if (!code) return;
    const lobby = manager.get(code);
    socket.leave(code);
    socket.data.lobbyCode = null;
    if (!lobby) return;

    const { migratedHostTo } = lobby.removePlayer(socket.id);
    if (migratedHostTo) {
      logger.info(`lobby ${code}: host migrated to ${migratedHostTo}`);
    }
    if (lobby.isEmpty()) {
      manager.remove(code);
      logger.info(`lobby ${code}: disposed (empty)`);
      return;
    }
    broadcast(lobby);
  };

  io.on('connection', (socket: GameSocket) => {
    socket.data.playerId = socket.id;
    socket.data.lobbyCode = null;
    logger.debug(`connected: ${socket.id} (lobbies: ${manager.count})`);

    socket.on('lobby:create', ({ playerName }, ack) => {
      handleLeave(socket); // defensive: never be in two lobbies
      const lobby = manager.create(socket.id);
      const player = lobby.addPlayer(socket.id, playerName);
      if (!player) {
        manager.remove(lobby.code);
        ack({ ok: false, error: 'Failed to create lobby.' });
        return;
      }
      socket.join(lobby.code);
      socket.data.lobbyCode = lobby.code;
      logger.info(`lobby ${lobby.code}: created by ${player.name} (${socket.id})`);
      ack({ ok: true, playerId: socket.id, state: lobby.getState() });
    });

    socket.on('lobby:join', ({ code, playerName }, ack) => {
      const { lobby, normalized } = manager.resolve(code);
      if (!lobby) {
        ack({ ok: false, error: `Lobby "${normalized || code}" was not found.` });
        return;
      }
      if (lobby.phase === 'in-game') {
        ack({ ok: false, error: 'That match has already started.' });
        return;
      }
      if (lobby.isFull()) {
        ack({ ok: false, error: 'That lobby is full.' });
        return;
      }
      handleLeave(socket);
      const player = lobby.addPlayer(socket.id, playerName);
      if (!player) {
        ack({ ok: false, error: 'Could not join that lobby.' });
        return;
      }
      socket.join(lobby.code);
      socket.data.lobbyCode = lobby.code;
      logger.info(`lobby ${lobby.code}: ${player.name} joined (${socket.id})`);
      ack({ ok: true, playerId: socket.id, state: lobby.getState() });
      broadcast(lobby);
    });

    socket.on('lobby:leave', () => handleLeave(socket));

    socket.on('lobby:setReady', ({ ready }) => {
      const lobby = currentLobby(socket);
      if (!lobby) return;
      lobby.setReady(socket.id, Boolean(ready));
      broadcast(lobby);
    });

    socket.on('lobby:selectTeam', ({ team }) => {
      const lobby = currentLobby(socket);
      if (!lobby) return;
      lobby.setTeam(socket.id, team);
      broadcast(lobby);
    });

    socket.on('lobby:selectCharacter', ({ characterId }) => {
      const lobby = currentLobby(socket);
      if (!lobby) return;
      lobby.setCharacter(socket.id, characterId);
      broadcast(lobby);
    });

    socket.on('lobby:selectWeapon', ({ weaponId }) => {
      const lobby = currentLobby(socket);
      if (!lobby) return;
      lobby.setWeapon(socket.id, weaponId);
      broadcast(lobby);
    });

    socket.on('lobby:updateSettings', ({ settings }) => {
      const lobby = requireHost(socket);
      if (!lobby) return;
      lobby.updateSettings(settings);
      broadcast(lobby);
    });

    socket.on('lobby:kick', ({ playerId }) => {
      const lobby = requireHost(socket);
      if (!lobby) return;
      if (playerId === socket.id || !lobby.has(playerId)) return;
      lobby.removePlayer(playerId);
      const target = io.sockets.sockets.get(playerId) as GameSocket | undefined;
      if (target) {
        target.emit('lobby:kicked', { reason: 'You were removed by the host.' });
        target.leave(lobby.code);
        target.data.lobbyCode = null;
      }
      logger.info(`lobby ${lobby.code}: kicked ${playerId}`);
      broadcast(lobby);
    });

    socket.on('lobby:close', () => {
      const lobby = requireHost(socket);
      if (!lobby) return;
      const code = lobby.code;
      io.to(code).emit('lobby:closed', { reason: 'The host closed the lobby.' });
      for (const s of io.sockets.sockets.values()) {
        const gs = s as GameSocket;
        if (gs.data.lobbyCode === code) {
          gs.leave(code);
          gs.data.lobbyCode = null;
        }
      }
      manager.remove(code);
      logger.info(`lobby ${code}: closed by host`);
    });

    socket.on('lobby:start', () => {
      const lobby = requireHost(socket);
      if (!lobby) return;
      if (!lobby.canStart()) {
        socket.emit('lobby:error', { message: 'All players must be ready to start.' });
        return;
      }
      lobby.phase = 'in-game';
      const payload: GameStartPayload = {
        mapId: lobby.settings.mapId,
        mapSeed: lobby.code, // deterministic per-lobby
        settings: lobby.settings,
        players: lobby.getState().players,
        startedAt: Date.now(),
      };
      io.to(lobby.code).emit('game:starting', payload);
      broadcast(lobby);
      logger.info(`lobby ${lobby.code}: match started (${lobby.size} players)`);
    });

    socket.on('net:ping', ({ clientTime }, ack) => {
      ack({ clientTime, serverTime: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`disconnected: ${socket.id} (${reason})`);
      handleLeave(socket);
    });
  });

  startHeartbeat(io, manager);
  return manager;
}

/**
 * Periodically probes every lobbied socket to measure round-trip latency (shown
 * as each player's ping) and rebroadcasts lobby state so pings stay fresh.
 */
function startHeartbeat(io: GameServer, manager: LobbyManager): void {
  setInterval(() => {
    const lobbyCodes = new Set<string>();
    for (const s of io.sockets.sockets.values()) {
      const socket = s as GameSocket;
      const code = socket.data.lobbyCode;
      if (!code) continue;
      const lobby = manager.get(code);
      if (!lobby) continue;
      lobbyCodes.add(code);

      const start = Date.now();
      socket.timeout(HEARTBEAT_INTERVAL_MS).emit('net:probe', { serverTime: start }, (err) => {
        if (err) return; // timed out; keep last known ping
        lobby.setPing(socket.id, Date.now() - start);
      });
    }
    // Rebroadcast each active lobby once with refreshed pings.
    for (const code of lobbyCodes) {
      const lobby = manager.get(code);
      if (lobby) io.to(code).emit('lobby:state', lobby.getState());
    }
  }, HEARTBEAT_INTERVAL_MS).unref();
}
