import { describe, expect, it } from 'vitest';
import { ROOM_CODE_LENGTH } from '../constants';
import { generateRoomCode, isValidRoomCodeShape, normalizeRoomCode } from './roomCode';

describe('room codes', () => {
  it('generates codes of the configured length using the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCodeShape(code)).toBe(true);
      // No ambiguous characters.
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('rejects malformed codes', () => {
    expect(isValidRoomCodeShape('')).toBe(false);
    expect(isValidRoomCodeShape('ABC')).toBe(false);
    expect(isValidRoomCodeShape('A4HF9O')).toBe(false); // contains O
    expect(isValidRoomCodeShape('a4hf9p')).toBe(false); // lowercase
  });

  it('normalizes user input', () => {
    expect(normalizeRoomCode(' a4 hf9p ')).toBe('A4HF9P');
    expect(normalizeRoomCode('a4hf9p')).toBe('A4HF9P');
  });

  it('has reasonable collision resistance across many codes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateRoomCode());
    // With a 32-char alphabet and length 6 there are ~1.07e9 combos; 5000 draws
    // should essentially never collide.
    expect(seen.size).toBeGreaterThan(4990);
  });
});
