'use client';

/**
 * Top-level in-match screen. Builds the deterministic world from the start
 * payload seed, constructs the NetGameClient, wires authoritative socket events
 * into it + the HUD, and renders the 3D scene with overlays (click-to-play,
 * pause, scoreboard, victory).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DEFAULT_MAX_HEARTS, generateWorld, type TeamId, type Vec3 } from '@game/shared';
import { getSocket } from '../../lib/socket';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import { useAssetStore } from '../../stores/assetStore';
import { useGameControls } from '../../game/input/useGameControls';
import { NetGameClient } from '../../game/net/NetGameClient';
import { GameScene } from '../r3f/GameScene';
import { HUD } from '../game/HUD';
import { Button, Panel } from '../ui/primitives';

const TEAM_COLOR: Record<TeamId, string> = { red: '#ff4d5e', blue: '#4c8bff' };
const TEAM_LABEL: Record<TeamId | 'draw', string> = {
  red: 'Red Team',
  blue: 'Blue Team',
  draw: 'Draw',
};

export function GameScreen() {
  const gameStart = useLobbyStore((s) => s.gameStart);
  const playerId = useLobbyStore((s) => s.playerId);
  const setScreen = useUIStore((s) => s.setScreen);
  const containerRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);

  const paused = useGameStore((s) => s.paused);
  const ended = useGameStore((s) => s.ended);
  const scoreboardOpen = useGameStore((s) => s.scoreboardOpen);

  // Build the world + client ONCE from the start payload.
  const setup = useMemo(() => {
    if (!gameStart || !playerId) return null;
    const world = generateWorld(gameStart.mapSeed, {
      size: undefined,
    });
    const self = gameStart.players.find((p) => p.id === playerId);
    const team: TeamId = self?.team ?? 'red';
    const spawn = world.spawns[team][0] ?? { position: { x: 0, y: 0, z: 0 } as Vec3, yaw: 0 };
    const collisionWorld = {
      colliders: world.colliders,
      groundY: world.groundY,
      bounds: world.bounds,
    };
    const client = new NetGameClient(getSocket(), playerId, collisionWorld, spawn.position);
    return { world, client, spawnYaw: spawn.yaw };
  }, [gameStart, playerId]);

  const controls = useGameControls(setup?.spawnYaw ?? 0);

  // Ensure the asset manifest is available for in-game character/weapon models.
  useEffect(() => {
    useAssetStore.getState().load();
  }, []);

  // Wire authoritative events.
  useEffect(() => {
    if (!setup || !playerId) return;
    const socket = getSocket();
    const store = useGameStore.getState();
    store.resetMatch();
    store.setSelfId(playerId);
    store.setHud({
      maxHearts: DEFAULT_MAX_HEARTS,
      hearts: DEFAULT_MAX_HEARTS,
      ammo: 30,
      magazine: 30,
    });

    const onSnapshot = setup.client.onSnapshot.bind(setup.client);
    socket.on('game:snapshot', onSnapshot);
    socket.on('game:hit', (e) => {
      if (e.shooterId === playerId) useGameStore.getState().markHit();
      if (e.victimId === playerId) useGameStore.getState().markDamage();
    });
    socket.on('game:kill', (e) => {
      useGameStore.getState().pushKill({
        killerName: e.killerName,
        killerTeam: e.killerTeam,
        victimName: e.victimName,
        victimTeam: e.victimTeam,
      });
    });
    socket.on('game:ended', (payload) => {
      useGameStore.getState().setEnded({ winner: payload.winner, scores: payload.scores });
      document.exitPointerLock?.();
    });

    const onLockChange = () => setLocked(document.pointerLockElement != null);
    document.addEventListener('pointerlockchange', onLockChange);

    return () => {
      socket.off('game:snapshot', onSnapshot);
      socket.off('game:hit');
      socket.off('game:kill');
      socket.off('game:ended');
      document.removeEventListener('pointerlockchange', onLockChange);
      document.exitPointerLock?.();
    };
  }, [setup, playerId]);

  if (!setup) return null;

  const leaveMatch = () => {
    getSocket().emit('game:leaveMatch');
    document.exitPointerLock?.();
    useGameStore.getState().resetMatch();
    useLobbyStore.getState().reset();
    setScreen('menu');
  };

  const returnToLobby = () => {
    document.exitPointerLock?.();
    useGameStore.getState().resetMatch();
    setScreen('lobby');
  };

  const resume = () => containerRef.current?.requestPointerLock?.();

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black">
      <GameScene client={setup.client} world={setup.world} controls={controls.current} />
      <HUD worldSize={setup.world.size} />

      {/* Click-to-play prompt */}
      {!locked && !paused && !ended && (
        <div
          className="absolute inset-0 flex cursor-pointer items-center justify-center"
          onClick={() => containerRef.current?.requestPointerLock?.()}
        >
          <Panel className="px-8 py-6 text-center">
            <p className="font-display text-2xl font-bold">Click to play</p>
            <p className="mt-2 max-w-md text-xs text-white/50">
              WASD move · Space jump · Shift sprint · C crouch · Left-click shoot · Right-click aim
              · R reload · V camera · Tab scoreboard · Esc pause
            </p>
          </Panel>
        </div>
      )}

      {/* Scoreboard (Tab) */}
      <AnimatePresence>{scoreboardOpen && <Scoreboard />}</AnimatePresence>

      {/* Pause menu */}
      <AnimatePresence>
        {paused && !ended && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <Panel className="flex w-72 flex-col gap-3 p-6">
              <h2 className="font-display text-center text-2xl font-bold">Paused</h2>
              <Button onClick={resume}>Resume</Button>
              <Button variant="ghost" onClick={() => setScreen('settings')}>
                Settings
              </Button>
              <Button variant="danger" onClick={leaveMatch}>
                Leave Match
              </Button>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Victory screen */}
      <AnimatePresence>
        {ended && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/70"
          >
            <Panel className="flex w-96 flex-col items-center gap-4 p-8 text-center">
              <p className="text-sm uppercase tracking-widest text-white/40">Match Over</p>
              <h1
                className="font-display text-4xl font-bold"
                style={{ color: ended.winner === 'draw' ? '#fff' : TEAM_COLOR[ended.winner] }}
              >
                {TEAM_LABEL[ended.winner]} {ended.winner !== 'draw' && 'Wins'}
              </h1>
              <div className="flex items-center gap-6 text-3xl font-bold">
                <span style={{ color: TEAM_COLOR.red }}>{ended.scores.red}</span>
                <span className="text-white/30">—</span>
                <span style={{ color: TEAM_COLOR.blue }}>{ended.scores.blue}</span>
              </div>
              <Button onClick={returnToLobby} className="mt-2">
                Return to Lobby
              </Button>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Scoreboard() {
  const roster = useGameStore((s) => s.roster);
  const scores = useGameStore((s) => s.scores);
  const sorted = [...roster].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <Panel className="w-[28rem] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-lg font-bold" style={{ color: TEAM_COLOR.red }}>
            Red {scores.red}
          </span>
          <span className="font-display text-lg font-bold" style={{ color: TEAM_COLOR.blue }}>
            Blue {scores.blue}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
          <span className="text-xs uppercase text-white/40">Player</span>
          <span className="text-xs uppercase text-white/40">K</span>
          <span className="text-xs uppercase text-white/40">D</span>
          {sorted.map((p) => (
            <FragmentRow key={p.id} name={p.name} team={p.team} kills={p.kills} deaths={p.deaths} />
          ))}
        </div>
      </Panel>
    </motion.div>
  );
}

function FragmentRow({
  name,
  team,
  kills,
  deaths,
}: {
  name: string;
  team: TeamId;
  kills: number;
  deaths: number;
}) {
  return (
    <>
      <span className="truncate" style={{ color: TEAM_COLOR[team] }}>
        {name}
      </span>
      <span className="text-right tabular-nums">{kills}</span>
      <span className="text-right tabular-nums text-white/60">{deaths}</span>
    </>
  );
}
