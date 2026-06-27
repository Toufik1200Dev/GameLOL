/**
 * Seeded procedural arena generator. Given a seed string it deterministically
 * produces the SAME world on the server (collision AABBs + spawns) and on every
 * client (visual props), which is what lets authoritative movement and client
 * prediction agree on geometry. Designed for cover-based combat: two team bases
 * with watchtowers, a scattered crate/barrel/wall cover field, mid-map buildings,
 * a water channel with a bridge, and decorative trees/rocks/mountains.
 */
import { aabbFromCenterSize, type AABB } from '../math/aabb';
import type { Vec3 } from '../math/vec3';
import { SeededRandom } from '../rng/seeded';
import type { TeamId } from '../types/lobby';

export type PropType =
  | 'crate'
  | 'barrel'
  | 'wall'
  | 'tower'
  | 'building'
  | 'bridge'
  | 'tree'
  | 'rock'
  | 'mountain'
  | 'platform';

export interface WorldProp {
  id: number;
  type: PropType;
  /** Center for boxes; base-center for cylinders/cones. */
  position: Vec3;
  /** Full extents (bounding box). */
  size: Vec3;
  rotationY: number;
  color: string;
}

export interface SpawnPoint {
  position: Vec3;
  yaw: number;
}

export interface GeneratedWorld {
  seed: string;
  size: number; // half-extent of the play area
  groundY: number;
  bounds: number;
  fogColor: string;
  skyColor: string;
  groundColor: string;
  waterColor: string;
  water: { z: number; width: number } | null;
  props: WorldProp[];
  colliders: AABB[];
  spawns: Record<TeamId, SpawnPoint[]>;
}

export interface WorldGenOptions {
  size?: number;
  fogColor?: string;
  skyColor?: string;
  propDensity?: number;
}

const CRATE_COLORS = ['#c98a3b', '#b9742f', '#d8a14a'];
const BARREL_COLORS = ['#d94f4f', '#4f78d9', '#54b06a'];
const WALL_COLORS = ['#8a93a6', '#7d869b', '#9aa3b5'];
const TREE_COLORS = ['#2f9e54', '#34b061', '#268a47'];
const ROCK_COLORS = ['#7d8694', '#6c7480', '#8b94a1'];

/**
 * Build the world. The same `seed` always yields the same layout.
 */
