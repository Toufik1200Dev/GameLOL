'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLobbyStore } from '@/stores/lobbyStore';
import { LobbyScreen } from '@/components/screens/LobbyScreen';
import { LoadingScreen } from '@/components/screens/LoadingScreen';

/** Lobby route. Requires an active lobby; a refresh/deep-link with none bounces home. */
export default function LobbyPage() {
  const lobby = useLobbyStore((s) => s.lobby);
  const router = useRouter();
  useEffect(() => {
    if (!lobby) router.replace('/');
  }, [lobby, router]);
  return lobby ? <LobbyScreen /> : <LoadingScreen />;
}
