'use client';

import { Panel, Button } from '../ui/primitives';

/**
 * Locked/empty state shown when no asset folders of a given kind exist yet.
 * Tells the user exactly where to drop files; auto-discovery surfaces them on
 * refresh with no code changes.
 */
const KIND_ICON: Record<'character' | 'weapon' | 'map', string> = {
  character: '🧍',
  weapon: '🔫',
  map: '🗺️',
};
const KIND_GLB: Record<'character' | 'weapon' | 'map', string> = {
  character: 'model.glb',
  weapon: 'weapon.glb',
  map: 'map.glb',
};

export function EmptyAssetState({
  kind,
  path,
  loading,
  onRefresh,
}: {
  kind: 'character' | 'weapon' | 'map';
  path: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Panel className="flex flex-col items-center gap-4 p-12 text-center">
      <div className="bg-bg-elevated flex h-16 w-16 items-center justify-center rounded-2xl text-3xl text-white/30">
        {KIND_ICON[kind]}
      </div>
      <div>
        <h2 className="font-display text-xl font-semibold">No {kind}s yet</h2>
        <p className="mt-1 max-w-md text-sm text-white/50">
          Drop a {kind} folder into{' '}
          <code className="bg-bg-elevated text-accent rounded px-1.5 py-0.5 text-xs">{path}</code>{' '}
          (with a {KIND_GLB[kind]}, icon.png and config.json), then refresh — it appears
          automatically.
        </p>
      </div>
      <Button variant="secondary" onClick={onRefresh} disabled={loading}>
        {loading ? 'Scanning…' : 'Refresh'}
      </Button>
    </Panel>
  );
}
