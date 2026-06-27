'use client';

/**
 * In-game GLB rendering for player characters and weapons. Models are loaded
 * once (cached by drei) and deep-cloned per instance via SkeletonUtils so the
 * same asset can be used by multiple players (and animated independently).
 *
 * All of this is config-driven (scale / yOffset / yawOffset / weapon attachment)
 * so uploaded models can be aligned without code changes. A failed/absent model
 * falls back to the neutral capsule (characters) or renders nothing (weapons).
 */
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Group, Object3D } from 'three';
import type { CharacterConfig, WeaponConfig } from '@game/shared';

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

function CharacterModelInner({
  url,
  animationsUrl,
  config,
}: {
  url: string;
  animationsUrl: string | null;
  config: CharacterConfig;
}) {
  const ref = useRef<Group>(null);
  const cloned = useClonedScene(url);
  const { animations: embedded } = useGLTF(url);
  // Always call the hook (same url when no separate file) for stable hook order.
  const animGltf = useGLTF(animationsUrl ?? url);
  const clips = animationsUrl ? animGltf.animations : embedded;
  const { actions, names } = useAnimations(clips, ref);

  useEffect(() => {
    if (names.length === 0) return;
    const idle = config.animations.idle;
    const pick = idle && actions[idle] ? idle : names[0];
    const action = pick ? actions[pick] : undefined;
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, names, config.animations.idle]);

  return (
    <group
      ref={ref}
      position={[0, config.yOffset, 0]}
      rotation={[0, config.yawOffset, 0]}
      scale={config.scale}
    >
      <primitive object={cloned} />
    </group>
  );
}

/** Character GLB with idle animation; falls back to `fallback` on error/Suspense. */
export function CharacterModel({
  url,
  animationsUrl,
  config,
  fallback,
}: {
  url: string;
  animationsUrl: string | null;
  config: CharacterConfig;
  fallback: ReactNode;
}) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <CharacterModelInner url={url} animationsUrl={animationsUrl} config={config} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

function WeaponModelInner({ url, config }: { url: string; config: WeaponConfig }) {
  const cloned = useClonedScene(url);
  const a = config.attachment;
  return (
    <group position={a.position} rotation={a.rotation} scale={a.scale}>
      <primitive object={cloned} />
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
