import { describe, expect, it } from 'vitest';
import { SeededRandom, hashStringToSeed, mulberry32 } from './seeded';

describe('SeededRandom determinism', () => {
  it('produces an identical sequence for the same numeric seed', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces an identical sequence for the same string seed', () => {
    const a = new SeededRandom('A4HF9P');
    const b = new SeededRandom('A4HF9P');
    expect(Array.from({ length: 10 }, () => a.int(0, 1000))).toEqual(
      Array.from({ length: 10 }, () => b.int(0, 1000)),
    );
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    expect(a.float()).not.toEqual(b.float());
  });

  it('hashStringToSeed is stable and unsigned 32-bit', () => {
    const h = hashStringToSeed('hello');
    expect(h).toBe(hashStringToSeed('hello'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('mulberry32 outputs floats in [0, 1)', () => {
    const next = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
