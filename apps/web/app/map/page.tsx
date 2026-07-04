'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLobbyStore } from '@/stores/lobbyStore';
import { LoadingScreen } from '@/components/screens/LoadingScreen';

const MapSelectScreen = dynamic(
  () => import('@/components/screens/MapSelectScreen').then((m) => m.MapSelectScreen),
  { ssr: false, loading: () => <LoadingScreen /> },
);

export default function MapPage() {
  const lobby = useLobbyStore((s) => s.lobby);
  const router = useRouter();
  useEffect(() => {
    if (!lobby) router.replace('/');
  }, [lobby, router]);
  return lobby ? <MapSelectScreen /> : <LoadingScreen />;
}
