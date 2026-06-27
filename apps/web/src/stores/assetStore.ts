/**
 * Loads and caches the asset manifest from the live `/api/assets/manifest`
 * endpoint. Components read from here so a single fetch is shared app-wide; the
 * lobby/selection screens call `load()` on mount and can `load(true)` to refresh
 * after dropping new asset folders in.
 */
import { create } from 'zustand';
import { EMPTY_MANIFEST, type AssetManifest } from '@game/shared';

interface AssetStore {
  manifest: AssetManifest;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  manifest: EMPTY_MANIFEST,
  loading: false,
  loaded: false,
  error: null,
  load: async (force = false) => {
    if (get().loading) return;
    if (get().loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/assets/manifest', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = (await res.json()) as AssetManifest;
      set({ manifest, loading: false, loaded: true });
    } catch (err) {
      set({ loading: false, loaded: true, error: (err as Error).message });
    }
  },
}));
