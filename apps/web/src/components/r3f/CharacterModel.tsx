'use client';

/**
 * In-game GLB rendering for player characters and weapons. Models are loaded
 * once (cached by drei) and deep-cloned per instance via SkeletonUtils so the
 * same asset can be used by multiple players (and animated independently).
 *
 * Models AUTO-FIT: a character is scaled so its height ≈ the player capsule and
 * its feet sit on the ground; a weapon is scaled so its longest dimension is a
 * sensible hand size. The `scale` (characters) / `attachment.scale` (weapons)
 * config value is then a fine-tune multiplier on top (1 = auto). `yOffset` /
 * `yawOffset` / `attachment.position|rotation` handle any remaining alignment —
 * all without code. A failed/absent model falls back to the capsule (characters)
 * or renders nothing (weapons).
 */
import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Box3, LoopOnce, Vector3, type Group, type Object3D } from 'three';
import { PLAYER_HEIGHT, type CharacterConfig, type WeaponConfig } from '@game/shared';

/** A ref holding the timestamp (performance.now) of the entity's last shot. */
export type FireRef = { current: number };

const TARGET_WEAPON_LENGTH = 0.55; // metres

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Deep-clone a loaded scene (preserving skinned-mesh skeletons) + enable shadows. */
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

/** Measure a model's bounding box once (bind pose) for auto-fit. */
function useBounds(object: Object3D): { size: Vector3; center: Vector3; min: Vector3 } {
  return useMemo(() => {
    const box = new Box3().setFromObject(object);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { size, center, min: box.min.clone() };
  }, [object]);
}

