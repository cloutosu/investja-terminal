import { useEffect, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface Props { title?: string; onClose: () => void; children: ReactNode; width?: string; hideClose?: boolean }

// Centered dialog on desktop, bottom sheet on phones.
export function Modal({ title, onClose, children, width = 'sm:max-w-xl', hideClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-md sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-line-strong bg-elevated p-6 pb-8 shadow-2xl shadow-black/40 sm:rounded-[28px] sm:pb-6 ${width}`}
        initial={{ y: 48, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 48, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-tint-2 sm:hidden" />
        {(title || !hideClose) && (
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-xl font-medium tracking-tight text-ink">{title}</h2>
            {!hideClose && (
              <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-tint text-ink-3 transition-colors hover:text-ink">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}
