/**
 * Imperative navigation bridge. Next's router is only available inside React
 * components, but our stores/socket handlers need to navigate too. ClientRoot
 * registers the router's `push` here once; everything else calls `navigate()`
 * (by logical screen name or a raw path). Falls back to a hard location change
 * before the router is registered.
 */
type NavFn = (path: string) => void;

let navFn: NavFn | null = null;

export function setNavigator(fn: NavFn): void {
  navFn = fn;
}

/** Logical screen name → route path (one Next route per screen). */
export const SCREEN_ROUTES: Record<string, string> = {
  menu: '/',
  settings: '/settings',
  lobby: '/lobby',
  characterSelect: '/character',
  weaponSelect: '/weapon',
  mapSelect: '/map',
  game: '/game',
};

export function navigate(screenOrPath: string): void {
  const path = SCREEN_ROUTES[screenOrPath] ?? screenOrPath;
  if (navFn) navFn(path);
  else if (typeof window !== 'undefined') window.location.assign(path);
}
