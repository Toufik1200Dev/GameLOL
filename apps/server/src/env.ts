/**
 * Centralised, validated environment configuration for the server. Reading env
 * vars in exactly one place keeps deploy config predictable.
 */
import 'dotenv/config';
import { DEFAULT_SERVER_PORT } from '@game/shared';

const parsePort = (value: string | undefined, fallback: number): number => {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Allowed browser origins for CORS / Socket.IO. Accepts a comma-separated list.
 * In development we default to the Next.js dev server. Use "*" to allow any
 * origin (handy for LAN play; tighten for production).
 */
const parseOrigins = (value: string | undefined): string[] | '*' => {
  if (!value || value.trim() === '*') return '*';
  return value
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parsePort(process.env.PORT, DEFAULT_SERVER_PORT),
  clientOrigin: parseOrigins(process.env.CLIENT_ORIGIN ?? 'http://localhost:3000'),
} as const;
