'use client';

/**
 * Root client shell. Mounts the socket connection once, renders the active
 * screen from the UI state machine, and overlays the toast system. Screens are
 * cross-faded with Framer Motion.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useUIStore, type Screen } from '../stores/uiStore';
import { Toasts } from './ui/Toasts';
import { AppErrorBoundary } from './AppErrorBoundary';
import { LoadingScreen } from './screens/LoadingScreen';
import { MainMenu } from './screens/MainMenu';
import { SettingsScreen } from './screens/SettingsScreen';
import { LobbyScreen } from './screens/LobbyScreen';

// R3F-heavy screens are lazy-loaded (client-only) so the menu/lobby keep a lean
// initial bundle.
const CharacterSelectScreen = dynamic(
  () => import('./screens/CharacterSelectScreen').then((m) => m.CharacterSelectScreen),
  { ssr: false, loading: () => <LoadingScreen /> },
);
const WeaponSelectScreen = dynamic(
  () => import('./screens/WeaponSelectScreen').then((m) => m.WeaponSelectScreen),
  { ssr: false, loading: () => <LoadingScreen /> },
);
const GameScreen = dynamic(() => import('./screens/GameScreen').then((m) => m.GameScreen), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

const SCREENS: Record<Screen, React.ComponentType> = {
  menu: MainMenu,
  settings: SettingsScreen,
  lobby: LobbyScreen,
  characterSelect: CharacterSelectScreen,
  weaponSelect: WeaponSelectScreen,
  game: GameScreen,
};

export function AppShell() {
  useSocketConnection();
  const screen = useUIStore((s) => s.screen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render the splash on the server and until the client mounts so persisted /
  // socket-driven state never causes a hydration mismatch.
  if (!mounted) return <LoadingScreen />;

  const ActiveScreen = SCREENS[screen];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AppErrorBoundary>
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full w-full"
          >
            <ActiveScreen />
          </motion.div>
        </AnimatePresence>
      </AppErrorBoundary>
      <Toasts />
    </div>
  );
}
