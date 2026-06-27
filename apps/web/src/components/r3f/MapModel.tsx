'use client';

/**
 * Renders a GLB map (single instance). drei's useGLTF decodes Draco geometry
 * automatically. Meshes receive shadows but don't cast them (the map is huge —
 * casting from 1M+ triangles every frame would tank performance; player shadows
 * are enough).
 */
import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Mesh } from 'three';

export function MapModel({ url, offsetY = 0 }: { url: string; offsetY?: number }) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.receiveShadow = true;
        mesh.castShadow = false;
      }
    });
  }, [scene]);

  // Visual-only vertical offset (collision uses the unshifted GLB). Lets a map
  // sit lower so players rest on the floor instead of appearing sunk into it.
  return <primitive object={scene} position={[0, offsetY, 0]} />;
}
