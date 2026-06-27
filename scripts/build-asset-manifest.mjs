// @ts-check
/**
 * Asset manifest builder.
 *
 * Scans `apps/web/public/assets/{characters,weapons,maps}` for content folders,
 * reads each `config.json`, performs lightweight shape validation, and writes a
 * single `manifest.json` the client consumes. This is what makes the game
 * data-driven: dropping a new asset folder in and rebuilding (or refreshing in
 * dev, where the route handler re-scans live) surfaces it with zero code changes.
 *
 * Phase 0: directory scanning + basic validation. Phase 2 layers richer Zod
 * validation (shared with the client) and stat normalization on top.
 */
import { mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '../apps/web/public/assets');

// `icon.png` is optional (the UI shows a placeholder without it).
const CATEGORIES = /** @type {const} */ ([
  { key: 'characters', requiredFiles: ['model.glb', 'config.json'] },
  { key: 'weapons', requiredFiles: ['weapon.glb', 'config.json'] },
  { key: 'maps', requiredFiles: ['config.json'] },
]);

/** Ensure the asset directory tree exists so scanning never throws. */
function ensureDirs() {
  for (const { key } of CATEGORIES) {
    const dir = join(ASSETS_DIR, key);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/** @param {string} dir */
function listSubdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() && !name.startsWith('.');
  });
}

/** @param {string} categoryKey @param {string[]} requiredFiles */
function scanCategory(categoryKey, requiredFiles) {
  const dir = join(ASSETS_DIR, categoryKey);
  const entries = [];
  for (const id of listSubdirs(dir)) {
    const folder = join(dir, id);
    const missing = requiredFiles.filter((f) => !existsSync(join(folder, f)));
    if (missing.length > 0) {
      console.warn(`[assets] skip ${categoryKey}/${id}: missing ${missing.join(', ')}`);
      continue;
    }

    let config;
    try {
      const text = readFileSync(join(folder, 'config.json'), 'utf8');
      const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      config = JSON.parse(clean);
    } catch (err) {
      console.warn(`[assets] skip ${categoryKey}/${id}: invalid config.json (${err.message})`);
      continue;
    }

    const basePath = `/assets/${categoryKey}/${id}`;
    const entry = { id, path: basePath, config };
    // Convenience absolute paths for the common files, when present.
    if (existsSync(join(folder, 'icon.png'))) entry.icon = `${basePath}/icon.png`;
    if (categoryKey === 'characters') {
      entry.model = `${basePath}/model.glb`;
      if (existsSync(join(folder, 'animations.glb')))
        entry.animations = `${basePath}/animations.glb`;
    }
    if (categoryKey === 'weapons') entry.model = `${basePath}/weapon.glb`;
    if (categoryKey === 'maps' && existsSync(join(folder, 'preview.png'))) {
      entry.preview = `${basePath}/preview.png`;
    }
    entries.push(entry);
  }
  return entries;
}

function build() {
  ensureDirs();
  const manifest = {
    generatedAt: new Date().toISOString(),
    characters: scanCategory('characters', ['model.glb', 'config.json']),
    weapons: scanCategory('weapons', ['weapon.glb', 'config.json']),
    maps: scanCategory('maps', ['config.json']),
  };

  const outPath = join(ASSETS_DIR, 'manifest.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(
    `[assets] manifest written: ${manifest.characters.length} characters, ` +
      `${manifest.weapons.length} weapons, ${manifest.maps.length} maps`,
  );
}

build();
