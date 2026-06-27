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
  // The /api/assets/manifest route scans public/assets from disk at request
  // time. On serverless hosts (Vercel) the public dir isn't on the function's
  // filesystem, so bundle the asset folders into that function explicitly.
  outputFileTracingIncludes: {
    '/api/assets/manifest': ['./public/assets/**/*'],
  },
  eslint: {
    // Lint is run explicitly via `pnpm lint`; don't fail production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
