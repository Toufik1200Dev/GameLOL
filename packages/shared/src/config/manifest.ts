/**
 * Types describing the generated asset manifest the client consumes. Each entry
 * pairs a discovered asset folder with its validated config and resolved public
 * URLs.
 */
import type { CharacterConfig, MapConfig, WeaponConfig } from './schemas';

export interface CharacterManifestEntry {
  id: string;
  /** Base public path, e.g. "/assets/characters/recruit". */
  path: string;
  icon: string | null;
  model: string;
  animations: string | null;
  config: CharacterConfig;
}

export interface WeaponManifestEntry {
  id: string;
  path: string;
  icon: string | null;
  model: string;
  config: WeaponConfig;
}

export interface MapManifestEntry {
  id: string;
  path: string;
  preview: string | null;
  /** GLB map model URL (null ⇒ procedural map). */
  model: string | null;
  /** Voxel collider data URL for GLB maps (null ⇒ procedural). */
  colliders: string | null;
  config: MapConfig;
}

export interface AssetManifest {
  generatedAt: string;
  characters: CharacterManifestEntry[];
  weapons: WeaponManifestEntry[];
  maps: MapManifestEntry[];
}

export const EMPTY_MANIFEST: AssetManifest = {
  generatedAt: new Date(0).toISOString(),
  characters: [],
  weapons: [],
  maps: [],
};
