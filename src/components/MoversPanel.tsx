import { useState } from 'react';
import { motion } from 'framer-motion';
import type { MoverKey, MoverRow, MoversData } from '../types';
import { money, signedMoney, signedPct } from '../lib/format';
import { Toggle } from './Toggle';

const KEYS: MoverKey[] = ['1m', '5m', '15m', '1h', '6h', '24h'];

function List({ title, rows, gain, onOpen, myTeam }: { title: string; rows: MoverRow[]; gain: boolean; onOpen: (n: string) => void; myTeam: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 1);
  return (
    <div>
      <div className="label mb-2">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">None.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.slice(0, 6).map((r) => (
            <li key={r.name}>
              <button onClick={() => onOpen(r.name)} className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-tint">
                <motion.span
                  className={`absolute inset-y-0 left-0 ${gain ? 'bg-gain/10' : 'bg-loss/10'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(Math.abs(r.delta) / max) * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="num relative w-8 text-xs text-ink-3">{r.rank}</span>
                <span className="relative min-w-0 flex-1 truncate text-ink">
                  {r.name}
                  {r.name === myTeam && <span className="num ml-2 rounded-full bg-accent px-2 py-px text-label text-accent-ink">YOU</span>}
                </span>
                <span className={`num relative text-xs ${gain ? 'text-gain' : 'text-loss'}`}>
                  {signedMoney(r.delta, Math.abs(r.delta) >= 1000 ? 0 : 2)} <span className="text-ink-3">{signedPct(r.pct)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MoversPanel({ movers, myTeam, onOpenTeam }: { movers: MoversData | null; myTeam: string; onOpenTeam: (n: string) => void }) {
  const [key, setKey] = useState<MoverKey>('5m');
  const w = movers?.windows[key];

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">Movement</h2>
        <Toggle id="movers" value={key} onChange={setKey} options={KEYS.map((k) => ({ id: k, label: k }))} />
      </div>
      {!w || !w.ready ? (
        <p className="py-6 text-center text-sm text-ink-3">
          Building the {key} baseline. Windows fill in as the server collects data (the 24h view needs a full day).
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {w.me && (
            <div className="rounded-2xl border border-line bg-tint px-4 py-3">
              <div className="label">You, last {key}</div>
              <div className={`numx mt-1 text-xl ${w.me.delta > 0 ? 'text-gain' : w.me.delta < 0 ? 'text-loss' : 'text-ink'}`}>
                {signedMoney(w.me.delta)} <span className="num text-xs text-ink-3">{signedPct(w.me.pct)} · {money(w.me.equity)}</span>
              </div>
            </div>
          )}
          <List title="Gaining" rows={w.gainers} gain onOpen={onOpenTeam} myTeam={myTeam} />
          <List title="Losing" rows={w.losers} gain={false} onOpen={onOpenTeam} myTeam={myTeam} />
        </div>
      )}
    </section>
  );
}
