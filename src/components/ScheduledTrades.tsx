import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ScheduledTrade } from '../types';
import { api } from '../lib/api';
import { etTime } from '../lib/market';
import { int } from '../lib/format';
import { useToast } from './Toaster';

export function ScheduledTrades({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [items, setItems] = useState<ScheduledTrade[]>([]);

  const load = useCallback(async () => {
    try { setItems(await api.scheduledTrades()); } catch { /* backend offline: keep last list */ }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  async function cancel(id: string) {
    try {
      await api.cancelScheduled(id);
      setItems((l) => l.filter((t) => t.id !== id));
    } catch (e) {
      toast(`Cancel failed: ${(e as Error).message}`, 'error');
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-medium tracking-tight">Scheduled Trades</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">No scheduled trades.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => (
            <li key={t.id} className="text-sm">
              <div className="flex items-center gap-3">
                <span className={`num text-label tracking-wider ${t.action === 'buy' ? 'text-gain' : 'text-loss'}`}>
                  [{t.action.toUpperCase()}]
                </span>
                <span className="num flex-1 text-ink-2">{int(t.quantity)} <span className="text-ink">{t.ticker}</span> @ {etTime(t.executeAt)}</span>
                <button onClick={() => cancel(t.id)} aria-label="Cancel" className="text-ink-3 transition-colors hover:text-ink"><X size={14} /></button>
              </div>
              {t.status !== 'pending' && (
                <div className="num mt-1 pl-0 text-xs text-warn">
                  {t.status === 'failed' ? 'gave up' : `retrying (${t.attempts})`}{t.lastError ? `: ${t.lastError}` : ''}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
