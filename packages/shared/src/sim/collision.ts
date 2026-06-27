/**
 * Deterministic capsule(≈AABB)-vs-static-AABB collision resolution. Approximating
 * the player as a vertical box keeps the maths simple, branch-free and identical
 * on every machine — exactly what client prediction + server reconciliation need.
 * Good enough for the blocky, cover-based arena (crates, walls, towers, bridges).
 */
import type { AABB } from '../math/aabb';
import type { MoveState } from './types';

/**
 * Push the player's MoveState out of any overlapping colliders and snap to the
 * ground plane, sliding along surfaces. Mutates `state.position`/`state.velocity`
 * and returns whether the player ended the step grounded.
 */
export function collideAndSlide(
  state: MoveState,
  height: number,
  radius: number,
  colliders: readonly AABB[],
  groundY: number,
): boolean {
  let onGround = false;
  const pos = state.position;
  const vel = state.velocity;

  for (let iter = 0; iter < 6; iter++) {
    let resolved = false;
    let pMinX = pos.x - radius;
    let pMaxX = pos.x + radius;
    let pMinY = pos.y;
    let pMaxY = pos.y + height;
    let pMinZ = pos.z - radius;
    let pMaxZ = pos.z + radius;

    for (const box of colliders) {
      if (
        pMinX >= box.max.x ||
        pMaxX <= box.min.x ||
        pMinY >= box.max.y ||
        pMaxY <= box.min.y ||
        pMinZ >= box.max.z ||
        pMaxZ <= box.min.z
      ) {
        continue;
      }

      const ox = Math.min(pMaxX, box.max.x) - Math.max(pMinX, box.min.x);
      const oy = Math.min(pMaxY, box.max.y) - Math.max(pMinY, box.min.y);
      const oz = Math.min(pMaxZ, box.max.z) - Math.max(pMinZ, box.min.z);

      const playerCenterY = pos.y + height / 2;
      const boxCenterX = (box.min.x + box.max.x) / 2;
      const boxCenterY = (box.min.y + box.max.y) / 2;
      const boxCenterZ = (box.min.z + box.max.z) / 2;

      if (ox <= oy && ox <= oz) {
        pos.x += pos.x < boxCenterX ? -ox : ox;
        vel.x = 0;
      } else if (oy <= ox && oy <= oz) {
        if (playerCenterY < boxCenterY) {
          // Hitting the underside (head bonk).
          pos.y -= oy;
          if (vel.y > 0) vel.y = 0;
        } else {
          // Landing on top.
          pos.y += oy;
          if (vel.y < 0) vel.y = 0;
          onGround = true;
        }
      } else {
        pos.z += pos.z < boxCenterZ ? -oz : oz;
        vel.z = 0;
      }

      resolved = true;
      pMinX = pos.x - radius;
      pMaxX = pos.x + radius;
      pMinY = pos.y;
      pMaxY = pos.y + height;
      pMinZ = pos.z - radius;
      pMaxZ = pos.z + radius;
    }

    if (!resolved) break;
  }

  if (pos.y <= groundY) {
    pos.y = groundY;
    if (vel.y < 0) vel.y = 0;
    onGround = true;
  }

  return onGround;
}
