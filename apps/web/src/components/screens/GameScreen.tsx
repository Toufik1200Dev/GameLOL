'use client';

/**
 * Top-level in-match screen. Builds the deterministic world from the start
 * payload seed, constructs the NetGameClient, wires authoritative socket events
 * into it + the HUD, and renders the 3D scene with overlays (click-to-play,
 * pause, scoreboard, victory).
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DEFAULT_MAX_HEARTS,
  buildGridCollision,
  generateWorld,
  scaleMapColliderData,
  type AABB,
  type CollisionWorld,
  type MapColliderData,
  type TeamId,
  type Vec3,
} from '@game/shared';
import { getSocket } from '../../lib/socket';
import { useLobbyStore } from '../../stores/lobbyStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import { useAssetStore } from '../../stores/assetStore';
import { useGameControls } from '../../game/input/useGameControls';
import { NetGameClient } from '../../game/net/NetGameClient';
import { GameScene, type SceneInfo } from '../r3f/GameScene';
import { GameErrorBoundary } from '../r3f/GameErrorBoundary';
import { HUD } from '../game/HUD';
import { TouchControls } from '../game/TouchControls';
import { LoadingScreen } from './LoadingScreen';
import { Button, Panel } from '../ui/primitives';

interface MatchSetup {
  client: NetGameClient;
  scene: SceneInfo;
  spawnYaw: number;
  worldSize: number;
}

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

  const [setup, setSetup] = useState<MatchSetup | null>(null);
  const [isTouch] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );
  const controls = useGameControls(0);

  // Resolve the map (procedural or GLB), fetch its collider data, and build the
  // net client. Async because GLB maps load their voxel colliders over the wire.
  useEffect(() => {
    if (!gameStart || !playerId) return;
    let cancelled = false;

    const build = async () => {
      await useAssetStore.getState().load();
      const manifest = useAssetStore.getState().manifest;
      const self = gameStart.players.find((p) => p.id === playerId);
      const team: TeamId = self?.team ?? 'red';
      const mapEntry = manifest.maps.find((m) => m.id === gameStart.mapId);

      let collision: CollisionWorld;
      let scene: SceneInfo;
      let spawn: { position: Vec3; yaw: number };
      let worldSize: number;

      if (mapEntry?.model && mapEntry.colliders) {
        // GLB map: fetch voxel colliders, apply the map's scale (render +
        // collision together), then render the model.
        const raw = (await (
          await fetch(mapEntry.colliders, { cache: 'no-cache' })
        ).json()) as MapColliderData;
        const mapScale = mapEntry.config.scale ?? 1;
        const data = scaleMapColliderData(raw, mapScale);
        const grid = buildGridCollision(data);
        const sizeX = data.bounds.max.x - data.bounds.min.x;
        const sizeZ = data.bounds.max.z - data.bounds.min.z;
        worldSize = Math.max(sizeX, sizeZ) / 2;

        // Turret base colliders (fixed real-world size, like the server) so client
        // prediction collides with turrets identically — no rubber-banding.
        const turretEntry = manifest.turrets?.[0] ?? null;
        const colliders: AABB[] = [...(data.colliders ?? [])];
        if (turretEntry && data.turrets) {
          const cs = turretEntry.config.colliderSize;
          for (const t of data.turrets) {
            colliders.push({
              min: { x: t.x - cs.x / 2, y: t.y, z: t.z - cs.z / 2 },
              max: { x: t.x + cs.x / 2, y: t.y + cs.y, z: t.z + cs.z / 2 },
            });
          }
        }

        collision = {
          colliders,
          grid,
          groundY: data.groundY,
          bounds: 0,
          boundsBox: {
            minX: data.bounds.min.x,
            maxX: data.bounds.max.x,
            minZ: data.bounds.min.z,
            maxZ: data.bounds.max.z,
          },
        };
        spawn = data.spawns[team]?.[0] ?? { position: { x: 0, y: data.groundY, z: 0 }, yaw: 0 };
        scene = {
          collision,
          proceduralWorld: null,
          mapModelUrl: mapEntry.model,
          mapModelOffsetY: (mapEntry.config.modelOffsetY ?? 0) * mapScale,
          mapScale,
          props: data.props ?? [],
          turret: turretEntry,
          skyColor: mapEntry.config.skyColor,
          fogColor: mapEntry.config.fogColor,
          groundColor: '#5fae54',
          size: worldSize,
          glb: true,
        };
      } else {
        // Procedural fallback.
        const world = generateWorld(gameStart.mapSeed);
        collision = { colliders: world.colliders, groundY: world.groundY, bounds: world.bounds };
        worldSize = world.size;
        spawn = world.spawns[team][0] ?? { position: { x: 0, y: 0, z: 0 } as Vec3, yaw: 0 };
        scene = {
          collision,
          proceduralWorld: world,
          mapModelUrl: null,
          mapModelOffsetY: 0,
          mapScale: 1,
          props: [],
          turret: null,
          skyColor: world.skyColor,
          fogColor: world.fogColor,
          groundColor: world.groundColor,
          size: world.size,
          glb: false,
        };
      }

      if (cancelled) return;
      controls.current.yaw = spawn.yaw;
      const client = new NetGameClient(getSocket(), playerId, collision, spawn.position);
      setSetup({ client, scene, spawnYaw: spawn.yaw, worldSize });
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, [gameStart, playerId, controls]);

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
      if (e.shooterId === playerId) useGameStore.getState().markHit(e.headshot);
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

  if (!setup) return <LoadingScreen />;

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

  const resume = () => {
    useGameStore.getState().setPaused(false);
    if (!isTouch) containerRef.current?.requestPointerLock?.();
  };

  return (
    <div ref={containerRef} className="relative h-full w-full bg-black">
      <GameErrorBoundary onLeave={leaveMatch}>
        <GameScene client={setup.client} scene={setup.scene} controls={controls.current} />
      </GameErrorBoundary>
      <HUD worldSize={setup.worldSize} />

      {/* On-screen controls for touch devices */}
      {isTouch && !paused && !ended && <TouchControls controls={controls} />}

      {/* Click-to-play prompt (desktop pointer-lock only) */}
      {!isTouch && !locked && !paused && !ended && (
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
