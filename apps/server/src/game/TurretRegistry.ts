/**
 * Authoritative turret-stats source. Mirrors WeaponRegistry: the server reads the
 * SAME `config.json` files the client's asset manifest validates — straight from
 * disk — so turret combat stats are server-authoritative. Re-scanned each match
 * start. Unknown/empty falls back to schema defaults via DEFAULT_TURRET.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { turretConfigSchema, type TurretConfig } from '@game/shared';
import { env } from '../env';
import { logger } from '../logger';

/** Schema defaults, used when no turret asset/config is present. */
export const DEFAULT_TURRET: TurretConfig = turretConfigSchema.parse({ name: 'Turret' });

export class TurretRegistry {
  private turrets = new Map<string, TurretConfig>();

  /** (Re)scan the turrets directory and return the id → config map. */
  scan(): Map<string, TurretConfig> {
    const dir = join(env.assetsDir, 'turrets');
    const map = new Map<string, TurretConfig>();
    if (!existsSync(dir)) {
      this.turrets = map;
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
        const parsed = turretConfigSchema.safeParse(JSON.parse(clean));
        if (parsed.success) map.set(id, parsed.data);
      } catch (err) {
        logger.warn(`turret config ${id} unreadable: ${(err as Error).message}`);
      }
    }
    this.turrets = map;
    logger.debug(`turret registry: ${map.size} turrets from ${dir}`);
    return map;
  }

  /** The first available turret config, or schema defaults. */
  default(): TurretConfig {
    return this.turrets.values().next().value ?? DEFAULT_TURRET;
  }

  get(id: string | null): TurretConfig | undefined {
    return id ? this.turrets.get(id) : undefined;
  }
}

export const turretRegistry = new TurretRegistry();
