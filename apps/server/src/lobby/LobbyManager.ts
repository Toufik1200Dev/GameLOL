/**
 * Owns the set of active lobbies and the lifecycle around them: code generation
 * (guaranteed unique), lookup, creation, and disposal of empty lobbies.
 */
import { generateRoomCode, isValidRoomCodeShape, normalizeRoomCode } from '@game/shared';
import { Lobby } from './Lobby';

export class LobbyManager {
  private readonly lobbies = new Map<string, Lobby>();

  get count(): number {
    return this.lobbies.size;
  }

  /** Create a new lobby with a unique code, with `hostId` as the first player. */
  create(hostId: string): Lobby {
    const code = this.generateUniqueCode();
    const lobby = new Lobby(code, hostId);
    this.lobbies.set(code, lobby);
    return lobby;
  }

  get(code: string): Lobby | undefined {
    return this.lobbies.get(code);
  }

  /** Resolve a user-entered code to a lobby, normalizing + validating shape. */
  resolve(rawCode: string): { lobby: Lobby | null; normalized: string } {
    const normalized = normalizeRoomCode(rawCode);
    if (!isValidRoomCodeShape(normalized)) return { lobby: null, normalized };
    return { lobby: this.lobbies.get(normalized) ?? null, normalized };
  }

  /** Remove a lobby entirely (host closed it or it emptied). */
  remove(code: string): void {
    this.lobbies.delete(code);
  }

  /** Dispose the lobby if it has no players left; returns true if removed. */
  disposeIfEmpty(code: string): boolean {
    const lobby = this.lobbies.get(code);
    if (lobby && lobby.isEmpty()) {
      this.lobbies.delete(code);
      return true;
    }
    return false;
  }

  private generateUniqueCode(): string {
    // Astronomically unlikely to loop more than once, but guard anyway.
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = generateRoomCode();
      if (!this.lobbies.has(code)) return code;
    }
    throw new Error('Unable to allocate a unique room code');
  }
}
