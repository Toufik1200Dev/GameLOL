import { describe, expect, it } from 'vitest';
import { generateWorld } from './worldgen';

describe('generateWorld', () => {
  it('is deterministic for a given seed', () => {
    const a = generateWorld('A4HF9P');
    const b = generateWorld('A4HF9P');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different layouts for different seeds', () => {
    const a = generateWorld('seed-one');
    const b = generateWorld('seed-two');
    expect(JSON.stringify(a.props)).not.toBe(JSON.stringify(b.props));
  });

  it('creates spawns for both teams and a non-empty collider set', () => {
    const w = generateWorld('XYZ123');
    expect(w.spawns.red.length).toBeGreaterThan(0);
    expect(w.spawns.blue.length).toBeGreaterThan(0);
    expect(w.colliders.length).toBeGreaterThan(0);
    // Spawns are on opposite halves of the map.
    const redZ = w.spawns.red[0]!.position.z;
    const blueZ = w.spawns.blue[0]!.position.z;
    expect(Math.sign(redZ)).not.toBe(Math.sign(blueZ));
  });

  it('keeps mountains non-collidable (visual only)', () => {
    const w = generateWorld('mountains');
    const mountainBoxes = w.props.filter((p) => p.type === 'mountain').length;
    expect(mountainBoxes).toBeGreaterThan(0);
    // Colliders should be fewer than total props (decor excluded).
    expect(w.colliders.length).toBeLessThan(w.props.length);
  });
});
