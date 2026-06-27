'use client';

/**
 * Renders the procedurally generated arena. Repeated props (crates, barrels,
 * trees, rocks, mountains) are drawn with instanced meshes for performance; the
 * ground, water and sky complete the scene. Geometry matches the shared
 * collider set so what you see is what you collide with.
 */
import { useMemo } from 'react';
import { Instance, Instances } from '@react-three/drei';
import type { GeneratedWorld, WorldProp } from '@game/shared';

const BOX_TYPES = new Set(['crate', 'wall', 'building', 'tower', 'platform', 'bridge']);

function Bucket({
  items,
  children,
  castShadow = true,
}: {
  items: WorldProp[];
  children: React.ReactNode;
  castShadow?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <Instances limit={items.length} range={items.length} castShadow={castShadow} receiveShadow>
      {children}
      {items.map((p) => (
        <Instance
          key={p.id}
          position={[p.position.x, p.position.y, p.position.z]}
          rotation={[0, p.rotationY, 0]}
          scale={[p.size.x, p.size.y, p.size.z]}
          color={p.color}
        />
      ))}
    </Instances>
  );
}

export function World({ world }: { world: GeneratedWorld }) {
  const buckets = useMemo(() => {
    const boxes: WorldProp[] = [];
    const barrels: WorldProp[] = [];
    const trees: WorldProp[] = [];
    const rocks: WorldProp[] = [];
    const mountains: WorldProp[] = [];
    for (const p of world.props) {
      if (BOX_TYPES.has(p.type)) boxes.push(p);
      else if (p.type === 'barrel') barrels.push(p);
      else if (p.type === 'tree') trees.push(p);
      else if (p.type === 'rock') rocks.push(p);
      else if (p.type === 'mountain') mountains.push(p);
    }
    return { boxes, barrels, trees, rocks, mountains };
  }, [world]);

  const groundSize = world.size * 4;

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color={world.groundColor} roughness={1} />
      </mesh>

      {/* Water channel */}
      {world.water && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.08, world.water.z]}
          receiveShadow={false}
        >
          <planeGeometry args={[world.bounds * 2, world.water.width]} />
          <meshStandardMaterial
            color={world.waterColor}
            transparent
            opacity={0.75}
            roughness={0.15}
            metalness={0.2}
          />
        </mesh>
      )}

      {/* Boxy props (crates, walls, buildings, towers, platforms, bridges) */}
      <Bucket items={buckets.boxes}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </Bucket>

      {/* Barrels */}
      <Bucket items={buckets.barrels}>
        <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
        <meshStandardMaterial roughness={0.5} metalness={0.3} />
      </Bucket>

      {/* Tree foliage (cones) */}
      <Bucket items={buckets.trees}>
        <coneGeometry args={[0.9, 1, 8]} />
        <meshStandardMaterial roughness={1} />
      </Bucket>

      {/* Rocks */}
      <Bucket items={buckets.rocks}>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Bucket>

      {/* Mountains (decorative, non-colliding) */}
      <Bucket items={buckets.mountains} castShadow={false}>
        <coneGeometry args={[0.6, 1, 6]} />
        <meshStandardMaterial roughness={1} flatShading />
      </Bucket>
    </group>
  );
}
