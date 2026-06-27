/**
 * Local, persisted player preferences (survive reloads via localStorage). These
 * are client-only — the server never needs them. Graphics/audio/input settings
 * here are consumed by the game engine and HUD in later phases.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface SettingsState {
  playerName: string;
  mouseSensitivity: number; // 0.1 .. 3
  invertY: boolean;
  fov: number; // 60 .. 110
  masterVolume: number; // 0 .. 1
  musicVolume: number;
  sfxVolume: number;
  graphicsQuality: GraphicsQuality;
  showFps: boolean;

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

const randomName = (): string => `Player${Math.floor(1000 + Math.random() * 9000)}`;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      playerName: randomName(),
      mouseSensitivity: 1,
      invertY: false,
      fov: 80,
      masterVolume: 0.8,
      musicVolume: 0.5,
      sfxVolume: 0.8,
      // Default to 'medium' (no shadows / post-processing) so heavy GLB maps run
      // smoothly out of the box; users can opt into 'high' for shadows + bloom.
      graphicsQuality: 'medium',
      showFps: true,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: 'gameonline-settings',
      // Only persist data fields, not the action.
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);
