/**
 * Firebase client initialisation. Only Analytics is used here (no auth/db), so
 * the config is the public web config — safe to ship in the client bundle; real
 * security for Firebase products lives in server-side rules, not these keys.
 *
 * Analytics only works in the browser (it touches `window`), so init is lazy
 * and guarded by `isSupported()` — important for static export / SSR builds.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyApBbtNoT6IqRD-9URyzHK35sg0eCozqD4',
  authDomain: 'lol-game-de44b.firebaseapp.com',
  projectId: 'lol-game-de44b',
  storageBucket: 'lol-game-de44b.firebasestorage.app',
  messagingSenderId: '495491638738',
  appId: '1:495491638738:web:bc59376d2164743350140b',
  measurementId: 'G-072GBK2M6N',
};

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let analytics: Analytics | null = null;

/** Initialise Google Analytics in the browser (no-op on the server / unsupported). */
export async function initAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (analytics) return analytics;
  if (!(await isSupported())) return null;
  analytics = getAnalytics(getFirebaseApp());
  return analytics;
}
