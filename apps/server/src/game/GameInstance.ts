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
  HEADSHOT_MULTIPLIER,
  INTERPOLATION_DELAY_MS,
  LAG_COMP_HISTORY_TICKS,
  PLAYER_HEIGHT,
  RESPAWN_INVULN_SEC,
  SNAPSHOT_RATE,
  SPRINT_MULTIPLIER,
  TICK_DURATION,
  TICK_RATE,
  buildGridCollision,
  clamp,
  createMoveState,
  generateWorld,
  playerHitBox,
  raycastPlayer,
  rayAABB,
  raycastGrid,
  stepMovement,
  type AABB,
  type ClientToServerEvents,
  type CollisionWorld,
  type GridCollision,
  type InterServerEvents,
  type LobbySettings,
  type MapColliderData,
  type MoveState,
  type MovementProfile,
  type NetPlayerState,
  type PlayerInput,
  type PlayerPublic,
  type ServerToClientEvents,
  type ShootCommand,
  type SocketData,
  type SpawnPoint,
  type TeamId,
  type TurretConfig,
  type TurretState,
  type Vec3,
  type WeaponConfig,
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

interface ServerProjectile {
  id: number;
  ownerId: string;
  team: TeamId;
  pos: Vec3;
  dir: Vec3;
  speed: number;
  damage: number;
  splashRadius: number;
  range: number;
  traveled: number;
}

interface ResolvedWeapon {
  damage: number;
  fireIntervalMs: number;
  range: number;
  projectileSpeed: number;
  splashRadius: number;
}

/** A live, authoritative combat turret instantiated from a map's turret spawns. */
interface ServerTurret {
  id: number;
  pos: Vec3;
  team: TeamId;
  baseYaw: number;
  yaw: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  firing: boolean;
  targetId: string | null;
  nextFireAt: number; // ms
  respawnTimer: number; // seconds
  collider: AABB;
  muzzleY: number;
}

/** Who dealt damage — a player (for kills/score) or a team turret. */
interface Attacker {
  id: string;
  name: string;
  team: TeamId;
  player: ServerPlayer | null;
}

const MAX_QUEUE = 64;
const PER_TICK_DT_BUDGET = TICK_DURATION * 2;
const PROJECTILE_MAX_LIFETIME = 6; // seconds

export class GameInstance {
  readonly code: string;
  private readonly io: GameServer;
  private readonly collisionWorld: CollisionWorld;
  private readonly grid: GridCollision | null;
  private readonly worldColliders: readonly AABB[];
  private readonly spawns: Record<TeamId, SpawnPoint[]>;
  private readonly groundY: number;
  private readonly settings: LobbySettings;
  private readonly players = new Map<string, ServerPlayer>();
  private readonly weapons: Map<string, WeaponConfig>;
  private readonly onEnd: () => void;

  private readonly projectiles: ServerProjectile[] = [];
  private nextProjectileId = 1;

