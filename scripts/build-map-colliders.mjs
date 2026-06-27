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
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { dedup, draco, metalRough, prune, textureCompress, weld } from '@gltf-transform/functions';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = resolve(__dirname, '../apps/web/public/assets/maps');

const CELL_SIZE = 1.5; // metres per voxel
const MAX_TRI_SAMPLES = 48; // per-triangle surface sampling cap
const SPAWN_HEADROOM = 3; // empty cells required above a spawn floor

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

async function processMap(id, folder) {
  const glbPath = join(folder, 'map.glb');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  console.log(`[map] ${id}: reading map.glb`);
  const doc = await io.read(glbPath);

  // 1) Clean + compress (materials, textures, Draco geometry) — but only on the
  //    first pass. Once processed the GLB is small, so re-runs (e.g. to retune
  //    collision/spawns) skip this and stay fast + idempotent.
  const sizeMB = statSync(glbPath).size / (1024 * 1024);
  if (sizeMB > 40) {
    const sharp = await loadSharp();
    const transforms = [metalRough(), dedup(), prune()];
    if (sharp) {
      transforms.push(
        textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
      );
    } else {
      console.warn('[map] sharp not available — skipping texture compression');
    }
    transforms.push(weld(), draco());
    await doc.transform(...transforms);
    await io.write(glbPath, doc);
    console.log(`[map] ${id}: cleaned + compressed map.glb written`);
  } else {
    console.log(`[map] ${id}: map.glb already processed (${sizeMB.toFixed(1)}MB) — skipping clean`);
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

  // 3) Voxelise into a solid grid over the FULL map height, so collision covers
  //    upper structures and "open to sky" spawn checks see overhead decks.
  const groundY = min[1];
  const origin = [min[0], groundY, min[2]];
  const nx = Math.max(1, Math.ceil((max[0] - min[0]) / CELL_SIZE));
  const ny = Math.max(1, Math.ceil((max[1] - min[1]) / CELL_SIZE));
  const nz = Math.max(1, Math.ceil((max[2] - min[2]) / CELL_SIZE));
  const solid = new Uint8Array(nx * ny * nz);
  const yTop = max[1];

  const markPoint = (x, y, z) => {
    if (y < groundY || y > yTop) return;
    const ix = Math.floor((x - origin[0]) / CELL_SIZE);
    const iy = Math.floor((y - origin[1]) / CELL_SIZE);
    const iz = Math.floor((z - origin[2]) / CELL_SIZE);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    solid[(iy * nz + iz) * nx + ix] = 1;
  };

  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t],
      b = triangles[t + 1],
      c = triangles[t + 2];
    const e1 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e2 = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = Math.min(
      MAX_TRI_SAMPLES,
      Math.max(1, Math.ceil(Math.max(e1, e2) / (CELL_SIZE * 0.5))),
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

  // Clear the bottom layer — the flat floor is handled by the ground plane, so
  // this keeps players from getting trapped inside the floor slab.
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) solid[(0 * nz + iz) * nx + ix] = 0;
  }

  let solidCount = 0;
  for (const v of solid) solidCount += v;

  // 4) Spawns. Find the widest OPEN-TO-SKY area (no solid in the whole column),
  //    then put both teams along the SAME Z line: teammates clustered together,
  //    the enemy team offset along X (a little farther). Falls back to merely
  //    "standable" columns if the map is fully covered.
  const openColumn = (ix, iz) => {
    for (let iy = 0; iy < ny; iy++) if (solid[(iy * nz + iz) * nx + ix]) return false;
    return true;
  };
  const standableColumn = (ix, iz) => {
    for (let iy = 0; iy < SPAWN_HEADROOM; iy++) if (solid[(iy * nz + iz) * nx + ix]) return false;
    return true;
  };
  const collect = (test) => {
    const pts = [];
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (test(ix, iz)) {
          pts.push({
            ix,
            iz,
            x: origin[0] + (ix + 0.5) * CELL_SIZE,
            z: origin[2] + (iz + 0.5) * CELL_SIZE,
          });
        }
      }
    }
    return pts;
  };

  let openPts = collect(openColumn);
  if (openPts.length < 8) openPts = collect(standableColumn);

  // Z line with the most open columns = the widest clear lane.
  const perZ = new Map();
  for (const p of openPts) perZ.set(p.iz, (perZ.get(p.iz) ?? 0) + 1);
  let z0iz = Math.floor(nz / 2);
  let bestCount = -1;
  for (const [iz, c] of perZ) if (c > bestCount) [bestCount, z0iz] = [c, iz];
  const z0 = origin[2] + (z0iz + 0.5) * CELL_SIZE;
  const band = openPts.filter((p) => Math.abs(p.iz - z0iz) <= 4);
  const bandCx = band.length ? band.reduce((a, p) => a + p.x, 0) / band.length : 0;

  const SEP = 12; // metres between team centres
  const nearest4 = (targetX) =>
    band
      .slice()
      .sort((a, b) => Math.hypot(a.x - targetX, a.z - z0) - Math.hypot(b.x - targetX, b.z - z0))
      .slice(0, 4);
  const toSpawn = (pts, yaw) =>
    (pts.length ? pts : [{ x: bandCx, z: z0 }]).map((p) => ({
      position: { x: p.x, y: groundY + 0.1, z: p.z },
      yaw,
    }));
  // Red on the left (faces +X toward the enemy), blue on the right (faces -X).
  const spawns = {
    red: toSpawn(nearest4(bandCx - SEP), -Math.PI / 2),
    blue: toSpawn(nearest4(bandCx + SEP), Math.PI / 2),
  };

  const out = {
    cellSize: CELL_SIZE,
    origin: { x: origin[0], y: origin[1], z: origin[2] },
    dims: [nx, ny, nz],
    groundY,
    bounds: { min: { x: min[0], z: min[2] }, max: { x: max[0], z: max[2] } },
    solid: Buffer.from(solid).toString('base64'),
    spawns,
  };
  writeFileSync(join(folder, 'colliders.json'), JSON.stringify(out));
  console.log(
    `[map] ${id}: grid ${nx}x${ny}x${nz} (${solidCount} solid cells), ` +
      `${triangles.length / 3} tris, bounds ${(max[0] - min[0]).toFixed(0)}x${(max[2] - min[2]).toFixed(0)}`,
  );
}

async function main() {
  if (!existsSync(MAPS_DIR)) return;
  for (const id of readdirSync(MAPS_DIR)) {
    const folder = join(MAPS_DIR, id);
    if (!statSync(folder).isDirectory()) continue;
    if (!existsSync(join(folder, 'map.glb'))) continue;
    await processMap(id, folder);
  }
}

main().catch((err) => {
  console.error('[map] build failed:', err);
  process.exit(1);
});
