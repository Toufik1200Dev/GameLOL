/**
 * Room-code generation. Codes use an unambiguous alphabet (no 0/O, 1/I) so they
 * are easy to read aloud and type. Uniqueness is enforced by the caller against
 * the set of active lobbies.
 */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../constants';

/** Cryptographically-strong random integer in [0, max) when available. */
const randomInt = (max: number): number => {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
  if (g.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    g.crypto.getRandomValues(buf);
    return (buf[0] ?? 0) % max;
  }
  return Math.floor(Math.random() * max);
};

/** Generate a single room code of the configured length. */
export const generateRoomCode = (length = ROOM_CODE_LENGTH): string => {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
};

/** Validate a user-entered code's shape (length + allowed characters). */
export const isValidRoomCodeShape = (code: string): boolean => {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
};

/** Normalize user input (uppercase, strip spaces) before validation. */
export const normalizeRoomCode = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
