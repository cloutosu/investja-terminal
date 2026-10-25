import { useState } from 'react';
import type { Holding } from '../types';
import { money } from '../lib/format';

interface Props { ticker: string; quantity: number; holdings: Holding[]; equity: number | null }

const OVERSIZED_PCT = 60;

export function PositionSizer({ ticker, quantity, holdings, equity }: Props) {
  const [manual, setManual] = useState('');
  const held = holdings.find((h) => h.ticker === ticker && h.quantity > 0);
  // The site's own CAD valuation per share; we do not convert currencies ourselves.
  const heldUnit = held ? held.totalValue / held.quantity : null;
  const manualUnit = parseFloat(manual);
  const unit = heldUnit ?? (Number.isFinite(manualUnit) && manualUnit > 0 ? manualUnit : null);

  const value = unit !== null && quantity > 0 ? unit * quantity : null;
  const pct = value !== null && equity ? (value / equity) * 100 : null;

  return (
    <div className="rounded-2xl border border-line bg-tint p-4">
      <div className="label mb-3">Position Sizer</div>
      {!ticker ? (
        <p className="text-sm text-ink-3">Enter ticker first</p>
      ) : (
        <>
          {heldUnit === null && (
            <label className="mb-3 flex items-center gap-3 text-xs text-ink-3">
              CAD price / share
              <input className="field num w-28 py-1" inputMode="decimal" placeholder="0.00" value={manual} onChange={(e) => setManual(e.target.value)} />
            </label>
          )}
          {value === null ? (
            <p className="text-sm text-ink-3">{quantity > 0 ? 'Price unknown. Enter a CAD price above.' : 'Enter quantity'}</p>
          ) : (
            <dl className="num grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt className="text-ink-3">Position Value</dt><dd className="text-right text-ink">{money(value)}</dd>
              <dt className="text-ink-3">% of Equity</dt><dd className="text-right text-ink">{pct !== null ? `${pct.toFixed(1)}%` : '—'}</dd>
              <dt className="text-ink-3">Max Loss if -10%</dt><dd className="text-right text-ink-2">-{money(value * 0.1)}</dd>
              <dt className="text-ink-3">Max Loss if -20%</dt><dd className="text-right text-ink-2">-{money(value * 0.2)}</dd>
            </dl>
          )}
          {pct !== null && pct > OVERSIZED_PCT && (
            <p className="mt-3 text-xs text-loss">⚠ Oversized position (&gt;{OVERSIZED_PCT}% of equity).</p>
          )}
        </>
      )}
    </div>
  );
}
