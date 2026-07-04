/**
 * UI shell state: a screen name + a transient toast queue. Each logical screen
 * maps to a real Next route (see lib/navigation); `setScreen` navigates the
 * router AND records the name. The socket connection lives in the root layout
 * (ClientRoot), so it stays intact across client-side route transitions.
 */
import { create } from 'zustand';
import { navigate } from '../lib/navigation';

export type Screen =
  | 'menu'
  | 'settings'
  | 'lobby'
  | 'characterSelect'
  | 'weaponSelect'
  | 'mapSelect'
  | 'game';

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
  setScreen: (screen) => {
    set({ screen });
    navigate(screen);
  },
  pushToast: (message, type = 'info') =>
    set((state) => ({ toasts: [...state.toasts, { id: ++toastId, type, message }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
