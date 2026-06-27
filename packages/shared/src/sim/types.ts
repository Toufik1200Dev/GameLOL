/**
 * Simulation data types shared by client prediction and server authority.
 */
import type { Vec3 } from '../math/vec3';

/** One sampled frame of player intent. Sent client → server, also stored client
 *  side for prediction/reconciliation. */
export interface PlayerInput {
  /** Monotonic per-player sequence number. */
  seq: number;
  /** Strafe intent, -1..1 (left/right) in the player's local frame. */
  moveX: number;
  /** Forward intent, -1..1 (back/forward) in the player's local frame. */
  moveZ: number;
  /** Facing yaw in radians (from the camera). */
  yaw: number;
  /** Look pitch in radians (for aim/shoot direction). */
  pitch: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  /** Client frame delta in seconds (server clamps to MAX_INPUT_DT). */
  dt: number;
}

/** The mutable kinematic state the movement step integrates. */
export interface MoveState {
  position: Vec3; // feet position (ground contact point)
  velocity: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  crouching: boolean;
}

/** Per-character movement profile (from character config, with fallbacks). */
export interface MovementProfile {
  speed: number;
  sprintMultiplier: number;
  jumpHeight: number;
}

export const createMoveState = (position: Vec3, yaw = 0): MoveState => ({
  position: { ...position },
  velocity: { x: 0, y: 0, z: 0 },
  yaw,
  pitch: 0,
  onGround: false,
  crouching: false,
});
