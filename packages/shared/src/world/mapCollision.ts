/**
 * Voxel-grid collision for GLB maps. A build step (`scripts/build-map-colliders`)
 * voxelises a map's triangles into a coarse solid grid; this module turns that
 * data into queryable collision used IDENTICALLY by the server (authority) and
 * the client (prediction) — preserving the deterministic sim while supporting
 * arbitrary mesh maps. Provides: cell→AABB extraction for movement, and a voxel
 * DDA raycast for shooting line-of-sight / projectile impacts.
 */
import type { AABB } from '../math/aabb';
import type { Vec3 } from '../math/vec3';
import type { SpawnPoint } from './worldgen';
import type { TeamId } from '../types/lobby';

/** A placed cover prop (e.g. a car) with a render transform. */
export interface PropInstance {
  model: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

/** Raw shape of a map's `colliders.json`. */
export interface MapColliderData {
  cellSize: number;
  origin: { x: number; y: number; z: number };
  dims: [number, number, number];
  groundY: number;
  bounds: { min: { x: number; z: number }; max: { x: number; z: number } };
  /** base64-encoded Uint8Array of length nx*ny*nz (1 = solid). */
  solid: string;
  spawns: Record<TeamId, SpawnPoint[]>;
  /** Extra static AABB colliders (prop cover boxes). */
  colliders?: AABB[];
  /** Renderable cover props placed on the map. */
  props?: PropInstance[];
}

export interface GridCollision {
  cellSize: number;
  origin: Vec3;
  dims: [number, number, number];
  solid: Uint8Array;
  groundY: number;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LUT = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** Environment-agnostic base64 → bytes (no atob/Buffer dependency). */
export function base64ToBytes(b64: string): Uint8Array {
  let len = b64.length;
  while (len > 0 && b64.charCodeAt(len - 1) === 61 /* '=' */) len--;
  const out = new Uint8Array((len * 3) >> 2);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_LUT[b64.charCodeAt(i)]!;
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

export function buildGridCollision(data: MapColliderData): GridCollision {
  return {
    cellSize: data.cellSize,
    origin: { ...data.origin },
    dims: data.dims,
    solid: base64ToBytes(data.solid),
    groundY: data.groundY,
  };
}

const isSolid = (grid: GridCollision, ix: number, iy: number, iz: number): boolean => {
  const [nx, ny, nz] = grid.dims;
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return false;
  return grid.solid[(iy * nz + iz) * nx + ix] === 1;
};

/** Append the AABBs of solid cells overlapping the player's swept box to `out`. */
export function gridCellAABBs(
  grid: GridCollision,
  feet: Vec3,
  height: number,
  radius: number,
  out: AABB[],
): void {
  const cs = grid.cellSize;
  const o = grid.origin;
  const margin = cs;
  const ix0 = Math.floor((feet.x - radius - margin - o.x) / cs);
  const ix1 = Math.floor((feet.x + radius + margin - o.x) / cs);
  const iy0 = Math.floor((feet.y - margin - o.y) / cs);
  const iy1 = Math.floor((feet.y + height + margin - o.y) / cs);
  const iz0 = Math.floor((feet.z - radius - margin - o.z) / cs);
  const iz1 = Math.floor((feet.z + radius + margin - o.z) / cs);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        if (!isSolid(grid, ix, iy, iz)) continue;
        const minx = o.x + ix * cs;
        const miny = o.y + iy * cs;
        const minz = o.z + iz * cs;
        out.push({
          min: { x: minx, y: miny, z: minz },
          max: { x: minx + cs, y: miny + cs, z: minz + cs },
        });
      }
    }
  }
}

/**
 * Voxel DDA raycast. Returns the distance to the first solid cell along `dir`
 * (normalized) within `maxDist`, or null. Used for shot line-of-sight and
 * projectile world impacts on GLB maps.
 */
export function raycastGrid(
  grid: GridCollision,
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
): number | null {
  const cs = grid.cellSize;
  const o = grid.origin;
  let ix = Math.floor((origin.x - o.x) / cs);
  let iy = Math.floor((origin.y - o.y) / cs);
  let iz = Math.floor((origin.z - o.z) / cs);

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;

  const inv = (d: number) => (Math.abs(d) < 1e-9 ? Infinity : 1 / d);
  const tDeltaX = Math.abs(cs * inv(dir.x));
  const tDeltaY = Math.abs(cs * inv(dir.y));
  const tDeltaZ = Math.abs(cs * inv(dir.z));

  const nextBound = (comp: number, originComp: number, i: number, step: number, d: number) => {
    const boundary = originComp + (i + (step > 0 ? 1 : 0)) * cs;
    return Math.abs(d) < 1e-9 ? Infinity : (boundary - comp) / d;
  };
  let tMaxX = nextBound(origin.x, o.x, ix, stepX, dir.x);
  let tMaxY = nextBound(origin.y, o.y, iy, stepY, dir.y);
  let tMaxZ = nextBound(origin.z, o.z, iz, stepZ, dir.z);

  let t = 0;
  for (let guard = 0; guard < 4096; guard++) {
    if (isSolid(grid, ix, iy, iz)) return t;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      ix += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      iy += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    } else {
      iz += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
    }
    if (t > maxDist) return null;
  }
  return null;
}
