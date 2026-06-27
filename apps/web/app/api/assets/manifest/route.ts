/**
 * Live asset manifest endpoint. Scans `public/assets/{characters,weapons,maps}`
 * on every request (dev → new folders appear on refresh with no restart),
 * validating each `config.json` against the shared Zod schemas. Invalid or
 * incomplete folders are skipped with a server-side warning.
 *
 * Runs on the Node.js runtime (needs `fs`). In production the same scan works
 * against the bundled `public/` directory.
 */
import { NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  EMPTY_MANIFEST,
  characterConfigSchema,
  mapConfigSchema,
  weaponConfigSchema,
  type AssetManifest,
  type CharacterManifestEntry,
  type MapManifestEntry,
  type WeaponManifestEntry,
} from '@game/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ASSETS_DIR = join(process.cwd(), 'public', 'assets');

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

export function GET() {
  try {
    const manifest: AssetManifest = {
      generatedAt: new Date().toISOString(),
      characters: scanCharacters(),
      weapons: scanWeapons(),
      maps: scanMaps(),
    };
    return NextResponse.json(manifest, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[assets] manifest scan failed:', err);
    return NextResponse.json(EMPTY_MANIFEST, { status: 200 });
  }
}
