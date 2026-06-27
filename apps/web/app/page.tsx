import { AppShell } from '@/components/AppShell';

/**
 * Single entry route. All in-app navigation (menu → lobby → game) is handled by
 * the client-side screen state machine inside <AppShell/> so the live socket
 * connection persists across transitions.
 */
export default function HomePage() {
  return <AppShell />;
}
