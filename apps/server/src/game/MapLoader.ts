/**
 * Loads a GLB map's voxel collider data (`colliders.json`) from disk for the
 * authoritative simulation. Returns null for procedural maps (or if the data is
 * missing), in which case the server falls back to the seeded procedural world.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MapColliderData } from '@game/shared';
import { env } from '../env';
import { logger } from '../logger';

export function loadMapColliders(mapId: string): MapColliderData | null {
  const file = join(env.assetsDir, 'maps', mapId, 'colliders.json');
  if (!existsSync(file)) return null;
  try {
    const text = readFileSync(file, 'utf8');
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    return JSON.parse(clean) as MapColliderData;
  } catch (err) {
    logger.warn(`map colliders for ${mapId} unreadable: ${(err as Error).message}`);
    return null;
  }
}
