/**
 * Client mirror of the authoritative lobby plus the action methods that emit to
 * the server. The store never mutates lobby data optimistically — it waits for
 * the server's `lobby:state` broadcast — so the UI always reflects authority.
 */
import { create } from 'zustand';
import type {
  GameStartPayload,
  LobbySettings,
  LobbyState,
  PlayerPublic,
  TeamId,
} from '@game/shared';
import { getSocket } from '../lib/socket';
import { useUIStore } from './uiStore';

interface LobbyStore {
  connected: boolean;
  playerId: string | null;
  lobby: LobbyState | null;
  gameStart: GameStartPayload | null;

  // --- setters used by the connection hook ---
  setConnected: (connected: boolean) => void;
  setLobby: (lobby: LobbyState) => void;
  setGameStart: (payload: GameStartPayload | null) => void;
  reset: () => void;

  // --- derived helpers ---
  isHost: () => boolean;
  self: () => PlayerPublic | null;

  // --- actions (emit to server) ---
  createLobby: (name: string) => Promise<boolean>;
  joinLobby: (code: string, name: string) => Promise<boolean>;
  leaveLobby: () => void;
  setReady: (ready: boolean) => void;
  selectTeam: (team: TeamId) => void;
  selectCharacter: (characterId: string | null) => void;
  selectWeapon: (weaponId: string | null) => void;
  updateSettings: (patch: Partial<LobbySettings>) => void;
  kick: (playerId: string) => void;
  closeLobby: () => void;
  startGame: () => void;
}

export const useLobbyStore = create<LobbyStore>((set, get) => ({
  connected: false,
  playerId: null,
  lobby: null,
  gameStart: null,

  setConnected: (connected) => set({ connected }),
  setLobby: (lobby) => set({ lobby }),
  setGameStart: (gameStart) => set({ gameStart }),
  reset: () => set({ lobby: null, gameStart: null }),

  isHost: () => {
    const { lobby, playerId } = get();
    return Boolean(lobby && playerId && lobby.hostId === playerId);
  },
  self: () => {
    const { lobby, playerId } = get();
    if (!lobby || !playerId) return null;
    return lobby.players.find((p) => p.id === playerId) ?? null;
  },

  createLobby: async (name) => {
    const ui = useUIStore.getState();
    try {
      const res = await getSocket().emitWithAck('lobby:create', { playerName: name });
      if (res.ok) {
        set({ playerId: res.playerId, lobby: res.state });
        ui.setScreen('lobby');
        return true;
      }
      ui.pushToast(res.error, 'error');
      return false;
    } catch {
      ui.pushToast('Could not reach the server.', 'error');
      return false;
    }
  },

  joinLobby: async (code, name) => {
    const ui = useUIStore.getState();
    try {
      const res = await getSocket().emitWithAck('lobby:join', { code, playerName: name });
      if (res.ok) {
        set({ playerId: res.playerId, lobby: res.state });
        ui.setScreen('lobby');
        return true;
      }
      ui.pushToast(res.error, 'error');
      return false;
    } catch {
      ui.pushToast('Could not reach the server.', 'error');
      return false;
    }
  },

  leaveLobby: () => {
    getSocket().emit('lobby:leave');
    set({ lobby: null, gameStart: null });
    useUIStore.getState().setScreen('menu');
  },

  setReady: (ready) => getSocket().emit('lobby:setReady', { ready }),
  selectTeam: (team) => getSocket().emit('lobby:selectTeam', { team }),
  selectCharacter: (characterId) => getSocket().emit('lobby:selectCharacter', { characterId }),
  selectWeapon: (weaponId) => getSocket().emit('lobby:selectWeapon', { weaponId }),
  updateSettings: (patch) => getSocket().emit('lobby:updateSettings', { settings: patch }),
  kick: (playerId) => getSocket().emit('lobby:kick', { playerId }),
  closeLobby: () => {
    getSocket().emit('lobby:close');
    set({ lobby: null, gameStart: null });
    useUIStore.getState().setScreen('menu');
  },
  startGame: () => getSocket().emit('lobby:start'),
}));
