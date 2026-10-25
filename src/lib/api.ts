import type {
  DailyReportData, DailyReportRequest, Portfolio, ScheduleBody, ScheduledTrade, Team, TradeBody, TradeResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // trade/schedule validation errors carry {success:false,message}; hand those back to the caller
    if (data && typeof data === 'object' && 'success' in data) return data as T;
    throw new Error((data && data.error) || `HTTP ${res.status}`);
  }
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  dashboard: () => request<Portfolio>('/api/dashboard'),
  leaderboard: () => request<Team[]>('/api/leaderboard'),
  trade: (body: TradeBody) => request<TradeResult>('/api/trade', json('POST', body)),
  scheduleTrade: (body: ScheduleBody) => request<TradeResult>('/api/schedule-trade', json('POST', body)),
  scheduledTrades: () => request<ScheduledTrade[]>('/api/scheduled-trades'),
  cancelScheduled: (id: string) => request<TradeResult>(`/api/schedule-trade/${id}`, { method: 'DELETE' }),
  generateDailyReport: (body: DailyReportRequest) =>
    request<DailyReportData>('/api/generate-daily-report', json('POST', body)),
};
