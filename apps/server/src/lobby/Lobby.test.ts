import { describe, expect, it } from 'vitest';
import { Lobby } from './Lobby';

const make = () => new Lobby('A4HF9P', 'p1');

describe('Lobby', () => {
  it('makes the first player the host and auto-balances teams on join', () => {
    const lobby = make();
    const p1 = lobby.addPlayer('p1', 'Alice');
    const p2 = lobby.addPlayer('p2', 'Bob');
    const p3 = lobby.addPlayer('p3', 'Cara');
    expect(p1?.isHost).toBe(true);
    expect(lobby.hostId).toBe('p1');
    // First → red, second → blue, third → red (smallest team).
    expect(p1?.team).toBe('red');
    expect(p2?.team).toBe('blue');
    expect(p3?.team).toBe('red');
    const counts = lobby.teamCounts();
    expect(counts.red).toBe(2);
    expect(counts.blue).toBe(1);
  });

  it('migrates the host when the host leaves', () => {
    const lobby = make();
    lobby.addPlayer('p1', 'Alice');
    lobby.addPlayer('p2', 'Bob');
    const { migratedHostTo } = lobby.removePlayer('p1');
    expect(migratedHostTo).toBe('p2');
    expect(lobby.hostId).toBe('p2');
    expect(lobby.get('p2')?.isHost).toBe(true);
  });

  it('reports empty after the last player leaves', () => {
    const lobby = make();
    lobby.addPlayer('p1', 'Alice');
    lobby.removePlayer('p1');
    expect(lobby.isEmpty()).toBe(true);
  });

  it('respects maxPlayers', () => {
    const lobby = make();
    lobby.updateSettings({ maxPlayers: 2 });
    expect(lobby.addPlayer('p1', 'A')).not.toBeNull();
    expect(lobby.addPlayer('p2', 'B')).not.toBeNull();
    expect(lobby.isFull()).toBe(true);
    expect(lobby.addPlayer('p3', 'C')).toBeNull();
  });

  it('can only start when all non-host players are ready', () => {
    const lobby = make();
    lobby.addPlayer('p1', 'Host');
    lobby.addPlayer('p2', 'Guest');
    expect(lobby.canStart()).toBe(false);
    lobby.setReady('p2', true);
    expect(lobby.canStart()).toBe(true);
    lobby.phase = 'in-game';
    expect(lobby.canStart()).toBe(false);
  });

  it('clamps maxPlayers to at least the current player count', () => {
    const lobby = make();
    lobby.addPlayer('p1', 'A');
    lobby.addPlayer('p2', 'B');
    lobby.addPlayer('p3', 'C');
    lobby.updateSettings({ maxPlayers: 1 });
    expect(lobby.settings.maxPlayers).toBeGreaterThanOrEqual(3);
  });
});
