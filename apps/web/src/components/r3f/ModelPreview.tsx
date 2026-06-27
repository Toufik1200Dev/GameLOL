'use client';

/**
 * Reusable 3D asset previews backed by React Three Fiber. Used by the character
 * and weapon selection screens. They gracefully handle the (current) no-asset
 * state — they are only mounted once a real `.glb` URL exists — and recover from
 * load errors via an error boundary.
 */
import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, ContactShadows, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import type { Group } from 'three';

class PreviewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
          Failed to load model
        </div>
      );
    }
    return this.props.children;
  }
}

function CharacterModel({
  url,
  animationsUrl,
  clipName,
  scale = 1,
}: {
  url: string;
  animationsUrl: string | null;
  clipName?: string;
  scale?: number;
}) {
  const ref = useRef<Group>(null);
  const { scene, animations: embedded } = useGLTF(url);
  // Always call the hook (same url when there's no separate clip file) to keep
  // hook order stable; drei caches by url so this is cheap.
  const animGltf = useGLTF(animationsUrl ?? url);
  const clips = animationsUrl ? animGltf.animations : embedded;
  const { actions, names } = useAnimations(clips, ref);

  useEffect(() => {
    if (names.length === 0) return;
    const pick = clipName && actions[clipName] ? clipName : names[0];
    const action = pick ? actions[pick] : undefined;
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, names, clipName]);

  return (
    <group ref={ref} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

function StaticModel({ url, scale = 1 }: { url: string; scale?: number }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={scale} />;
}

function PreviewCanvas({ children }: { children: ReactNode }) {
  return (
    <PreviewErrorBoundary>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 1.2, 3.2], fov: 45 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0c1322']} />
        <ambientLight intensity={0.6} />
        <hemisphereLight intensity={0.5} groundColor="#1a2235" />
        <directionalLight position={[3, 5, 2]} intensity={1.4} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#4cc2ff" />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            {children}
          </Bounds>
          <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={8} blur={2.5} far={4} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          autoRotate
          autoRotateSpeed={2}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </PreviewErrorBoundary>
  );
}

export function CharacterPreview({
  url,
  animationsUrl,
  clipName,
  scale,
}: {
  url: string;
  animationsUrl: string | null;
  clipName?: string;
  scale?: number;
}) {
  return (
    <PreviewCanvas>
      <CharacterModel url={url} animationsUrl={animationsUrl} clipName={clipName} scale={scale} />
    </PreviewCanvas>
  );
}

export function WeaponPreview({ url, scale }: { url: string; scale?: number }) {
  return (
    <PreviewCanvas>
      <StaticModel url={url} scale={scale} />
    </PreviewCanvas>
  );
}
