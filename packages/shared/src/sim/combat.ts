/**
 * Combat constants + the player hit-box helper. Until real weapon assets exist
 * (and their configs are made available server-side), the authoritative server
 * resolves every shot with this default weapon. When weapon configs are wired to
 * the server, swap these per-player.
 */
import { aabbFromCenterSize, type AABB } from '../math/aabb';
import type { Vec3 } from '../math/vec3';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './constants';

export interface WeaponStats {
  damage: number; // hearts per hit
  fireRateRpm: number; // rounds per minute
  range: number; // metres
}

export const DEFAULT_WEAPON: WeaponStats = {
  damage: 1,
  fireRateRpm: 360,
  range: 90,
};

/** Minimum seconds between shots for a weapon. */
export const fireInterval = (stats: WeaponStats): number => 60 / stats.fireRateRpm;

/** The collision/hit box for a player standing at `feet`. */
export const playerHitBox = (feet: Vec3): AABB =>
  aabbFromCenterSize(
    { x: feet.x, y: feet.y + PLAYER_HEIGHT / 2, z: feet.z },
    { x: PLAYER_RADIUS * 2, y: PLAYER_HEIGHT, z: PLAYER_RADIUS * 2 },
  );
