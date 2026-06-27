'use client';

/**
 * Renders placed cover props (e.g. cars) for a GLB map. Each unique model is
 * loaded once and cloned per placement. The matching collider boxes live in the
 * map's colliders.json (server + client), so players collide with these.
 */
import { useMemo } from 'react';
import { Clone, useGLTF } from '@react-three/drei';
import type { PropInstance } from '@game/shared';

function PropGroup({ model, items }: { model: string; items: PropInstance[] }) {
  const { scene } = useGLTF(model);
  return (
    <>
      {items.map((p, i) => (
        <Clone
          key={i}
          object={scene}
          position={[p.x, p.y, p.z]}
          rotation={[0, p.rotationY, 0]}
        />
      ))}
    </>
  );
}

export function MapProps({ props }: { props: PropInstance[] }) {
  const groups = useMemo(() => {
    const byModel = new Map<string, PropInstance[]>();
    for (const p of props) {
      if (!byModel.has(p.model)) byModel.set(p.model, []);
      byModel.get(p.model)!.push(p);
    }
    return [...byModel.entries()];
  }, [props]);

  return (
    <>
      {groups.map(([model, items]) => (
        <PropGroup key={model} model={model} items={items} />
      ))}
    </>
  );
}