  private readonly turrets: ServerTurret[] = [];
  private readonly turretCfg: TurretConfig;
  private simWorld: CollisionWorld | null = null;

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
    weapons: Map<string, WeaponConfig>,
    mapData: MapColliderData | null,
    turretConfig: TurretConfig,
    onEnd: () => void,
  ) {
    this.io = io;
    this.code = code;
    this.settings = settings;
    this.weapons = weapons;
    this.turretCfg = turretConfig;
    this.onEnd = onEnd;

    if (mapData) {
      // GLB map: voxel-grid collision + prop colliders + play-area box + spawns.
      this.grid = buildGridCollision(mapData);
      this.worldColliders = mapData.colliders ?? [];
      this.spawns = mapData.spawns;
      this.groundY = mapData.groundY;
      this.collisionWorld = {
        colliders: this.worldColliders,
        grid: this.grid,
        groundY: mapData.groundY,
        bounds: 0,
        boundsBox: {
          minX: mapData.bounds.min.x,
          maxX: mapData.bounds.max.x,
          minZ: mapData.bounds.min.z,
          maxZ: mapData.bounds.max.z,
        },
      };
    } else {
      // Procedural fallback.
      const world = generateWorld(seed);
      this.grid = null;
      this.worldColliders = world.colliders;
      this.spawns = world.spawns;
      this.groundY = world.groundY;
      this.collisionWorld = {
        colliders: world.colliders,
        groundY: world.groundY,
        bounds: world.bounds,
      };
    }

    for (const p of roster) this.addPlayer(p);

    // Instantiate team turrets from the map's baked spawns (already map-scaled).
    const cs = this.turretCfg.colliderSize;
    let turretId = 1;
    for (const t of mapData?.turrets ?? []) {
      const pos: Vec3 = { x: t.x, y: t.y, z: t.z };
      this.turrets.push({
        id: turretId++,
        pos,
        team: t.team,
        baseYaw: t.yaw,
        yaw: t.yaw,
        health: this.turretCfg.health,
        maxHealth: this.turretCfg.health,
        alive: true,
        firing: false,
        targetId: null,
        nextFireAt: 0,
        respawnTimer: 0,
        collider: {
          min: { x: pos.x - cs.x / 2, y: pos.y, z: pos.z - cs.z / 2 },
          max: { x: pos.x + cs.x / 2, y: pos.y + cs.y, z: pos.z + cs.z / 2 },
        },
        muzzleY: pos.y + cs.y * 0.6,
      });
    }
  }

  // ---- lifecycle ----

  start(): void {
    this.startTime = Date.now();
    this.tickTimer = setInterval(() => this.step(), 1000 / TICK_RATE);
    this.snapshotTimer = setInterval(() => this.broadcast(), 1000 / SNAPSHOT_RATE);
    logger.info(
      `game ${this.code}: started (${this.players.size} players, map=${this.grid ? 'glb' : 'procedural'})`,
    );
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

  /** Nearest static-world hit distance along a ray (voxel grid + AABB colliders). */
  private worldRayDistance(origin: Vec3, dir: Vec3, maxDist: number): number {
    let nearest = maxDist;
    if (this.grid) {
      const t = raycastGrid(this.grid, origin, dir, nearest);
      if (t !== null && t < nearest) nearest = t;
    }
    for (const box of this.worldColliders) {
      const t = rayAABB(origin, dir, box);
      if (t !== null && t < nearest) nearest = t;
    }
    return nearest;
  }

  /** Resolve a player's authoritative weapon stats (config or default fallback). */
  private resolveWeapon(player: ServerPlayer): ResolvedWeapon {
    const cfg = player.weaponId ? this.weapons.get(player.weaponId) : undefined;
    if (cfg) {
      return {
        damage: cfg.damage,
        fireIntervalMs: 60000 / cfg.fireRate,
        range: cfg.range,
        projectileSpeed: cfg.projectileSpeed,
        splashRadius: cfg.splashRadius,
      };
    }
    return {
      damage: DEFAULT_WEAPON.damage,
      fireIntervalMs: 60000 / DEFAULT_WEAPON.fireRateRpm,
      range: DEFAULT_WEAPON.range,
      projectileSpeed: 0,
      splashRadius: 0,
    };
  }

  handleShoot(id: string, cmd: ShootCommand): void {
    const shooter = this.players.get(id);
    if (!shooter || !shooter.alive) return;

    const weapon = this.resolveWeapon(shooter);
    const now = Date.now();
    if (now - shooter.lastFireTime < weapon.fireIntervalMs - 8) return; // rate limit
    shooter.lastFireTime = now;

    // Authoritative origin = server-side eye position (prevents origin spoofing).
    const origin: Vec3 = {
      x: shooter.move.position.x,
      y: shooter.move.position.y + EYE_HEIGHT,
      z: shooter.move.position.z,
    };
    const dir = normalize(cmd.dir);
    if (dir.x === 0 && dir.y === 0 && dir.z === 0) return;

    // Projectile weapon → spawn a travelling round; resolved on later ticks.
    if (weapon.projectileSpeed > 0) {
      const projectile: ServerProjectile = {
        id: this.nextProjectileId++,
        ownerId: shooter.id,
        team: shooter.team,
        pos: { x: origin.x + dir.x * 0.5, y: origin.y + dir.y * 0.5, z: origin.z + dir.z * 0.5 },
        dir,
        speed: weapon.projectileSpeed,
        damage: weapon.damage,
        splashRadius: weapon.splashRadius,
        range: weapon.range,
        traveled: 0,
      };
      this.projectiles.push(projectile);
      this.io.to(this.code).emit('game:projectile', {
        id: projectile.id,
        ownerId: shooter.id,
        x: projectile.pos.x,
        y: projectile.pos.y,
        z: projectile.pos.z,
        dx: dir.x,
        dy: dir.y,
        dz: dir.z,
        speed: weapon.projectileSpeed,
      });
      return;
    }

    // Hitscan: lag-compensate enemies to roughly when the shooter fired.
    const rewindTo = now - (INTERPOLATION_DELAY_MS + shooter.ping / 2);
    const rewound = this.positionsAt(rewindTo);

    // Start from the nearest static-world hit; players/turrets must beat it.
    let bestT = this.worldRayDistance(origin, dir, weapon.range);
    let victim: ServerPlayer | null = null;
    let victimTurret: ServerTurret | null = null;
    let headshot = false;

    for (const other of this.players.values()) {
      if (other.id === id || !other.alive) continue;
      if (other.team === shooter.team && !this.settings.friendlyFire) continue;
      const feet = rewound.get(other.id) ?? other.move.position;
      const hit = raycastPlayer(origin, dir, feet, bestT);
      if (hit) {
        bestT = hit.t;
        victim = other;
        victimTurret = null;
        headshot = hit.headshot;
      }
    }
    // Turret bases block shots (alive or wrecked); only alive enemy turrets take the hit.
    for (const tr of this.turrets) {
      const t = rayAABB(origin, dir, tr.collider);
      if (t === null || t < 0 || t >= bestT) continue;
      bestT = t;
      victim = null;
      headshot = false;
      victimTurret = tr.alive && tr.team !== shooter.team ? tr : null;
    }

    const point: Vec3 = {
      x: origin.x + dir.x * bestT,
      y: origin.y + dir.y * bestT,
      z: origin.z + dir.z * bestT,
    };
    if (victim) {
      const dmg = headshot ? weapon.damage * HEADSHOT_MULTIPLIER : weapon.damage;
      this.applyDamage(shooter, victim, dmg, point, headshot);
    } else if (victimTurret) {
      this.damageTurret(shooter, victimTurret, weapon.damage, point);
    }
  }

  /** Apply damage from a player shooter (thin wrapper over damagePlayer). */
  private applyDamage(
    shooter: ServerPlayer,
    victim: ServerPlayer,
    amount: number,
    point: Vec3,
    headshot = false,
  ): void {
    this.damagePlayer(
      { id: shooter.id, name: shooter.name, team: shooter.team, player: shooter },
      victim,
      amount,
      point,
      headshot,
    );
  }

  /** Apply damage to a player from any attacker (player or turret). Honours invuln. */
  private damagePlayer(
    attacker: Attacker,
    victim: ServerPlayer,
    amount: number,
    point: Vec3,
    headshot: boolean,
  ): void {
    if (!victim.alive || Date.now() < victim.invulnUntil) return;
    victim.health -= amount;
    const killed = victim.health <= 0;
    const payload = {
      shooterId: attacker.id,
      victimId: victim.id,
      damage: amount,
      victimHealth: Math.max(0, victim.health),
      killed,
      headshot,
      point,
    };
    if (attacker.player) this.io.to(attacker.player.id).emit('game:hit', payload);
    this.io.to(victim.id).emit('game:hit', payload);
    if (killed) this.killPlayer(attacker, victim);
  }

  /** Damage an enemy turret; destroy it (explosion + kill feed) at 0 health. */
  private damageTurret(
    shooter: ServerPlayer,
    turret: ServerTurret,
    amount: number,
    point: Vec3,
  ): void {
    if (!turret.alive) return;
    turret.health -= amount;
    this.io.to(shooter.id).emit('game:hit', {
      shooterId: shooter.id,
      victimId: `turret:${turret.id}`,
      damage: amount,
      victimHealth: Math.max(0, turret.health),
      killed: turret.health <= 0,
      headshot: false,
      point,
    });
    if (turret.health > 0) return;
    turret.health = 0;
    turret.alive = false;
    turret.firing = false;
    turret.targetId = null;
    turret.respawnTimer = this.turretCfg.respawnSec;
    this.io.to(this.code).emit('game:explosion', {
      id: -turret.id, // negative id ⇒ turret blast (distinct from projectile ids)
      x: turret.pos.x,
      y: turret.pos.y + this.turretCfg.colliderSize.y * 0.5,
      z: turret.pos.z,
      radius: 2.4,
    });
    this.io.to(this.code).emit('game:kill', {
      killerId: shooter.id,
      killerName: shooter.name,
      killerTeam: shooter.team,
      victimId: `turret:${turret.id}`,
      victimName: 'Turret',
      victimTeam: turret.team,
      weaponId: shooter.weaponId,
    });
  }

  /** Detonate a projectile: explosion VFX + direct/splash damage (players + turrets). */
  private detonate(
    p: ServerProjectile,
    point: Vec3,
    directVictim: ServerPlayer | null,
    directTurret: ServerTurret | null,
  ): void {
    this.io.to(this.code).emit('game:explosion', {
      id: p.id,
      x: point.x,
      y: point.y,
      z: point.z,
      radius: Math.max(0.4, p.splashRadius),
    });

    const owner = this.players.get(p.ownerId);
    if (!owner) return;

    if (p.splashRadius > 0) {
      for (const other of this.players.values()) {
        if (!other.alive || other.id === p.ownerId) continue;
        if (other.team === p.team && !this.settings.friendlyFire) continue;
        const cx = other.move.position.x;
        const cy = other.move.position.y + PLAYER_HEIGHT / 2;
        const cz = other.move.position.z;
        const dist = Math.hypot(cx - point.x, cy - point.y, cz - point.z);
        if (dist <= p.splashRadius) {
          const dmg = Math.max(1, Math.round(p.damage * (1 - dist / p.splashRadius)));
          this.applyDamage(owner, other, dmg, point);
        }
      }
      for (const tr of this.turrets) {
        if (!tr.alive || tr.team === p.team) continue;
        const cx = tr.pos.x;
        const cy = tr.pos.y + this.turretCfg.colliderSize.y / 2;
        const cz = tr.pos.z;
        const dist = Math.hypot(cx - point.x, cy - point.y, cz - point.z);
        if (dist <= p.splashRadius) {
          const dmg = Math.max(1, Math.round(p.damage * (1 - dist / p.splashRadius)));
          this.damageTurret(owner, tr, dmg, point);
        }
      }
    } else if (directVictim) {
      this.applyDamage(owner, directVictim, p.damage, point);
    } else if (directTurret) {
      this.damageTurret(owner, directTurret, p.damage, point);
    }
  }

  /** Advance travelling projectiles, detonating on player/world/ground impact. */
  private updateProjectiles(dt: number): void {
    if (this.projectiles.length === 0) return;
    const remaining: ServerProjectile[] = [];
    for (const p of this.projectiles) {
      const step = p.speed * dt;
      let hitT = step;
      let directVictim: ServerPlayer | null = null;
      let directTurret: ServerTurret | null = null;

      for (const other of this.players.values()) {
        if (other.id === p.ownerId || !other.alive) continue;
        if (other.team === p.team && !this.settings.friendlyFire) continue;
        const t = rayAABB(p.pos, p.dir, playerHitBox(other.move.position));
        if (t !== null && t >= 0 && t < hitT) {
          hitT = t;
          directVictim = other;
          directTurret = null;
        }
      }
      // Turret bases block projectiles; only alive enemy turrets take the direct hit.
      for (const tr of this.turrets) {
        const t = rayAABB(p.pos, p.dir, tr.collider);
        if (t === null || t < 0 || t >= hitT) continue;
        hitT = t;
        directVictim = null;
        directTurret = tr.alive && tr.team !== p.team ? tr : null;
      }
      const worldT = this.worldRayDistance(p.pos, p.dir, hitT);
      if (worldT < hitT) {
        hitT = worldT;
        directVictim = null;
        directTurret = null;
      }
      if (p.dir.y < 0) {
        const tGround = (this.groundY - p.pos.y) / p.dir.y;
        if (tGround >= 0 && tGround < hitT) {
          hitT = tGround;
          directVictim = null;
        }
      }

      const collided = hitT < step;
      const point: Vec3 = {
        x: p.pos.x + p.dir.x * hitT,
        y: p.pos.y + p.dir.y * hitT,
        z: p.pos.z + p.dir.z * hitT,
      };
      const lifetime = p.traveled / p.speed;
      if (collided || p.traveled + step >= p.range || lifetime > PROJECTILE_MAX_LIFETIME) {
        this.detonate(p, point, directVictim, directTurret);
        continue;
      }
      p.pos = {
        x: p.pos.x + p.dir.x * step,
        y: p.pos.y + p.dir.y * step,
        z: p.pos.z + p.dir.z * step,
      };
      p.traveled += step;
      remaining.push(p);
    }
    this.projectiles.length = 0;
    this.projectiles.push(...remaining);
  }

  private killPlayer(killer: Attacker, victim: ServerPlayer): void {
    victim.alive = false;
    victim.health = 0;
    victim.deaths += 1;
    victim.respawnTimer = this.settings.respawnDelaySec;
    if (killer.player) killer.player.kills += 1;
    this.scores[killer.team] += 1;

    this.io.to(this.code).emit('game:kill', {
      killerId: killer.id,
      killerName: killer.name,
      killerTeam: killer.team,
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      weaponId: killer.player?.weaponId ?? null,
    });

    if (this.scores[killer.team] >= this.settings.scoreLimit) this.end();
  }

  // ---- simulation ----

  private step(): void {
    if (this.ended) return;
    const now = Date.now();

    // Static colliders + live turret boxes, so players collide with turrets too.
    const world = this.movementWorld();

    for (const p of this.players.values()) {
      if (p.alive) {
        let budget = PER_TICK_DT_BUDGET;
        while (p.inputQueue.length > 0 && budget > 0) {
          const input = p.inputQueue.shift()!;
          p.move = stepMovement(p.move, input, p.profile, world);
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

    // Advance any travelling projectiles (rockets etc.).
    this.updateProjectiles(TICK_DURATION);

    // Team turrets: acquire targets, rotate, fire, rebuild.
    this.updateTurrets(now);

    this.tick += 1;

    if (this.timeRemaining() <= 0) this.end();
  }

  /**
   * Collision world for movement: static geometry + every turret base. Turret
   * bases stay solid whether alive or destroyed, so this is fixed for the match
   * and matches the client's collider set exactly (no prediction rubber-banding).
   */
  private movementWorld(): CollisionWorld {
    if (this.simWorld) return this.simWorld;
    this.simWorld =
      this.turrets.length > 0
        ? {
            ...this.collisionWorld,
            colliders: [...this.worldColliders, ...this.turrets.map((t) => t.collider)],
          }
        : this.collisionWorld;
    return this.simWorld;
  }

  // ---- turrets ----

  private updateTurrets(now: number): void {
    if (this.turrets.length === 0) return;
    const cfg = this.turretCfg;
    const fireIntervalMs = 60000 / cfg.fireRate;
    const maxTurn = cfg.rotateSpeed * TICK_DURATION;

    for (const tr of this.turrets) {
      tr.firing = false;
      if (!tr.alive) {
        if (cfg.respawnSec > 0) {
          tr.respawnTimer -= TICK_DURATION;
          if (tr.respawnTimer <= 0) {
            tr.alive = true;
            tr.health = tr.maxHealth;
            tr.yaw = tr.baseYaw;
            tr.targetId = null;
          }
        }
        continue;
      }

      const eye: Vec3 = { x: tr.pos.x, y: tr.muzzleY, z: tr.pos.z };
      let target = tr.targetId ? (this.players.get(tr.targetId) ?? null) : null;
      if (!this.turretCanSee(tr, target, eye, cfg.range)) {
        target = this.acquireTurretTarget(tr, eye, cfg.range);
      }
      tr.targetId = target?.id ?? null;
      if (!target) continue;

      const aim: Vec3 = {
        x: target.move.position.x,
        y: target.move.position.y + PLAYER_HEIGHT * 0.6,
        z: target.move.position.z,
      };
      // Game yaw convention: forward = (-sin(yaw), -cos(yaw)).
      const desiredYaw = Math.atan2(-(aim.x - eye.x), -(aim.z - eye.z));
      tr.yaw = rotateToward(tr.yaw, desiredYaw, maxTurn);

      if (Math.abs(angleDelta(tr.yaw, desiredYaw)) <= cfg.aimTolerance && now >= tr.nextFireAt) {
        tr.nextFireAt = now + fireIntervalMs;
        tr.firing = true;
        this.turretShoot(tr, eye, target, aim, cfg.range, cfg.damage);
      }
    }
  }

  /** Can this turret currently engage `target` (alive enemy, in range, line of sight)? */
  private turretCanSee(
    tr: ServerTurret,
    target: ServerPlayer | null,
    eye: Vec3,
    range: number,
  ): target is ServerPlayer {
    if (!target || !target.alive || target.team === tr.team) return false;
    const aim: Vec3 = {
      x: target.move.position.x,
      y: target.move.position.y + PLAYER_HEIGHT * 0.6,
      z: target.move.position.z,
    };
    const dx = aim.x - eye.x;
    const dy = aim.y - eye.y;
    const dz = aim.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > range || dist < 1e-3) return false;
    const dir: Vec3 = { x: dx / dist, y: dy / dist, z: dz / dist };
    return this.worldRayDistance(eye, dir, dist) >= dist - 0.2;
  }

  private acquireTurretTarget(tr: ServerTurret, eye: Vec3, range: number): ServerPlayer | null {
    let best: ServerPlayer | null = null;
    let bestDist = Infinity;
    for (const p of this.players.values()) {
      if (!this.turretCanSee(tr, p, eye, range)) continue;
      const d = Math.hypot(p.move.position.x - eye.x, p.move.position.z - eye.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private turretShoot(
    tr: ServerTurret,
    eye: Vec3,
    target: ServerPlayer,
    aim: Vec3,
    range: number,
    damage: number,
  ): void {
    const dx = aim.x - eye.x;
    const dy = aim.y - eye.y;
    const dz = aim.z - eye.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const dir: Vec3 = { x: dx / dist, y: dy / dist, z: dz / dist };

    const worldT = this.worldRayDistance(eye, dir, range);
    const hit = raycastPlayer(eye, dir, target.move.position, Math.min(range, worldT));
    const endT = hit ? hit.t : Math.min(range, worldT);
    const to: Vec3 = { x: eye.x + dir.x * endT, y: eye.y + dir.y * endT, z: eye.z + dir.z * endT };

    this.io.to(this.code).emit('game:turretFire', { id: tr.id, from: eye, to });

    if (hit) {
      const dmg = hit.headshot ? damage * HEADSHOT_MULTIPLIER : damage;
      this.damagePlayer(
        { id: `turret:${tr.id}`, name: 'Turret', team: tr.team, player: null },
        target,
        dmg,
        to,
        hit.headshot,
      );
    }
  }

  /** Interpolated player positions at a past server time (for lag comp). */
  private positionsAt(time: number): Map<string, Vec3> {
    const h = this.history;
    if (h.length === 0) return new Map();
    if (time <= h[0]!.time) return h[0]!.positions;
    if (time >= h[h.length - 1]!.time) return h[h.length - 1]!.positions;

    let a = h[0]!;
    let b = h[h.length - 1]!;
    for (let i = 0; i < h.length - 1; i++) {
      if (h[i]!.time <= time && h[i + 1]!.time >= time) {
        a = h[i]!;
        b = h[i + 1]!;
        break;
      }
    }
    const span = b.time - a.time;
    const f = span > 0 ? (time - a.time) / span : 0;
    const out = new Map<string, Vec3>();
    for (const [id, pa] of a.positions) {
      const pb = b.positions.get(id) ?? pa;
      out.set(id, {
        x: pa.x + (pb.x - pa.x) * f,
        y: pa.y + (pb.y - pa.y) * f,
        z: pa.z + (pb.z - pa.z) * f,
      });
    }
    return out;
  }

  private spawn(player: ServerPlayer): void {
    const spawns = this.spawns[player.team];
    const idx = this.spawnCursor[player.team] % spawns.length;
    this.spawnCursor[player.team] += 1;
    const spawn = spawns[idx]!;
    const spawnPosition = {
      x: spawn.position.x,
      y: Math.max(spawn.position.y, this.groundY),
      z: spawn.position.z,
    };
    player.move = createMoveState(spawnPosition, spawn.yaw);
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

  private turretsNet(): TurretState[] {
    return this.turrets.map((t) => ({
      id: t.id,
      x: t.pos.x,
      y: t.pos.y,
      z: t.pos.z,
      yaw: t.yaw,
      team: t.team,
      health: Math.max(0, t.health),
      maxHealth: t.maxHealth,
      alive: t.alive,
      firing: t.firing,
      respawnIn: t.alive ? 0 : Math.max(0, t.respawnTimer),
    }));
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
    const turrets = this.turretsNet();

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
        turrets,
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
      this.scores.red === this.scores.blue
        ? 'draw'
        : this.scores.red > this.scores.blue
          ? 'red'
          : 'blue';
    this.io.to(this.code).emit('game:ended', {
      winner,
      scores: { ...this.scores },
      players: [...this.players.values()].map((p) => this.toNet(p)),
    });
    logger.info(
      `game ${this.code}: ended (winner=${winner}, red=${this.scores.red}, blue=${this.scores.blue})`,
    );
    this.stop();
    this.onEnd();
  }
}

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

/** Shortest signed angular difference target - current, wrapped to [-PI, PI]. */
const angleDelta = (current: number, target: number): number => {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Rotate `current` toward `target` by at most `maxStep` radians. */
const rotateToward = (current: number, target: number, maxStep: number): number => {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
};
