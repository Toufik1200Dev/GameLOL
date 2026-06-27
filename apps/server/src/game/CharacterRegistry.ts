/**
 * Lists available character ids from disk (folders with a model.glb). Used to
 * assign a default character to players who start a match without picking one,
 * so an avatar always renders.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../env';

export function listCharacterIds(): string[] {
  const dir = join(env.assetsDir, 'characters');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((id) => {
    const folder = join(dir, id);
    return statSync(folder).isDirectory() && existsSync(join(folder, 'model.glb'));
  });
}
