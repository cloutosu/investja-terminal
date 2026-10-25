import { useCallback, useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Check, Delete } from 'lucide-react';

const PIN = import.meta.env.VITE_PIN ?? ''; // no fallback: the repo is public
const TEAM = import.meta.env.VITE_TARGET_TEAM || 'Rahman Power Squared';
const MAX_ATTEMPTS = 5;
const ATTEMPT_KEY = 'investja.pin.attempts';
const STEP_MS = 400;

const STEPS = [
  'Authenticating credentials...',
  `Verifying PIN [${PIN}]...`,
  'Logging in to Invest JA session...',
  'Synchronizing Dexie ledger...',
  `Welcome, ${TEAM}`,
];

const readAttempts = () => {
  try { return Number(sessionStorage.getItem(ATTEMPT_KEY) || 0); } catch { return 0; }
};

export function PinAuth({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState('');
  const [attempts, setAttempts] = useState(readAttempts);
  const [stage, setStage] = useState<'entry' | 'sequence'>('entry');
  const [shown, setShown] = useState(0);
  const [barFull, setBarFull] = useState(false);
  const shake = useAnimation();
  const locked = attempts >= MAX_ATTEMPTS || !PIN;

  const press = useCallback((d: string) => {
    if (locked || stage !== 'entry') return;
    setDigits((cur) => (cur.length < PIN.length ? cur + d : cur));
  }, [locked, stage]);
  const back = useCallback(() => setDigits((c) => c.slice(0, -1)), []);

  useEffect(() => {
    if (digits.length !== PIN.length || stage !== 'entry' || locked) return;
    if (digits === PIN) {
      setStage('sequence');
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    try { sessionStorage.setItem(ATTEMPT_KEY, String(next)); } catch { /* storage blocked */ }
    void shake.start({ x: [0, -8, 8, -8, 0], transition: { duration: 0.3 } });
    setDigits('');
  }, [digits, stage, locked, attempts, shake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, back]);

  useEffect(() => {
    if (stage !== 'sequence') return;
    const id = setInterval(() => setShown((n) => Math.min(n + 1, STEPS.length)), STEP_MS);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (shown < STEPS.length) return;
    const t = setTimeout(() => setBarFull(true), STEP_MS / 2);
    return () => clearTimeout(t);
  }, [shown]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-base p-4"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="ambient" />
      <motion.div animate={shake} className="relative z-10 w-full max-w-sm rounded-[32px] border border-line-strong bg-elevated p-8 shadow-2xl shadow-black/30">
        <div className="label mb-1">InvestJA Terminal</div>
        <h1 className="mb-8 text-2xl font-medium tracking-tight">
          {locked ? (PIN ? 'TERMINAL LOCKED.' : 'VITE_PIN not set') : stage === 'sequence' ? 'Access granted' : 'Enter PIN'}
        </h1>

        {stage === 'entry' && (
          <>
            <div className="mb-3 flex justify-between gap-2">
              {Array.from({ length: PIN.length }, (_, i) => (
                <div
                  key={i}
                  className={`num flex h-14 flex-1 items-center justify-center rounded-2xl border bg-tint text-lg ${
                    i === digits.length && !locked ? 'border-line-focus' : 'border-line-strong'
                  }`}
                >
                  {digits[i] ? '•' : ''}
                </div>
              ))}
            </div>
            <div className="num mb-6 h-4 text-xs text-ink-3">
              {locked ? 'Too many failed attempts.' : attempts > 0 ? `Incorrect PIN. ${MAX_ATTEMPTS - attempts} left.` : ''}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {keys.map((k) => (
                <button key={k} disabled={locked} onClick={() => press(k)} className="btn num h-14 !rounded-full text-[1rem]">{k}</button>
              ))}
              <button disabled={locked} onClick={() => setDigits('')} className="btn h-14 !rounded-full">Clear</button>
              <button disabled={locked} onClick={() => press('0')} className="btn num h-14 !rounded-full text-[1rem]">0</button>
              <button disabled={locked} onClick={back} aria-label="Backspace" className="btn flex h-14 items-center justify-center !rounded-full">
                <Delete size={16} />
              </button>
            </div>
          </>
        )}

        {stage === 'sequence' && (
          <div>
            <ul className="num mb-6 flex flex-col gap-2 text-xs">
              {STEPS.slice(0, shown).map((line, i) => (
                <motion.li
                  key={line}
                  className="flex items-center gap-3 text-ink-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <span className="text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1">{line}</span>
                  <Check size={14} className="text-gain" />
                </motion.li>
              ))}
            </ul>
            <div className="h-1.5 overflow-hidden rounded-full bg-tint-2">
              <motion.div
                className="h-full bg-gain"
                initial={{ width: '0%' }}
                animate={{ width: barFull ? '100%' : '0%' }}
                transition={{ duration: 0.8, ease: 'linear' }}
                onAnimationComplete={() => barFull && onUnlock()}
              />
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
