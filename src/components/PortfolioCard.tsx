import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Portfolio, Pulse } from '../types';
import { int, money } from '../lib/format';

interface Props { portfolio: Portfolio | null; pulse: Pulse | null }

export function PortfolioCard({ portfolio, pulse }: Props) {
  const [dot, setDot] = useState<{ ticker: string; gain: boolean } | null>(null);

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
  const equity = holdingsTotal + cash - loan;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-lg font-medium tracking-tight">Active positions</h2>
        <span className="num text-xs text-ink-3">{holdings.length}</span>
      </div>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {holdings.map((h) => (
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
                <div className="num text-xs text-ink-3">{money(h.currentPrice)} · {equity > 0 ? ((h.totalValue / equity) * 100).toFixed(0) : 0}%</div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {holdings.length === 0 && <li className="py-6 text-center text-sm text-ink-3">{portfolio ? 'No open positions.' : 'Waiting for first sync...'}</li>}
      </ul>
      <p className="num mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
        Holdings ({money(holdingsTotal)}) + Cash ({money(cash)}) − Loan ({money(loan)}) = <span className="text-ink">{money(equity)}</span>
      </p>
    </section>
  );
}
