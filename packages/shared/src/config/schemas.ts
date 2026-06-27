/**
 * Zod schemas for the data-driven asset `config.json` files. These are the
 * contract that makes the game extensible: drop a folder in with a valid config
 * and it appears in-game. Schemas apply sensible defaults so authors only need
 * to specify what differs. Used by the asset manifest route (validation) and the
 * client (typed consumption).
 */
import { z } from 'zod';
import { DEFAULT_MAX_HEARTS } from '../constants';

/** Names of animation clips a character may map to logical states. */
export const ANIMATION_STATES = [
  'idle',
  'walk',
  'run',
  'sprint',
  'jump',
  'fall',
  'land',
  'aim',
  'shoot',
  'reload',
  'death',
  'victory',
] as const;

export type AnimationState = (typeof ANIMATION_STATES)[number];

const animationMapSchema = z
  .object(
    Object.fromEntries(ANIMATION_STATES.map((s) => [s, z.string()])) as Record<
      AnimationState,
      z.ZodString
    >,
  )
  .partial();

export const characterConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  health: z.number().positive().default(DEFAULT_MAX_HEARTS),
  speed: z.number().positive().default(5),
  sprintMultiplier: z.number().positive().default(1.5),
  jumpHeight: z.number().positive().default(1.4),
  scale: z.number().positive().default(1),
  /** Vertical offset (metres) to align the model's feet to the ground. */
  yOffset: z.number().default(0),
  /** Yaw offset (radians) if the model doesn't face -Z by default. */
  yawOffset: z.number().default(0),
  animations: animationMapSchema.default({}),
});

export type CharacterConfig = z.infer<typeof characterConfigSchema>;

const vec3Tuple = z.tuple([z.number(), z.number(), z.number()]);

const attachmentSchema = z
  .object({
    position: vec3Tuple.default([0, 0, 0]),
    rotation: vec3Tuple.default([0, 0, 0]),
    scale: z.number().positive().default(1),
  })
  .default({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });

export const weaponConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  /** Hearts of damage per hit. */
  damage: z.number().positive().default(1),
  /** Rounds per minute. */
  fireRate: z.number().positive().default(400),
  magazine: z.number().int().positive().default(30),
  /** Seconds to reload. */
  reloadSpeed: z.number().positive().default(2),
  /** Units/second; 0 ⇒ hitscan, >0 ⇒ travelling projectile. */
  projectileSpeed: z.number().nonnegative().default(0),
  /** Explosion radius (metres) for projectiles; 0 ⇒ direct hit only. */
  splashRadius: z.number().nonnegative().default(0),
  recoil: z.number().nonnegative().default(0.3),
  spread: z.number().nonnegative().default(0.02),
  range: z.number().positive().default(80),
  attachment: attachmentSchema,
});

export type WeaponConfig = z.infer<typeof weaponConfigSchema>;

export const mapConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  /** Optional explicit seed; falls back to the lobby code at runtime. */
  seed: z.string().optional(),
  /** World half-extent in metres. */
  size: z.number().positive().default(120),
  fogColor: z.string().default('#9fd3ff'),
  skyColor: z.string().default('#67b6ff'),
  /** 0..1 multiplier for prop scattering density. */
  propDensity: z.number().min(0).max(1).default(0.6),
  /**
   * Vertical offset (metres) applied to the RENDERED GLB map model only (not
   * collision). Negative moves the visuals down so players sit on/above the
   * floor instead of appearing sunk into it. Tune per map.
   */
  modelOffsetY: z.number().default(0),
});

export type MapConfig = z.infer<typeof mapConfigSchema>;
