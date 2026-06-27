'use client';

/** Transient toast notifications (errors/info) rendered top-right. */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUIStore, type Toast } from '../../stores/uiStore';

const COLORS: Record<Toast['type'], string> = {
  info: 'border-accent/50 bg-accent/10 text-accent',
  success: 'border-success/50 bg-success/10 text-success',
  error: 'border-danger/50 bg-danger/10 text-danger',
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useUIStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, dismissToast]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      onClick={() => dismissToast(toast.id)}
      className={`pointer-events-auto cursor-pointer rounded-lg border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur ${COLORS[toast.type]}`}
    >
      {toast.message}
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
