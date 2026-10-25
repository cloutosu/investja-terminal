import { useCallback, useEffect, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Check, CornerDownLeft, Delete } from 'lucide-react';
import type { Role } from '../types';
import { api, session } from '../lib/api';

const TEAM = import.meta.env.VITE_TARGET_TEAM || 'Rahman Power Squared';
const MAX_LEN = 12;
const MIN_BOXES = 5;
const STEP_MS = 400;

export function PinAuth({ onUnlock }: { onUnlock: (role: Role) => void }) {
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'entry' | 'checking' | 'sequence'>('entry');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<Role>('owner');
  const [shown, setShown] = useState(0);
  const [barFull, setBarFull] = useState(false);
  const shake = useAnimation();

  const steps = [
    'Authenticating credentials...',
    'Verifying access code...',
    `Access level: ${role}`,
    'Synchronizing ledger...',
    `Welcome, ${TEAM}`,
  ];

  const press = useCallback((d: string) => {
    if (stage !== 'entry') return;
    setMessage('');
    setCode((c) => (c.length < MAX_LEN ? c + d : c));
  }, [stage]);
  const back = useCallback(() => setCode((c) => c.slice(0, -1)), []);

  const submit = useCallback(async () => {
    if (stage !== 'entry' || !code) return;
    setStage('checking');
    try {
      const r = await api.auth(code);
      if (r.token && r.role) {
        session.set(r.token, r.role);
        setRole(r.role);
        setStage('sequence');
        return;
      }
      setMessage(r.message || 'Incorrect code.');
    } catch (e) {
      setMessage((e as Error).message || 'Could not reach the server.');
    }
    void shake.start({ x: [0, -8, 8, -8, 0], transition: { duration: 0.3 } });
    setCode('');
    setStage('entry');
  }, [code, stage, shake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, back, submit]);

  useEffect(() => {
    if (stage !== 'sequence') return;
    const id = setInterval(() => setShown((n) => Math.min(n + 1, steps.length)), STEP_MS);
    return () => clearInterval(id);
  }, [stage, steps.length]);

  useEffect(() => {
    if (shown < steps.length) return;
    const t = setTimeout(() => setBarFull(true), STEP_MS / 2);
    return () => clearTimeout(t);
  }, [shown, steps.length]);

  const boxes = Math.max(MIN_BOXES, code.length);

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
        <h1 className="mb-8 text-2xl font-medium tracking-tight">{stage === 'sequence' ? 'Access granted' : 'Enter access code'}</h1>

        {stage !== 'sequence' && (
          <>
            <div className="mb-3 flex justify-center gap-2">
              {Array.from({ length: boxes }, (_, i) => (
                <div
                  key={i}
                  className={`num flex h-14 min-w-0 flex-1 items-center justify-center rounded-2xl border bg-tint text-lg transition-colors ${i === code.length ? 'border-line-focus' : 'border-line-strong'}`}
                >
                  {code[i] ? '•' : ''}
                </div>
              ))}
            </div>
            <div className="num mb-5 min-h-8 text-xs text-ink-3">{stage === 'checking' ? 'Checking...' : message}</div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                <button key={k} disabled={stage !== 'entry'} onClick={() => press(k)} className="btn num h-14 !rounded-full text-[1rem]">{k}</button>
              ))}
              <button disabled={stage !== 'entry'} onClick={() => setCode('')} className="btn h-14 !rounded-full">Clear</button>
              <button disabled={stage !== 'entry'} onClick={() => press('0')} className="btn num h-14 !rounded-full text-[1rem]">0</button>
              <button disabled={stage !== 'entry'} onClick={back} aria-label="Backspace" className="btn flex h-14 items-center justify-center !rounded-full"><Delete size={16} /></button>
            </div>
            <button disabled={stage !== 'entry' || !code} onClick={() => void submit()} className="btn-primary mt-3 flex h-12 w-full items-center justify-center gap-2 disabled:opacity-40">
              Unlock <CornerDownLeft size={14} />
            </button>
          </>
        )}

        {stage === 'sequence' && (
          <div>
            <ul className="num mb-6 flex flex-col gap-2 text-xs">
              {steps.slice(0, shown).map((line, i) => (
                <motion.li key={line} className="flex items-center gap-3 text-ink-2" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
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
                onAnimationComplete={() => barFull && onUnlock(role)}
              />
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
