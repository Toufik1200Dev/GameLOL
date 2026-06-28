/** Client-side environment access. NEXT_PUBLIC_* vars are inlined at build time. */
const normalizeServerUrl = (value: string | undefined): string => {
  const raw = value?.trim();
  if (!raw) return 'http://localhost:4000';

  const candidate = raw
    .split(/[;,\s]+/) // some deploy envs may inject multiple values in one string
    .map((v) => v.trim())
    .filter(Boolean)[0];

  return candidate ?? 'http://localhost:4000';
};

export const SERVER_URL = normalizeServerUrl(process.env.NEXT_PUBLIC_SERVER_URL);
