/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace shared package (TS source) directly.
  transpilePackages: ['@game/shared'],
  // three.js and several R3F addons ship as ESM with deep imports; let Next
  // optimize/transpile them cleanly.
  experimental: {
    optimizePackageImports: ['@react-three/drei', 'three'],
  },
  eslint: {
    // Lint is run explicitly via `pnpm lint`; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
