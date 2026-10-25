import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyReportData, DayAnchor, Portfolio } from '../types';
import { buildReport } from '../lib/report';
import { db } from '../lib/db';
import { etDayKey, etMinutes, etParts } from '../lib/market';
import { money, signedMoney, signedPct, tone } from '../lib/format';
import { useToast } from './Toaster';

const REPORT_MINUTE = 16 * 60 + 5;

interface Props { portfolio: Portfolio | null; equity: number | null; anchor: DayAnchor | null; trades: { buys: number; sells: number } | null }

const prettyDate = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function DailyReport({ portfolio, equity, anchor, trades }: Props) {
  const toast = useToast();
  const [reports, setReports] = useState<DailyReportData[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const reload = useCallback(async () => {
    const all = await db.dailyReports.orderBy('date').reverse().toArray();
    setReports(all);
    setSelected((s) => s ?? all[0]?.date ?? null);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const generate = useCallback(async (manual: boolean) => {
    if (running.current || !portfolio || equity === null || !anchor) {
      if (manual) toast('Report needs a synced data.json first', 'warn');
      return;
    }
    running.current = true;
    setBusy(true);
    try {
      const date = etDayKey();
      const built = buildReport(date, anchor, equity, portfolio.holdings);
      const report = trades ? { ...built, buys: trades.buys, sells: trades.sells } : built; // exact counts from the server's trade log
      await db.dailyReports.where('date').equals(date).delete();
      await db.dailyReports.add(report);
      setSelected(date);
      await reload();
    } catch (e) {
      toast(`Daily report failed: ${(e as Error).message}`, 'error');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [portfolio, equity, anchor, trades, reload, toast]);

  // 16:05 ET on weekdays, once per day. Opening the app later that evening catches up.
  useEffect(() => {
    const check = async () => {
      const wd = etParts().wd;
      if (wd === 0 || wd === 6 || etMinutes() < REPORT_MINUTE) return;
      const have = await db.dailyReports.where('date').equals(etDayKey()).count();
      if (!have) await generate(false);
    };
    void check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [generate]);

  const report = reports.find((r) => r.date === selected) ?? null;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium tracking-tight">Daily Report</h2>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <select className="field w-auto py-1 text-xs" value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
              {reports.map((r) => <option key={r.date} value={r.date}>{prettyDate(r.date)}</option>)}
            </select>
          )}
          <button className="btn" disabled={busy} onClick={() => generate(true)}>{busy ? '...' : 'Generate'}</button>
        </div>
      </div>
      {report ? (
        <div className="num flex flex-col gap-1 text-sm">
          <div className="mb-2 text-xs tracking-wider text-ink-3">DAILY REPORT — {prettyDate(report.date)}</div>
          <div className="text-ink-2">
            P&amp;L: <span className={tone(report.pnl)}>{signedMoney(report.pnl)} ({signedPct(report.pnlPercent)})</span>
          </div>
          <div className="text-ink-2">
            Top contributor:{' '}
            {report.topContributor ? <span className="text-ink">{report.topContributor.ticker} <span className="text-gain">({signedMoney(report.topContributor.amount)})</span></span> : '—'}
          </div>
          <div className="text-ink-2">
            Biggest drag:{' '}
            {report.biggestDrag ? <span className="text-ink">{report.biggestDrag.ticker} <span className="text-loss">({signedMoney(report.biggestDrag.amount)})</span></span> : '—'}
          </div>
          <div className="text-ink-2">Trades: {report.buys} buy{report.buys === 1 ? '' : 's'}, {report.sells} sell{report.sells === 1 ? '' : 's'}</div>
          <div className="mt-2 text-xs text-ink-3">{money(report.startEquity)} → {money(report.endEquity)}</div>
        </div>
      ) : (
        <p className="text-sm text-ink-3">Auto-generates at 4:05 PM ET on trading days.</p>
      )}
    </section>
  );
}
