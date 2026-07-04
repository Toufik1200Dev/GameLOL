'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLobbyStore } from '@/stores/lobbyStore';
import { LoadingScreen } from '@/components/screens/LoadingScreen';

const GameScreen = dynamic(
  () => import('@/components/screens/GameScreen').then((m) => m.GameScreen),
  { ssr: false, loading: () => <LoadingScreen /> },
);

/** In-match route. Requires a game-start payload; otherwise bounce to lobby/home. */
export default function GamePage() {
  const gameStart = useLobbyStore((s) => s.gameStart);
  const lobby = useLobbyStore((s) => s.lobby);
  const router = useRouter();
  useEffect(() => {
    if (!gameStart) router.replace(lobby ? '/lobby' : '/');
  }, [gameStart, lobby, router]);
  return gameStart ? <GameScreen /> : <LoadingScreen />;
}
