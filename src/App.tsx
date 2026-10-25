import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppData, DayAnchor, Portfolio, Pulse, TeamWithDelta } from './types';
import { fetchData } from './lib/api';
import { computeDeltas } from './lib/deltas';
import { importHistory, recordTracked } from './lib/db';
import { etTime, isMarketOpen } from './lib/market';
import { PinAuth } from './components/PinAuth';
import { TopBar } from './components/TopBar';
import { BottomNav, type Tab } from './components/BottomNav';
import { Leaderboard } from './components/Leaderboard';
import { PortfolioCard } from './components/PortfolioCard';
import { HistoryModal } from './components/HistoryModal';
import { ThreatRadar } from './components/ThreatRadar';
import { DailyReport } from './components/DailyReport';

const TARGET_TEAM = import.meta.env.VITE_TARGET_TEAM || 'Rahman Power Squared';
const AUTH_KEY = 'investja.auth';
const HAS_PIN = !!import.meta.env.VITE_PIN; // no PIN configured = no lock screen
const POLL_MS = 60_000;
const PULSE_MS = 3000;
const STALE_MS = 15 * 60_000; // GitHub's scheduler regularly runs late; past this we say so

const portfolioEquity = (p: Portfolio) => p.holdings.reduce((s, h) => s + h.totalValue, 0) + p.cash - p.loan;

// Which holding moved the most, in the same direction as the total, at constant quantity.
function attributeTicker(prev: Portfolio, next: Portfolio, direction: number): string | null {
  let best: { ticker: string; amount: number } | null = null;
  for (const h of next.holdings) {
    const before = prev.holdings.find((p) => p.ticker === h.ticker);
    if (!before) continue;
    const amount = (h.currentPrice - before.currentPrice) * h.quantity;
    if (Math.sign(amount) !== Math.sign(direction)) continue;
    if (!best || Math.abs(amount) > Math.abs(best.amount)) best = { ticker: h.ticker, amount };
  }
  return best?.ticker ?? null;
}

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};