export function generateWorld(seed: string, options: WorldGenOptions = {}): GeneratedWorld {
  const rng = new SeededRandom(`world:${seed}`);
  const size = options.size ?? 60;
  const bounds = size - 2;
  const groundY = 0;
  const density = options.propDensity ?? 0.6;

  const props: WorldProp[] = [];
  const colliders: AABB[] = [];
  let nextId = 1;

  const addBox = (
    type: PropType,
    position: Vec3,
    sizeVec: Vec3,
    color: string,
    collide = true,
    rotationY = 0,
  ): void => {
    props.push({ id: nextId++, type, position, size: sizeVec, rotationY, color });
    if (collide) colliders.push(aabbFromCenterSize(position, sizeVec));
  };

  // --- Team bases (north = blue +Z, south = red -Z) ---
  const baseZ = size - 12;
  const buildBase = (team: TeamId, sign: number): SpawnPoint[] => {
    const z = sign * baseZ;
    const color = team === 'red' ? '#7a2230' : '#23407a';
    // Raised platform building.
    addBox('building', { x: 0, y: 1.5, z }, { x: 18, y: 3, z: 10 }, color);
    // Watchtower beside the base.
    const towerX = sign * 8;
    addBox('tower', { x: towerX, y: 4, z: z + sign * 2 }, { x: 3, y: 8, z: 3 }, color);
    addBox('platform', { x: towerX, y: 8, z: z + sign * 2 }, { x: 5, y: 0.4, z: 5 }, color);
    // Spawn points fanned out in front of the base.
    const spawns: SpawnPoint[] = [];
    const yaw = sign > 0 ? Math.PI : 0; // face toward centre
    for (let i = 0; i < 4; i++) {
      spawns.push({
        position: { x: -6 + i * 4, y: groundY, z: z - sign * 6 },
        yaw,
      });
    }
    return spawns;
  };

  const spawns: Record<TeamId, SpawnPoint[]> = {
    blue: buildBase('blue', 1),
    red: buildBase('red', -1),
  };

  // --- Central water channel + bridge ---
  const waterWidth = 8;
  const water = { z: 0, width: waterWidth };
  // Bridge planks crossing the channel at x≈0.
  for (let i = -1; i <= 1; i++) {
    addBox('bridge', { x: i * 4.2, y: 0.4, z: 0 }, { x: 4, y: 0.8, z: waterWidth + 2 }, '#9c7b4f');
  }

  // --- Cover field: crates, barrels, walls scattered across the arena ---
  const coverCount = Math.round(26 * density);
  for (let i = 0; i < coverCount; i++) {
    const x = rng.range(-bounds + 4, bounds - 4);
    const z = rng.range(-baseZ + 6, baseZ - 6);
    // Keep the bridge lane clearer.
    if (Math.abs(z) < waterWidth / 2 + 1 && Math.abs(x) < 6) continue;
    const roll = rng.float();
    if (roll < 0.5) {
      const s = rng.range(1.2, 1.8);
      const stack = rng.chance(0.3) ? 2 : 1;
      for (let k = 0; k < stack; k++) {
        addBox(
          'crate',
          { x, y: s / 2 + k * s, z },
          { x: s, y: s, z: s },
          rng.pick(CRATE_COLORS),
          true,
          rng.range(0, Math.PI),
        );
      }
    } else if (roll < 0.78) {
      const r = rng.range(0.5, 0.7);
      const h = rng.range(1.1, 1.5);
      addBox('barrel', { x, y: h / 2, z }, { x: r * 2, y: h, z: r * 2 }, rng.pick(BARREL_COLORS));
    } else {
      const w = rng.range(3, 6);
      const h = rng.range(1.6, 2.6);
      addBox(
        'wall',
        { x, y: h / 2, z },
        { x: w, y: h, z: 0.6 },
        rng.pick(WALL_COLORS),
        true,
        rng.chance(0.5) ? Math.PI / 2 : 0,
      );
    }
  }

  // --- A couple of mid-map buildings for vertical play ---
  for (let i = 0; i < 2; i++) {
    const x = (i === 0 ? -1 : 1) * rng.range(14, 22);
    const z = rng.range(-10, 10);
    addBox('building', { x, y: 2, z }, { x: 8, y: 4, z: 8 }, '#5a6378');
    addBox('platform', { x, y: 4.2, z }, { x: 9, y: 0.4, z: 9 }, '#6b748a');
  }

  // --- Decorative trees + rocks (collidable, AABB-approx) ---
  const treeCount = Math.round(16 * density);
  for (let i = 0; i < treeCount; i++) {
    const x = rng.range(-bounds, bounds);
    const z = rng.range(-bounds, bounds);
    if (Math.abs(z) < baseZ - 4 && Math.abs(x) < bounds - 6 && rng.chance(0.7)) {
      // Mostly push trees toward the edges to keep the centre playable.
      continue;
    }
    const h = rng.range(4, 7);
    addBox('tree', { x, y: h / 2, z }, { x: 1.1, y: h, z: 1.1 }, rng.pick(TREE_COLORS));
  }

  const rockCount = Math.round(12 * density);
  for (let i = 0; i < rockCount; i++) {
    const x = rng.range(-bounds, bounds);
    const z = rng.range(-bounds, bounds);
    const s = rng.range(0.8, 1.8);
    addBox('rock', { x, y: s / 2, z }, { x: s, y: s, z: s }, rng.pick(ROCK_COLORS), true, rng.range(0, Math.PI));
  }

  // --- Perimeter mountains (visual only) ---
  const mountainCount = 14;
  for (let i = 0; i < mountainCount; i++) {
    const angle = (i / mountainCount) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const radius = size + rng.range(6, 16);
    const h = rng.range(18, 34);
    const w = rng.range(14, 24);
    addBox(
      'mountain',
      { x: Math.cos(angle) * radius, y: h / 2 - 2, z: Math.sin(angle) * radius, },
      { x: w, y: h, z: w },
      '#6f7d8c',
      false,
    );
  }

  return {
    seed,
    size,
    groundY,
    bounds,
    fogColor: options.fogColor ?? '#a7d8ff',
    skyColor: options.skyColor ?? '#6cb8ff',
    groundColor: '#5fae54',
    waterColor: '#3f8fd0',
    water,
    props,
    colliders,
    spawns,
  };
}
