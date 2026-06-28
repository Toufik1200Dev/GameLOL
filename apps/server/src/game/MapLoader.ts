/**
 * Loads a GLB map's voxel collider data (`colliders.json`) from disk for the
 * authoritative simulation, applying the map config's `scale` so collision matches
 * the client's scaled render. Returns null for procedural maps (or if the data is
 * missing), in which case the server falls back to the seeded procedural world.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapConfigSchema, scaleMapColliderData, type MapColliderData } from '@game/shared';
import { env } from '../env';
import { logger } from '../logger';

const readJson = (file: string): unknown | null => {
  if (!existsSync(file)) return null;
  try {
    const text = readFileSync(file, 'utf8');
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    return JSON.parse(clean);
  } catch (err) {
    logger.warn(`map file ${file} unreadable: ${(err as Error).message}`);
    return null;
  }
};

/** The map config's `scale` (defaults to 1 if the config is absent/invalid). */
function mapScale(mapId: string): number {
  const parsed = mapConfigSchema.safeParse(readJson(join(env.assetsDir, 'maps', mapId, 'config.json')));
  return parsed.success ? parsed.data.scale : 1;
}

export function loadMapColliders(mapId: string): MapColliderData | null {
  const data = readJson(join(env.assetsDir, 'maps', mapId, 'colliders.json')) as
    | MapColliderData
    | null;
  if (!data) return null;
  return scaleMapColliderData(data, mapScale(mapId));
}
