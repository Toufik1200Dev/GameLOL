/**
 * Public surface of the @game/shared package — imported by BOTH the web client
 * and the authoritative server. Keep this a thin barrel; put implementations in
 * the sub-modules.
 *
 * Imports are intentionally EXTENSIONLESS so the same source resolves cleanly
 * under every consumer's bundler (webpack/turbopack on the web, tsx/esbuild on
 * the server) with `moduleResolution: "Bundler"`.
 */

// Constants & primitives
export * from './constants';
export * from './math/vec3';
export * from './rng/seeded';

// Domain types
export * from './types/lobby';

// Config defaults + schemas + manifest types
export * from './config/defaults';
export * from './config/schemas';
export * from './config/manifest';

// Networking protocol
export * from './protocol/events';

// Utilities
export * from './util/roomCode';
