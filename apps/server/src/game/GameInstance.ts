/**
 * One authoritative match. Owns the fixed-tick simulation for a single lobby:
 * it processes buffered player inputs through the SHARED deterministic movement
 * step (so it matches client prediction), resolves shooting with basic lag
 * compensation, manages hearts/death/respawn/scoring, and broadcasts delta
 * snapshots. The server never trusts client positions, health, or hits.
 */
import type { Server } from 'socket.io';
import {
  BASE_SPEED,
  DEFAULT_JUMP_HEIGHT,
  DEFAULT_MAX_HEARTS,
  DEFAULT_WEAPON,
  EYE_HEIGHT,
  INTERPOLATION_DELAY_MS,
  LAG_COMP_HISTORY_TICKS,
  RESPAWN_INVULN_SEC,
  SNAPSHOT_RATE,
  SPRINT_MULTIPLIER,
  TICK_DURATION,
  TICK_RATE,
  clamp,
  createMoveState,
  fireInterval,
  generateWorld,
  playerHitBox,
  rayAABB,
  stepMovement,
  type ClientToServerEvents,
  type GeneratedWorld,
  type InterServerEvents,
  type LobbySettings,
  type MoveState,
  type MovementProfile,
  type NetPlayerState,
  type PlayerInput,
  type PlayerPublic,
  type ServerToClientEvents,
  type ShootCommand,
  type SocketData,
  type TeamId,
  type Vec3,
} from '@game/shared';
import { logger } from '../logger';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Exported for white-box unit testing of combat/movement. */
export interface ServerPlayer {
  id: string;
  name: string;
  team: TeamId;
  characterId: string | null;
  weaponId: string | null;
  move: MoveState;
  profile: MovementProfile;
  health: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawnTimer: number;
  invulnUntil: number;
  lastProcessedInput: number;
  inputQueue: PlayerInput[];
  lastFireTime: number;
  ping: number;
  moving: boolean;
}

interface HistoryFrame {
  time: number;
  positions: Map<string, Vec3>;
}

const MAX_QUEUE = 64;
const PER_TICK_DT_BUDGET = TICK_DURATION * 2;

export class GameInstance {
  readonly code: string;
  private readonly io: GameServer;
  private readonly world: GeneratedWorld;
  private readonly collisionWorld: { colliders: GeneratedWorld['colliders']; groundY: number; bounds: number };
  private readonly settings: LobbySettings;
  private readonly players = new Map<string, ServerPlayer>();
  private readonly onEnd: () => void;

  private readonly scores: Record<TeamId, number> = { red: 0, blue: 0 };
  private readonly spawnCursor: Record<TeamId, number> = { red: 0, blue: 0 };
  private readonly history: HistoryFrame[] = [];
  private readonly lastSent = new Map<string, string>();
  private readonly needsFull = new Set<string>();
  private removedSinceBroadcast: string[] = [];

  private tick = 0;
  private startTime = 0;
  private ended = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(
    io: GameServer,
    code: string,
    seed: string,
    settings: LobbySettings,
    roster: PlayerPublic[],
    onEnd: () => void,
  ) {
    this.io = io;
    this.code = code;
    this.settings = settings;
    this.onEnd = onEnd;
    this.world = generateWorld(seed);
    this.collisionWorld = {
      colliders: this.world.colliders,
      groundY: this.world.groundY,
      bounds: this.world.bounds,
    };
    for (const p of roster) this.addPlayer(p);
  }

  // ---- lifecycle ----

  start(): void {
    this.startTime = Date.now();
    this.tickTimer = setInterval(() => this.step(), 1000 / TICK_RATE);
    this.snapshotTimer = setInterval(() => this.broadcast(), 1000 / SNAPSHOT_RATE);
    logger.info(`game ${this.code}: started (${this.players.size} players, seed=${this.world.seed})`);
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.tickTimer = null;
    this.snapshotTimer = null;
  }

  // ---- roster ----

  private addPlayer(p: PlayerPublic): void {
    const profile: MovementProfile = {
      speed: BASE_SPEED,
      sprintMultiplier: SPRINT_MULTIPLIER,
      jumpHeight: DEFAULT_JUMP_HEIGHT,
    };
    const player: ServerPlayer = {
      id: p.id,
      name: p.name,
      team: p.team,
      characterId: p.characterId,
      weaponId: p.weaponId,
      move: createMoveState({ x: 0, y: 0, z: 0 }),
      profile,
      health: DEFAULT_MAX_HEARTS,
      alive: true,
      kills: 0,
      deaths: 0,
      respawnTimer: 0,
      invulnUntil: 0,
      lastProcessedInput: 0,
      inputQueue: [],
      lastFireTime: 0,
      ping: p.ping,
      moving: false,
    };
    this.spawn(player);
    this.players.set(p.id, player);
    this.needsFull.add(p.id);
  }

