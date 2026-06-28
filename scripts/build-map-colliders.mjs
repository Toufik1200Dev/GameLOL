// @ts-check
/**
 * GLB map processor. For each `maps/<id>/map.glb` it:
 *   1. Converts deprecated spec/gloss materials → metal/rough (so modern three
 *      can render it), then prunes/dedups and compresses textures (WebP, resized)
 *      to slash the download size. The cleaned GLB overwrites map.glb.
 *   2. Voxelises the world-space triangles into a coarse solid grid used as
 *      authoritative collision by BOTH the server and client prediction (keeps
 *      the deterministic sim intact). Writes `colliders.json` with the grid,
 *      bounds, ground height and team spawn points.
 *
 * Run: `node scripts/build-map-colliders.mjs`
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import {
  dedup,
  draco,
  getBounds,
  metalRough,
  prune,
  textureCompress,
  weld,
} from '@gltf-transform/functions';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '../apps/web/public/assets');
const MAPS_DIR = join(ASSETS_DIR, 'maps');
const PROPS_DIR = join(ASSETS_DIR, 'props');

const CELL_SIZE = 1.0; // metres per voxel
const MAX_TRI_SAMPLES = 64; // per-triangle surface sampling cap
const SPAWN_HEADROOM = 4; // empty cells required above a spawn floor
const PLAY_HEIGHT_CAP = 36; // metres of collision above the floor (the STORED grid)
const SPAWN_ANALYSIS_CAP = 200; // metres analysed (build-time only) to find open sky
const OPEN_SKY_GAP = 8; // a spawn column must have NO geometry above floor+this
const MAP_TARGET_SIZE = 250; // scale oversized maps so their footprint ≈ this
const MAP_SCALE_THRESHOLD = 400; // only rescale maps bigger than this
const PROP_TARGET_SIZE = 4.6; // scale a prop so its footprint ≈ this (≈ a car)

const readJson = (file) => {
  const text = readFileSync(file, 'utf8');
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
};

// ---- tiny mat4 (column-major) ----
const composeTRS = (t, q, s) => {
  const [x, y, z, w] = q;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    t[0],
    t[1],
    t[2],
    1,
  ];
};
const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
};
const transform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function processMap(id, folder, props = {}) {
  const glbPath = join(folder, 'map.glb');
  const io = await makeIO();
  console.log(`[map] ${id}: reading map.glb`);
  const doc = await io.read(glbPath);

  // Per-map config (read once). `cellSize` lets a map opt into finer collision
  // voxels (default 1.0); `turretsPerTeam` controls how many turrets we place.
  const cfg = existsSync(join(folder, 'config.json')) ? readJson(join(folder, 'config.json')) : {};
  const cell = Number.isFinite(cfg.cellSize) && cfg.cellSize > 0 ? cfg.cellSize : CELL_SIZE;

  // 1) Clean + compress + normalize SIZE — only the first time a map is processed
  //    (no colliders.json yet). Re-runs to retune collision/spawns stay fast.
  const collidersPath = join(folder, 'colliders.json');
  if (!existsSync(collidersPath)) {
    const sizeMB = statSync(glbPath).size / (1024 * 1024);
    const usedExts = doc
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName);
    const needsMaterialFix = usedExts.includes('KHR_materials_pbrSpecularGlossiness');
    const needsDraco = !usedExts.includes('KHR_draco_mesh_compression');
    console.log(
      `[map] ${id}: processing (${sizeMB.toFixed(1)}MB, matFix=${needsMaterialFix}, draco=${needsDraco})`,
    );

    const sharp = await loadSharp();
    const transforms = [];
    if (needsMaterialFix) transforms.push(metalRough());
    transforms.push(dedup(), prune());
    if (sharp) {
      transforms.push(
        textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
      );
    }
    if (needsDraco) transforms.push(weld(), draco());
    if (transforms.length) await doc.transform(...transforms);

    // Scale oversized maps (e.g. models authored in cm) down to a playable size.
    const b = getBounds(doc.getRoot().listScenes()[0]);
    const footprint = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    if (footprint > MAP_SCALE_THRESHOLD) {
      const s = MAP_TARGET_SIZE / footprint;
      for (const node of doc.getRoot().listScenes()[0].listChildren()) {
        node.setTranslation(node.getTranslation().map((v) => v * s));
        node.setScale(node.getScale().map((v) => v * s));
      }
      console.log(
        `[map] ${id}: scaled by ${s.toFixed(5)} (footprint ${footprint.toFixed(0)} -> ~${MAP_TARGET_SIZE})`,
      );
    }

    await io.write(glbPath, doc);
    console.log(`[map] ${id}: processed map.glb written`);
  } else {
    console.log(`[map] ${id}: already processed (colliders.json present) — skipping clean`);
  }

  // 2) Gather world-space triangles + overall bounds.
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const triangles = [];

  const walk = (node, parent) => {
    const world = mul(
      parent,
      composeTRS(node.getTranslation(), node.getRotation(), node.getScale()),
    );
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const idx = prim.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        const va = [0, 0, 0],
          vb = [0, 0, 0],
          vc = [0, 0, 0];
        for (let i = 0; i + 2 < count; i += 3) {
          const ia = idx ? idx.getScalar(i) : i;
          const ib = idx ? idx.getScalar(i + 1) : i + 1;
          const ic = idx ? idx.getScalar(i + 2) : i + 2;
          pos.getElement(ia, va);
          pos.getElement(ib, vb);
          pos.getElement(ic, vc);
          const a = transform(world, va);
          const b = transform(world, vb);
          const c = transform(world, vc);
          for (const p of [a, b, c]) {
            for (let k = 0; k < 3; k++) {
              if (p[k] < min[k]) min[k] = p[k];
              if (p[k] > max[k]) max[k] = p[k];
            }
          }
          triangles.push(a, b, c);
        }
      }
    }
    for (const child of node.listChildren()) walk(child, world);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const n of scene.listChildren()) walk(n, identity);

  // 3) Voxelise into a solid grid. We voxelise a TALL grid (up to
  //    SPAWN_ANALYSIS_CAP) so we can tell which floor columns are genuinely open
  //    to the sky vs. sitting under the map's high walls/overhangs — crucial for
  //    spawn placement on big arenas. The STORED grid (used at runtime) is just
  //    the bottom PLAY_HEIGHT_CAP layers, so colliders.json stays small.
  const groundY = min[1];
  const origin = [min[0], groundY, min[2]];
  const playH = Math.min(PLAY_HEIGHT_CAP, max[1] - groundY);
  const analysisH = Math.min(SPAWN_ANALYSIS_CAP, max[1] - groundY);
  const nx = Math.max(1, Math.ceil((max[0] - min[0]) / cell));
  const ny = Math.max(1, Math.ceil(playH / cell)); // stored height
  const nyA = Math.max(ny, Math.ceil(analysisH / cell)); // analysis height
  const nz = Math.max(1, Math.ceil((max[2] - min[2]) / cell));
  const solidA = new Uint8Array(nx * nyA * nz); // tall, build-time analysis grid
  const yTopA = groundY + nyA * cell;

  const markPoint = (x, y, z) => {
    if (y < groundY || y > yTopA) return;
    const ix = Math.floor((x - origin[0]) / cell);
    const iy = Math.floor((y - origin[1]) / cell);
    const iz = Math.floor((z - origin[2]) / cell);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= nyA || iz >= nz) return;
    solidA[(iy * nz + iz) * nx + ix] = 1;
  };

  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t],
      b = triangles[t + 1],
      c = triangles[t + 2];
    const e1 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e2 = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = Math.min(
      MAX_TRI_SAMPLES,
      Math.max(1, Math.ceil(Math.max(e1, e2) / (cell * 0.5))),
    );
    for (let u = 0; u <= n; u++) {
      for (let v = 0; v <= n - u; v++) {
        const fu = u / n,
          fv = v / n;
        markPoint(
          a[0] + (b[0] - a[0]) * fu + (c[0] - a[0]) * fv,
          a[1] + (b[1] - a[1]) * fu + (c[1] - a[1]) * fv,
          a[2] + (b[2] - a[2]) * fu + (c[2] - a[2]) * fv,
        );
      }
    }
  }

  // The stored grid is the bottom `ny` layers of the analysis grid (identical
  // linear layout, since nx/nz match), so runtime collision is unchanged.
  const solid = solidA.slice(0, nx * ny * nz);
  let solidCount = 0;
  for (const v of solid) solidCount += v;

  // 4) Spawns. For each column find the FLOOR surface (lowest solid cell) and the
  //    clearance above it, then spawn in the largest, most-open area. Players
  //    spawn ON the floor (works for raised/uneven floors, not just y=0). Both
  //    teams share the same Z line: teammates clustered, enemies offset in X.
  const cellA = (ix, iy, iz) => solidA[(iy * nz + iz) * nx + ix];
  const columnInfo = (ix, iz) => {
    let floorIy = -1;
    for (let iy = 0; iy < nyA; iy++) {
      if (cellA(ix, iy, iz)) {
        floorIy = iy;
        break;
      }
    }
    if (floorIy < 0) return null; // no floor in this column
    // Contiguous open cells directly above the floor (player headroom).
    let h = 0;
    for (let iy = floorIy + 1; iy < nyA; iy++) {
      if (cellA(ix, iy, iz)) break;
      h++;
    }
    // Open to sky: NO geometry anywhere above floor+OPEN_SKY_GAP, all the way up
    // (i.e. not tucked under the map's tall walls / overhangs).
    let openToSky = true;
    for (let iy = floorIy + 1 + OPEN_SKY_GAP; iy < nyA; iy++) {
      if (cellA(ix, iy, iz)) {
        openToSky = false;
        break;
      }
    }
    return { floorIy, h, openToSky };
  };
  const all = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const info = columnInfo(ix, iz);
      if (!info) continue;
      all.push({
        ix,
        iz,
        h: info.h,
        openToSky: info.openToSky,
        y: origin[1] + (info.floorIy + 1) * cell,
        x: origin[0] + (ix + 0.5) * cell,
        z: origin[2] + (iz + 0.5) * cell,
      });
    }
  }
  // Prefer floor columns that are open to the sky AND have player headroom. Fall
  // back to clearance-only for fully-enclosed maps (e.g. indoor levels).
  const skyOpen = all.filter((p) => p.openToSky && p.h >= SPAWN_HEADROOM);
  const candidates = skyOpen.length ? skyOpen : all.filter((p) => p.h >= SPAWN_HEADROOM);
  const pool = candidates.length ? candidates : all;

  // Pick the coarse region whose columns have the most total clearance (biggest,
  // most open hall), and anchor the spawn cluster at its centroid.
  const REG = 8;
  const regions = new Map();
  for (const p of pool) {
    const rx = Math.min(REG - 1, Math.floor(((p.x - min[0]) / (max[0] - min[0] || 1)) * REG));
    const rz = Math.min(REG - 1, Math.floor(((p.z - min[2]) / (max[2] - min[2] || 1)) * REG));
    const key = `${rx},${rz}`;
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(p);
  }
  let region = pool;
  let bestScore = -1;
  for (const pts of regions.values()) {
    const score = pts.reduce((a, p) => a + p.h, 0);
    if (score > bestScore) [bestScore, region] = [score, pts];
  }
  const z0 = region.reduce((a, p) => a + p.z, 0) / region.length;
  const bandCx = region.reduce((a, p) => a + p.x, 0) / region.length;
  const band = region;

  const SEP = 12; // metres between team centres
  const nearest4 = (targetX) =>
    band
      .slice()
      .sort((a, b) => Math.hypot(a.x - targetX, a.z - z0) - Math.hypot(b.x - targetX, b.z - z0))
      .slice(0, 4);
  const fallbackY = band.length ? band[0].y : groundY + 0.1;
  const toSpawn = (pts, yaw) =>
    (pts.length ? pts : [{ x: bandCx, z: z0, y: fallbackY }]).map((p) => ({
      position: { x: p.x, y: (p.y ?? fallbackY) + 0.1, z: p.z },
      yaw,
    }));
  // Red on the left (faces +X toward the enemy), blue on the right (faces -X).
  const spawns = {
    red: toSpawn(nearest4(bandCx - SEP), -Math.PI / 2),
    blue: toSpawn(nearest4(bandCx + SEP), Math.PI / 2),
  };

  // 5) Props (cover): place the map config's props in the CENTRAL play area
  //    around the spawn midpoint (not flung to the map edges), on the exact
  //    spawn floor, each with a collider box so players can hide behind them.
  const spawnPts = [...spawns.red, ...spawns.blue].map((s) => s.position);
  // Players' feet rest on this surface; sit the cars on the same level.
  const spawnSurfaceY = spawns.red[0]?.position.y ?? groundY + 0.1;
  const spawnFloorY = spawnSurfaceY - 0.1;
  // Centre of the contested area: midpoint of the two team spawns.
  const midX =
    spawns.red[0] && spawns.blue[0]
      ? (spawns.red[0].position.x + spawns.blue[0].position.x) / 2
      : bandCx;
  const midZ =
    spawns.red[0] && spawns.blue[0]
      ? (spawns.red[0].position.z + spawns.blue[0].position.z) / 2
      : z0;
  const MIN_SPAWN_DIST = 10; // keep cars off the spawn points themselves
  const RING_MIN = 12; // closest a car sits to the arena centre
  // Build candidate floor columns in a central ring; widen the ring until we
  // have enough spots for the requested cars.
  const onFloor = all.filter(
    (p) =>
      p.h >= 2 &&
      p.openToSky &&
      Math.abs(p.y - spawnFloorY) < 1.5 &&
      spawnPts.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > MIN_SPAWN_DIST),
  );
  const wanted = (cfg.props ?? []).reduce((n, s) => n + (s.count ?? 1), 0);
  let ringMax = 40;
  let propCandidates = [];
  while (ringMax <= 110) {
    propCandidates = onFloor.filter((p) => {
      const r = Math.hypot(p.x - midX, p.z - midZ);
      return r >= RING_MIN && r <= ringMax;
    });
    if (propCandidates.length >= wanted * 8) break;
    ringMax += 15;
  }
  if (propCandidates.length === 0) propCandidates = onFloor;
  const propColliders = [];
  const propInstances = [];
  const placed = [];
  const MIN_GAP = 7; // minimum spacing between two cars (metres)
  for (const spec of cfg.props ?? []) {
    const prop = props[spec.id];
    if (!prop) {
      console.warn(`[map] ${id}: prop '${spec.id}' not found — skipping`);
      continue;
    }
    for (let i = 0; i < (spec.count ?? 1); i++) {
      // Pick the spot that's well-separated from already-placed cars but still
      // central: maximise distance-to-nearest-car minus a pull toward centre.
      let pick = null;
      let best = -Infinity;
      for (const c of propCandidates) {
        const sep = placed.length
          ? Math.min(...placed.map((q) => Math.hypot(q.x - c.x, q.z - c.z)))
          : 999;
        if (placed.length && sep < MIN_GAP) continue;
        const centrePull = Math.hypot(c.x - midX, c.z - midZ) * 0.25;
        const score = sep - centrePull;
        if (score > best) [best, pick] = [score, c];
      }
      if (!pick) break;
      placed.push(pick);
      const rot = (placed.length % 2) * (Math.PI / 2);
      const ex = rot === 0 ? prop.size.x : prop.size.z;
      const ez = rot === 0 ? prop.size.z : prop.size.x;
      // Sit cars on the collision floor (where players' feet rest), not the
      // +0.1 spawn epsilon, so they're flush with the floor like the players.
      propInstances.push({
        model: prop.model,
        x: pick.x,
        y: spawnFloorY,
        z: pick.z,
        rotationY: rot,
      });
      propColliders.push({
        min: { x: pick.x - ex / 2, y: spawnFloorY, z: pick.z - ez / 2 },
        max: { x: pick.x + ex / 2, y: spawnFloorY + prop.size.y, z: pick.z + ez / 2 },
      });
    }
  }

  // 6) Turrets (team defenders): place `turretsPerTeam` per side on open floor
  //    near each team's spawn cluster, well separated and facing the enemy side.
  const turretsPerTeam = Number.isFinite(cfg.turretsPerTeam) ? cfg.turretsPerTeam : 2;
  const turrets = [];
  // Floor columns turrets may stand on: with headroom, on the spawn floor. Unlike
  // props, turrets are base defenders so they MAY sit near spawns. Prefer open-sky
  // columns, but fall back so enclosed/indoor maps still get turrets.
  let turretFloor = all.filter(
    (p) => p.openToSky && p.h >= 2 && Math.abs(p.y - spawnFloorY) < 1.5,
  );
  if (turretFloor.length === 0) {
    turretFloor = all.filter((p) => p.h >= 2 && Math.abs(p.y - spawnFloorY) < 1.5);
  }
  if (turretFloor.length === 0) turretFloor = all.filter((p) => p.h >= 2);
  const placeTurrets = (team, teamSpawns, yaw) => {
    if (turretsPerTeam <= 0 || teamSpawns.length === 0 || turretFloor.length === 0) return;
    const cx = teamSpawns.reduce((a, s) => a + s.position.x, 0) / teamSpawns.length;
    const cz = teamSpawns.reduce((a, s) => a + s.position.z, 0) / teamSpawns.length;
    // Prefer a ring around this base; fall back to any open floor if scarce.
    let cand = turretFloor.filter((p) => {
      const r = Math.hypot(p.x - cx, p.z - cz);
      return r >= 3 && r <= 32 && spawnPts.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > 2);
    });
    if (cand.length === 0) cand = turretFloor;
    // Greedy: first turret forward (toward mid), the rest maximise separation so
    // they flank the base and never sit too close together.
    const chosen = [];
    for (let i = 0; i < turretsPerTeam; i++) {
      let pick = null;
      let best = -Infinity;
      for (const c of cand) {
        if (chosen.some((q) => q.x === c.x && q.z === c.z)) continue;
        const score = chosen.length
          ? Math.min(...chosen.map((q) => Math.hypot(q.x - c.x, q.z - c.z)))
          : -Math.hypot(c.x - midX, c.z - midZ);
        if (score > best) [best, pick] = [score, c];
      }
      if (!pick) break;
      chosen.push(pick);
      turrets.push({ x: pick.x, y: spawnFloorY, z: pick.z, yaw, team });
    }
  };
  placeTurrets('red', spawns.red, -Math.PI / 2);
  placeTurrets('blue', spawns.blue, Math.PI / 2);

  // 7) Render offset: lift the visual map so the floor meets where players rest
  //    (the voxel cell top). An explicit config.modelOffsetY always wins (hand-
  //    tuned maps); otherwise auto-compute from the true mesh floor under the
  //    spawn so new maps don't float/sink without manual tuning.
  const surfaceY = spawns.red[0]?.position.y ?? spawnSurfaceY;
  let autoOffset = 0;
  {
    const sx = spawns.red[0]?.position.x ?? bandCx;
    const sz = spawns.red[0]?.position.z ?? z0;
    let minY = Infinity;
    for (const v of triangles) {
      const dx = v[0] - sx;
      const dz = v[2] - sz;
      if (dx * dx + dz * dz <= 25 && v[1] <= surfaceY + 3 && v[1] < minY) minY = v[1];
    }
    if (minY !== Infinity) autoOffset = surfaceY - 0.1 - minY;
  }
  const renderOffsetY = cfg.modelOffsetY !== undefined ? cfg.modelOffsetY : autoOffset;

  const out = {
    cellSize: cell,
    origin: { x: origin[0], y: origin[1], z: origin[2] },
    dims: [nx, ny, nz],
    groundY,
    bounds: { min: { x: min[0], z: min[2] }, max: { x: max[0], z: max[2] } },
    solid: Buffer.from(solid).toString('base64'),
    spawns,
    colliders: propColliders,
    props: propInstances,
    turrets,
    renderOffsetY,
  };
  writeFileSync(join(folder, 'colliders.json'), JSON.stringify(out));
  console.log(
    `[map] ${id}: grid ${nx}x${ny}x${nz} (${solidCount} solid cells), ${propInstances.length} props, ` +
      `${turrets.length} turrets, renderOffsetY ${renderOffsetY.toFixed(2)}, ${triangles.length / 3} tris, ` +
      `bounds ${(max[0] - min[0]).toFixed(0)}x${(max[2] - min[2]).toFixed(0)}`,
  );
}

/** Create a draco-capable glTF IO. */
async function makeIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
}

