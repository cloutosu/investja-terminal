import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Portfolio, TradeAction } from '../types';
import { api } from '../lib/api';
import { etTime, isMarketOpen, nextMarketOpen } from '../lib/market';
import { int } from '../lib/format';
import { Modal } from './Modal';
import { PositionSizer } from './PositionSizer';
import { recordBuy } from './PortfolioCard';
import { SwipeToConfirm, type ConfirmResult } from './SwipeToConfirm';
import { StatusGlyph } from './StatusGlyph';
import { useToast } from './Toaster';

export interface TradeInit { action?: TradeAction; exchange?: string; ticker?: string; quantity?: number; mode?: 'now' | 'schedule' }
interface Props { portfolio: Portfolio | null; equity: number | null; init?: TradeInit; onClose: () => void; onDone: () => void }

const EXCHANGES = ['Nasdaq', 'NYSE', 'TSX'];
const RECEIPT_MS = 1900;

const toLocalInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function TradeModal({ portfolio, equity, init, onClose, onDone }: Props) {
  const toast = useToast();
  const [action, setAction] = useState<TradeAction>(init?.action ?? 'buy');
  const [exchange, setExchange] = useState(init?.exchange ?? 'Nasdaq');
  const [ticker, setTicker] = useState(init?.ticker ?? '');
  const [qty, setQty] = useState(init?.quantity ? String(init.quantity) : '');
  const [mode, setMode] = useState<'now' | 'schedule'>(init?.mode ?? 'now');
  const [when, setWhen] = useState(toLocalInput(Date.now() + 65 * 60000));
  const [receipt, setReceipt] = useState<string | null>(null);
  const pending = useRef<string | null>(null);

  const quantity = parseInt(qty, 10) || 0;
  const valid = ticker.length > 0 && quantity > 0;
  const closed = !isMarketOpen();
  const buy = action === 'buy';
  const verb = buy ? 'Buy' : 'Sell';

  useEffect(() => {
    if (!receipt) return;
    const t = setTimeout(onClose, RECEIPT_MS);
    return () => clearTimeout(t);
  }, [receipt, onClose]);

  const confirm = useCallback(async (): Promise<ConfirmResult> => {
    const body = { action, exchange, ticker, quantity };
    if (mode === 'now') {
      const r = await api.trade(body);
      if (!r.success) return { ok: false, message: r.message };
      if (buy) recordBuy(ticker);
      pending.current = `${buy ? 'Bought' : 'Sold'} ${int(quantity)} ${ticker}`;
      return { ok: true };
    }
    const executeAt = new Date(when).getTime();
    if (!Number.isFinite(executeAt) || executeAt <= Date.now()) return { ok: false, message: 'Pick a time in the future' };
    const r = await api.scheduleTrade({ ...body, executeAt });
    if (!r.success) return { ok: false, message: r.message };
    toast(`${verb} scheduled for ${etTime(executeAt)}`);
    pending.current = `${verb} ${int(quantity)} ${ticker} scheduled · ${etTime(executeAt)}`;
    return { ok: true };
  }, [action, exchange, ticker, quantity, mode, when, buy, verb, toast]);

  const presets: { label: string; ms: () => number }[] = [
    { label: '+1h', ms: () => Date.now() + 3600e3 },
    { label: '+65m', ms: () => Date.now() + 65 * 60e3 },
    { label: 'Next open', ms: () => nextMarketOpen() },
  ];

  return (
    <Modal title={receipt ? undefined : mode === 'now' ? 'New trade' : 'Schedule trade'} onClose={onClose} hideClose={!!receipt}>
      <AnimatePresence mode="wait">
        {receipt ? (
          <motion.div
            key="receipt"
            className="flex flex-col items-center gap-5 py-10 text-center"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-full text-gain" style={{ background: 'color-mix(in srgb, var(--gain) 14%, transparent)' }}>
              <StatusGlyph phase="success" size={56} stroke={2} />
            </div>
            <div>
              <div className="text-xl font-medium tracking-tight">{receipt}</div>
              <div className="num mt-2 text-xs text-ink-3">Order confirmed · $25 CAD fee</div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" className="flex flex-col gap-5" exit={{ opacity: 0 }}>
            {closed && (
              <div className="rounded-2xl border border-warn/30 px-4 py-3 text-xs text-warn">
                Market closed. Orders run 9:35–16:00 ET on weekdays and the server rejects anything outside that window.
              </div>
            )}
            <div className="flex rounded-full border border-line-strong bg-tint p-1">
              {(['buy', 'sell'] as TradeAction[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={`flex-1 rounded-full py-2 text-sm font-medium capitalize transition-all duration-300 ${action === a ? '' : 'text-ink-3 hover:text-ink'}`}
                  style={action === a ? { color: 'var(--on-color)', background: a === 'buy' ? 'var(--gain)' : 'var(--loss)' } : undefined}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="label">Exchange</span>
                <select className="field" value={exchange} onChange={(e) => setExchange(e.target.value)}>
                  {EXCHANGES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">Ticker</span>
                <input className="field font-mono uppercase" value={ticker} maxLength={10} onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, ''))} placeholder="STAK" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">Quantity</span>
                <input className="field num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} placeholder="100" />
              </label>
            </div>

            <PositionSizer ticker={ticker} quantity={quantity} holdings={portfolio?.holdings ?? []} equity={equity} />

            {mode === 'schedule' && (
              <div className="flex flex-col gap-3">
                <span className="label">Execute at (your local time)</span>
                <input type="datetime-local" className="field num" value={when} onChange={(e) => setWhen(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => <button key={p.label} className="btn" onClick={() => setWhen(toLocalInput(p.ms()))}>{p.label}</button>)}
                </div>
                <p className="text-xs text-ink-3">Failed orders retry every 5 minutes (market closed, 1-hour hold) until they clear.</p>
              </div>
            )}

            <SwipeToConfirm
              key={`${mode}-${action}`}
              tone={buy ? 'gain' : 'loss'}
              label={mode === 'now' ? `Swipe to ${action}` : `Swipe to schedule ${action}`}
              processingLabel={mode === 'now' ? 'Placing order' : 'Scheduling'}
              successLabel={mode === 'now' ? 'Filled' : 'Scheduled'}
              disabled={!valid}
              onConfirm={confirm}
              onSettled={(r) => { if (r.ok) { onDone(); setTimeout(() => setReceipt(pending.current), 1100); } }}
            />
            <button className="self-center text-xs text-ink-3 transition-colors hover:text-ink" onClick={() => setMode((m) => (m === 'now' ? 'schedule' : 'now'))}>
              {mode === 'now' ? 'Schedule for later →' : '← Trade now'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
