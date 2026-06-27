/**
 * Typed Socket.IO client singleton. Reusing one module-level socket means the
 * connection survives client-side navigation and React re-renders. The generic
 * parameters come straight from the shared protocol, giving end-to-end type
 * safety on every emit/listen.
 */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@game/shared';
import { SERVER_URL } from './env';

// NOTE: socket.io types list <ListenEvents, EmitEvents>.
export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;

export function getSocket(): ClientSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}
