import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TeamWithDelta } from '../types';
import { deltaDecimals, int, money, signedMoney, tone } from '../lib/format';

type SortKey = 'rank' | 'equity' | 'delta';
const DEFAULT_ROWS = 50;
const ANIMATE_LIMIT = 200; // layout animation on 2,500 rows would stall the main thread

interface Props { teams: TeamWithDelta[]; myTeam: string; onOpenTeam: (name: string) => void }

interface RowProps { team: TeamWithDelta; isMe: boolean; animate: boolean; onOpen: (name: string) => void }

const Row = memo(function Row({ team, isMe, animate, onOpen }: RowProps) {
  const d = team.deltaDollar;
  const cells = (
    <>
      <td className="num w-9 pl-2 text-xs text-ink-3 sm:w-14 sm:pl-4 sm:text-[inherit]">{int(team.rank)}</td>
      <td className="max-w-[8.5rem] truncate pr-2 text-ink sm:max-w-56 sm:pr-4">
        {team.name}
        {isMe && <span className="num ml-1.5 rounded-full border px-1.5 py-px text-label sm:ml-2 sm:px-2 text-accent-ink bg-accent border-transparent">YOU</span>}
      </td>
      <td className="hidden max-w-48 truncate pr-4 text-ink-3 md:table-cell">{team.school}</td>
      <td className="num pr-2 text-right text-xs text-ink sm:pr-4 sm:text-sm">{money(team.equity)}</td>
      <td className={`num pr-1 text-right text-xs sm:pr-4 sm:text-sm ${tone(d)}`}>
        {d === 0 ? '—' : <><span className="max-sm:hidden">{d > 0 ? '▲' : '▼'} </span>{signedMoney(d, deltaDecimals(d))}</>}
      </td>
    </>
  );
  const cls = `h-12 cursor-pointer text-sm transition-colors hover:bg-tint ${isMe ? 'bg-tint' : ''}`;
  return animate ? (
    <motion.tr layout transition={{ duration: 0.25 }} className={cls} onClick={() => onOpen(team.name)}>{cells}</motion.tr>
  ) : (
    <tr className={cls} onClick={() => onOpen(team.name)}>{cells}</tr>
  );
});

function Th({ label, k, sort, dir, onSort, className = '' }: {
  label: string; k?: SortKey; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = k === sort;
  return (
    <th className={`label h-8 text-left font-normal ${className}`}>
      {k ? (
        <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase transition-colors hover:text-ink ${active ? 'text-ink-2' : ''}`}>
          {label}
          {active && (dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        </button>
      ) : label}
    </th>
  );
}

export function Leaderboard({ teams, myTeam, onOpenTeam }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<SortKey>('rank');
  const [dir, setDir] = useState<1 | -1>(1);
  const [query, setQuery] = useState('');

  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === 1 ? -1 : 1));
    else { setSort(k); setDir(k === 'rank' ? 1 : -1); }
  };

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? teams.filter((t) => t.name.toLowerCase().includes(q) || t.school.toLowerCase().includes(q)) : teams;
    const val = (t: TeamWithDelta) => (sort === 'rank' ? t.rank : sort === 'equity' ? t.equity : t.deltaDollar);
    return [...base].sort((a, b) => (val(a) - val(b)) * dir || a.rank - b.rank);
  }, [teams, sort, dir, query]);

  const visible = showAll || query ? sorted : sorted.slice(0, DEFAULT_ROWS);
  const me = teams.find((t) => t.name === myTeam);
  const pinMe = !!me && !showAll && !query && !visible.some((t) => t.name === myTeam);
  const animate = visible.length <= ANIMATE_LIMIT;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-medium tracking-tight">Leaderboard</h2>
          <span className="num text-xs text-ink-3">{int(teams.length)} teams</span>
        </div>
        <div className="flex items-center gap-2">
          <input className="field w-40 sm:w-52 !rounded-full !py-1.5 text-xs" placeholder="Search team or school" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" onClick={() => setShowAll((s) => !s)}>{showAll ? `Show top ${DEFAULT_ROWS}` : 'Show all'}</button>
        </div>
      </div>
      <div className={`overflow-auto ${showAll ? 'max-h-[70vh]' : ''}`}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-elevated">
            <tr>
              <Th label="#" k="rank" sort={sort} dir={dir} onSort={onSort} className="pl-2 sm:pl-4" />
              <Th label="Team" sort={sort} dir={dir} onSort={onSort} className="pl-2" />
              <Th label="School" sort={sort} dir={dir} onSort={onSort} className="hidden md:table-cell" />
              <Th label="Equity" k="equity" sort={sort} dir={dir} onSort={onSort} className="pr-2 text-right sm:pr-4" />
              <Th label="Delta" k="delta" sort={sort} dir={dir} onSort={onSort} className="pr-1 text-right sm:pr-4" />
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <Row key={t.name} team={t} isMe={t.name === myTeam} animate={animate} onOpen={onOpenTeam} />
            ))}
            {pinMe && me && (
              <>
                <tr><td colSpan={5} className="py-1 text-center text-ink-3">···</td></tr>
                <Row team={me} isMe animate={false} onOpen={onOpenTeam} />
              </>
            )}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-ink-3">{teams.length ? 'No matches.' : 'Waiting for first sync...'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
