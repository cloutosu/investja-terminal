import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Snapshot } from '../types';
import { readSnapshots, trackTeam } from '../lib/db';
import { int, money, signedMoney, signedPct } from '../lib/format';
import { etParts } from '../lib/market';
import { Modal } from './Modal';
import { useTheme } from '../lib/theme';

type Range = '1h' | '6h' | '24h';
type View = 'historical' | 'projected';
const RANGE_MS: Record<Range, number> = { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 24 * 3600e3 };
const MAX_POINTS = 500;
const PROJECT_DAYS = 12;
const DAILY = 1.05;

interface Point { t: number; label: string; value: number; rank?: number }

const hhmm = (ms: number, seconds = false) => {
  const p = etParts(ms);
  const base = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
  return seconds ? `${base}:${String(new Date(ms).getSeconds()).padStart(2, '0')}` : base;
};

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="num rounded-xl border border-line-strong bg-elevated px-3 py-2 text-xs">
      <div className="text-ink-3">{p.label}</div>
      <div className="text-ink">{money(p.value)}</div>
      {p.rank !== undefined && <div className="text-ink-3">rank {int(p.rank)}</div>}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`num rounded-full px-3 py-1 text-xs transition-colors ${value === o.id ? 'bg-tint-2 text-ink' : 'text-ink-3 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HistoryModal({ teamName, onClose }: { teamName: string; onClose: () => void }) {
  const { colors } = useTheme();
  const [range, setRange] = useState<Range>('1h');
  const [view, setView] = useState<View>('historical');
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    trackTeam(teamName);
    let alive = true;
    const load = async () => {
      const data = await readSnapshots(teamName, Date.now() - RANGE_MS[range]);
      if (alive) { setRows(data); setLoaded(true); }
    };
    void load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [teamName, range]);

  const points = useMemo<Point[]>(() => {
    const stride = Math.max(1, Math.ceil(rows.length / MAX_POINTS));
    const out: Point[] = [];
    rows.forEach((r, i) => {
      if (i % stride === 0 || i === rows.length - 1) {
        out.push({ t: r.timestamp, label: hhmm(r.timestamp, range === '1h'), value: r.equity, rank: r.rank });
      }
    });
    return out;
  }, [rows, range]);

  const latest = rows.length ? rows[rows.length - 1].equity : null;
  const first = rows.length ? rows[0].equity : null;
  const trendUp = latest === null || first === null || latest >= first;
  const stroke = trendUp ? colors.gain : colors.loss;
  const target = latest !== null ? latest * Math.pow(DAILY, PROJECT_DAYS) : null;

  const projected = useMemo<Point[]>(() => {
    if (latest === null) return [];
    return Array.from({ length: PROJECT_DAYS + 1 }, (_, d) => ({
      t: d,
      label: d === 0 ? 'Today' : `+${d}d`,
      value: latest * Math.pow(DAILY, d),
    }));
  }, [latest]);

  const data = view === 'projected' ? projected : points;
  const gradId = `fill-${trendUp ? 'up' : 'down'}`;
    const change = latest !== null && first !== null ? latest - first : 0;

  return (
    <Modal title={teamName} onClose={onClose} width="sm:max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="num">
          <div className="text-2xl text-ink">{latest !== null ? money(latest) : '—'}</div>
          {view === 'historical' && first !== null && first > 0 && (
            <div className={`mt-1 text-xs ${change >= 0 ? 'text-gain' : 'text-loss'}`}>
              {signedMoney(change)} ({signedPct((change / first) * 100)}) over {range}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Toggle value={view} onChange={setView} options={[{ id: 'historical', label: 'Historical' }, { id: 'projected', label: `Projected (${PROJECT_DAYS}d)` }]} />
          {view === 'historical' && (
            <Toggle value={range} onChange={setRange} options={(['1h', '6h', '24h'] as Range[]).map((r) => ({ id: r, label: r }))} />
          )}
        </div>
      </div>

      <div className="h-72">
        {data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-ink-3">
            {loaded ? 'Collecting snapshots. This team is now tracked; the chart fills in every poll.' : 'Loading...'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: colors.ink3, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip content={<Tip />} cursor={{ stroke: colors.ink3 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray={view === 'projected' ? '6 4' : undefined}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {view === 'projected' && target !== null && (
        <div className="num mt-6 text-sm text-ink-2">
          Target if +5%/day: <span className="text-ink">{money(target)}</span>
        </div>
      )}
    </Modal>
  );
}
