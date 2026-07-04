'use client';

/**
 * Persistent client shell mounted once in the root layout (survives client-side
 * route changes). Opens the socket connection, registers the Next router so
 * stores/socket handlers can navigate imperatively, and renders the toast layer.
 * Gates children until mounted so persisted/socket state can't cause a hydration
 * mismatch (each route re-uses this same instance, so it only gates the first load).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { setNavigator } from '../lib/navigation';
import { Toasts } from './ui/Toasts';
import { AppErrorBoundary } from './AppErrorBoundary';
import { LoadingScreen } from './screens/LoadingScreen';

export function ClientRoot({ children }: { children: ReactNode }) {
  const router = useRouter();
  useSocketConnection();

  useEffect(() => {
    setNavigator((path) => router.push(path));
  }, [router]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AppErrorBoundary>{mounted ? children : <LoadingScreen />}</AppErrorBoundary>
      <Toasts />
    </div>
  );
}
