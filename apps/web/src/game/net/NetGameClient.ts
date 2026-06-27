/**
 * Client-side netcode brain for an in-progress match.
 *
 * - Client-side prediction: applies local input immediately via the SHARED
 *   movement step and buffers unacknowledged inputs.
 * - Server reconciliation: on each snapshot, rebases the local player to the
 *   authoritative state and replays still-pending inputs (no rubber-banding).
 * - Entity interpolation: remote players are rendered ~100 ms in the past from a
 *   snapshot buffer, so their motion is smooth and jitter-free.
 *
 * Per-frame transforms are read from here via refs by the R3F scene; HUD-facing
 * values are pushed into the game store.
 */
import {
  BASE_SPEED,
  DEFAULT_JUMP_HEIGHT,
  INTERPOLATION_DELAY_MS,
  SPRINT_MULTIPLIER,
  createMoveState,
  lerp,
  lerpAngle,
  stepMovement,
  type CollisionWorld,
  type GameSnapshot,
  type MoveState,
  type MovementProfile,
  type NetPlayerState,
  type PlayerInput,
  type Vec3,
} from '@game/shared';
import type { ClientSocket } from '../../lib/socket';
import { useGameStore } from '../../stores/gameStore';

const PROFILE: MovementProfile = {
  speed: BASE_SPEED,
  sprintMultiplier: SPRINT_MULTIPLIER,
  jumpHeight: DEFAULT_JUMP_HEIGHT,
};

export interface InputState {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
}

interface RemoteSample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface RemoteRenderState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  moving: boolean;
  crouching: boolean;
  team: NetPlayerState['team'];
  characterId: string | null;
  alive: boolean;
}

interface RemoteEntity {
  buffer: RemoteSample[];
  latest: NetPlayerState;
}

const fromNet = (p: NetPlayerState): MoveState => ({
  position: { x: p.x, y: p.y, z: p.z },
  velocity: { x: 0, y: p.vy, z: 0 },
  yaw: p.yaw,
  pitch: p.pitch,
  onGround: p.onGround,
  crouching: p.crouching,
});

export class NetGameClient {
  readonly selfId: string;
  private readonly socket: ClientSocket;
  private readonly world: CollisionWorld;

  /** Authoritative-after-replay predicted state (drives logic + shooting). */
  predicted: MoveState;
  /** Smoothed render state (drives camera + mesh) to hide reconciliation pops. */
  render: MoveState;

  private seq = 0;
  private pending: PlayerInput[] = [];
  private remotes = new Map<string, RemoteEntity>();
  private netPlayers = new Map<string, NetPlayerState>();
  private serverTimeOffset = 0;
  private offsetInit = false;
  private alive = true;

  constructor(socket: ClientSocket, selfId: string, world: CollisionWorld, spawn: Vec3) {
    this.socket = socket;
    this.selfId = selfId;
    this.world = world;
    this.predicted = createMoveState(spawn);
    this.render = createMoveState(spawn);
  }

  // ---- per-frame: sample input, predict, send ----

  update(dt: number, input: InputState): void {
    this.seq += 1;
    const frame: PlayerInput = {
      seq: this.seq,
      moveX: input.moveX,
      moveZ: input.moveZ,
      yaw: input.yaw,
      pitch: input.pitch,
      jump: input.jump,
      sprint: input.sprint,
      crouch: input.crouch,
      dt: Math.min(dt, 0.05),
    };

    this.socket.emit('game:input', frame);

    if (this.alive) {
      this.pending.push(frame);
      this.predicted = stepMovement(this.predicted, frame, PROFILE, this.world);
    }

    // Ease render state toward predicted to smooth small corrections.
    const k = 1 - Math.exp(-18 * dt);
    this.render.position.x = lerp(this.render.position.x, this.predicted.position.x, k);
    this.render.position.y = lerp(this.render.position.y, this.predicted.position.y, k);
    this.render.position.z = lerp(this.render.position.z, this.predicted.position.z, k);
    this.render.yaw = this.predicted.yaw;
    this.render.pitch = this.predicted.pitch;
    this.render.crouching = this.predicted.crouching;
    this.render.onGround = this.predicted.onGround;
  }

