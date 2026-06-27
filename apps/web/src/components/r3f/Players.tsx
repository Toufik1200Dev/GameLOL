'use client';

/**
 * Renders the local player (predicted/smoothed) and remote players
 * (interpolated). Transforms are read from the NetGameClient every frame via
 * refs — never React state — so motion stays smooth. The neutral capsule avatar
 * stands in until a real character `.glb` is wired to `characterId`.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS, type TeamId } from '@game/shared';
import { useGameStore } from '../../stores/gameStore';
import type { NetGameClient } from '../../game/net/NetGameClient';
import type { ControlsRef } from '../../game/input/useGameControls';

const TEAM_COLOR: Record<TeamId, string> = { red: '#ff4d5e', blue: '#4c8bff' };

/** Neutral capsule avatar (engine primitive; replaced by character models later). */
function CapsuleAvatar({ team }: { team: TeamId }) {
  const capLen = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
  return (
    <group>
      <mesh position={[0, PLAYER_HEIGHT / 2, 0]} castShadow>
        <capsuleGeometry args={[PLAYER_RADIUS, capLen, 6, 12]} />
        <meshStandardMaterial color={TEAM_COLOR[team]} roughness={0.6} />
      </mesh>
      {/* Facing indicator (visor) pointing local -Z (forward). */}
      <mesh position={[0, PLAYER_HEIGHT * 0.78, -PLAYER_RADIUS]} castShadow>
        <boxGeometry args={[0.5, 0.18, 0.25]} />
        <meshStandardMaterial color="#0c1322" roughness={0.4} />
      </mesh>
    </group>
  );
}

function NameTag({ name, team }: { name: string; team: TeamId }) {
  return (
    <Html position={[0, PLAYER_HEIGHT + 0.35, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
      <div
        className="pointer-events-none select-none whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: 'rgba(0,0,0,0.55)', color: TEAM_COLOR[team] }}
      >
        {name}
      </div>
    </Html>
  );
}

function LocalPlayer({ client, controls }: { client: NetGameClient; controls: ControlsRef }) {
  const ref = useRef<Group>(null);
  const self = useGameStore((s) => s.roster.find((p) => p.id === client.selfId));
  const team = self?.team ?? 'red';

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // Hide own avatar in first person.
    g.visible = !controls.firstPerson;
    g.position.set(client.render.position.x, client.render.position.y, client.render.position.z);
    g.rotation.set(0, client.render.yaw, 0);
  });

  return (
    <group ref={ref}>
      <CapsuleAvatar team={team} />
    </group>
  );
}

function RemotePlayer({ client, id }: { client: NetGameClient; id: string }) {
  const ref = useRef<Group>(null);
  const meta = useGameStore((s) => s.roster.find((p) => p.id === id));

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const s = client.sampleRemote(id);
    if (!s || !s.alive) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(s.x, s.y, s.z);
    g.rotation.set(0, s.yaw, 0);
  });

  const team = meta?.team ?? 'blue';
  return (
    <group ref={ref}>
      <CapsuleAvatar team={team} />
      {meta && <NameTag name={meta.name} team={team} />}
    </group>
  );
}

export function Players({ client, controls }: { client: NetGameClient; controls: ControlsRef }) {
  // Re-render only when the set of remote ids changes (not per frame).
  const remoteIds = useGameStore((s) =>
    s.roster
      .filter((p) => p.id !== client.selfId)
      .map((p) => p.id)
      .join(','),
  );
  const ids = useMemo(() => (remoteIds ? remoteIds.split(',') : []), [remoteIds]);

  return (
    <>
      <LocalPlayer client={client} controls={controls} />
      {ids.map((id) => (
        <RemotePlayer key={id} client={client} id={id} />
      ))}
    </>
  );
}
