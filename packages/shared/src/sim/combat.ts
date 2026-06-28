/**
 * Combat constants + the player hit-box helper. Until real weapon assets exist
 * (and their configs are made available server-side), the authoritative server
 * resolves every shot with this default weapon. When weapon configs are wired to
 * the server, swap these per-player.
 */
import { aabbFromCenterSize, rayAABB, type AABB } from '../math/aabb';
import type { Vec3 } from '../math/vec3';
import { HEAD_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from './constants';

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

/** The full collision/hit box for a player standing at `feet`. */
export const playerHitBox = (feet: Vec3): AABB =>
  aabbFromCenterSize(
    { x: feet.x, y: feet.y + PLAYER_HEIGHT / 2, z: feet.z },
    { x: PLAYER_RADIUS * 2, y: PLAYER_HEIGHT, z: PLAYER_RADIUS * 2 },
  );

/** Torso/legs hit box (everything below the head slice). */
export const playerBodyBox = (feet: Vec3): AABB =>
  aabbFromCenterSize(
    { x: feet.x, y: feet.y + (PLAYER_HEIGHT - HEAD_HEIGHT) / 2, z: feet.z },
    { x: PLAYER_RADIUS * 2, y: PLAYER_HEIGHT - HEAD_HEIGHT, z: PLAYER_RADIUS * 2 },
  );

/** Head hit box (top slice, slightly narrower) — qualifies for the headshot bonus. */
export const playerHeadBox = (feet: Vec3): AABB =>
  aabbFromCenterSize(
    { x: feet.x, y: feet.y + PLAYER_HEIGHT - HEAD_HEIGHT / 2, z: feet.z },
    { x: PLAYER_RADIUS * 1.4, y: HEAD_HEIGHT, z: PLAYER_RADIUS * 1.4 },
  );

/** Result of a ray vs a player: distance along the ray + whether it hit the head. */
export interface PlayerRayHit {
  t: number;
  headshot: boolean;
}

/**
 * Ray vs a player's head+body boxes. Returns the nearest hit (with headshot flag)
 * within `maxT`, or null. The head box is preferred only when it is the closer
 * surface, so grazing a shoulder still counts as a body hit.
 */
export const raycastPlayer = (
  origin: Vec3,
  dir: Vec3,
  feet: Vec3,
  maxT: number,
): PlayerRayHit | null => {
  const tHead = rayAABB(origin, dir, playerHeadBox(feet));
  const tBody = rayAABB(origin, dir, playerBodyBox(feet));
  let t: number | null = null;
  let headshot = false;
  if (tHead !== null && tHead >= 0) {
    t = tHead;
    headshot = true;
  }
  if (tBody !== null && tBody >= 0 && (t === null || tBody < t)) {
    t = tBody;
    headshot = false;
  }
  if (t === null || t > maxT) return null;
  return { t, headshot };
};
