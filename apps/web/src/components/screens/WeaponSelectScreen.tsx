'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { WeaponManifestEntry } from '@game/shared';
import { useAssetStore } from '../../stores/assetStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { Button, Panel } from '../ui/primitives';
import { WeaponPreview } from '../r3f/ModelPreview';
import { EmptyAssetState } from './EmptyAssetState';

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-1.5 text-sm">
      <span className="text-white/50">{label}</span>
      <span className="font-medium text-white/90">{value}</span>
    </div>
  );
}

export function WeaponSelectScreen() {
  const load = useAssetStore((s) => s.load);
  const manifest = useAssetStore((s) => s.manifest);
  const loading = useAssetStore((s) => s.loading);
  const setScreen = useUIStore((s) => s.setScreen);
  const selectWeapon = useLobbyStore((s) => s.selectWeapon);
  const self = useLobbyStore((s) => s.self());

  const weapons = manifest.weapons;
  const [selectedId, setSelectedId] = useState<string | null>(self?.weaponId ?? null);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId && weapons.length > 0) setSelectedId(weapons[0]!.id);
  }, [weapons, selectedId]);

  const selected: WeaponManifestEntry | null = useMemo(
    () => weapons.find((w) => w.id === selectedId) ?? null,
    [weapons, selectedId],
  );

  const choose = (id: string) => {
    setSelectedId(id);
    selectWeapon(id);
  };

  return (
    <div className="menu-grid-bg h-full w-full overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-bold">Select Weapon</h1>
          <Button variant="ghost" onClick={() => setScreen('lobby')}>
            ← Back to Lobby
          </Button>
        </div>

        {weapons.length === 0 ? (
          <EmptyAssetState
            kind="weapon"
            loading={loading}
            onRefresh={() => load(true)}
            path="public/assets/weapons/<id>/"
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {weapons.map((w) => (
                <motion.button
                  key={w.id}
                  whileHover={{ y: -3 }}
                  onClick={() => choose(w.id)}
                  className={`bg-panel/70 flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                    selectedId === w.id ? 'border-accent' : 'border-border hover:border-white/30'
                  }`}
                >
                  <div className="bg-bg-elevated h-20 w-full overflow-hidden rounded-lg">
                    {w.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={w.icon}
                        alt={w.config.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="font-display flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--color-accent-strong)]/40 to-[var(--color-panel)] text-2xl font-bold text-white/80">
                        {w.config.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-white/90">{w.config.name}</span>
                </motion.button>
              ))}
            </div>

            <Panel className="flex flex-col gap-4 overflow-hidden p-4">
              <div className="bg-bg-elevated h-56 overflow-hidden rounded-xl">
                {selected && <WeaponPreview key={selected.id} url={selected.model} />}
              </div>
              {selected && (
                <>
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{selected.config.name}</h2>
                    <p className="text-xs text-white/50">{selected.config.description}</p>
                  </div>
                  <div className="flex flex-col">
                    <StatRow label="Damage" value={selected.config.damage} />
                    <StatRow label="Fire Rate" value={`${selected.config.fireRate} rpm`} />
                    <StatRow label="Magazine" value={selected.config.magazine} />
                    <StatRow label="Reload" value={`${selected.config.reloadSpeed}s`} />
                    <StatRow label="Range" value={`${selected.config.range}m`} />
                  </div>
                  <Button onClick={() => setScreen('lobby')}>
                    {self?.weaponId === selected.id ? '✓ Selected' : 'Confirm'}
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
