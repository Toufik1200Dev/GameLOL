/** Axis-aligned bounding box helpers used by the deterministic collision system. */
import type { Vec3 } from './vec3';

export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** Build an AABB from a center and full-extent size. */
export const aabbFromCenterSize = (center: Vec3, size: Vec3): AABB => ({
  min: { x: center.x - size.x / 2, y: center.y - size.y / 2, z: center.z - size.z / 2 },
  max: { x: center.x + size.x / 2, y: center.y + size.y / 2, z: center.z + size.z / 2 },
});

export const aabbOverlaps = (a: AABB, b: AABB): boolean =>
  a.min.x < b.max.x &&
  a.max.x > b.min.x &&
  a.min.y < b.max.y &&
  a.max.y > b.min.y &&
  a.min.z < b.max.z &&
  a.max.z > b.min.z;

/** Expand an AABB outward by a uniform radius (Minkowski sum with a sphere ≈ box). */
export const expandAABB = (box: AABB, r: number): AABB => ({
  min: { x: box.min.x - r, y: box.min.y - r, z: box.min.z - r },
  max: { x: box.max.x + r, y: box.max.y + r, z: box.max.z + r },
});

/**
 * Ray vs AABB (slab method). `dir` need not be normalized; the returned value is
 * the distance along `dir` to the entry point (or the exit, if the origin is
 * inside). Returns null when there is no hit ahead of the origin.
 */
export const rayAABB = (origin: Vec3, dir: Vec3, box: AABB): number | null => {
  let tmin = -Infinity;
  let tmax = Infinity;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const lo = [box.min.x, box.min.y, box.min.z];
  const hi = [box.max.x, box.max.y, box.max.z];

  for (let i = 0; i < 3; i++) {
    const oi = o[i]!;
    const di = d[i]!;
    if (Math.abs(di) < 1e-8) {
      if (oi < lo[i]! || oi > hi[i]!) return null;
    } else {
      let t1 = (lo[i]! - oi) / di;
      let t2 = (hi[i]! - oi) / di;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
};
