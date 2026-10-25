import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Lock, Plus } from 'lucide-react';
import type { HistoryPoint, MoverKey, MoverRow, Pulse } from '../types';
import { int, money, signedMoney, signedPct } from '../lib/format';
import { etParts, etTime } from '../lib/market';
import { setTheme, THEMES, useTheme, type ThemeId } from '../lib/theme';
import { AnimatedNumber } from './AnimatedNumber';
import { Sparkline } from './Sparkline';
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
  history: HistoryPoint[];
  mine: Partial<Record<MoverKey, MoverRow | null>>;
  canTrade: boolean;
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
          style={{ background: t === 'ember' ? '#27272a' : t === 'frost' ? '#d3d9de' : '#e6d6cf' }}
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

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line-strong bg-transparent px-4 py-2.5 text-sm text-ink transition-colors hover:bg-tint sm:flex-none sm:px-6"
    >
      {icon}
      {label}
    </motion.button>
  );
}

export function TopBar({ teamName, equity, dayDelta, anchorEquity, cash, loan, positions, live, marketOpen, pulse, history, mine, canTrade, onTrade, onLock }: Props) {
  const { colors } = useTheme();
  const border = useAnimationControls();
  const cardRef = useRef<HTMLElement>(null);
  const color = useAnimationControls();
  const [floater, setFloater] = useState<Pulse | null>(null);
  const [mode, setMode] = useState<ChartMode>('equity');
  const [range, setRange] = useState<ChartRange>('1h');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  useEffect(() => {
    if (!pulse) return;
    const gain = pulse.delta > 0;
    const accent = gain ? colors.gain : colors.loss;
    const idle = cardRef.current ? getComputedStyle(cardRef.current).borderTopColor : 'rgba(255,255,255,0.06)';
    void border.start({ borderColor: [idle, `${accent}80`, idle], transition: { duration: 1.1, times: [0, 0.2, 1] } });
    void color.start({ color: [accent, accent, colors.ink], transition: { duration: 0.8, times: [0, 0.15, 1] } });
    setFloater(pulse);
    const t = setTimeout(() => setFloater(null), 1500);
    return () => clearTimeout(t);
  }, [pulse, border, color, colors]);

  const buyingPower = cash + (MAX_LOAN - loan);
  const loanPct = Math.min(100, (loan / MAX_LOAN) * 100);
  const loanHot = loan >= 45000;
  const shownValue = scrub ? scrub.value : mode === 'earned' ? (dayDelta?.dollar ?? 0) : equity;
  const isEarned = mode === 'earned';

  // last hour of each metric, from the server's per-minute history (flat until a trade moves it)
  const series = useMemo(() => {
    const end = history.at(-1)?.t ?? 0;
    const hour = history.filter((p) => p.t >= end - 3600e3 && p.cash !== undefined && p.loan !== undefined);
    return {
      cash: hour.map((p) => p.cash as number),
      loan: hour.map((p) => p.loan as number),
      power: hour.map((p) => (p.cash as number) + (MAX_LOAN - (p.loan as number))),
    };
  }, [history]);
  const trend = (vals: number[], now: number, goodWhenUp: boolean) => {
    const v = vals.length >= 2 ? vals : [now, now];
    const d = v[v.length - 1] - v[0];
    const color = Math.abs(d) < 0.005 ? colors.ink3 : (d > 0) === goodWhenUp ? colors.gain : colors.loss;
    return { values: v, color };
  };
  const kpis: { label: string; value: string; hot?: boolean; loanBar?: boolean; spark?: { values: number[]; color: string } }[] = [
    { label: 'Cash', value: money(cash), spark: trend(series.cash, cash, true) },
    { label: 'Loan', value: money(loan), hot: loanHot, loanBar: true, spark: trend(series.loan, loan, false) },
    { label: 'Buying power', value: money(buyingPower), spark: trend(series.power, buyingPower, true) },
    { label: 'Positions', value: int(positions) },
  ];

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
          {canTrade && <button onClick={() => onTrade({})} className="btn-primary hidden items-center gap-2 lg:flex"><Plus size={14} />New trade</button>}
          <button onClick={onLock} aria-label="Lock terminal" className="btn hidden items-center gap-2 lg:flex"><Lock size={13} />Lock</button>
        </div>
      </div>

      <motion.section
        ref={cardRef}
        className="card relative overflow-hidden p-5 sm:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div animate={border} initial={false} className="pointer-events-none absolute inset-0 rounded-[24px] border border-transparent" />
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
          <EquityChart teamName={teamName} history={history} anchorEquity={anchorEquity} mode={mode} range={range} onScrub={setScrub} />
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(['1m', '5m', '15m', '1h', '6h', '24h'] as MoverKey[]).map((k) => {
            const m = mine[k];
            return (
              <div key={k} className="rounded-lg border border-line bg-tint px-3 py-2">
                <div className="label">{k}</div>
                <div className={`num mt-1 text-xs ${!m ? 'text-ink-3' : m.delta > 0 ? 'text-gain' : m.delta < 0 ? 'text-loss' : 'text-ink-3'}`}>
                  {m ? signedMoney(m.delta, Math.abs(m.delta) >= 1000 ? 0 : 2) : '—'}
                </div>
              </div>
            );
          })}
        </div>
        {canTrade && (
          <div className="relative mt-5 flex gap-2 sm:justify-start">
            <Action icon={<ArrowUpRight size={16} />} label="Buy" onClick={() => onTrade({ action: 'buy' })} />
            <Action icon={<ArrowDownLeft size={16} />} label="Sell" onClick={() => onTrade({ action: 'sell' })} />
            <Action icon={<CalendarClock size={16} />} label="Schedule" onClick={() => onTrade({ mode: 'schedule' })} />
          </div>
        )}
      </motion.section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <motion.div key={k.label} className="card p-3 sm:p-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}>
            <div className="label">{k.label}</div>
            <div className={`numx mt-1 text-lg sm:text-xl ${k.hot ? 'text-loss' : 'text-ink'}`}>{k.value}</div>
            {k.loanBar && (
              <div className="mt-2 h-0.5 overflow-hidden bg-loss/10" role="progressbar" aria-valuenow={Math.round(loanPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Loan used of $50,000">
                <motion.div className="h-full bg-loss" initial={{ width: 0 }} animate={{ width: `${loanPct}%` }} transition={{ duration: 0.8 }} />
              </div>
            )}
            {k.spark && <div className="mt-2"><Sparkline values={k.spark.values} color={k.spark.color} /></div>}
          </motion.div>
        ))}
      </div>
    </header>
  );
}
