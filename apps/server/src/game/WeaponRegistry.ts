/**
 * Authoritative weapon-stats source. The server reads the SAME `config.json`
 * files the client's asset manifest validates — straight from disk — so weapon
 * stats are server-authoritative (never client-trusted). Re-scanned at each
 * match start so newly added weapons are picked up without a restart. Unknown
 * weapons fall back to DEFAULT_WEAPON.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { weaponConfigSchema, type WeaponConfig } from '@game/shared';
import { env } from '../env';
import { logger } from '../logger';

export class WeaponRegistry {
  private weapons = new Map<string, WeaponConfig>();

  /** (Re)scan the weapons directory and return the id → config map. */
  scan(): Map<string, WeaponConfig> {
    const dir = join(env.assetsDir, 'weapons');
    const map = new Map<string, WeaponConfig>();
    if (!existsSync(dir)) {
      this.weapons = map;
      return map;
    }
    for (const id of readdirSync(dir)) {
      const folder = join(dir, id);
      if (!statSync(folder).isDirectory()) continue;
      const file = join(folder, 'config.json');
      if (!existsSync(file)) continue;
      try {
        const text = readFileSync(file, 'utf8');
        const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
        const parsed = weaponConfigSchema.safeParse(JSON.parse(clean));
        if (parsed.success) map.set(id, parsed.data);
      } catch (err) {
        logger.warn(`weapon config ${id} unreadable: ${(err as Error).message}`);
      }
    }
    this.weapons = map;
    logger.debug(`weapon registry: ${map.size} weapons from ${dir}`);
    return map;
  }

  get(id: string | null): WeaponConfig | undefined {
    return id ? this.weapons.get(id) : undefined;
  }
}

export const weaponRegistry = new WeaponRegistry();
