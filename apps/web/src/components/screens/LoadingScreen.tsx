'use client';

import { motion } from 'framer-motion';

/** Initial splash shown until the client shell mounts (also avoids SSR hydration
 *  mismatches from persisted/local-only state). */
export function LoadingScreen() {
  return (
    <div className="menu-grid-bg flex h-full w-full flex-col items-center justify-center gap-6">
      <motion.h1
        className="font-display text-5xl font-bold tracking-tight"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-accent">GAME</span>ONLINE
      </motion.h1>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="bg-accent h-full w-1/3 rounded-full"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}
