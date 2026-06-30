'use client';

/**
 * Renders the local player (predicted/smoothed) and remote players
 * (interpolated). Transforms are read from the NetGameClient every frame via
 * refs — never React state — so motion stays smooth. The selected character
 * `.glb` (resolved from the asset manifest) renders as the avatar, with a
 * neutral capsule fallback until a model is chosen/available, and the selected
 * weapon is attached at a hand anchor.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { PLAYER_HEIGHT, PLAYER_RADIUS, lerpAngle, type TeamId } from '@game/shared';
import { useGameStore } from '../../stores/gameStore';
import { useAssetStore } from '../../stores/assetStore';
import type { NetGameClient } from '../../game/net/NetGameClient';
import type { ControlsRef } from '../../game/input/useGameControls';
import { CharacterModel, WeaponModel, type FireRef } from './CharacterModel';

const TEAM_COLOR: Record<TeamId, string> = { red: '#ff4d5e', blue: '#4c8bff' };

/** Where the held weapon sits relative to the avatar feet (right hand, held forward). */
const HAND_ANCHOR: [number, number, number] = [0.25, PLAYER_HEIGHT * 0.55, -0.5];

/** Neutral capsule avatar (engine primitive; fallback when no character model). */
function CapsuleAvatar({ team }: { team: TeamId }) {
  const capLen = PLAYER_HEIGHT - PLAYER_RADIUS * 2;
  return (
    <group>
      <mesh position={[0, PLAYER_HEIGHT / 2, 0]} castShadow>
        <capsuleGeometry args={[PLAYER_RADIUS, capLen, 6, 12]} />
        <meshStandardMaterial color={TEAM_COLOR[team]} roughness={0.6} />
      </mesh>
      <mesh position={[0, PLAYER_HEIGHT * 0.78, -PLAYER_RADIUS]} castShadow>
        <boxGeometry args={[0.5, 0.18, 0.25]} />
        <meshStandardMaterial color="#0c1322" roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Resolves character/weapon models from the manifest; capsule + no weapon fallback. */
function CharacterAvatar({
  team,
  characterId,
  weaponId,
  isMoving,
  fireRef,
}: {
  team: TeamId;
  characterId: string | null;
  weaponId: string | null;
  isMoving?: () => boolean;
  fireRef?: FireRef;
}) {
  const manifest = useAssetStore((s) => s.manifest);
  const character = useMemo(
    () => (characterId ? manifest.characters.find((c) => c.id === characterId) : undefined),
    [manifest, characterId],
  );
  const weapon = useMemo(
    () => (weaponId ? manifest.weapons.find((w) => w.id === weaponId) : undefined),
    [manifest, weaponId],
  );

  return (
    <>
      {character ? (
        <CharacterModel
          url={character.model}
          animationsUrl={character.animations}
          config={character.config}
          fallback={<CapsuleAvatar team={team} />}
          isMoving={isMoving}
          fireRef={fireRef}
        />
      ) : (
        <CapsuleAvatar team={team} />
      )}
      {weapon && (
        <group position={HAND_ANCHOR}>
          <WeaponModel url={weapon.model} config={weapon.config} fireRef={fireRef} />
        </group>
      )}
    </>
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
  const fireRef = useRef(0);
  const self = useGameStore((s) => s.roster.find((p) => p.id === client.selfId));
  const team = self?.team ?? 'red';

  useFrame((_s, dt) => {
    const g = ref.current;
    fireRef.current = client.lastFireAt; // mirror the local shot timestamp
    if (!g) return;
    g.visible = !controls.firstPerson;
    g.position.set(client.render.position.x, client.render.position.y, client.render.position.z);
    // Turn the body toward the movement direction while moving, and HOLD that
    // facing when standing still (don't snap back to the aim/forward direction).
    const v = client.predicted.velocity;
    const speed = Math.hypot(v.x, v.z);
    if (speed > 1.2) {
      const targetYaw = Math.atan2(-v.x, -v.z);
      g.rotation.y = lerpAngle(g.rotation.y, targetYaw, 1 - Math.exp(-12 * dt));
    }
  });

  return (
    <group ref={ref}>
      <CharacterAvatar
        team={team}
        characterId={self?.characterId ?? null}
        weaponId={self?.weaponId ?? null}
        isMoving={() => {
          const v = client.predicted.velocity;
          return Math.hypot(v.x, v.z) > 1.2;
        }}
        fireRef={fireRef}
      />
    </group>
  );
}

function RemotePlayer({ client, id }: { client: NetGameClient; id: string }) {
  const ref = useRef<Group>(null);
  const last = useRef<{ x: number; z: number } | null>(null);
  const fireRef = useRef(0);
  const wasFiring = useRef(false);
  const meta = useGameStore((s) => s.roster.find((p) => p.id === id));

  useFrame((_s, dt) => {
    const g = ref.current;
    if (!g) return;
    // Trigger the attack animation on the firing rising-edge from snapshots.
    const firing = useGameStore.getState().roster.find((p) => p.id === id)?.firing ?? false;
    if (firing && !wasFiring.current) fireRef.current = performance.now();
    wasFiring.current = firing;
    const s = client.sampleRemote(id);
    if (!s || !s.alive) {
      g.visible = false;
      last.current = null;
      return;
    }
    g.visible = true;
    g.position.set(s.x, s.y, s.z);
    // Face the interpolated movement direction; HOLD the last facing when still
    // (don't rotate back to the aim/forward direction).
    if (last.current) {
      const dx = s.x - last.current.x;
      const dz = s.z - last.current.z;
      if (Math.hypot(dx, dz) > 0.02) {
        const targetYaw = Math.atan2(-dx, -dz);
        g.rotation.y = lerpAngle(g.rotation.y, targetYaw, 1 - Math.exp(-12 * dt));
      }
    }
    last.current = { x: s.x, z: s.z };
  });

  const team = meta?.team ?? 'blue';
  return (
    <group ref={ref}>
      <CharacterAvatar
        team={team}
        characterId={meta?.characterId ?? null}
        weaponId={meta?.weaponId ?? null}
        isMoving={() => useGameStore.getState().roster.find((p) => p.id === id)?.moving ?? false}
        fireRef={fireRef}
      />
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
