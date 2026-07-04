'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingScreen } from '@/components/screens/LoadingScreen';

/** Unknown path → send the player back to the main menu. */
export default function NotFound() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return <LoadingScreen />;
}
