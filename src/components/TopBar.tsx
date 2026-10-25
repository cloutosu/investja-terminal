import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Lock, Plus } from 'lucide-react';
import type { Pulse } from '../types';
import { int, money, signedMoney, signedPct } from '../lib/format';
import { etParts, etTime } from '../lib/market';
import { setTheme, THEMES, useTheme, type ThemeId } from '../lib/theme';
import { AnimatedNumber } from './AnimatedNumber';
import { EquityChart, type ChartMode, type ChartPoint, type ChartRange } from './EquityChart';
import type { TradeInit } from './TradeModal';

interface Props {
  teamName: string;
  equity: number | null;
  dayDelta: { dollar: number; percent: number } | null;
  anchorEquity: number | null;
  cash: number;
  loan: number;
  positions: number;
  live: boolean;
  marketOpen: boolean;
  pulse: Pulse | null;
  tick: number;
  onTrade: (init: TradeInit) => void;
  onLock: () => void;
}

const MAX_LOAN = 50000;

function greeting() {
  const h = etParts().h;
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function ThemeDots() {
  const { id } = useTheme();
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line-strong bg-tint p-1" role="radiogroup" aria-label="Theme">
      {(Object.keys(THEMES) as ThemeId[]).map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={id === t}
          title={THEMES[t].label}
          onClick={() => setTheme(t)}
          className={`h-5 w-5 rounded-full border transition-transform ${id === t ? 'scale-110 border-line-focus' : 'border-transparent opacity-70 hover:opacity-100'}`}
          style={{ background: t === 'ember' ? 'linear-gradient(135deg,#f26b1d,#3a0f0c)' : t === 'frost' ? 'linear-gradient(135deg,#ffffff,#9aa8b2)' : 'linear-gradient(135deg,#f3d9c8,#c9a48f)' }}
        />
      ))}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="relative flex rounded-full border border-line-strong bg-tint p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={`relative z-10 rounded-full px-3 py-1 text-xs transition-colors ${value === o.id ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}>
          {value === o.id && <motion.span layoutId={`tg-${options[0].id}`} className="absolute inset-0 -z-10 rounded-full bg-tint-2" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Action({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.94 }} onClick={onClick} className="group flex flex-col items-center gap-2">
      <span className={`flex h-14 w-14 items-center justify-center rounded-full border transition-colors sm:h-16 sm:w-16 ${primary ? 'border-transparent bg-accent text-accent-ink' : 'border-line-strong bg-tint text-ink group-hover:bg-tint-2'}`}>
        {icon}
      </span>
      <span className="text-xs text-ink-2">{label}</span>
    </motion.button>
  );
}

