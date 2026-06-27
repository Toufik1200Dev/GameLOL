'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { Button, TextInput } from '../ui/primitives';
import { JoinLobbyModal } from './JoinLobbyModal';

export function MainMenu() {
  const playerName = useSettingsStore((s) => s.playerName);
  const setSetting = useSettingsStore((s) => s.set);
  const createLobby = useLobbyStore((s) => s.createLobby);
  const connected = useLobbyStore((s) => s.connected);
  const setScreen = useUIStore((s) => s.setScreen);

  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    await createLobby(playerName.trim() || 'Player');
    setBusy(false);
  };

  return (
    <div className="menu-grid-bg flex h-full w-full items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex w-full max-w-md flex-col items-center gap-8"
      >
        <div className="text-center">
          <motion.h1
            className="font-display text-7xl font-bold leading-none tracking-tight"
            initial={{ letterSpacing: '0.2em', opacity: 0 }}
            animate={{ letterSpacing: '-0.01em', opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <span className="text-accent">GAME</span>ONLINE
          </motion.h1>
          <p className="mt-2 text-sm text-white/50">Private-lobby multiplayer 3D shooter</p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <TextInput
            id="player-name"
            label="Callsign"
            value={playerName}
            maxLength={20}
            onChange={(e) => setSetting('playerName', e.target.value)}
            placeholder="Enter your name"
          />

          <div className="flex flex-col gap-3 pt-2">
            <Button size="lg" onClick={handleCreate} disabled={busy || !connected}>
              Create Lobby
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setJoinOpen(true)}
              disabled={!connected}
            >
              Join Lobby
            </Button>
            <Button size="md" variant="ghost" onClick={() => setScreen('settings')}>
              Settings
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/40">
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-success' : 'bg-danger animate-pulse'}`}
          />
          {connected ? 'Connected to server' : 'Connecting to server…'}
        </div>
      </motion.div>

      <JoinLobbyModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
