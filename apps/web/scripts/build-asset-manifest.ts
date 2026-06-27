/**
 * Static asset manifest builder (build-time).
 *
 * Scans `apps/web/public/assets/{characters,weapons,maps}`, validates each
 * `config.json` with the SAME shared Zod schemas the app uses (so defaults are
 * applied), and writes `public/assets/manifest.json`. The client fetches that
 * static file, which lets the whole frontend deploy as static files (Firebase
 * Hosting, any CDN) with no server-side route.
 *
 * Run via tsx (see apps/web `prebuild`/`predev`):
 *   tsx scripts/build-asset-manifest.ts
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  characterConfigSchema,
  mapConfigSchema,
  weaponConfigSchema,
  type AssetManifest,
  type CharacterManifestEntry,
  type MapManifestEntry,
  type WeaponManifestEntry,
} from '@game/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '../public/assets');

const listSubdirs = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (name) => !name.startsWith('.') && statSync(join(dir, name)).isDirectory(),
  );
};

const readConfig = (folder: string): unknown | null => {
  const file = join(folder, 'config.json');
  if (!existsSync(file)) return null;
  try {
    const text = readFileSync(file, 'utf8');
    // Strip a leading UTF-8 BOM (common in Windows-authored files) before parsing.
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    return JSON.parse(clean);
  } catch (err) {
    console.warn(`[assets] invalid JSON in ${file}:`, (err as Error).message);
    return null;
  }
};

const has = (folder: string, file: string): boolean => existsSync(join(folder, file));

function scanCharacters(): CharacterManifestEntry[] {
  const dir = join(ASSETS_DIR, 'characters');
  const out: CharacterManifestEntry[] = [];
  for (const id of listSubdirs(dir)) {
    const folder = join(dir, id);
    if (!has(folder, 'model.glb')) continue;
    const parsed = characterConfigSchema.safeParse(readConfig(folder));
    if (!parsed.success) {
      console.warn(`[assets] characters/${id} invalid config:`, parsed.error?.message);
      continue;
    }
    const base = `/assets/characters/${id}`;
    out.push({
      id,
      path: base,
      icon: has(folder, 'icon.png') ? `${base}/icon.png` : null,
      model: `${base}/model.glb`,
      animations: has(folder, 'animations.glb') ? `${base}/animations.glb` : null,
      config: parsed.data,
    });
  }
  return out;
}

function scanWeapons(): WeaponManifestEntry[] {
  const dir = join(ASSETS_DIR, 'weapons');
  const out: WeaponManifestEntry[] = [];
  for (const id of listSubdirs(dir)) {
    const folder = join(dir, id);
    if (!has(folder, 'weapon.glb')) continue;
    const parsed = weaponConfigSchema.safeParse(readConfig(folder));
    if (!parsed.success) {
      console.warn(`[assets] weapons/${id} invalid config:`, parsed.error?.message);
      continue;
    }
    const base = `/assets/weapons/${id}`;
    out.push({
      id,
      path: base,
      icon: has(folder, 'icon.png') ? `${base}/icon.png` : null,
      model: `${base}/weapon.glb`,
      config: parsed.data,
    });
  }
  return out;
}

function scanMaps(): MapManifestEntry[] {
  const dir = join(ASSETS_DIR, 'maps');
  const out: MapManifestEntry[] = [];
  for (const id of listSubdirs(dir)) {
    const folder = join(dir, id);
    const parsed = mapConfigSchema.safeParse(readConfig(folder));
    if (!parsed.success) {
      console.warn(`[assets] maps/${id} invalid config:`, parsed.error?.message);
      continue;
    }
    const base = `/assets/maps/${id}`;
    out.push({
      id,
      path: base,
      preview: has(folder, 'preview.png') ? `${base}/preview.png` : null,
      model: has(folder, 'map.glb') ? `${base}/map.glb` : null,
      colliders: has(folder, 'colliders.json') ? `${base}/colliders.json` : null,
      config: parsed.data,
    });
  }
  return out;
}

const manifest: AssetManifest = {
  generatedAt: new Date().toISOString(),
  characters: scanCharacters(),
  weapons: scanWeapons(),
  maps: scanMaps(),
};

const outPath = join(ASSETS_DIR, 'manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(
  `[assets] manifest.json written: ${manifest.characters.length} characters, ` +
    `${manifest.weapons.length} weapons, ${manifest.maps.length} maps`,
);