export function TopBar({ teamName, equity, dayDelta, anchorEquity, cash, loan, positions, live, marketOpen, pulse, tick, onTrade, onLock }: Props) {
  const { colors } = useTheme();
  const glow = useAnimationControls();
  const color = useAnimationControls();
  const [floater, setFloater] = useState<Pulse | null>(null);
  const [mode, setMode] = useState<ChartMode>('equity');
  const [range, setRange] = useState<ChartRange>('1h');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [flashSign, setFlashSign] = useState(1);

  useEffect(() => {
    if (!pulse) return;
    const gain = pulse.delta > 0;
    const accent = gain ? colors.gain : colors.loss;
    setFlashSign(gain ? 1 : -1);
    void glow.start({ opacity: [0, 1, 0], transition: { duration: 1.2, times: [0, 0.2, 1] } });
    void color.start({ color: [accent, accent, colors.ink], transition: { duration: 0.8, times: [0, 0.15, 1] } });
    setFloater(pulse);
    const t = setTimeout(() => setFloater(null), 1500);
    return () => clearTimeout(t);
  }, [pulse, glow, color, colors]);

  const buyingPower = cash + (MAX_LOAN - loan);
  const loanPct = Math.min(100, (loan / MAX_LOAN) * 100);
  const loanHot = loan >= 45000;
  const shownValue = scrub ? scrub.value : mode === 'earned' ? (dayDelta?.dollar ?? 0) : equity;
  const isEarned = mode === 'earned';

  return (
    <header className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-ink-3">{greeting()}</div>
          <div className="truncate text-[1rem] font-medium tracking-tight sm:text-lg">{teamName}</div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 text-label tracking-widest sm:flex">
            <motion.span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-gain' : 'bg-warn'}`} animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
            <span className={live ? 'text-ink-2' : 'text-warn'}>{live ? 'LIVE' : 'OFFLINE'}</span>
          </span>
          <span className={`hidden rounded-full border px-3 py-1 text-label tracking-widest sm:inline ${marketOpen ? 'border-line-strong text-ink-3' : 'border-warn/30 text-warn'}`}>
            {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
          </span>
          <ThemeDots />
          <button onClick={() => onTrade({})} className="btn-primary hidden items-center gap-2 lg:flex"><Plus size={14} />New trade</button>
          <button onClick={onLock} aria-label="Lock terminal" className="btn hidden items-center gap-2 lg:flex"><Lock size={13} />Lock</button>
        </div>
      </div>

      <motion.section
        className="card relative overflow-hidden p-5 sm:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full opacity-60 blur-3xl" style={{ background: 'radial-gradient(closest-side, var(--glow-a), transparent)' }} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={glow}
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(70% 90% at 30% 0%, color-mix(in srgb, var(${flashSign > 0 ? '--gain' : '--loss'}) 26%, transparent), transparent)` }}
        />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <Toggle value={mode} onChange={setMode} options={[{ id: 'equity', label: 'Equity' }, { id: 'earned', label: 'Earned today' }]} />
          <Toggle value={range} onChange={setRange} options={(['1h', '6h', '24h'] as ChartRange[]).map((r) => ({ id: r, label: r.toUpperCase() }))} />
        </div>

        <div className="relative mt-6">
          <div className="label">{scrub ? etTime(scrub.t) : isEarned ? 'Earned today' : 'Total equity'}</div>
          <div className="relative mt-2 inline-block max-w-full">
            <motion.div animate={color} className="numx text-hero text-ink">
              {shownValue === null ? '—' : scrub ? (isEarned ? signedMoney(scrub.value) : money(scrub.value)) : (
                <AnimatedNumber value={shownValue} format={(n) => (isEarned ? signedMoney(n) : money(n))} />
              )}
            </motion.div>
            <AnimatePresence>
              {floater && (
                <motion.span
                  key={floater.id}
                  className={`num pointer-events-none absolute -top-1 right-0 translate-x-1/4 text-sm whitespace-nowrap ${floater.delta > 0 ? 'text-gain' : 'text-loss'}`}
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: -20 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                >
                  {signedMoney(floater.delta)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-3 flex items-center gap-3">
            {dayDelta ? (
              <span className={`num inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${dayDelta.dollar === 0 ? 'bg-tint text-ink-3' : dayDelta.dollar > 0 ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'}`}>
                {dayDelta.dollar === 0 ? '— flat today' : `${dayDelta.dollar > 0 ? '▲' : '▼'} ${signedMoney(dayDelta.dollar)} · ${signedPct(dayDelta.percent)} today`}
              </span>
            ) : <span className="text-xs text-ink-3">Waiting for the day's first snapshot</span>}
          </div>
        </div>

        <div className="relative mt-4 h-56 sm:h-72">
          <EquityChart teamName={teamName} anchorEquity={anchorEquity} tick={tick} mode={mode} range={range} onScrub={setScrub} />
        </div>

        <div className="relative mt-6 flex items-start justify-around sm:justify-center sm:gap-12">
          <Action primary icon={<ArrowUpRight size={22} />} label="Buy" onClick={() => onTrade({ action: 'buy' })} />
          <Action icon={<ArrowDownLeft size={22} />} label="Sell" onClick={() => onTrade({ action: 'sell' })} />
          <Action icon={<CalendarClock size={21} />} label="Schedule" onClick={() => onTrade({ mode: 'schedule' })} />
        </div>
      </motion.section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: 'Cash', value: money(cash), extra: null },
          { label: 'Loan', value: money(loan), extra: <div className="mt-3 h-1 overflow-hidden rounded-full bg-tint-2"><motion.div className={`h-full rounded-full ${loanHot ? 'bg-loss' : 'bg-ink-3'}`} initial={{ width: 0 }} animate={{ width: `${loanPct}%` }} transition={{ duration: 0.8 }} /></div>, hot: loanHot },
          { label: 'Buying power', value: money(buyingPower), extra: null },
          { label: 'Positions', value: int(positions), extra: null },
        ].map((k, i) => (
          <motion.div key={k.label} className="card p-4 sm:p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}>
            <div className="label">{k.label}</div>
            <div className={`numx mt-2 text-xl sm:text-2xl ${'hot' in k && k.hot ? 'text-loss' : 'text-ink'}`}>{k.value}</div>
            {k.extra}
          </motion.div>
        ))}
      </div>
    </header>
  );
}
