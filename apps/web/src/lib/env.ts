/** Client-side environment access. NEXT_PUBLIC_* vars are inlined at build time. */
export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000';