/**
 * Process a prop GLB (e.g. a car): clean/compress, scale to a sensible size, and
 * recenter so its base sits at y=0 centred on the origin (so it can be placed on
 * a floor). Writes prop.json with its final size.
 */
async function processProp(id, folder) {
  const glbPath = join(folder, 'prop.glb');
  const jsonPath = join(folder, 'prop.json');
  const io = await makeIO();
  const doc = await io.read(glbPath);

  if (!existsSync(jsonPath)) {
    const usedExts = doc
      .getRoot()
      .listExtensionsUsed()
      .map((e) => e.extensionName);
    const sharp = await loadSharp();
    const transforms = [];
    if (usedExts.includes('KHR_materials_pbrSpecularGlossiness')) transforms.push(metalRough());
    transforms.push(dedup(), prune());
    if (sharp) {
      transforms.push(
        textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
      );
    }
    if (!usedExts.includes('KHR_draco_mesh_compression')) transforms.push(weld(), draco());
    if (transforms.length) await doc.transform(...transforms);

    const scene = doc.getRoot().listScenes()[0];
    // Scale to ~PROP_TARGET_SIZE footprint.
    let b = getBounds(scene);
    const horiz = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    const s = horiz > 0 ? PROP_TARGET_SIZE / horiz : 1;
    for (const node of scene.listChildren()) {
      node.setTranslation(node.getTranslation().map((v) => v * s));
      node.setScale(node.getScale().map((v) => v * s));
    }
    // Recenter: base at y=0, centred on x/z.
    b = getBounds(scene);
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const minY = b.min[1];
    for (const node of scene.listChildren()) {
      const t = node.getTranslation();
      node.setTranslation([t[0] - cx, t[1] - minY, t[2] - cz]);
    }
    await io.write(glbPath, doc);
    console.log(`[prop] ${id}: processed (scale ${s.toFixed(4)})`);
  }

  const b = getBounds(doc.getRoot().listScenes()[0]);
  const info = {
    model: `/assets/props/${id}/prop.glb`,
    size: { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] },
  };
  writeFileSync(jsonPath, JSON.stringify(info));
  return info;
}

async function loadProps() {
  const props = {};
  if (!existsSync(PROPS_DIR)) return props;
  for (const id of readdirSync(PROPS_DIR)) {
    const folder = join(PROPS_DIR, id);
    if (!statSync(folder).isDirectory() || !existsSync(join(folder, 'prop.glb'))) continue;
    props[id] = await processProp(id, folder);
  }
  return props;
}

async function main() {
  if (!existsSync(MAPS_DIR)) return;
  const props = await loadProps();
  for (const id of readdirSync(MAPS_DIR)) {
    const folder = join(MAPS_DIR, id);
    if (!statSync(folder).isDirectory()) continue;
    if (!existsSync(join(folder, 'map.glb'))) continue;
    await processMap(id, folder, props);
  }
}

main().catch((err) => {
  console.error('[map] build failed:', err);
  process.exit(1);
});
