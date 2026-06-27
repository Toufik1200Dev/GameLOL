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
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Box3, Vector3, type Group, type Object3D } from 'three';
import { PLAYER_HEIGHT, type CharacterConfig, type WeaponConfig } from '@game/shared';

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
}: {
  url: string;
  animationsUrl: string | null;
  config: CharacterConfig;
  isMoving?: () => boolean;
}) {
  const ref = useRef<Group>(null);
  const cloned = useClonedScene(url);
  const { size, center, min } = useBounds(cloned);

  const { animations: embedded } = useGLTF(url);
  // Always call the hook (same url when no separate file) for stable hook order.
  const animGltf = useGLTF(animationsUrl ?? url);
  const clips = animationsUrl ? animGltf.animations : embedded;
  const { actions, names } = useAnimations(clips, ref);

  // Resolve idle + locomotion clips (by config name, else by common naming).
  const idleName = useMemo(() => {
    if (config.animations.idle && actions[config.animations.idle]) return config.animations.idle;
    return names.find((n) => /idle/i.test(n)) ?? names[0] ?? null;
  }, [actions, names, config.animations]);
  const moveName = useMemo(() => {
    if (config.animations.run && actions[config.animations.run]) return config.animations.run;
    if (config.animations.walk && actions[config.animations.walk]) return config.animations.walk;
    return (
      names.find((n) => /run|sprint/i.test(n)) ?? names.find((n) => /walk|move/i.test(n)) ?? null
    );
  }, [actions, names, config.animations]);

  const currentClip = useRef<string | null>(null);
  const playClip = (name: string | null) => {
    if (!name || currentClip.current === name) return;
    const next = actions[name];
    if (!next) return;
    const prev = currentClip.current ? actions[currentClip.current] : null;
    next.reset().fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    currentClip.current = name;
  };

  useEffect(() => {
    playClip(idleName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleName]);

  // Switch to the locomotion clip while moving, idle otherwise.
  useFrame(() => {
    const moving = isMoving?.() ?? false;
    playClip(moving && moveName ? moveName : idleName);
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
}: {
  url: string;
  animationsUrl: string | null;
  config: CharacterConfig;
  fallback: ReactNode;
  isMoving?: () => boolean;
}) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CharacterModelInner
          url={url}
          animationsUrl={animationsUrl}
          config={config}
          isMoving={isMoving}
        />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function WeaponModelInner({ url, config }: { url: string; config: WeaponConfig }) {
  const cloned = useClonedScene(url);
  const { size, center } = useBounds(cloned);
  const a = config.attachment;

  const maxDim = Math.max(size.x, size.y, size.z);
  const autoScale = maxDim > 1e-4 ? TARGET_WEAPON_LENGTH / maxDim : 1;
  const s = autoScale * a.scale;

  return (
    // Attachment transform (position/rotation) for hand alignment.
    <group position={a.position} rotation={a.rotation}>
      {/* Auto-fit scale + centre on origin. */}
      <group scale={s} position={[-center.x * s, -center.y * s, -center.z * s]}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

/** Weapon GLB positioned by its config attachment transform. Renders nothing on error. */
export function WeaponModel({ url, config }: { url: string; config: WeaponConfig }) {
  return (
    <ModelErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <WeaponModelInner url={url} config={config} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
