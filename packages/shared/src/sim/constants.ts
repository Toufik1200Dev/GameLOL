/**
 * Movement/simulation tuning. These govern the deterministic character
 * controller that runs identically on the client (prediction) and server
 * (authority). Treat them as game-feel knobs.
 */
export const GRAVITY = -26; // m/s² — snappier than real gravity for arcade feel

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.7;
export const CROUCH_HEIGHT = 1.05;
export const EYE_HEIGHT = 1.55; // camera/eye offset from feet (standing)
export const CROUCH_EYE_HEIGHT = 0.95;

/**
 * Tallest obstacle the player auto-climbs instead of being blocked by. Lets the
 * controller ride over voxel-grid seams, kerbs and short steps so flat ground
 * never feels "sticky", while still blocking anything taller (real walls).
 */
export const STEP_HEIGHT = 0.35;

/** Top slice of the player hit box treated as the head (metres, from the crown down). */
export const HEAD_HEIGHT = 0.28;
/** Damage multiplier for a shot that lands in the head box. */
export const HEADSHOT_MULTIPLIER = 2;

export const BASE_SPEED = 5.2; // m/s walk (fallback when no character config)
export const SPRINT_MULTIPLIER = 1.65;
export const CROUCH_MULTIPLIER = 0.5;
export const DEFAULT_JUMP_HEIGHT = 1.4; // metres

// Horizontal velocity approaches its target at these per-second lerp rates.
// On the ground the target is reached quickly (and decays to 0 with no input,
// giving friction); in the air the low rate preserves momentum (floaty control).
export const GROUND_ACCEL = 14;
export const AIR_ACCEL = 2.5;

/** Server clamps each input's dt to this to neutralise speed-hack attempts. */
export const MAX_INPUT_DT = 0.1;

/** Seconds of spawn protection after (re)spawning. */
export const RESPAWN_INVULN_SEC = 1.5;

/** Jump take-off velocity for a desired apex height: v = sqrt(2·g·h). */
export const jumpVelocityForHeight = (height: number): number =>
  Math.sqrt(2 * Math.abs(GRAVITY) * Math.max(0.1, height));
