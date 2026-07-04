'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLobbyStore } from '@/stores/lobbyStore';
import { LoadingScreen } from '@/components/screens/LoadingScreen';

const WeaponSelectScreen = dynamic(
  () => import('@/components/screens/WeaponSelectScreen').then((m) => m.WeaponSelectScreen),
  { ssr: false, loading: () => <LoadingScreen /> },
);

export default function WeaponPage() {
  const lobby = useLobbyStore((s) => s.lobby);
  const router = useRouter();
  useEffect(() => {
    if (!lobby) router.replace('/');
  }, [lobby, router]);
  return lobby ? <WeaponSelectScreen /> : <LoadingScreen />;
}
