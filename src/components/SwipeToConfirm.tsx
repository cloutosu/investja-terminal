import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { ChevronsRight } from 'lucide-react';
import { StatusGlyph } from './StatusGlyph';

type Phase = 'idle' | 'processing' | 'success' | 'error';
export interface ConfirmResult { ok: boolean; message?: string }
interface Props {
  label: string;
  processingLabel?: string;
  successLabel?: string;
  tone?: 'gain' | 'loss' | 'accent';
  disabled?: boolean;
  onConfirm: () => Promise<ConfirmResult>;
  onSettled?: (r: ConfirmResult) => void;
}

const THUMB = 52;
const PAD = 4;
const THRESHOLD = 0.82;
const MIN_WORK_MS = 800; // long enough for the ring to read as "working"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SwipeToConfirm({ label, processingLabel = 'Processing', successLabel = 'Done', tone = 'accent', disabled, onConfirm, onSettled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(240);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const x = useMotionValue(0);
  const fill = useTransform(x, (v) => v + THUMB + PAD * 2);
  const labelOpacity = useTransform(x, [0, Math.max(max * 0.45, 1)], [1, 0]);
  const color = `var(--${tone === 'accent' ? 'accent' : tone})`;
  const onColor = tone === 'accent' ? 'var(--accent-ink)' : 'var(--on-color)';

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMax(Math.max(el.clientWidth - THUMB - PAD * 2, 1)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const run = useCallback(async () => {
    if (phase !== 'idle' || disabled) return;
    setPhase('processing');
    setError(null);
    void animate(x, max, { type: 'spring', stiffness: 260, damping: 28 });
    let result: ConfirmResult;
    try {
      [result] = await Promise.all([onConfirm(), sleep(MIN_WORK_MS)]);
    } catch (e) {
      result = { ok: false, message: (e as Error).message };
    }
    if (result.ok) {
      setPhase('success');
    } else {
      setPhase('error');
      setError(result.message ?? 'Failed');
      await sleep(1600);
      await animate(x, 0, { type: 'spring', stiffness: 220, damping: 26 });
      setPhase('idle');
    }
    onSettled?.(result);
  }, [phase, disabled, x, max, onConfirm, onSettled]);

  useEffect(() => { if (phase === 'idle') x.set(0); }, [max, phase, x]);

  const done = phase === 'success';

  return (
    <motion.div
      ref={trackRef}
      animate={phase === 'error' ? { x: [0, -8, 8, -6, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      className={`relative h-[60px] select-none overflow-hidden rounded-full border border-line-strong bg-tint ${disabled ? 'opacity-50' : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void run(); } }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: fill,
          background: done ? color : `color-mix(in srgb, ${color} ${phase === 'error' ? 28 : 24}%, transparent)`,
          transition: 'background 450ms',
        }}
      />
      <motion.div style={{ opacity: phase === 'idle' ? labelOpacity : 1 }} className="pointer-events-none absolute inset-0 flex items-center justify-center pl-8 text-sm font-medium">
        {phase === 'idle' && <span className="sheen-text">{label}</span>}
        {phase === 'processing' && <span className="text-ink-2">{processingLabel}…</span>}
        {phase === 'success' && <span style={{ color: onColor }}>{successLabel}</span>}
        {phase === 'error' && <span className="px-16 text-center text-xs text-loss">{error}</span>}
      </motion.div>
      <motion.div
        drag={phase === 'idle' && !disabled ? 'x' : false}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, width: THUMB, height: THUMB, top: PAD, left: PAD, background: phase === 'error' ? 'var(--loss)' : color, color: phase === 'error' ? 'var(--on-color)' : onColor }}
        onDragEnd={() => { if (x.get() >= max * THRESHOLD) void run(); else void animate(x, 0, { type: 'spring', stiffness: 400, damping: 32 }); }}
        whileTap={phase === 'idle' ? { scale: 0.96 } : undefined}
        className={`absolute z-10 flex items-center justify-center rounded-full ${phase === 'idle' ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {phase === 'idle' ? <ChevronsRight size={22} className="chev" /> : <StatusGlyph phase={phase} />}
      </motion.div>
    </motion.div>
  );
}
