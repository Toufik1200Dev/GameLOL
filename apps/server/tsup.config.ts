import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // Bundle the workspace `@game/shared` source into the output so the deployed
  // server is fully self-contained and does not need the monorepo at runtime.
  noExternal: ['@game/shared'],
  clean: true,
  sourcemap: true,
  dts: false,
});
