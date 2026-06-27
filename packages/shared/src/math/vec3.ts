/**
 * Minimal plain-object 3D vector math. Deliberately framework-agnostic (no THREE
 * dependency) so the SAME code runs on the headless server and in the browser.
 * Operations are written to avoid allocations on hot paths where it matters
 * (out-parameter variants), with convenient pure variants for readability.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const cloneVec3 = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export const subVec3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const scaleVec3 = (a: Vec3, s: number): Vec3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});

export const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const lengthVec3 = (a: Vec3): number => Math.sqrt(dotVec3(a, a));

export const lengthSqVec3 = (a: Vec3): number => dotVec3(a, a);

export const distanceVec3 = (a: Vec3, b: Vec3): number => lengthVec3(subVec3(a, b));

export const normalizeVec3 = (a: Vec3): Vec3 => {
  const len = lengthVec3(a);
  if (len < 1e-8) return vec3(0, 0, 0);
  return scaleVec3(a, 1 / len);
};

/** Linear interpolation between a and b by t in [0,1]. */
export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Wrap an angle (radians) into [-PI, PI] for safe interpolation. */
export const wrapAngle = (radians: number): number => {
  let r = radians % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
};

/** Shortest-path angular interpolation (radians). */
export const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t;
