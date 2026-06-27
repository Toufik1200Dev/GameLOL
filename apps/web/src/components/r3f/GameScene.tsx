'use client';

/**
 * The in-match 3D scene: Canvas + environment (sky/fog/lights), the procedural
 * world, players, and the per-frame GameLoop that drives prediction, the
 * third/first-person camera (with collision + aim zoom + sprint FOV), shooting,
 * tracer VFX and the FPS counter. Post-processing (tone mapping + bloom) is
 * gated by the graphics-quality setting.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, Sky } from '@react-three/drei';
import * as THREE from 'three';
import {
  CROUCH_EYE_HEIGHT,
  DEFAULT_WEAPON,
  EYE_HEIGHT,
  fireInterval,
  rayAABB,
  raycastGrid,
  type CollisionWorld,
  type GeneratedWorld,
} from '@game/shared';
import { useGameStore } from '../../stores/gameStore';
import { useAssetStore } from '../../stores/assetStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getSocket } from '../../lib/socket';
import type { NetGameClient } from '../../game/net/NetGameClient';
import type { ControlsRef } from '../../game/input/useGameControls';
import { World } from './World';
import { MapModel } from './MapModel';
import { Players } from './Players';
import { WeaponModel } from './CharacterModel';

/** Everything the scene needs to render + collide, for procedural OR GLB maps. */
export interface SceneInfo {
  collision: CollisionWorld;
  proceduralWorld: GeneratedWorld | null;
  mapModelUrl: string | null;
  skyColor: string;
  fogColor: string;
  groundColor: string;
  size: number;
  glb: boolean;
}

interface Tracer {
  id: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  born: number;
}

const TRACER_LIFE = 90;

function SceneEnv({ scene }: { scene: SceneInfo }) {
  const size = scene.size;
  if (scene.glb) {
    // GLB maps ship their own (often baked) look — light them softly, no daytime
    // sun/sky, and keep player shadows only.
    return (
      <>
        <fog attach="fog" args={[scene.fogColor, size * 0.9, size * 3]} />
        <ambientLight intensity={0.85} />
        <hemisphereLight intensity={0.5} color={scene.skyColor} groundColor="#05070d" />
        <directionalLight
          castShadow
          position={[size * 0.6, size * 1.4, size * 0.4]}
          intensity={0.6}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0005}
          shadow-camera-near={1}
          shadow-camera-far={size * 4}
          shadow-camera-left={-size}
          shadow-camera-right={size}
          shadow-camera-top={size}
          shadow-camera-bottom={-size}
        />
      </>
    );
  }
  return (
    <>
      <Sky distance={450000} sunPosition={[120, 60, 80]} turbidity={5} rayleigh={2.2} />
      <fog attach="fog" args={[scene.fogColor, size * 0.85, size * 2.6]} />
      <ambientLight intensity={0.3} />
      <hemisphereLight intensity={0.55} color={scene.skyColor} groundColor={scene.groundColor} />
      <directionalLight
        castShadow
        position={[size * 0.8, size * 1.2, size * 0.6]}
        intensity={1.7}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-camera-near={1}
        shadow-camera-far={size * 4}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
      />
    </>
  );
}

function Tracers({ pool }: { pool: React.MutableRefObject<Tracer[]> }) {
  // Re-render only while tracers are active (transient bursts); idle = no churn.
  const [, force] = useState(0);
  useFrame(() => {
    if (pool.current.length === 0) return;
    const now = performance.now();
    pool.current = pool.current.filter((t) => now - t.born < TRACER_LIFE);
    force((n) => n + 1);
  });
  return (
    <group>
      {pool.current.map((t) => {
        const age = (performance.now() - t.born) / TRACER_LIFE;
        return (
          <Line
            key={t.id}
            points={[t.start, t.end]}
            color="#ffd27a"
            lineWidth={2}
            transparent
            opacity={Math.max(0, 1 - age)}
          />
        );
      })}
    </group>
  );
}

