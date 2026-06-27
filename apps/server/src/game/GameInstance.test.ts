import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_HEARTS,
  EYE_HEIGHT,
  createDefaultLobbySettings,
  type PlayerPublic,
} from '@game/shared';
import { GameInstance, type ServerPlayer } from './GameInstance';

type GameServerArg = ConstructorParameters<typeof GameInstance>[0];

interface Emitted {
  room: string;
  event: string;
  payload: unknown;
}

/** Minimal fake Socket.IO server that records emissions. */
function makeFakeIo(sink: Emitted[]): GameServerArg {
  return {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => sink.push({ room, event, payload }),
    }),
  } as unknown as GameServerArg;
}

const roster = (): PlayerPublic[] => [
  {
    id: 'a',
    name: 'Alice',
    team: 'red',
    isHost: true,
    ready: true,
    ping: 0,
    characterId: null,
    weaponId: null,
    kills: 0,
    deaths: 0,
    connected: true,
  },
  {
    id: 'b',
    name: 'Bob',
    team: 'blue',
    isHost: false,
    ready: true,
    ping: 0,
    characterId: null,
    weaponId: null,
    kills: 0,
    deaths: 0,
    connected: true,
  },
];

/** White-box accessor for the instance internals we drive in tests. */
interface Internals {
  players: Map<string, ServerPlayer>;
  world: { colliders: unknown[] };
  scores: Record<'red' | 'blue', number>;
}

function setup() {
  const sink: Emitted[] = [];
  const io = makeFakeIo(sink);
  const game = new GameInstance(io, 'TEST01', 'seed', createDefaultLobbySettings(), roster(), () => {});
  const internals = game as unknown as Internals;
  // Clear world colliders so line-of-sight is unobstructed for the test.
  internals.world.colliders.length = 0;
  const a = internals.players.get('a')!;
  const b = internals.players.get('b')!;
  // Place B 5m directly in front of A (A faces -Z).
  a.move.position = { x: 0, y: 0, z: 0 };
  b.move.position = { x: 0, y: 0, z: -5 };
  a.invulnUntil = 0;
  b.invulnUntil = 0;
  return { game, sink, a, b, internals };
}

const fireStraight = (game: GameInstance, shooter: ServerPlayer) => {
  shooter.lastFireTime = 0; // bypass rate limit between scripted shots
  game.handleShoot(shooter.id, {
    seq: 1,
    origin: { x: 0, y: EYE_HEIGHT, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    clientTime: Date.now(),
  });
};

describe('GameInstance combat', () => {
  it('lands a hit and decrements the victim health', () => {
    const { game, sink, a, b } = setup();
    fireStraight(game, a);
    expect(b.health).toBe(DEFAULT_MAX_HEARTS - 1);
    expect(sink.some((e) => e.event === 'game:hit')).toBe(true);
  });

  it('does not damage a friendly when friendly fire is off', () => {
    const { game, a, b, internals } = setup();
    b.team = 'red'; // same team as A
    internals.scores.red = 0;
    fireStraight(game, a);
    expect(b.health).toBe(DEFAULT_MAX_HEARTS);
  });

  it('respects spawn invulnerability', () => {
    const { game, a, b } = setup();
    b.invulnUntil = Date.now() + 1000;
    fireStraight(game, a);
    expect(b.health).toBe(DEFAULT_MAX_HEARTS);
  });

  it('kills after enough hits, awards a point, and starts a respawn timer', () => {
    const { game, sink, a, b, internals } = setup();
    for (let i = 0; i < DEFAULT_MAX_HEARTS; i++) {
      b.invulnUntil = 0;
      fireStraight(game, a);
    }
    expect(b.alive).toBe(false);
    expect(b.deaths).toBe(1);
    expect(a.kills).toBe(1);
    expect(internals.scores.red).toBe(1);
    expect(b.respawnTimer).toBeGreaterThan(0);
    expect(sink.some((e) => e.event === 'game:kill')).toBe(true);
  });

  it('misses when aimed away from the target', () => {
    const { game, a, b } = setup();
    a.lastFireTime = 0;
    game.handleShoot('a', {
      seq: 1,
      origin: { x: 0, y: EYE_HEIGHT, z: 0 },
      dir: { x: 1, y: 0, z: 0 }, // perpendicular, B is at -Z
      clientTime: Date.now(),
    });
    expect(b.health).toBe(DEFAULT_MAX_HEARTS);
  });
});
