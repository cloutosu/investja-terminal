import type { DailyReportData, DayAnchor, Holding } from '../types';

// Per-ticker contribution = end value minus start value scaled to the end quantity, so adding or
// trimming a position doesn't count as profit. Positions opened today have no basis and are skipped.
// Buys/sells are inferred from quantity changes (the site is read-only here, so there's no trade log).
export function buildReport(date: string, anchor: DayAnchor, endEquity: number, endHoldings: Holding[]): DailyReportData {
  const startBy = new Map(anchor.holdings.map((h) => [h.ticker, h]));
  const contrib: { ticker: string; amount: number }[] = [];
  let buys = 0;
  let sells = 0;
  for (const e of endHoldings) {
    const s = startBy.get(e.ticker);
    if (!s) { buys++; continue; }
    if (e.quantity > s.quantity) buys++;
    else if (e.quantity < s.quantity) sells++;
    if (s.quantity) contrib.push({ ticker: e.ticker, amount: e.totalValue - s.totalValue * (e.quantity / s.quantity) });
  }
  const ended = new Set(endHoldings.map((h) => h.ticker));
  for (const s of anchor.holdings) if (!ended.has(s.ticker)) sells++;
  contrib.sort((a, b) => b.amount - a.amount);
  const pnl = endEquity - anchor.equity;
  return {
    date, pnl, pnlPercent: anchor.equity > 0 ? (pnl / anchor.equity) * 100 : 0,
    startEquity: anchor.equity, endEquity,
    topContributor: contrib.find((c) => c.amount > 0) ?? null,
    biggestDrag: [...contrib].reverse().find((c) => c.amount < 0) ?? null,
    buys, sells, generatedAt: Date.now(),
  };
}
