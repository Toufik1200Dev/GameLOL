'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLobbyStore } from '@/stores/lobbyStore';
import { LoadingScreen } from '@/components/screens/LoadingScreen';

const CharacterSelectScreen = dynamic(
  () => import('@/components/screens/CharacterSelectScreen').then((m) => m.CharacterSelectScreen),
  { ssr: false, loading: () => <LoadingScreen /> },
);

export default function CharacterPage() {
  const lobby = useLobbyStore((s) => s.lobby);
  const router = useRouter();
  useEffect(() => {
    if (!lobby) router.replace('/');
  }, [lobby, router]);
  return lobby ? <CharacterSelectScreen /> : <LoadingScreen />;
}
