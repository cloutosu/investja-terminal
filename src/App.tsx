import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DayAnchor, HistoryPoint, MoverKey, MoversData, Portfolio, Pulse, Role, TeamWithDelta } from './types';
import { api, session, setUnauthorizedHandler } from './lib/api';
import { computeDeltas } from './lib/deltas';
import { etTime, isMarketOpen } from './lib/market';
import { PinAuth } from './components/PinAuth';
import { TopBar } from './components/TopBar';
import { BottomNav, type Tab } from './components/BottomNav';
import { Leaderboard } from './components/Leaderboard';
import { PortfolioCard } from './components/PortfolioCard';
import { HistoryModal } from './components/HistoryModal';
import { TradeModal, type TradeInit } from './components/TradeModal';
import { ScheduledTrades } from './components/ScheduledTrades';
import { MoversPanel } from './components/MoversPanel';
import { ThreatRadar } from './components/ThreatRadar';
import { DailyReport } from './components/DailyReport';

const TARGET_TEAM = import.meta.env.VITE_TARGET_TEAM || 'Rahman Power Squared';
const POLL_MS = 20_000;
const PULSE_MS = 3000;
const STALE_MS = 4 * 60_000;
const MOVER_KEYS: MoverKey[] = ['1m', '5m', '15m', '1h', '6h', '24h'];

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
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
};

export default function App() {
  const [role, setRole] = useState<Role | null>(() => (session.token() ? session.role() : null));
  const prevEquitiesRef = useRef<Map<string, number>>(new Map());
  const prevPortfolioRef = useRef<Portfolio | null>(null);
  const prevMyEquityRef = useRef<number | null>(null);
  const lastTs = useRef(0);
  const inFlight = useRef(false);
  const pulseSeq = useRef(0);

  const [teams, setTeams] = useState<TeamWithDelta[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [anchor, setAnchor] = useState<DayAnchor | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [movers, setMovers] = useState<MoversData | null>(null);
  const [trades, setTrades] = useState<{ buys: number; sells: number } | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [historyTeam, setHistoryTeam] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeInit | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const show = (t: Tab) => (tab === t ? '' : 'max-lg:hidden');
  const canTrade = role === 'owner';

  const lock = useCallback(() => {
    session.clear();
    setRole(null);
    lastTs.current = 0;
  }, []);
  useEffect(() => { setUnauthorizedHandler(lock); }, [lock]);

  const pollLiveData = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const d = await api.live();
      setError(null);
      setServerError(d.status?.error ?? null);
      if (d.timestamp === lastTs.current) return;
      lastTs.current = d.timestamp;
      console.log(`[poll] leaderboard: ${d.teams.length} teams, dashboard:`, { cash: d.portfolio.cash, loan: d.portfolio.loan });

      // first load: seed from the server's previous-minute equities so deltas aren't all zero
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
      setMovers(d.movers);
      setTrades(d.trades);
      setSyncedAt(d.timestamp);
      api.history().then((h) => setHistory(h.points)).catch(() => {});
    } catch (e) {
      console.warn('[poll] failed:', (e as Error).message);
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!role) return;
    void pollLiveData();
    const interval = setInterval(() => { if (!document.hidden) void pollLiveData(); }, POLL_MS);
    return () => clearInterval(interval);
  }, [role, pollLiveData]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
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
  const mine = useMemo(
    () => Object.fromEntries(MOVER_KEYS.map((k) => [k, movers?.windows[k]?.ready ? movers.windows[k].me : null])),
    [movers],
  );

  const age = syncedAt ? now - syncedAt : null;
  const stale = age !== null && age > STALE_MS;
  const bannerWarn = stale || !!serverError || !!error;

  return (
    <>
      <AnimatePresence>{!role && <PinAuth key="pin" onUnlock={setRole} />}</AnimatePresence>

      <div className="ambient" />
      {role && (
        <motion.div
          className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-5 px-4 pt-3 pb-32 sm:px-6 lg:gap-6 lg:pb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className={`num flex flex-wrap items-center justify-center gap-x-3 rounded-full border px-4 py-1.5 text-center text-xs ${bannerWarn ? 'border-warn/30 text-warn' : 'border-line text-ink-3'}`}>
            {error && !syncedAt ? (
              <span>{error}</span>
            ) : (
              <>
                <span>Updated {syncedAt ? etTime(syncedAt) : '…'}</span>
                {age !== null && <span>{ago(age)}</span>}
                {role === 'viewer' && <span>· view only</span>}
                {serverError && <span>· server: {serverError}</span>}
                {stale && !serverError && <span>· scheduler behind</span>}
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
              live={!bannerWarn && syncedAt !== null}
              marketOpen={isMarketOpen(now)}
              pulse={pulse}
              history={history}
              mine={mine}
              canTrade={canTrade}
              onTrade={setTrade}
              onLock={lock}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="flex flex-col gap-5 lg:col-span-8 lg:gap-6">
              <div className={show('home')}><PortfolioCard portfolio={portfolio} pulse={pulse} canTrade={canTrade} onSell={setTrade} /></div>
              <div className={show('board')}><Leaderboard teams={teams} myTeam={TARGET_TEAM} onOpenTeam={setHistoryTeam} /></div>
            </div>
            <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
              <div className={show('board')}><MoversPanel movers={movers} myTeam={TARGET_TEAM} onOpenTeam={setHistoryTeam} /></div>
              <div className={show('board')}><ThreatRadar teams={teams} myTeam={TARGET_TEAM} /></div>
              {canTrade && <div className={show('report')}><ScheduledTrades refreshKey={scheduleTick} /></div>}
              <div className={show('report')}><DailyReport portfolio={portfolio} equity={equity} anchor={anchor} trades={trades} /></div>
            </div>
          </div>
          <BottomNav tab={tab} onTab={setTab} onLock={lock} onTrade={canTrade ? () => setTrade({}) : undefined} />
        </motion.div>
      )}

      <AnimatePresence>
        {historyTeam && <HistoryModal key={historyTeam} teamName={historyTeam} history={history} onClose={() => setHistoryTeam(null)} />}
        {trade && canTrade && (
          <TradeModal
            key="trade"
            portfolio={portfolio}
            equity={equity}
            init={trade}
            onClose={() => setTrade(null)}
            onDone={() => { void pollLiveData(); setScheduleTick((n) => n + 1); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
