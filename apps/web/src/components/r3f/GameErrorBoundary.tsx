'use client';

/**
 * Catches WebGL / render crashes (e.g. a lost GPU context taking down the
 * post-processing composer) so they never white-screen the whole app. On a
 * crash it auto-drops the graphics quality to "low" (disables shadows + post FX,
 * lowers resolution) and offers a reload, which then runs light enough to play.
 */
import { Component, type ReactNode } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface Props {
  children: ReactNode;
  onLeave?: () => void;
}

export class GameErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('[game] canvas crashed:', error);
    // Auto-downgrade so the next load is light enough to run.
    useSettingsStore.getState().set('graphicsQuality', 'low');
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="menu-grid-bg absolute inset-0 flex items-center justify-center p-6">
        <div className="bg-panel/90 border-border max-w-md rounded-2xl border p-8 text-center">
          <h2 className="font-display text-2xl font-bold">Graphics hiccup</h2>
          <p className="mt-2 text-sm text-white/60">
            The GPU dropped the 3D context (often a heavy map on integrated graphics). Quality has
            been set to <span className="text-accent">Low</span> — reload to continue.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="bg-accent font-display rounded-lg px-5 py-2.5 text-sm font-semibold text-[#04111d]"
            >
              Reload
            </button>
            {this.props.onLeave && (
              <button
                onClick={this.props.onLeave}
                className="border-border rounded-lg border px-5 py-2.5 text-sm text-white/80"
              >
                Leave Match
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