  removePlayer(id: string): void {
    if (this.players.delete(id)) {
      this.removedSinceBroadcast.push(id);
      this.lastSent.delete(id);
      this.needsFull.delete(id);
    }
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  setPing(id: string, ping: number): void {
    const p = this.players.get(id);
    if (p) p.ping = ping;
  }

  // ---- input + shooting ----

  enqueueInput(id: string, input: PlayerInput): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.inputQueue.length >= MAX_QUEUE) p.inputQueue.length = 0; // abuse guard
    p.inputQueue.push(input);
  }

  handleShoot(id: string, cmd: ShootCommand): void {
    const shooter = this.players.get(id);
    if (!shooter || !shooter.alive) return;

    const now = Date.now();
    if (now - shooter.lastFireTime < fireInterval(DEFAULT_WEAPON) * 1000 - 8) return; // rate limit
    shooter.lastFireTime = now;

    // Authoritative origin = server-side eye position (prevents origin spoofing).
    const origin: Vec3 = {
      x: shooter.move.position.x,
      y: shooter.move.position.y + EYE_HEIGHT,
      z: shooter.move.position.z,
    };
    const dir = normalize(cmd.dir);
    if (dir.x === 0 && dir.y === 0 && dir.z === 0) return;

    // Lag compensation: rewind enemies to roughly when the shooter fired.
    const rewindTo = now - (INTERPOLATION_DELAY_MS + shooter.ping / 2);
    const rewound = this.positionsAt(rewindTo);

    // Nearest blocking world geometry along the ray (line of sight).
    let nearestWorld = DEFAULT_WEAPON.range;
    for (const box of this.world.colliders) {
      const t = rayAABB(origin, dir, box);
      if (t !== null && t < nearestWorld) nearestWorld = t;
    }

    // Closest hittable player in front of any wall.
    let victim: ServerPlayer | null = null;
    let victimT = nearestWorld;
    let point: Vec3 = { x: origin.x + dir.x * victimT, y: origin.y + dir.y * victimT, z: origin.z + dir.z * victimT };

    for (const other of this.players.values()) {
      if (other.id === id || !other.alive) continue;
      if (other.team === shooter.team && !this.settings.friendlyFire) continue;
      const feet = rewound.get(other.id) ?? other.move.position;
      const t = rayAABB(origin, dir, playerHitBox(feet));
      if (t !== null && t >= 0 && t < victimT) {
        victim = other;
        victimT = t;
        point = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
      }
    }

    if (!victim) return;
    if (now < victim.invulnUntil) return; // spawn protection

    victim.health -= DEFAULT_WEAPON.damage;
    const killed = victim.health <= 0;

    this.io.to(shooter.id).emit('game:hit', {
      shooterId: shooter.id,
      victimId: victim.id,
      damage: DEFAULT_WEAPON.damage,
      victimHealth: Math.max(0, victim.health),
      killed,
      point,
    });
    this.io.to(victim.id).emit('game:hit', {
      shooterId: shooter.id,
      victimId: victim.id,
      damage: DEFAULT_WEAPON.damage,
      victimHealth: Math.max(0, victim.health),
      killed,
      point,
    });

    if (killed) this.killPlayer(shooter, victim);
  }

  private killPlayer(killer: ServerPlayer, victim: ServerPlayer): void {
    victim.alive = false;
    victim.health = 0;
    victim.deaths += 1;
    victim.respawnTimer = this.settings.respawnDelaySec;
    killer.kills += 1;
    this.scores[killer.team] += 1;

    this.io.to(this.code).emit('game:kill', {
      killerId: killer.id,
      killerName: killer.name,
      killerTeam: killer.team,
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      weaponId: killer.weaponId,
    });

    if (this.scores[killer.team] >= this.settings.scoreLimit) this.end();
  }

  // ---- simulation ----

  private step(): void {
    if (this.ended) return;
    const now = Date.now();

    for (const p of this.players.values()) {
      if (p.alive) {
        let budget = PER_TICK_DT_BUDGET;
        while (p.inputQueue.length > 0 && budget > 0) {
          const input = p.inputQueue.shift()!;
          p.move = stepMovement(p.move, input, p.profile, this.collisionWorld);
          p.lastProcessedInput = input.seq;
          budget -= clamp(input.dt, 0, 0.1);
        }
        p.moving = Math.hypot(p.move.velocity.x, p.move.velocity.z) > 0.5;
      } else {
        p.respawnTimer -= TICK_DURATION;
        if (p.respawnTimer <= 0) this.spawn(p);
      }
    }

    // Record a history frame for lag compensation.
    const frame: HistoryFrame = { time: now, positions: new Map() };
    for (const p of this.players.values()) frame.positions.set(p.id, { ...p.move.position });
    this.history.push(frame);
    if (this.history.length > LAG_COMP_HISTORY_TICKS) this.history.shift();

    this.tick += 1;

    if (this.timeRemaining() <= 0) this.end();
  }

  /** Interpolated player positions at a past server time (for lag comp). */
  private positionsAt(time: number): Map<string, Vec3> {
    if (this.history.length === 0) return new Map();
    let frame = this.history[0]!;
    for (const f of this.history) {
      if (f.time <= time) frame = f;
      else break;
    }
    return frame.positions;
  }

  private spawn(player: ServerPlayer): void {
    const spawns = this.world.spawns[player.team];
    const idx = this.spawnCursor[player.team] % spawns.length;
    this.spawnCursor[player.team] += 1;
    const spawn = spawns[idx]!;
    player.move = createMoveState({ ...spawn.position }, spawn.yaw);
    player.health = DEFAULT_MAX_HEARTS;
    player.alive = true;
    player.respawnTimer = 0;
    player.invulnUntil = Date.now() + RESPAWN_INVULN_SEC * 1000;
    player.inputQueue.length = 0;
  }

  private timeRemaining(): number {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return Math.max(0, this.settings.matchDurationSec - elapsed);
  }

  // ---- snapshots (delta) ----

  private toNet(p: ServerPlayer): NetPlayerState {
    return {
      id: p.id,
      name: p.name,
      team: p.team,
      x: p.move.position.x,
      y: p.move.position.y,
      z: p.move.position.z,
      yaw: p.move.yaw,
      pitch: p.move.pitch,
      vy: p.move.velocity.y,
      moving: p.moving,
      crouching: p.move.crouching,
      onGround: p.move.onGround,
      health: Math.max(0, p.health),
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      characterId: p.characterId,
      weaponId: p.weaponId,
      respawnIn: p.alive ? 0 : Math.max(0, p.respawnTimer),
    };
  }

  /** Compact rounded signature used to detect whether a player changed. */
  private signature(s: NetPlayerState): string {
    const r = (n: number) => Math.round(n * 100) / 100;
    return `${r(s.x)},${r(s.y)},${r(s.z)},${r(s.yaw)},${r(s.pitch)},${s.moving ? 1 : 0},${s.crouching ? 1 : 0},${s.onGround ? 1 : 0},${s.health},${s.alive ? 1 : 0},${s.kills},${s.deaths},${Math.ceil(s.respawnIn)}`;
  }

  private broadcast(): void {
    if (this.ended) return;
    const now = Date.now();
    const all: NetPlayerState[] = [];
    const changed: NetPlayerState[] = [];
    const nextSent = new Map<string, string>();

    for (const p of this.players.values()) {
      const net = this.toNet(p);
      all.push(net);
      const sig = this.signature(net);
      nextSent.set(p.id, sig);
      if (this.lastSent.get(p.id) !== sig) changed.push(net);
    }

    const removed = this.removedSinceBroadcast;
    const timeRemaining = this.timeRemaining();

    for (const p of this.players.values()) {
      const full = this.needsFull.has(p.id);
      this.io.to(p.id).emit('game:snapshot', {
        tick: this.tick,
        serverTime: now,
        lastProcessedInput: p.lastProcessedInput,
        full,
        players: full ? all : changed,
        removed,
        scores: { ...this.scores },
        timeRemaining,
      });
      if (full) this.needsFull.delete(p.id);
    }

    this.lastSent.clear();
    for (const [id, sig] of nextSent) this.lastSent.set(id, sig);
    this.removedSinceBroadcast = [];
  }

  // ---- end ----

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    const winner: TeamId | 'draw' =
      this.scores.red === this.scores.blue ? 'draw' : this.scores.red > this.scores.blue ? 'red' : 'blue';
    this.io.to(this.code).emit('game:ended', {
      winner,
      scores: { ...this.scores },
      players: [...this.players.values()].map((p) => this.toNet(p)),
    });
    logger.info(`game ${this.code}: ended (winner=${winner}, red=${this.scores.red}, blue=${this.scores.blue})`);
    this.stop();
    this.onEnd();
  }
}

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};
