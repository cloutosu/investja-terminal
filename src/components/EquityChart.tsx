import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from '../types';
import { useTheme } from '../lib/theme';

export type ChartMode = 'equity' | 'earned';
export type ChartRange = '1h' | '6h' | '24h';
export interface ChartPoint { t: number; value: number }

const RANGE_MS: Record<ChartRange, number> = { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 24 * 3600e3 };
const MAX_POINTS = 360;
const TICK_BARS = 36;

interface Props {
  teamName: string;
  history: HistoryPoint[];
  anchorEquity: number | null;
  mode: ChartMode;
  range: ChartRange;
  onScrub: (p: ChartPoint | null) => void;
}

function Scrubber({ active, payload, onScrub }: { active?: boolean; payload?: { payload: ChartPoint }[]; onScrub: (p: ChartPoint | null) => void }) {
  const point = active && payload?.length ? payload[0].payload : null;
  const t = point?.t ?? null;
  useEffect(() => { onScrub(point); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function PulseDot({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (cx === undefined || cy === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={color} opacity={0.35}>
        <animate attributeName="r" values="4;11;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4} fill={color} />
    </g>
  );
}

export function EquityChart({ teamName, history, anchorEquity, mode, range, onScrub }: Props) {
  const { colors } = useTheme();
  const [drawIn, setDrawIn] = useState(true);
  const rows = useMemo(() => {
    const since = (history.at(-1)?.t ?? Date.now()) - RANGE_MS[range];
    return history.filter((p) => p.t >= since && p.eq[teamName]).map((p) => ({ timestamp: p.t, equity: p.eq[teamName][0] }));
  }, [history, teamName, range]);

  // draw-in only on first paint of a range; live updates after that must not re-animate the line
  useEffect(() => {
    setDrawIn(true);
    const t = setTimeout(() => setDrawIn(false), 1200);
    return () => clearTimeout(t);
  }, [range, mode]);

  const base = anchorEquity ?? rows[0]?.equity ?? 0;
  const points = useMemo<ChartPoint[]>(() => {
    const stride = Math.max(1, Math.ceil(rows.length / MAX_POINTS));
    const out: ChartPoint[] = [];
    rows.forEach((r, i) => {
      if (i % stride === 0 || i === rows.length - 1) out.push({ t: r.timestamp, value: mode === 'earned' ? r.equity - base : r.equity });
    });
    return out;
  }, [rows, mode, base]);

  const bars = useMemo(() => {
    const tail = rows.slice(-(TICK_BARS + 1));
    const real = tail.slice(1).map((r, i) => ({ t: r.timestamp, d: r.equity - tail[i].equity as number | null }));
    // left-pad so early on the bars stay thin and the series grows in from the right
    const pad = Array.from({ length: Math.max(0, TICK_BARS - real.length) }, (_, i) => ({ t: -(i + 1), d: null as number | null }));
    return [...pad.reverse(), ...real];
  }, [rows]);

  const last = points[points.length - 1];
  const up = !last || (mode === 'earned' ? last.value >= 0 : last.value >= points[0].value);
  const stroke = up ? colors.gain : colors.loss;

  const domain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 1];
    let lo = Math.min(...points.map((p) => p.value));
    let hi = Math.max(...points.map((p) => p.value));
    if (mode === 'earned') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.18 || Math.max(Math.abs(hi) * 0.001, 1);
    return [lo - pad, hi + pad];
  }, [points, mode]);

  const gid = `eq-${up ? 'u' : 'd'}`;

  if (points.length < 2) {
    return <div className="flex h-full items-center justify-center text-sm text-ink-3">Collecting ticks… the line starts drawing after a couple of minutes of data.</div>;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 12, right: 6, bottom: 0, left: 6 }} onMouseLeave={() => onScrub(null)}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} hide />
            <YAxis hide domain={domain} />
            {mode === 'earned' && <ReferenceLine y={0} stroke={colors.ink3} strokeDasharray="3 5" strokeOpacity={0.7} />}
            <Tooltip content={<Scrubber onScrub={onScrub} />} cursor={{ stroke: colors.ink3, strokeDasharray: '3 3' }} isAnimationActive={false} />
            <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} fill={`url(#${gid})`} dot={false} isAnimationActive={drawIn} animationDuration={900} activeDot={{ r: 5, fill: stroke, stroke: 'none' }} />
            <ReferenceDot x={last.t} y={last.value} ifOverflow="extendDomain" shape={(p: { cx?: number; cy?: number }) => <PulseDot cx={p.cx} cy={p.cy} color={stroke} />} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="h-10" title="Change per poll tick">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 0, right: 6, bottom: 0, left: 6 }} barCategoryGap={2}>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={[(m: number) => Math.min(m, -0.01), (m: number) => Math.max(m, 0.01)]} />
            <ReferenceLine y={0} stroke={colors.ink3} strokeOpacity={0.4} />
            <Bar dataKey="d" isAnimationActive={false} radius={2} maxBarSize={8}>
              {bars.map((b) => <Cell key={b.t} fill={(b.d ?? 0) >= 0 ? colors.gain : colors.loss} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
