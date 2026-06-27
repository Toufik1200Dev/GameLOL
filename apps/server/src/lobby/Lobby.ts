/**
 * A single private lobby. Pure domain logic — no Socket.IO dependency — so it is
 * trivially unit-testable. The networking layer (`socketHandlers`) drives it and
 * broadcasts `getState()` snapshots.
 *
 * Player identity in Phase 1 is the socket id (unique per connection). Host
 * migration and team auto-balancing are handled here.
 */
import {
  HARD_MAX_PLAYERS,
  MIN_PLAYERS,
  TEAMS,
  clamp,
  createDefaultLobbySettings,
  type LobbyPhase,
  type LobbySettings,
  type LobbyState,
  type PlayerPublic,
  type TeamId,
} from '@game/shared';

export class Lobby {
  readonly code: string;
  readonly createdAt: number;
  hostId: string;
  phase: LobbyPhase = 'lobby';
  settings: LobbySettings;
  private readonly players = new Map<string, PlayerPublic>();

  constructor(code: string, hostId: string) {
    this.code = code;
    this.hostId = hostId;
    this.createdAt = Date.now();
    this.settings = createDefaultLobbySettings();
  }

  get size(): number {
    return this.players.size;
  }

  has(id: string): boolean {
    return this.players.has(id);
  }

  get(id: string): PlayerPublic | undefined {
    return this.players.get(id);
  }

  isHost(id: string): boolean {
    return this.hostId === id;
  }

  isFull(): boolean {
    return this.players.size >= this.settings.maxPlayers;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  /** Count players currently on each team. */
  teamCounts(): Record<TeamId, number> {
    const counts: Record<TeamId, number> = { red: 0, blue: 0 };
    for (const p of this.players.values()) counts[p.team] += 1;
    return counts;
  }

  /** Team with the fewest players (ties → red), for auto-balancing on join. */
  private smallestTeam(): TeamId {
    const counts = this.teamCounts();
    return counts.red <= counts.blue ? 'red' : 'blue';
  }

  /**
   * Add a player. The first player becomes host. Returns the created record, or
   * `null` if the lobby is full / already contains the id.
   */
  addPlayer(id: string, name: string): PlayerPublic | null {
    if (this.players.has(id) || this.isFull()) return null;
    const player: PlayerPublic = {
      id,
      name: name.trim().slice(0, 20) || 'Player',
      team: this.smallestTeam(),
      isHost: this.players.size === 0,
      ready: false,
      ping: 0,
      characterId: null,
      weaponId: null,
      kills: 0,
      deaths: 0,
      connected: true,
    };
    if (player.isHost) this.hostId = id;
    this.players.set(id, player);
    return player;
  }

  /**
   * Remove a player. If they were the host, migrate the host to the next player.
   * Returns the new host id when migration occurred.
   */
  removePlayer(id: string): { migratedHostTo: string | null } {
    const wasHost = this.hostId === id;
    this.players.delete(id);
    let migratedHostTo: string | null = null;
    if (wasHost && this.players.size > 0) {
      const next = this.players.values().next().value as PlayerPublic | undefined;
      if (next) {
        this.hostId = next.id;
        next.isHost = true;
        migratedHostTo = next.id;
      }
    }
    return { migratedHostTo };
  }

  setReady(id: string, ready: boolean): void {
    const p = this.players.get(id);
    if (p) p.ready = ready;
  }

  setTeam(id: string, team: TeamId): void {
    const p = this.players.get(id);
    if (p && TEAMS.includes(team)) p.team = team;
  }

  setCharacter(id: string, characterId: string | null): void {
    const p = this.players.get(id);
    if (p) p.characterId = characterId;
  }

  setWeapon(id: string, weaponId: string | null): void {
    const p = this.players.get(id);
    if (p) p.weaponId = weaponId;
  }

  setPing(id: string, ping: number): void {
    const p = this.players.get(id);
    if (p) p.ping = Math.max(0, Math.round(ping));
  }

  /** Apply a host settings patch with validation/clamping. */
  updateSettings(patch: Partial<LobbySettings>): void {
    const next = { ...this.settings, ...patch };
    next.maxPlayers = clamp(
      Math.round(next.maxPlayers),
      Math.max(MIN_PLAYERS, this.size),
      HARD_MAX_PLAYERS,
    );
    next.matchDurationSec = clamp(Math.round(next.matchDurationSec), 60, 3600);
    next.respawnDelaySec = clamp(Math.round(next.respawnDelaySec), 0, 30);
    next.scoreLimit = clamp(Math.round(next.scoreLimit), 1, 1000);
    this.settings = next;

    // If auto-balance was just turned on, even out the teams.
    if (next.autoBalance) this.autoBalance();
  }

  /** Re-distribute players so team sizes differ by at most 1. */
  autoBalance(): void {
    const counts = this.teamCounts();
    let diff = counts.red - counts.blue;
    if (Math.abs(diff) <= 1) return;
    const fromTeam: TeamId = diff > 0 ? 'red' : 'blue';
    const toTeam: TeamId = diff > 0 ? 'blue' : 'red';
    for (const p of this.players.values()) {
      if (Math.abs(diff) <= 1) break;
      if (p.team === fromTeam) {
        p.team = toTeam;
        diff += diff > 0 ? -2 : 2;
      }
    }
  }

  /** Host may start once at least MIN_PLAYERS are present and all non-hosts are ready. */
  canStart(): boolean {
    if (this.phase !== 'lobby') return false;
    if (this.players.size < MIN_PLAYERS) return false;
    for (const p of this.players.values()) {
      if (!p.isHost && !p.ready) return false;
    }
    return true;
  }

  /** Serializable snapshot for broadcast. */
  getState(): LobbyState {
    return {
      code: this.code,
      hostId: this.hostId,
      players: [...this.players.values()],
      settings: this.settings,
      phase: this.phase,
      createdAt: this.createdAt,
    };
  }
}
