import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Portfolio, Pulse } from '../types';
import { HOLD_MS, etTime } from '../lib/market';
import { int, money } from '../lib/format';
import type { TradeInit } from './TradeModal';

const BUYS_KEY = 'investja.buys';

export function readBuys(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(BUYS_KEY) || '{}'); } catch { return {}; }
}
export function recordBuy(ticker: string) {
  try { localStorage.setItem(BUYS_KEY, JSON.stringify({ ...readBuys(), [ticker]: Date.now() })); } catch { /* storage blocked */ }
}

interface Props { portfolio: Portfolio | null; pulse: Pulse | null; onSell: (init: TradeInit) => void }

export function PortfolioCard({ portfolio, pulse, onSell }: Props) {
  const [dot, setDot] = useState<{ ticker: string; gain: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pulse?.ticker) return;
    setDot({ ticker: pulse.ticker, gain: pulse.delta > 0 });
    const t = setTimeout(() => setDot(null), 3000);
    return () => clearTimeout(t);
  }, [pulse]);

  const holdings = portfolio?.holdings ?? [];
  const holdingsTotal = holdings.reduce((s, h) => s + h.totalValue, 0);
  const cash = portfolio?.cash ?? 0;
  const loan = portfolio?.loan ?? 0;
  const buys = readBuys();

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-lg font-medium tracking-tight">Active positions</h2>
        <span className="num text-xs text-ink-3">{holdings.length}</span>
      </div>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {holdings.map((h) => {
            const holdUntil = (buys[h.ticker] ?? 0) + HOLD_MS;
            const held = holdUntil > now;
            return (
              <motion.li
                key={`${h.exchange}:${h.ticker}`}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 border-t border-line py-3 first:border-t-0"
              >
                <span className="num relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tint-2 text-xs text-ink">
                  {h.ticker.slice(0, 4)}
                  {dot?.ticker === h.ticker && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-elevated ${dot.gain ? 'bg-gain' : 'bg-loss'}`} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{h.ticker}</div>
                  <div className="num text-xs text-ink-3">{int(h.quantity)} · {h.exchange}</div>
                </div>
                <div className="text-right">
                  <div className="num text-sm text-ink">{money(h.totalValue)}</div>
                  <div className="num text-xs text-ink-3">{money(h.currentPrice)}</div>
                </div>
                <button
                  className="btn ml-1"
                  disabled={held}
                  title={held ? `1-hour hold until ${etTime(holdUntil)}` : undefined}
                  onClick={() => onSell({ action: 'sell', exchange: String(h.exchange), ticker: h.ticker, quantity: h.quantity })}
                >
                  {held ? 'Held' : 'Sell all'}
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
        {holdings.length === 0 && <li className="py-6 text-center text-sm text-ink-3">{portfolio ? 'No open positions.' : 'Waiting for first sync...'}</li>}
      </ul>
      <p className="num mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
        Holdings ({money(holdingsTotal)}) + Cash ({money(cash)}) − Loan ({money(loan)}) ={' '}
        <span className="text-ink">{money(holdingsTotal + cash - loan)}</span>
      </p>
    </section>
  );
}
