/**
 * THE deterministic character movement step. This single pure function is the
 * heart of the netcode: the client runs it for prediction, the server runs it
 * for authority, and the client replays it during reconciliation. Same inputs →
 * same output, so corrections stay tiny and movement is smooth.
 */
import type { AABB } from '../math/aabb';
import { clamp } from '../math/vec3';
import { collideAndSlide } from './collision';
import {
  AIR_ACCEL,
  CROUCH_HEIGHT,
  CROUCH_MULTIPLIER,
  GRAVITY,
  GROUND_ACCEL,
  MAX_INPUT_DT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  jumpVelocityForHeight,
} from './constants';
import type { MoveState, MovementProfile, PlayerInput } from './types';

/** Static collision data the movement step reads (built from the world). */
export interface CollisionWorld {
  colliders: readonly AABB[];
  groundY: number;
  /** Soft play-area half-extent; players are clamped inside ±bounds. */
  bounds: number;
}

const lerpTo = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * Math.min(1, rate * dt);

/**
 * Advance `prev` by one input. Returns a NEW MoveState (never mutates `prev`),
 * so prediction buffers can keep historical states safely.
 */
export function stepMovement(
  prev: MoveState,
  input: PlayerInput,
  profile: MovementProfile,
  world: CollisionWorld,
): MoveState {
  const dt = clamp(input.dt, 0, MAX_INPUT_DT);

  const state: MoveState = {
    position: { ...prev.position },
    velocity: { ...prev.velocity },
    yaw: input.yaw,
    pitch: input.pitch,
    onGround: prev.onGround,
    crouching: input.crouch,
  };

  const height = input.crouch ? CROUCH_HEIGHT : PLAYER_HEIGHT;

  // Target horizontal speed depends on stance.
  const sprinting = input.sprint && !input.crouch && input.moveZ > 0;
  const speed =
    profile.speed *
    (sprinting ? profile.sprintMultiplier : 1) *
    (input.crouch ? CROUCH_MULTIPLIER : 1);

  // Local intent → world space (Three.js convention: yaw 0 faces -Z).
  const sin = Math.sin(state.yaw);
  const cos = Math.cos(state.yaw);
  const forwardX = -sin;
  const forwardZ = -cos;
  const rightX = cos;
  const rightZ = -sin;

  let wishX = rightX * input.moveX + forwardX * input.moveZ;
  let wishZ = rightZ * input.moveX + forwardZ * input.moveZ;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX /= wishLen;
    wishZ /= wishLen;
  } else {
    wishX = 0;
    wishZ = 0;
  }

  const targetVX = wishX * speed;
  const targetVZ = wishZ * speed;
  const accel = prev.onGround ? GROUND_ACCEL : AIR_ACCEL;
  state.velocity.x = lerpTo(state.velocity.x, targetVX, accel, dt);
  state.velocity.z = lerpTo(state.velocity.z, targetVZ, accel, dt);

  // Gravity + jump.
  state.velocity.y += GRAVITY * dt;
  if (input.jump && prev.onGround) {
    state.velocity.y = jumpVelocityForHeight(profile.jumpHeight);
    state.onGround = false;
  }

  // Integrate.
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;

  // Resolve collisions + ground.
  state.onGround = collideAndSlide(state, height, PLAYER_RADIUS, world.colliders, world.groundY);

  // Keep inside the play area.
  const b = world.bounds;
  state.position.x = clamp(state.position.x, -b, b);
  state.position.z = clamp(state.position.z, -b, b);

  return state;
}
