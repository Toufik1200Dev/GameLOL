'use client';

/**
 * Renders the authoritative team turrets from game snapshots. Each turret loads
 * the shared turret GLB (deep-cloned per instance, auto-fit to a target height),
 * lerps its yaw toward the server's aim, tints a team ring at its base, flashes a
 * muzzle when firing, and tilts as a wreck when destroyed. Transforms are read
 * from the game store every frame via refs (never React state) for smooth motion.
 */
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Box3, LoopOnce, LoopRepeat, Vector3, type Group, type Object3D } from 'three';
import { lerpAngle, type TeamId, type TurretManifestEntry } from '@game/shared';
import { useGameStore } from '../../stores/gameStore';

const TEAM_COLOR: Record<TeamId, string> = { red: '#ff4d5e', blue: '#4c8bff' };
/** Correction if the turret model's forward axis differs from the game convention. */
const TURRET_YAW_OFFSET = 0;

class TurretErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useClonedScene(url: string): Object3D {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const cloned = cloneSkeleton(scene);
    cloned.traverse((o) => {
      const mesh = o as { isMesh?: boolean; castShadow?: boolean; frustumCulled?: boolean };
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });
    return cloned;
  }, [scene]);
}

function TurretEntity({ id, entry }: { id: number; entry: TurretManifestEntry }) {
  const ref = useRef<Group>(null);
  const flashRef = useRef<Group>(null);
  const cloned = useClonedScene(entry.model);
  const { animations } = useGLTF(entry.model);
  const { actions, names } = useAnimations(animations, ref);

  // Auto-fit to the configured height; centre on X/Z and drop the base to y=0.
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(cloned);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    const autoScale = size.y > 1e-4 ? entry.config.height / size.y : 1;
    const s = autoScale * entry.config.scale;
    return { s, center, minY: box.min.y };
  }, [cloned, entry.config.height, entry.config.scale]);

  const team = useGameStore((st) => st.turrets.find((t) => t.id === id)?.team ?? 'red');
  const maxHealth = useGameStore((st) => st.turrets.find((t) => t.id === id)?.maxHealth ?? 1);
  const [health, setHealth] = useState(maxHealth);

  const yawRef = useRef(0);
  const flashUntil = useRef(0);
  const wasFiring = useRef(false);
  const currentClip = useRef<string | null>(null);

  const { idleName, deathName } = useMemo(() => {
    const a = entry.config.animations;
    const idle = (a.idle && actions[a.idle] ? a.idle : names[0]) ?? null;
    const death = a.death && actions[a.death] ? a.death : null;
    return { idleName: idle, deathName: death };
  }, [actions, names, entry.config.animations]);

  // Crossfade to a clip (idle loops; death plays once and holds its last frame).
  const playClip = (name: string | null, loop: boolean) => {
    if (!name || currentClip.current === name) return;
    const next = actions[name];
    if (!next) return;
    const prev = currentClip.current ? actions[currentClip.current] : null;
    next.reset();
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    currentClip.current = name;
  };

  // Start on idle once actions resolve.
  useEffect(() => {
    if (idleName) playClip(idleName, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleName]);

  useFrame((_s, dt) => {
    const g = ref.current;
    if (!g) return;
    const t = useGameStore.getState().turrets.find((x) => x.id === id);
    if (!t) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(t.x, t.y + entry.config.yOffset, t.z);
    yawRef.current = lerpAngle(yawRef.current, t.yaw + TURRET_YAW_OFFSET, 1 - Math.exp(-8 * dt));
    g.rotation.y = yawRef.current;
    // Play the destroyed clip when down (fall back to a tilt if none); idle when up.
    if (t.alive) {
      playClip(idleName, true);
      g.rotation.z = 0;
    } else {
      playClip(deathName, false);
      g.rotation.z = deathName ? 0 : 0.4;
    }
    if (t.health !== health) setHealth(t.health);

    // Muzzle flash on the firing-edge.
    const now = performance.now();
    if (t.firing && !wasFiring.current) flashUntil.current = now + 70;
    wasFiring.current = t.firing;
    const flash = flashRef.current;
    if (flash) {
      const on = t.alive && now < flashUntil.current;
      flash.visible = on;
      if (on) flash.scale.setScalar(0.6 + Math.random() * 0.5);
    }
  });

  const half = entry.config.height * 0.5;
  return (
    <group ref={ref}>
      {/* Auto-fit model (centred on X/Z, base at y=0). */}
      <group scale={fit.s} position={[-fit.center.x * fit.s, -fit.minY * fit.s, -fit.center.z * fit.s]}>
        <primitive object={cloned} />
      </group>

      {/* Team ring at the base. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.55, 0.78, 28]} />
        <meshStandardMaterial
          color={TEAM_COLOR[team]}
          emissive={TEAM_COLOR[team]}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>

      {/* Muzzle flash (points forward; turret forward is -Z in game convention). */}
      <group ref={flashRef} position={[0, half, -0.7]} visible={false}>
        <mesh>
          <sphereGeometry args={[0.16, 8, 8]} />
          <meshStandardMaterial
            color="#ffd27a"
            emissive="#ff8a00"
            emissiveIntensity={4}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Health bar (only while damaged + alive). */}
      {health < maxHealth && health > 0 && (
        <Html position={[0, entry.config.height + 0.35, 0]} center distanceFactor={14} zIndexRange={[8, 0]}>
          <div className="h-1 w-12 overflow-hidden rounded bg-black/60">
            <div
              className="h-full"
              style={{
                width: `${Math.max(0, (health / maxHealth) * 100)}%`,
                background: TEAM_COLOR[team],
              }}
            />
          </div>
        </Html>
      )}
    </group>
  );
}

export function Turrets({ entry }: { entry: TurretManifestEntry }) {
  // Re-render only when the set of turret ids changes (positions are static).
  const idKey = useGameStore((s) => s.turrets.map((t) => t.id).join(','));
  const ids = useMemo(() => (idKey ? idKey.split(',').map(Number) : []), [idKey]);
  if (ids.length === 0) return null;
  return (
    <TurretErrorBoundary>
      <Suspense fallback={null}>
        {ids.map((id) => (
          <TurretEntity key={id} id={id} entry={entry} />
        ))}
      </Suspense>
    </TurretErrorBoundary>
  );
}
