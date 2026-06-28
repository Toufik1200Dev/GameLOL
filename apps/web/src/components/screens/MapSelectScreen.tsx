'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { MapManifestEntry } from '@game/shared';
import { useAssetStore } from '../../stores/assetStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { Button, Panel } from '../ui/primitives';
import { MapPreview } from '../r3f/ModelPreview';
import { EmptyAssetState } from './EmptyAssetState';

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="border-border h-4 w-4 rounded border" style={{ background: color }} />
      <span className="text-xs text-white/50">
        {label} <span className="text-white/80">{color}</span>
      </span>
    </div>
  );
}

export function MapSelectScreen() {
  const load = useAssetStore((s) => s.load);
  const manifest = useAssetStore((s) => s.manifest);
  const loading = useAssetStore((s) => s.loading);
  const setScreen = useUIStore((s) => s.setScreen);
  const pushToast = useUIStore((s) => s.pushToast);
  const selectMap = useLobbyStore((s) => s.selectMap);
  const isHost = useLobbyStore((s) => s.isHost());
  const lobby = useLobbyStore((s) => s.lobby);

  const maps = manifest.maps;
  const currentMapId = lobby?.settings.mapId ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(currentMapId);

  useEffect(() => {
    load();
  }, [load]);

  // Default selection to the active map (or the first one) once the list loads.
  useEffect(() => {
    if (!selectedId && maps.length > 0) setSelectedId(currentMapId ?? maps[0]!.id);
  }, [maps, selectedId, currentMapId]);

  const selected: MapManifestEntry | null = useMemo(
    () => maps.find((m) => m.id === selectedId) ?? null,
    [maps, selectedId],
  );

  const choose = (id: string) => {
    setSelectedId(id);
    if (!isHost) {
      pushToast('Only the host can change the map.', 'info');
      return;
    }
    selectMap(id);
  };

  return (
    <div className="menu-grid-bg h-full w-full overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-bold">Select Map</h1>
          <Button variant="ghost" onClick={() => setScreen('lobby')}>
            ← Back to Lobby
          </Button>
        </div>

        {maps.length === 0 ? (
          <EmptyAssetState
            kind="map"
            loading={loading}
            onRefresh={() => load(true)}
            path="public/assets/maps/<id>/"
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            {/* Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {maps.map((m) => (
                <motion.button
                  key={m.id}
                  whileHover={{ y: -3 }}
                  onClick={() => choose(m.id)}
                  className={`bg-panel/70 flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                    selectedId === m.id ? 'border-accent' : 'border-border hover:border-white/30'
                  }`}
                >
                  <div className="bg-bg-elevated h-20 w-full overflow-hidden rounded-lg">
                    {m.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.preview}
                        alt={m.config.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="font-display flex h-full w-full items-center justify-center text-2xl font-bold text-white/80"
                        style={{
                          background: `linear-gradient(135deg, ${m.config.skyColor}, ${m.config.fogColor})`,
                        }}
                      >
                        {m.config.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white/90">
                    {m.config.name}
                    {currentMapId === m.id && <span className="text-accent text-[10px]">● active</span>}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Preview + stats */}
            <Panel className="flex flex-col gap-4 overflow-hidden p-4">
              <div
                className="bg-bg-elevated h-64 overflow-hidden rounded-xl"
                style={{
                  background: selected
                    ? `linear-gradient(160deg, ${selected.config.skyColor}, ${selected.config.fogColor})`
                    : undefined,
                }}
              >
                {selected?.model && <MapPreview key={selected.id} url={selected.model} />}
              </div>
              {selected && (
                <>
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{selected.config.name}</h2>
                    <p className="text-xs text-white/50">{selected.config.description}</p>
                  </div>
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between text-white/60">
                      <span>Size</span>
                      <span className="text-white/90">{selected.config.size} m</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Scale</span>
                      <span className="text-white/90">{selected.config.scale}×</span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Type</span>
                      <span className="text-white/90">{selected.model ? 'Model' : 'Procedural'}</span>
                    </div>
                    <Swatch label="Sky" color={selected.config.skyColor} />
                    <Swatch label="Fog" color={selected.config.fogColor} />
                  </div>
                  <Button onClick={() => choose(selected.id)} disabled={!isHost}>
                    {!isHost
                      ? 'Host picks the map'
                      : currentMapId === selected.id
                        ? '✓ Selected'
                        : 'Set Map'}
                  </Button>
                </>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