function CharacterModelInner({
  url,
  animationsUrl,
  config,
  isMoving,
  fireRef,
}: {
  url: string;
  animationsUrl: string | null;
  config: CharacterConfig;
  isMoving?: () => boolean;
  fireRef?: FireRef;
}) {
  const ref = useRef<Group>(null);
  const cloned = useClonedScene(url);
  const { size, center, min } = useBounds(cloned);

  const { animations: embedded } = useGLTF(url);
  // Always call the hook (same url when no separate file) for stable hook order.
  const animGltf = useGLTF(animationsUrl ?? url);
  const clips = animationsUrl ? animGltf.animations : embedded;
  const { actions, names } = useAnimations(clips, ref);

  // Only a locomotion clip is used — no idle/dance animation. Resolve it by
  // config name, else by common naming.
  const moveName = useMemo(() => {
    if (config.animations.run && actions[config.animations.run]) return config.animations.run;
    if (config.animations.walk && actions[config.animations.walk]) return config.animations.walk;
    return (
      names.find((n) => /run|sprint/i.test(n)) ?? names.find((n) => /walk|move/i.test(n)) ?? null
    );
  }, [actions, names, config.animations]);

  // Attack/fire clip, played once per shot. Prefer a config mapping, else a clean
  // "Attack"/"Slash"/"Crit" clip (skip blend-transition variants like *_to_run).
  const attackName = useMemo(() => {
    if (config.animations.shoot && actions[config.animations.shoot]) return config.animations.shoot;
    const clean = names.filter(
      (n) => /attack|slash|swing|crit/i.test(n) && !/to_?(idle|run|walk)|wind|out/i.test(n),
    );
    return (
      clean.find((n) => /attack1|attack_1|attack_first|crit/i.test(n)) ?? clean[0] ?? null
    );
  }, [actions, names, config.animations]);

  // Play the locomotion clip while moving; FREEZE it when stopped. On each shot,
  // play the attack clip once and blend it over the locomotion briefly.
  const started = useRef(false);
  const lastFire = useRef(0);
  const attackUntil = useRef(0);
  useFrame(() => {
    const action = moveName ? actions[moveName] : null;
    const atk = attackName ? actions[attackName] : null;
    const now = performance.now();

    // Trigger an attack on a new shot (fireRef timestamp changed).
    if (atk && fireRef && fireRef.current !== lastFire.current) {
      lastFire.current = fireRef.current;
      const dur = atk.getClip().duration || 0.4;
      const playDur = Math.min(0.5, Math.max(0.18, dur));
      attackUntil.current = now + playDur * 1000;
      atk.reset();
      atk.setLoop(LoopOnce, 1);
      atk.clampWhenFinished = true;
      atk.setEffectiveTimeScale(dur > 0.55 ? dur / 0.4 : 1); // speed up long attacks
      atk.fadeIn(0.05).play();
    }
    const attacking = atk != null && now < attackUntil.current;
    if (atk) atk.setEffectiveWeight(attacking ? 1 : 0);

    if (action) {
      const moving = isMoving?.() ?? false;
      if (moving && !started.current) {
        action.play();
        started.current = true;
      }
      if (started.current) action.paused = !moving;
      // Yield to the attack while it plays.
      action.setEffectiveWeight(attacking ? 0.12 : 1);
    }
  });

  // Auto-fit: scale to player height, centre on X/Z, drop feet to y=0.
  const autoScale = size.y > 1e-4 ? PLAYER_HEIGHT / size.y : 1;
  const s = autoScale * config.scale;

  return (
    // Outer group: facing + vertical nudge.
    <group ref={ref} rotation={[0, config.yawOffset, 0]} position={[0, config.yOffset, 0]}>
      {/* Inner group: scale + centre/ground (feet at origin). */}
      <group scale={s} position={[-center.x * s, -min.y * s, -center.z * s]}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

/** Character GLB with idle/locomotion animation; falls back on error/Suspense. */
export function CharacterModel({
  url,
  animationsUrl,
  config,
  fallback,
  isMoving,
  fireRef,
}: {
  url: string;
  animationsUrl: string | null;
  config: CharacterConfig;
  fallback: ReactNode;
  isMoving?: () => boolean;
  fireRef?: FireRef;
}) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CharacterModelInner
          url={url}
          animationsUrl={animationsUrl}
          config={config}
          isMoving={isMoving}
          fireRef={fireRef}
        />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function WeaponModelInner({
  url,
  config,
  fireRef,
}: {
  url: string;
  config: WeaponConfig;
  fireRef?: FireRef;
}) {
  const cloned = useClonedScene(url);
  const { size, center } = useBounds(cloned);
  const a = config.attachment;

  const maxDim = Math.max(size.x, size.y, size.z);
  const autoScale = maxDim > 1e-4 ? TARGET_WEAPON_LENGTH / maxDim : 1;
  const s = autoScale * a.scale;

  // Procedural fire motion (pivots around the hand): a sword swing for melee,
  // a short recoil kick for guns. Driven by the fireRef timestamp.
  const animRef = useRef<Group>(null);
  const lastFire = useRef(0);
  const fireT = useRef(-1); // seconds since the shot; <0 = at rest
  useFrame((_state, dt) => {
    const g = animRef.current;
    if (!g) return;
    if (fireRef && fireRef.current !== lastFire.current) {
      lastFire.current = fireRef.current;
      fireT.current = 0;
    }
    if (fireT.current < 0) return;
    fireT.current += dt;
    if (config.melee) {
      // Overhead sword slash: wind up and chop down over ~0.32s.
      const u = Math.min(1, fireT.current / 0.32);
      const arc = Math.sin(u * Math.PI);
      g.rotation.set(-2.3 * arc, 0, 0.5 * arc);
      g.position.set(0, 0, 0);
      if (u >= 1) {
        fireT.current = -1;
        g.rotation.set(0, 0, 0);
      }
    } else {
      // Recoil: kick back + muzzle up, ease back over ~0.12s.
      const u = Math.min(1, fireT.current / 0.12);
      const k = Math.cos((u * Math.PI) / 2); // 1 -> 0
      g.position.set(0, 0, 0.09 * k);
      g.rotation.set(-0.35 * k, 0, 0);
      if (u >= 1) {
        fireT.current = -1;
        g.position.set(0, 0, 0);
        g.rotation.set(0, 0, 0);
      }
    }
  });

  return (
    // Animated wrapper (swing/recoil) pivoting at the hand anchor.
    <group ref={animRef}>
      {/* Attachment transform (position/rotation) for hand alignment. */}
      <group position={a.position} rotation={a.rotation}>
        {/* Auto-fit scale + centre on origin. */}
        <group scale={s} position={[-center.x * s, -center.y * s, -center.z * s]}>
          <primitive object={cloned} />
        </group>
      </group>
    </group>
  );
}

/** Weapon GLB positioned by its config attachment transform. Renders nothing on error. */
export function WeaponModel({
  url,
  config,
  fireRef,
}: {
  url: string;
  config: WeaponConfig;
  fireRef?: FireRef;
}) {
  return (
    <ModelErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <WeaponModelInner url={url} config={config} fireRef={fireRef} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
