import { motion } from 'framer-motion';

export type GlyphPhase = 'processing' | 'success' | 'error';

// One ring that spins while work is in flight, closes into a full circle on success and
// hands over to a drawn checkmark (the Stripe-style settle). Errors draw an X instead.
export function StatusGlyph({ phase, size = 28, stroke = 2.5 }: { phase: GlyphPhase; size?: number; stroke?: number }) {
  const ok = phase === 'success';
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      {phase === 'error' ? (
        <>
          <motion.path d="M9 9l10 10" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25 }} />
          <motion.path d="M19 9L9 19" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: 0.1 }} />
        </>
      ) : (
        <>
          <motion.circle
            cx="14" cy="14" r="11"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            initial={{ pathLength: 0.28, rotate: 0 }}
            animate={ok ? { pathLength: 1, rotate: 0, opacity: 0.45 } : { pathLength: 0.28, rotate: 360 }}
            transition={ok ? { duration: 0.55, ease: [0.22, 1, 0.36, 1] } : { repeat: Infinity, ease: 'linear', duration: 0.9 }}
          />
          <motion.path
            d="M8.5 14.5l4 4 7-8.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={ok ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
            transition={{ delay: ok ? 0.4 : 0, duration: 0.4, ease: 'easeOut' }}
          />
        </>
      )}
    </motion.svg>
  );
}
