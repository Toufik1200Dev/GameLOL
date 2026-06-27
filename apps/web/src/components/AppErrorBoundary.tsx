'use client';

/**
 * App-wide safety net: turns any uncaught client exception into a readable
 * on-screen message (with reload) instead of a blank white page, so failures are
 * diagnosable.
 */
import { Component, type ReactNode } from 'react';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    console.error('[app] uncaught error:', error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="menu-grid-bg flex h-full w-full items-center justify-center p-6">
        <div className="bg-panel/90 border-border max-w-lg overflow-hidden rounded-2xl border p-6">
          <h2 className="font-display text-xl font-bold text-red-400">Something went wrong</h2>
          <p className="mt-2 break-words text-sm text-white/70">{error.message}</p>
          <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] text-white/40">
            {error.stack?.split('\n').slice(0, 8).join('\n')}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="bg-accent font-display mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold text-[#04111d]"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
