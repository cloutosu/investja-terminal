import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DayAnchor, Portfolio, Pulse, Team, TeamWithDelta } from './types';
import { api } from './lib/api';
import { computeDeltas } from './lib/deltas';
import { ensureDayAnchor, recordSnapshots, db } from './lib/db';
import { etDayKey, isMarketOpen } from './lib/market';
import { PinAuth } from './components/PinAuth';
import { TopBar } from './components/TopBar';
import { BottomNav, type Tab } from './components/BottomNav';
import { Leaderboard } from './components/Leaderboard';
import { PortfolioCard } from './components/PortfolioCard';
import { HistoryModal } from './components/HistoryModal';
import { TradeModal, type TradeInit } from './components/TradeModal';
import { ScheduledTrades } from './components/ScheduledTrades';
import { ThreatRadar } from './components/ThreatRadar';
import { DailyReport } from './components/DailyReport';

const TARGET_TEAM = import.meta.env.VITE_TARGET_TEAM || 'Rahman Power Squared';
const AUTH_KEY = 'investja.auth';
const POLL_MS = 5000;
const PULSE_MS = 3000;

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

export default function App() {
  const [authed, setAuthed] = useState(() => {
    try { return sessionStorage.getItem(AUTH_KEY) === '1'; } catch { return false; }
  });
  const prevEquitiesRef = useRef<Map<string, number>>(new Map());
  const prevPortfolioRef = useRef<Portfolio | null>(null);
  const prevMyEquityRef = useRef<number | null>(null);
  const inFlight = useRef(false);
  const pulseSeq = useRef(0);

  const [teams, setTeams] = useState<TeamWithDelta[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [live, setLive] = useState(true);
  const [anchor, setAnchor] = useState<DayAnchor | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const [historyTeam, setHistoryTeam] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeInit | null>(null);
  const [scheduleTick, setScheduleTick] = useState(0);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const show = (t: Tab) => (tab === t ? '' : 'max-lg:hidden');

  const pollLiveData = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [lbRes, dashRes] = await Promise.all([api.leaderboard(), api.dashboard()]);
      console.log(`[poll] leaderboard: ${lbRes.length} teams, dashboard:`, { cash: dashRes.cash, loan: dashRes.loan });

      const withDeltas = computeDeltas(lbRes, prevEquitiesRef.current);
      prevEquitiesRef.current = new Map(lbRes.map((t: Team) => [t.name, t.equity]));

      const myEquity = portfolioEquity(dashRes);
      const prevEq = prevMyEquityRef.current;
      const prevPf = prevPortfolioRef.current;
      if (prevEq !== null && Math.abs(myEquity - prevEq) >= 0.005) {
        const delta = myEquity - prevEq;
        setPulse({ id: ++pulseSeq.current, delta, ticker: prevPf ? attributeTicker(prevPf, dashRes, delta) : null });
      }
      prevMyEquityRef.current = myEquity;
      prevPortfolioRef.current = dashRes;

      setTeams(withDeltas);
      setPortfolio(dashRes);
      setLive(true);
      setMarketOpen(isMarketOpen());

      ensureDayAnchor(etDayKey(), myEquity, dashRes.holdings).then(setAnchor).catch(console.error);
      recordSnapshots(withDeltas, TARGET_TEAM, myEquity).then(() => setTick((n) => n + 1)).catch(console.error);
    } catch (e) {
      console.warn('[poll] failed:', (e as Error).message);
      setLive(false);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void pollLiveData();
    const interval = setInterval(pollLiveData, POLL_MS);
    return () => clearInterval(interval);
  }, [pollLiveData]);

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse((p) => (p === pulse ? null : p)), PULSE_MS);
    return () => clearTimeout(t);
  }, [pulse]);

  useEffect(() => {
    db.dayAnchors.get(etDayKey()).then((a) => a && setAnchor(a)).catch(() => {});
  }, []);

  const myTeam = useMemo(() => teams.find((t) => t.name === TARGET_TEAM) ?? null, [teams]);
  const equity = portfolio ? portfolioEquity(portfolio) : myTeam?.equity ?? null;
  const dayDelta = useMemo(() => {
    if (equity === null || !anchor) return null;
    const dollar = equity - anchor.equity;
    return { dollar, percent: anchor.equity > 0 ? (dollar / anchor.equity) * 100 : 0 };
  }, [equity, anchor]);

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
          className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-5 px-4 pt-5 pb-32 sm:px-6 lg:gap-6 lg:pb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className={tab === 'home' ? '' : 'max-lg:hidden'}>
            <TopBar
              teamName={TARGET_TEAM}
              equity={equity}
              dayDelta={dayDelta}
              anchorEquity={anchor?.equity ?? null}
              cash={portfolio?.cash ?? 0}
              loan={portfolio?.loan ?? 0}
              positions={portfolio?.holdings.length ?? 0}
              live={live}
              marketOpen={marketOpen}
              pulse={pulse}
              tick={tick}
              onTrade={setTrade}
              onLock={lock}
            />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="flex flex-col gap-5 lg:col-span-8 lg:gap-6">
              <div className={show('home')}><PortfolioCard portfolio={portfolio} pulse={pulse} onSell={setTrade} /></div>
              <div className={show('board')}><Leaderboard teams={teams} myTeam={TARGET_TEAM} onOpenTeam={setHistoryTeam} /></div>
            </div>
            <div className="flex flex-col gap-5 lg:col-span-4 lg:gap-6">
              <div className={show('board')}><ThreatRadar teams={teams} myTeam={TARGET_TEAM} /></div>
              <div className={show('activity')}><ScheduledTrades refreshKey={scheduleTick} /></div>
              <div className={show('activity')}><DailyReport portfolio={portfolio} equity={equity} anchor={anchor} /></div>
            </div>
          </div>
          <BottomNav tab={tab} onTab={setTab} onTrade={() => setTrade({})} onLock={lock} />
        </motion.div>
      )}

      <AnimatePresence>
        {historyTeam && <HistoryModal key={historyTeam} teamName={historyTeam} onClose={() => setHistoryTeam(null)} />}
        {trade && (
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
