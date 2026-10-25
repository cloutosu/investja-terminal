import { useEffect, useMemo, useState } from 'react';
import type { TeamWithDelta } from '../types';
import { deltaDecimals, signedMoney, signedPct } from '../lib/format';
import { useToast } from './Toaster';

const BIG_MOVE_PCT = 10;
const TOP_RANKS = 10;
const FLASH_MS = 2000;

export function ThreatRadar({ teams, myTeam }: { teams: TeamWithDelta[]; myTeam: string }) {
  const toast = useToast();
  const [flash, setFlash] = useState<Set<string>>(new Set());

  const movers = useMemo(
    () => teams.filter((t) => t.name !== myTeam && t.deltaDollar > 0).sort((a, b) => b.deltaDollar - a.deltaDollar).slice(0, 3),
    [teams, myTeam],
  );

  useEffect(() => {
    const big = teams.filter((t) => t.name !== myTeam && t.rank <= TOP_RANKS && t.deltaPercent > BIG_MOVE_PCT);
    if (!big.length) return;
    for (const t of big) toast(`⚠ ${t.name} made a big move (${signedMoney(t.deltaDollar)})`, 'warn');
    setFlash(new Set(big.map((t) => t.name)));
    const id = setTimeout(() => setFlash(new Set()), FLASH_MS);
    return () => clearTimeout(id);
  }, [teams, myTeam, toast]);

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-medium tracking-tight">Threat Radar</h2>
      {movers.length === 0 ? (
        <p className="text-sm text-ink-3">No competitor gains this tick.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {movers.map((t) => (
            <li key={t.name} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-500 ${flash.has(t.name) ? 'bg-loss/10' : ''}`}>
              <span className="text-gain">▲</span>
              <span className="flex-1 truncate text-ink">{t.name}</span>
              <span className="num text-xs text-gain">
                {signedMoney(t.deltaDollar, deltaDecimals(t.deltaDollar))} ({signedPct(t.deltaPercent)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
