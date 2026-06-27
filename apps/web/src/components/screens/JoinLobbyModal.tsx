'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '@game/shared';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLobbyStore } from '../../stores/lobbyStore';
import { Button } from '../ui/primitives';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function JoinLobbyModal({ open, onClose }: Props) {
  const playerName = useSettingsStore((s) => s.playerName);
  const joinLobby = useLobbyStore((s) => s.joinLobby);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.length !== ROOM_CODE_LENGTH || busy) return;
    setBusy(true);
    const ok = await joinLobby(code, playerName.trim() || 'Player');
    setBusy(false);
    if (ok) {
      setCode('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-panel border-border w-full max-w-sm rounded-2xl border p-6"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl font-semibold">Join Lobby</h2>
            <p className="mt-1 text-sm text-white/50">
              Enter the {ROOM_CODE_LENGTH}-character code.
            </p>

            <input
              autoFocus
              value={code}
              onChange={(e) =>
                setCode(normalizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH))
              }
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="A4HF9P"
              className="font-display bg-bg-elevated border-border focus:border-accent mt-5 w-full rounded-xl border px-4 py-4 text-center text-3xl font-bold uppercase tracking-[0.4em] text-white outline-none"
            />

            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={code.length !== ROOM_CODE_LENGTH || busy}
                onClick={submit}
              >
                {busy ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