function GameLoop({
  client,
  collision,
  controls,
  pool,
}: {
  client: NetGameClient;
  collision: CollisionWorld;
  controls: ControlsRef;
  pool: React.MutableRefObject<Tracer[]>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const lastShot = useRef(0);
  const reloadUntil = useRef(0);
  const tracerId = useRef(0);
  const magInit = useRef(false);
  const fpsAcc = useRef({ t: 0, n: 0 });
  const baseFov = useRef(useSettingsStore.getState().fov);

  useEffect(() => {
    const unsub = useSettingsStore.subscribe((s) => {
      baseFov.current = s.fov;
    });
    return unsub;
  }, []);

  useFrame((_state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const c = controls;
    const store = useGameStore.getState();
    const paused = store.paused || store.ended != null;
    const alive = store.alive;
    const active = c.pointerLocked && !paused;

    // 1) sample input → prediction + send
    client.update(dt, {
      moveX: active ? c.moveX : 0,
      moveZ: active ? c.moveZ : 0,
      yaw: c.yaw,
      pitch: c.pitch,
      jump: active ? c.jump : false,
      sprint: active && c.sprint,
      crouch: active && c.crouch,
    });

    // 2) aim direction
    const cosP = Math.cos(c.pitch);
    const dir = new THREE.Vector3(
      -Math.sin(c.yaw) * cosP,
      Math.sin(c.pitch),
      -Math.cos(c.yaw) * cosP,
    ).normalize();

    // 3) camera (third / first person with collision, aim zoom, sprint FOV)
    const eyeY = c.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    const head = new THREE.Vector3(
      client.render.position.x,
      client.render.position.y + eyeY,
      client.render.position.z,
    );
    const sprinting = c.sprint && c.moveZ > 0 && !c.aim;
    const targetFov = c.aim
      ? baseFov.current * 0.7
      : sprinting
        ? baseFov.current * 1.08
        : baseFov.current;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-10 * dt));
    camera.updateProjectionMatrix();

    if (c.firstPerson) {
      camera.position.copy(head);
      camera.lookAt(head.clone().add(dir));
    } else {
      let dist = c.aim ? 2.2 : 4.6;
      const back = dir.clone().multiplyScalar(-1);
      const backVec = { x: back.x, y: back.y, z: back.z };
      const headVec = { x: head.x, y: head.y, z: head.z };
      if (collision.grid) {
        const t = raycastGrid(collision.grid, headVec, backVec, dist);
        if (t !== null && t > 0) dist = Math.max(1, t - 0.3);
      } else {
        for (const box of collision.colliders) {
          const t = rayAABB(headVec, backVec, box);
          if (t !== null && t > 0 && t < dist) dist = Math.max(1, t - 0.3);
        }
      }
      const camPos = head.clone().add(back.multiplyScalar(dist));
      camera.position.lerp(camPos, 1 - Math.exp(-30 * dt));
      camera.lookAt(head.clone().add(dir.clone().multiplyScalar(8)));
    }

    // 4) shooting + reload — resolve the local player's selected weapon stats.
    const selfWeaponId = store.roster.find((p) => p.id === client.selfId)?.weaponId ?? null;
    const weapon = selfWeaponId
      ? useAssetStore.getState().manifest.weapons.find((w) => w.id === selfWeaponId)?.config
      : undefined;
    if (!magInit.current && weapon) {
      store.setHud({ magazine: weapon.magazine, ammo: weapon.magazine });
      magInit.current = true;
    }
    const interval = weapon ? 60000 / weapon.fireRate : fireInterval(DEFAULT_WEAPON) * 1000;
    const range = weapon?.range ?? DEFAULT_WEAPON.range;
    const isProjectile = (weapon?.projectileSpeed ?? 0) > 0;
    const reloadMs = (weapon?.reloadSpeed ?? 1.8) * 1000;
    const recoil = weapon?.recoil ?? 0.3;

    const now = performance.now();
    if (store.reloading && now >= reloadUntil.current) {
      store.setHud({ reloading: false, ammo: store.magazine });
    }
    if (!store.reloading && (c.reload || store.ammo <= 0) && store.ammo < store.magazine && alive) {
      store.setHud({ reloading: true });
      reloadUntil.current = now + reloadMs;
    }
    if (
      c.shoot &&
      alive &&
      active &&
      !store.reloading &&
      store.ammo > 0 &&
      now - lastShot.current >= interval
    ) {
      lastShot.current = now;
      store.setHud({ ammo: store.ammo - 1 });
      const origin = { x: head.x, y: head.y, z: head.z };
      client.shoot(origin, { x: dir.x, y: dir.y, z: dir.z });
      // Hitscan weapons draw a tracer; projectile weapons are rendered from the
      // server's projectile event (see CombatVFX).
      if (!isProjectile) {
        const start = head.clone().add(dir.clone().multiplyScalar(0.6));
        const end = head.clone().add(dir.clone().multiplyScalar(range));
        pool.current.push({ id: ++tracerId.current, start, end, born: now });
        if (pool.current.length > 24) pool.current.shift();
      }
      // Recoil kick (scaled by weapon recoil).
      c.pitch = Math.min(1.4, c.pitch + Math.min(0.05, recoil * 0.03));
    }

    // 5) fps
    fpsAcc.current.t += dt;
    fpsAcc.current.n += 1;
    if (fpsAcc.current.t >= 0.5) {
      store.setHud({ fps: Math.round(fpsAcc.current.n / fpsAcc.current.t) });
      fpsAcc.current.t = 0;
      fpsAcc.current.n = 0;
    }
  });

  return null;
}

interface ActiveProjectile {
  id: number;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  born: number;
}
interface ActiveExplosion {
  id: number;
  pos: THREE.Vector3;
  radius: number;
  born: number;
}
const PROJECTILE_LIFE = 6000;
const EXPLOSION_LIFE = 500;

