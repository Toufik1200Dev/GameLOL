'use client';

/**
 * Renders a GLB map (single instance). drei's useGLTF decodes Draco geometry
 * automatically. Meshes receive shadows but don't cast them (the map is huge —
 * casting from 1M+ triangles every frame would tank performance; player shadows
 * are enough).
 */
import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, type Mesh } from 'three';

export function MapModel({
  url,
  offsetY = 0,
  groundY,
  scale = 1,
}: {
  url: string;
  offsetY?: number;
  groundY: number;
  /** Uniform map scale (matches the scaled collision); applied about the origin. */
  scale?: number;
}) {
  const { scene } = useGLTF(url);

  const renderOffsetY = useMemo(() => {
    const bounds = new Box3().setFromObject(scene);
    // groundY/offsetY are already in scaled world units; align the SCALED mesh
    // floor (min.y * scale) to the authoritative collision ground.
    return offsetY + (groundY - bounds.min.y * scale);
  }, [scene, offsetY, groundY, scale]);

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.receiveShadow = true;
        mesh.castShadow = false;
      }
    });
  }, [scene]);

  // Visual-only vertical offset (collision uses the unshifted GLB plus optional
  // config tuning). The scene is scaled and raised so its minimum Y aligns with
  // the authoritative collision groundY.
  return <primitive object={scene} scale={scale} position={[0, renderOffsetY, 0]} />;
}
