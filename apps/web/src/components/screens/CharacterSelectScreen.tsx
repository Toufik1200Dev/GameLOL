'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { CharacterManifestEntry } from '@game/shared';
import { useAssetStore } from '../../stores/assetStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { Button, Panel } from '../ui/primitives';
import { CharacterPreview } from '../r3f/ModelPreview';
import { EmptyAssetState } from './EmptyAssetState';

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-white/50">
        <span>{label}</span>
        <span className="text-white/80">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10">
        <div className="bg-accent h-full rounded-full" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

export function CharacterSelectScreen() {
  const load = useAssetStore((s) => s.load);
  const manifest = useAssetStore((s) => s.manifest);
  const loading = useAssetStore((s) => s.loading);
  const setScreen = useUIStore((s) => s.setScreen);
  const selectCharacter = useLobbyStore((s) => s.selectCharacter);
  const self = useLobbyStore((s) => s.self());

  const characters = manifest.characters;
  const [selectedId, setSelectedId] = useState<string | null>(self?.characterId ?? null);

  useEffect(() => {
    load();
  }, [load]);

  // Default selection to the first character once the list loads.
  useEffect(() => {
    if (!selectedId && characters.length > 0) setSelectedId(characters[0]!.id);
  }, [characters, selectedId]);

  const selected: CharacterManifestEntry | null = useMemo(
    () => characters.find((c) => c.id === selectedId) ?? null,
    [characters, selectedId],
  );

  const choose = (id: string) => {
    setSelectedId(id);
    selectCharacter(id);
  };

  return (
    <div className="menu-grid-bg h-full w-full overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-bold">Select Character</h1>
          <Button variant="ghost" onClick={() => setScreen('lobby')}>
            ← Back to Lobby
          </Button>
        </div>

        {characters.length === 0 ? (
          <EmptyAssetState
            kind="character"
            loading={loading}
            onRefresh={() => load(true)}
            path="public/assets/characters/<id>/"
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            {/* Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {characters.map((c) => (
                <motion.button
                  key={c.id}
                  whileHover={{ y: -3 }}
                  onClick={() => choose(c.id)}
                  className={`bg-panel/70 flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                    selectedId === c.id ? 'border-accent' : 'border-border hover:border-white/30'
                  }`}
                >
                  <div className="bg-bg-elevated h-20 w-20 overflow-hidden rounded-lg">
                    {c.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.icon}
                        alt={c.config.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-white/20">
                        ?
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-white/90">{c.config.name}</span>
                </motion.button>
              ))}
            </div>

            {/* Preview + stats */}
            <Panel className="flex flex-col gap-4 overflow-hidden p-4">
              <div className="bg-bg-elevated h-64 overflow-hidden rounded-xl">
                {selected && (
                  <CharacterPreview
                    key={selected.id}
                    url={selected.model}
                    animationsUrl={selected.animations}
                    clipName={selected.config.animations.idle}
                    scale={selected.config.scale}
                  />
                )}
              </div>
              {selected && (
                <>
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{selected.config.name}</h2>
                    <p className="text-xs text-white/50">{selected.config.description}</p>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <StatBar label="Health" value={selected.config.health} max={20} />
                    <StatBar label="Speed" value={selected.config.speed} max={10} />
                    <StatBar label="Jump" value={selected.config.jumpHeight} max={3} />
                  </div>
                  <Button onClick={() => setScreen('lobby')}>
                    {self?.characterId === selected.id ? '✓ Selected' : 'Confirm'}
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