/** Renders travelling projectiles + explosion flashes from server combat events. */
function CombatVFX() {
  const projectiles = useRef<Map<number, ActiveProjectile>>(new Map());
  const explosions = useRef<ActiveExplosion[]>([]);
  const prevHad = useRef(false);
  const [, force] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    const onProjectile = (p: {
      id: number;
      x: number;
      y: number;
      z: number;
      dx: number;
      dy: number;
      dz: number;
      speed: number;
    }) => {
      projectiles.current.set(p.id, {
        id: p.id,
        pos: new THREE.Vector3(p.x, p.y, p.z),
        dir: new THREE.Vector3(p.dx, p.dy, p.dz),
        speed: p.speed,
        born: performance.now(),
      });
    };
    const onExplosion = (e: { id: number; x: number; y: number; z: number; radius: number }) => {
      projectiles.current.delete(e.id);
      explosions.current.push({
        id: e.id,
        pos: new THREE.Vector3(e.x, e.y, e.z),
        radius: e.radius,
        born: performance.now(),
      });
    };
    socket.on('game:projectile', onProjectile);
    socket.on('game:explosion', onExplosion);
    return () => {
      socket.off('game:projectile', onProjectile);
      socket.off('game:explosion', onExplosion);
    };
  }, []);

  useFrame((_s, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    for (const [id, p] of projectiles.current) {
      p.pos.addScaledVector(p.dir, p.speed * dt);
      if (now - p.born > PROJECTILE_LIFE) projectiles.current.delete(id);
    }
    if (explosions.current.length) {
      explosions.current = explosions.current.filter((e) => now - e.born < EXPLOSION_LIFE);
    }
    const has = projectiles.current.size > 0 || explosions.current.length > 0;
    if (has || prevHad.current) force((n) => n + 1);
    prevHad.current = has;
  });

  return (
    <group>
      {[...projectiles.current.values()].map((p) => (
        <mesh key={p.id} position={p.pos}>
          <sphereGeometry args={[0.18, 10, 10]} />
          <meshStandardMaterial
            color="#ffb020"
            emissive="#ff7a00"
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
      ))}
      {explosions.current.map((e) => {
        const age = (performance.now() - e.born) / EXPLOSION_LIFE;
        const scale = e.radius * (0.4 + age * 0.9);
        return (
          <mesh key={e.id} position={e.pos} scale={scale}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color="#ff7a2a"
              emissive="#ff5500"
              emissiveIntensity={2}
              transparent
              opacity={Math.max(0, 1 - age)}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** First-person weapon viewmodel for the local player (follows the camera). */
function FirstPersonViewmodel({
  client,
  controls,
}: {
  client: NetGameClient;
  controls: ControlsRef;
}) {
  const camera = useThree((s) => s.camera);
  const ref = useRef<THREE.Group>(null);
  const manifest = useAssetStore((s) => s.manifest);
  const weaponId = useGameStore(
    (s) => s.roster.find((p) => p.id === client.selfId)?.weaponId ?? null,
  );
  const weapon = weaponId ? manifest.weapons.find((w) => w.id === weaponId) : undefined;

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = controls.firstPerson && Boolean(weapon);
    if (!g.visible) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(0.18);
    g.translateY(-0.18);
    g.translateZ(-0.4);
  });

  if (!weapon) return null;
  return (
    <group ref={ref}>
      <WeaponModel url={weapon.model} config={weapon.config} />
    </group>
  );
}

export function GameScene({
  client,
  scene,
  controls,
}: {
  client: NetGameClient;
  scene: SceneInfo;
  controls: ControlsRef;
}) {
  const quality = useSettingsStore((s) => s.graphicsQuality);
  const fov = useSettingsStore((s) => s.fov);
  const pool = useRef<Tracer[]>([]);
  const dpr = useMemo<[number, number]>(
    () => (quality === 'low' ? [0.7, 1] : quality === 'medium' ? [1, 1.25] : [1, 1.5]),
    [quality],
  );

  return (
    <Canvas
      shadows={quality === 'high'}
      dpr={dpr}
      gl={{
        antialias: quality !== 'low',
        toneMapping: THREE.ACESFilmicToneMapping,
        powerPreference: 'high-performance',
      }}
      camera={{ fov, near: 0.1, far: Math.max(400, scene.size * 6), position: [0, 5, 10] }}
      onCreated={({ gl }) => {
        // Allow the browser to restore a lost context instead of giving up.
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      }}
      onClick={(e) => (e.target as HTMLCanvasElement).requestPointerLock?.()}
    >
      <color attach="background" args={[scene.skyColor]} />
      <SceneEnv scene={scene} />
      {scene.proceduralWorld ? (
        <World world={scene.proceduralWorld} />
      ) : scene.mapModelUrl ? (
        <MapModel url={scene.mapModelUrl} />
      ) : null}
      <Players client={client} controls={controls} />
      <FirstPersonViewmodel client={client} controls={controls} />
      <GameLoop client={client} collision={scene.collision} controls={controls} pool={pool} />
      <Tracers pool={pool} />
      <CombatVFX />
    </Canvas>
  );
}
