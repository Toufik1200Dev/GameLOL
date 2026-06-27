import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/worldgen';
import { stepMovement, type CollisionWorld } from './movement';
import { createMoveState, type MovementProfile, type PlayerInput } from './types';
import { PLAYER_HEIGHT } from './constants';

const profile: MovementProfile = { speed: 5, sprintMultiplier: 1.6, jumpHeight: 1.4 };

const flatWorld: CollisionWorld = { colliders: [], groundY: 0, bounds: 100 };

const input = (over: Partial<PlayerInput> = {}): PlayerInput => ({
  seq: 1,
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  sprint: false,
  crouch: false,
  dt: 1 / 60,
  ...over,
});

describe('stepMovement', () => {
  it('does not mutate the previous state', () => {
    const prev = createMoveState({ x: 0, y: 5, z: 0 });
    const snapshot = JSON.stringify(prev);
    stepMovement(prev, input(), profile, flatWorld);
    expect(JSON.stringify(prev)).toBe(snapshot);
  });

  it('falls under gravity and lands exactly on the ground plane', () => {
    let s = createMoveState({ x: 0, y: 5, z: 0 });
    for (let i = 0; i < 240; i++) s = stepMovement(s, input(), profile, flatWorld);
    expect(s.position.y).toBe(0);
    expect(s.onGround).toBe(true);
  });

  it('moves forward when commanded (yaw 0 ⇒ -Z)', () => {
    let s = createMoveState({ x: 0, y: 0, z: 0 });
    s.onGround = true;
    for (let i = 0; i < 60; i++) s = stepMovement(s, input({ moveZ: 1 }), profile, flatWorld);
    expect(s.position.z).toBeLessThan(-1);
    expect(Math.abs(s.position.x)).toBeLessThan(0.01);
  });

  it('jumps when grounded and not when airborne', () => {
    let s = createMoveState({ x: 0, y: 0, z: 0 });
    s.onGround = true;
    s = stepMovement(s, input({ jump: true }), profile, flatWorld);
    expect(s.velocity.y).toBeGreaterThan(0);
    const airborne = { ...s, onGround: false };
    const after = stepMovement(airborne, input({ jump: true }), profile, flatWorld);
    // Can't double-jump: vertical velocity only decreases due to gravity.
    expect(after.velocity.y).toBeLessThan(s.velocity.y);
  });

  it('is deterministic: identical input sequences ⇒ identical state (two "machines")', () => {
    const world: CollisionWorld = (() => {
      const w = generateWorld('determinism-seed');
      return { colliders: w.colliders, groundY: w.groundY, bounds: w.bounds };
    })();

    const run = (): string => {
      let s = createMoveState({ x: 0, y: 3, z: 20 });
      for (let i = 0; i < 600; i++) {
        const inp = input({
          seq: i,
          moveX: Math.sin(i / 23),
          moveZ: Math.cos(i / 17),
          yaw: i / 50,
          jump: i % 45 === 0,
          sprint: i % 2 === 0,
        });
        s = stepMovement(s, inp, profile, world);
      }
      return JSON.stringify(s);
    };

    expect(run()).toBe(run());
  });

  it('stands on top of a box instead of passing through it', () => {
    const world: CollisionWorld = {
      colliders: [{ min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 2, z: 2 } }],
      groundY: 0,
      bounds: 100,
    };
    let s = createMoveState({ x: 0, y: 6, z: 0 });
    for (let i = 0; i < 240; i++) s = stepMovement(s, input(), profile, world);
    // Rests on top of the 2m-tall box.
    expect(s.position.y).toBeGreaterThanOrEqual(1.99);
    expect(s.position.y).toBeLessThan(2.2);
    expect(s.onGround).toBe(true);
    expect(PLAYER_HEIGHT).toBeGreaterThan(0);
  });
});
