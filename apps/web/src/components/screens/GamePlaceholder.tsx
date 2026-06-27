'use client';

/**
 * Placeholder shown when the host starts the match. Phase 3 replaces this entire
 * screen with the React Three Fiber game canvas + HUD. For now it confirms the
 * `game:starting` payload arrived end-to-end.
 */
import { motion } from 'framer-motion';
import { useLobbyStore } from '../../stores/lobbyStore';
import { Button, Panel } from '../ui/primitives';

export function GamePlaceholder() {
  const gameStart = useLobbyStore((s) => s.gameStart);
  const leaveLobby = useLobbyStore((s) => s.leaveLobby);

  return (
    <div className="menu-grid-bg flex h-full w-full items-center justify-center px-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <Panel className="flex max-w-lg flex-col gap-4 p-8 text-center">
          <h1 className="font-display text-accent text-4xl font-bold">Match Starting</h1>
          <p className="text-sm text-white/60">
            The 3D game scene is implemented in Phase 3. This confirms the authoritative
            start signal reached every client.
          </p>
          {gameStart && (
            <div className="bg-bg-elevated/60 rounded-lg p-4 text-left text-xs text-white/60">
              <div>
                Map: <span className="text-white">{gameStart.mapId}</span>
              </div>
              <div>
                Seed: <span className="text-white">{gameStart.mapSeed}</span>
              </div>
              <div>
                Players: <span className="text-white">{gameStart.players.length}</span>
              </div>
            </div>
          )}
          <Button variant="secondary" onClick={leaveLobby} className="mt-2">
            Leave Match
          </Button>
        </Panel>
      </motion.div>
    </div>
  );
}
