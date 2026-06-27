'use client';

/**
 * Mounts the socket connection once and routes every server → client event into
 * the Zustand stores. Mounted a single time at the app root (`AppShell`).
 */
import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useLobbyStore } from '../stores/lobbyStore';
import { useUIStore } from '../stores/uiStore';

export function useSocketConnection(): void {
  useEffect(() => {
    const socket = getSocket();

    const onConnect = (): void => useLobbyStore.getState().setConnected(true);
    const onDisconnect = (): void => useLobbyStore.getState().setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('lobby:state', (state) => {
      useLobbyStore.getState().setLobby(state);
    });

    socket.on('lobby:closed', ({ reason }) => {
      useLobbyStore.getState().reset();
      useUIStore.getState().setScreen('menu');
      useUIStore.getState().pushToast(reason, 'info');
    });

    socket.on('lobby:kicked', ({ reason }) => {
      useLobbyStore.getState().reset();
      useUIStore.getState().setScreen('menu');
      useUIStore.getState().pushToast(reason, 'error');
    });

    socket.on('lobby:error', ({ message }) => {
      useUIStore.getState().pushToast(message, 'error');
    });

    socket.on('game:starting', (payload) => {
      useLobbyStore.getState().setGameStart(payload);
      useUIStore.getState().setScreen('game');
    });

    // Latency probe: just acknowledge so the server can time the round trip.
    socket.on('net:probe', (_payload, ack) => ack());

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:state');
      socket.off('lobby:closed');
      socket.off('lobby:kicked');
      socket.off('lobby:error');
      socket.off('game:starting');
      socket.off('net:probe');
    };
  }, []);
}