  // ---- snapshot handling: reconcile self + buffer remotes ----

  onSnapshot(snap: GameSnapshot): void {
    const offset = snap.serverTime - performance.now();
    if (!this.offsetInit) {
      this.serverTimeOffset = offset;
      this.offsetInit = true;
    } else {
      this.serverTimeOffset = lerp(this.serverTimeOffset, offset, 0.05);
    }

    // Merge delta into the full net-player map.
    if (snap.full) this.netPlayers.clear();
    for (const p of snap.players) this.netPlayers.set(p.id, p);
    for (const id of snap.removed) {
      this.netPlayers.delete(id);
      this.remotes.delete(id);
    }

    const self = snap.players.find((p) => p.id === this.selfId);
    if (self) {
      this.alive = self.alive;
      // Reconcile: rebase to authoritative state, drop acked inputs, replay rest.
      this.pending = this.pending.filter((i) => i.seq > snap.lastProcessedInput);
      let state = fromNet(self);
      if (self.alive) {
        for (const inp of this.pending) state = stepMovement(state, inp, PROFILE, this.world);
      } else {
        this.pending = [];
      }
      const dx = state.position.x - this.predicted.position.x;
      const dy = state.position.y - this.predicted.position.y;
      const dz = state.position.z - this.predicted.position.z;
      const err = Math.hypot(dx, dy, dz);
      this.predicted = state;
      if (err > 3) {
        // Big correction (respawn / teleport): snap the render state too.
        this.render = { ...state, position: { ...state.position } };
      }
    }

    // Buffer remote players for interpolation.
    for (const p of snap.players) {
      if (p.id === this.selfId) continue;
      let ent = this.remotes.get(p.id);
      if (!ent) {
        ent = { buffer: [], latest: p };
        this.remotes.set(p.id, ent);
      }
      ent.latest = p;
      ent.buffer.push({ t: snap.serverTime, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
      if (ent.buffer.length > 24) ent.buffer.shift();
    }

    this.pushHud(snap, self);
  }

  private pushHud(snap: GameSnapshot, self: NetPlayerState | undefined): void {
    const store = useGameStore.getState();
    const patch: Parameters<typeof store.setHud>[0] = {
      scores: snap.scores,
      timeRemaining: snap.timeRemaining,
      roster: [...this.netPlayers.values()],
    };
    if (self) {
      patch.hearts = self.health;
      patch.alive = self.alive;
      patch.respawnIn = self.respawnIn;
      patch.kills = self.kills;
      patch.deaths = self.deaths;
    }
    store.setHud(patch);
  }

  // ---- remote interpolation ----

  renderTime(): number {
    return performance.now() + this.serverTimeOffset - INTERPOLATION_DELAY_MS;
  }

  remoteIds(): string[] {
    return [...this.remotes.keys()];
  }

  sampleRemote(id: string): RemoteRenderState | null {
    const ent = this.remotes.get(id);
    if (!ent || ent.buffer.length === 0) return null;
    const t = this.renderTime();
    const buf = ent.buffer;

    let a = buf[0]!;
    let b = buf[buf.length - 1]!;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i]!.t <= t && buf[i + 1]!.t >= t) {
        a = buf[i]!;
        b = buf[i + 1]!;
        break;
      }
    }
    const span = b.t - a.t;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;

    return {
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      z: lerp(a.z, b.z, f),
      yaw: lerpAngle(a.yaw, b.yaw, f),
      pitch: lerp(a.pitch, b.pitch, f),
      moving: ent.latest.moving,
      crouching: ent.latest.crouching,
      team: ent.latest.team,
      characterId: ent.latest.characterId,
      alive: ent.latest.alive,
    };
  }

  // ---- shooting ----

  shoot(origin: Vec3, dir: Vec3): void {
    this.socket.emit('game:shoot', {
      seq: this.seq,
      origin,
      dir,
      clientTime: Date.now(),
    });
  }
}
