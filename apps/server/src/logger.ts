/**
 * Tiny structured-ish console logger. Swappable for pino/winston later without
 * touching call sites.
 */
const ts = (): string => new Date().toISOString();

export const logger = {
  info: (msg: string, ...args: unknown[]): void => console.log(`[${ts()}] [info]  ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]): void => console.warn(`[${ts()}] [warn]  ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]): void =>
    console.error(`[${ts()}] [error] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]): void => {
    if (process.env.NODE_ENV !== 'production') console.debug(`[${ts()}] [debug] ${msg}`, ...args);
  },
};