export default function App() {
  const [authed, setAuthed] = useState(() => {
    if (!HAS_PIN) return true;
    try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch { return false; }
  });
  const prevEquitiesRef = useRef<Map<string, number>>(new Map());
  const prevPortfolioRef = useRef<Portfolio | null>(null);
  const prevMyEquityRef = useRef<number | null>(null);
  const lastTs = useRef(0);
  const pulseSeq = useRef(0);

  const [teams, setTeams] = useState<TeamWithDelta[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [anchor, setAnchor] = useState<DayAnchor | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [historyTeam, setHistoryTeam] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const show = (t: Tab) => (tab === t ? '' : 'max-lg:hidden');

  const pollLiveData = useCallback(async () => {
    try {
      const d: AppData = await fetchData();
      setError(null);
      if (d.timestamp === lastTs.current) return; // same scrape as last time
      lastTs.current = d.timestamp;
      console.log(`[poll] leaderboard: ${d.teams.length} teams, dashboard:`, { cash: d.portfolio.cash, loan: d.portfolio.loan });

      // first load: seed from the scraper's previous-run equities so deltas aren't all zero
      if (prevEquitiesRef.current.size === 0) {
        prevEquitiesRef.current = new Map(d.teams.flatMap((t) => (t.prevEquity !== undefined ? [[t.name, t.prevEquity] as [string, number]] : [])));
      }
      const withDeltas = computeDeltas(d.teams, prevEquitiesRef.current);
      prevEquitiesRef.current = new Map(d.teams.map((t) => [t.name, t.equity]));

      const myEquity = portfolioEquity(d.portfolio);
      const prevEq = prevMyEquityRef.current;
      if (prevEq !== null && Math.abs(myEquity - prevEq) >= 0.005) {
        const delta = myEquity - prevEq;
        const prevPf = prevPortfolioRef.current;
        setPulse({ id: ++pulseSeq.current, delta, ticker: prevPf ? attributeTicker(prevPf, d.portfolio, delta) : null });
      }
      prevMyEquityRef.current = myEquity;
      prevPortfolioRef.current = d.portfolio;

      setTeams(withDeltas);
      setPortfolio(d.portfolio);
      setAnchor(d.anchor);
      setSyncedAt(d.timestamp);

      await importHistory(d.history, TARGET_TEAM);
      await recordTracked(withDeltas, d.timestamp);
      setTick((n) => n + 1);
    } catch (e) {
      console.warn('[poll] failed:', (e as Error).message);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void pollLiveData();
    const interval = setInterval(pollLiveData, POLL_MS);
    return () => clearInterval(interval);
  }, [pollLiveData]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse((p) => (p === pulse ? null : p)), PULSE_MS);
    return () => clearTimeout(t);
  }, [pulse]);

  const equity = portfolio ? portfolioEquity(portfolio) : teams.find((t) => t.name === TARGET_TEAM)?.equity ?? null;
  const dayDelta = useMemo(() => {
    if (equity === null || !anchor) return null;
    const dollar = equity - anchor.equity;
    return { dollar, percent: anchor.equity > 0 ? (dollar / anchor.equity) * 100 : 0 };
  }, [equity, anchor]);

  const age = syncedAt ? now - syncedAt : null;
  const stale = age !== null && age > STALE_MS;

  const unlock = useCallback(() => {
    try { sessionStorage.setItem(AUTH_KEY, '1'); } catch { /* storage blocked */ }
    setAuthed(true);
  }, []);
  const lock = useCallback(() => {
    try { sessionStorage.clear(); } catch { /* storage blocked */ }
    setAuthed(false);
  }, []);

  return (
    <>
      <AnimatePresence>{!authed && <PinAuth key="pin" onUnlock={unlock} />}</AnimatePresence>

      <div className="ambient" />
      {authed && (
        <motion.div
          className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-5 px-4 pt-3 pb-32 sm:px-6 lg:gap-6 lg:pb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className={`num flex flex-wrap items-center justify-center gap-x-3 rounded-full border px-4 py-1.5 text-center text-xs ${stale || error ? 'border-warn/30 text-warn' : 'border-line text-ink-3'}`}>
            {error && !syncedAt ? (
              <span>No data yet: {error}. The first scrape can take a few minutes after deploy.</span>
            ) : (
              <>
                <span>Last synced via GitHub Actions: {syncedAt ? etTime(syncedAt) : '…'}</span>
                {age !== null && <span>{ago(age)}</span>}
                {stale && <span>· scheduler running late</span>}
                {error && syncedAt && <span>· refresh failed</span>}
              </>
            )}
          </div>

          <div className={tab === 'home' ? '' : 'max-lg:hidden'}>
            <TopBar
              teamName={TARGET_TEAM}
              equity={equity}
              dayDelta={dayDelta}
              anchorEquity={anchor?.equity ?? null}
              cash={portfolio?.cash ?? 0}
              loan={portfolio?.loan ?? 0}
              positions={portfolio?.holdings.length ?? 0}
              live={!stale && !error && syncedAt !== null}
              marketOpen={isMarketOpen(now)}
              pulse={pulse}
              tick={tick}
              onLock={HAS_PIN ? lock : undefined}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="flex flex-col gap-5 lg:col-span-8 lg:gap-6">
              <div className={show('home')}><PortfolioCard portfolio={portfolio} pulse={pulse} /></div>
              <div className={show('board')}><Leaderboard teams={teams} myTeam={TARGET_TEAM} onOpenTeam={setHistoryTeam} /></div>
            </div>
            <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
              <div className={show('board')}><ThreatRadar teams={teams} myTeam={TARGET_TEAM} /></div>
              <div className={show('report')}><DailyReport portfolio={portfolio} equity={equity} anchor={anchor} /></div>
            </div>
          </div>
          <BottomNav tab={tab} onTab={setTab} onLock={HAS_PIN ? lock : undefined} />
        </motion.div>
      )}

      <AnimatePresence>
        {historyTeam && <HistoryModal key={historyTeam} teamName={historyTeam} onClose={() => setHistoryTeam(null)} />}
      </AnimatePresence>
    </>
  );
}
