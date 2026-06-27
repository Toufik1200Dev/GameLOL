/**
 * UI shell state: a simple screen state machine plus a transient toast queue.
 * Using a client-side screen machine (rather than URL routes) keeps the live
 * socket connection intact across menu → lobby → game transitions and avoids
 * refresh/deep-link edge cases for ephemeral lobby state.
 */
import { create } from 'zustand';

export type Screen = 'menu' | 'settings' | 'lobby' | 'characterSelect' | 'weaponSelect' | 'game';

export type ToastType = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface UIState {
  screen: Screen;
  toasts: Toast[];
  setScreen: (screen: Screen) => void;
  pushToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useUIStore = create<UIState>((set) => ({
  screen: 'menu',
  toasts: [],
  setScreen: (screen) => set({ screen }),
  pushToast: (message, type = 'info') =>
    set((state) => ({ toasts: [...state.toasts, { id: ++toastId, type, message }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
