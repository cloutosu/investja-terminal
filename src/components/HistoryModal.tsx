import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoryPoint } from '../types';
import { api } from '../lib/api';
import { money, signedMoney, signedPct } from '../lib/format';
import { etParts } from '../lib/market';
import { useTheme } from '../lib/theme';
import { EquityChart, type ChartMode, type ChartPoint, type ChartRange } from './EquityChart';
import { Modal } from './Modal';
import { Toggle } from './Toggle';

type View = 'historical' | 'projected';
const PROJECT_DAYS = 12;
const DAILY = 1.05;

export function HistoryModal({ teamName, history, onClose }: { teamName: string; history: HistoryPoint[]; onClose: () => void }) {
  const { colors } = useTheme();
  const [range, setRange] = useState<ChartRange>('1h');
  const [view, setView] = useState<View>('historical');
  const [mode, setMode] = useState<ChartMode>('equity');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  // the server records the top 20 and every team someone opens, from that moment on
  useEffect(() => { api.track(teamName).catch(() => {}); }, [teamName]);

  const series = useMemo(() => history.filter((p) => p.eq[teamName]), [history, teamName]);
  const latest = series.length ? series[series.length - 1].eq[teamName][0] : null;
  const first = useMemo(() => {
    const since = (history.at(-1)?.t ?? Date.now()) - { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 24 * 3600e3 }[range];
    return series.find((p) => p.t >= since)?.eq[teamName][0] ?? null;
  }, [series, history, range, teamName]);
  const change = latest !== null && first !== null ? latest - first : 0;
  const target = latest !== null ? latest * Math.pow(DAILY, PROJECT_DAYS) : null;
  const up = view === 'projected' || change >= 0;
  const stroke = up ? colors.gain : colors.loss;
  const projected = useMemo(
    () => (latest === null ? [] : Array.from({ length: PROJECT_DAYS + 1 }, (_, d) => ({ label: d === 0 ? 'Today' : `+${d}d`, value: latest * Math.pow(DAILY, d) }))),
    [latest],
  );
  const hhmm = (ms: number) => { const p = etParts(ms); return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')} ET`; };

  return (
    <Modal title={teamName} onClose={onClose} width="sm:max-w-3xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="num">
          <div className="text-xs text-ink-3">{scrub ? hhmm(scrub.t) : view === 'historical' ? `Last ${range}` : 'If +5% a day'}</div>
          <div className="numx text-3xl text-ink">{scrub ? (mode === 'earned' ? signedMoney(scrub.value) : money(scrub.value)) : latest !== null ? money(latest) : '—'}</div>
          {view === 'historical' && first !== null && first > 0 && !scrub && (
            <div className={`mt-1 text-xs ${change >= 0 ? 'text-gain' : 'text-loss'}`}>{signedMoney(change)} ({signedPct((change / first) * 100)}) over {range}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle id="hm-view" value={view} onChange={setView} options={[{ id: 'historical', label: 'Historical' }, { id: 'projected', label: `Projected (${PROJECT_DAYS}d)` }]} />
          {view === 'historical' && <Toggle id="hm-mode" value={mode} onChange={setMode} options={[{ id: 'equity', label: 'Equity' }, { id: 'earned', label: 'Change' }]} />}
          {view === 'historical' && <Toggle id="hm-range" value={range} onChange={setRange} options={(['1h', '6h', '24h'] as ChartRange[]).map((r) => ({ id: r, label: r }))} />}
        </div>
      </div>

      <div className="h-72">
        {view === 'historical' ? (
          <EquityChart teamName={teamName} history={history} anchorEquity={null} mode={mode} range={range} onScrub={setScrub} />
        ) : projected.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-3">No data for this team yet. It's being tracked now.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projected} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: colors.ink3, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} minTickGap={32} />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', borderRadius: 12, fontFamily: 'JetBrains Mono', fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2.5} strokeDasharray="6 4" fill="url(#proj)" isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {view === 'projected' && target !== null && (
        <div className="num mt-6 text-sm text-ink-2">Target if +5%/day: <span className="text-ink">{money(target)}</span></div>
      )}
    </Modal>
  );
}
