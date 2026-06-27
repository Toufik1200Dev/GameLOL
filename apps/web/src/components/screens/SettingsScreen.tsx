'use client';

import { motion } from 'framer-motion';
import { useSettingsStore, type GraphicsQuality } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { Button, Panel, Slider, TextInput, Toggle } from '../ui/primitives';

const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];

export function SettingsScreen() {
  const s = useSettingsStore();
  const setScreen = useUIStore((u) => u.setScreen);

  return (
    <div className="menu-grid-bg h-full w-full overflow-y-auto px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto flex w-full max-w-2xl flex-col gap-6"
      >
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-bold">Settings</h1>
          <Button variant="ghost" onClick={() => setScreen('menu')}>
            ← Back
          </Button>
        </div>

        <Panel className="flex flex-col gap-5 p-6">
          <h2 className="font-display text-accent text-lg uppercase tracking-wide">Profile</h2>
          <TextInput
            label="Callsign"
            value={s.playerName}
            maxLength={20}
            onChange={(e) => s.set('playerName', e.target.value)}
          />
        </Panel>

        <Panel className="flex flex-col gap-5 p-6">
          <h2 className="font-display text-accent text-lg uppercase tracking-wide">Controls</h2>
          <Slider
            label="Mouse Sensitivity"
            value={s.mouseSensitivity}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => s.set('mouseSensitivity', v)}
            format={(v) => v.toFixed(2)}
          />
          <Slider
            label="Field of View"
            value={s.fov}
            min={60}
            max={110}
            step={1}
            onChange={(v) => s.set('fov', v)}
            format={(v) => `${v}°`}
          />
          <Toggle checked={s.invertY} onChange={(v) => s.set('invertY', v)} label="Invert Y axis" />
        </Panel>

        <Panel className="flex flex-col gap-5 p-6">
          <h2 className="font-display text-accent text-lg uppercase tracking-wide">Audio</h2>
          <Slider
            label="Master Volume"
            value={s.masterVolume}
            min={0}
            max={1}
            onChange={(v) => s.set('masterVolume', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Music"
            value={s.musicVolume}
            min={0}
            max={1}
            onChange={(v) => s.set('musicVolume', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Sound Effects"
            value={s.sfxVolume}
            min={0}
            max={1}
            onChange={(v) => s.set('sfxVolume', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Panel>

        <Panel className="flex flex-col gap-5 p-6">
          <h2 className="font-display text-accent text-lg uppercase tracking-wide">Graphics</h2>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-white/50">Quality</span>
            <div className="flex gap-2">
              {QUALITIES.map((q) => (
                <Button
                  key={q}
                  size="sm"
                  variant={s.graphicsQuality === q ? 'primary' : 'secondary'}
                  className="flex-1 capitalize"
                  onClick={() => s.set('graphicsQuality', q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
          <Toggle
            checked={s.showFps}
            onChange={(v) => s.set('showFps', v)}
            label="Show FPS counter"
          />
        </Panel>
      </motion.div>
    </div>
  );
}
