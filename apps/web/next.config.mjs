/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static export (`out/`) so the frontend deploys as static files to
  // Firebase Hosting (or any CDN). The app is a client-only SPA; the asset
  // manifest is prebuilt to /assets/manifest.json, so no server is needed.
  output: 'export',
  // next/image optimization needs a server; disable it for static export.
  images: { unoptimized: true },
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
