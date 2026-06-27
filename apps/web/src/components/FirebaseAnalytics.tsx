'use client';

/** Fires Firebase Analytics once on the client. Renders nothing. */
import { useEffect } from 'react';
import { initAnalytics } from '../lib/firebase';

export function FirebaseAnalytics() {
  useEffect(() => {
    void initAnalytics();
  }, []);
  return null;
}
