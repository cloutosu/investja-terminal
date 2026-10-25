import type {
  HistoryPoint, LiveData, Role, ScheduleBody, ScheduledTrade, TradeBody, TradeResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'investja.token';
const ROLE_KEY = 'investja.role';

const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };

export const session = {
  token: () => read(TOKEN_KEY),
  role: (): Role | null => (read(ROLE_KEY) as Role | null),
  set(token: string, role: Role) {
    try { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(ROLE_KEY, role); } catch { /* storage blocked */ }
  },
  clear() { try { sessionStorage.clear(); } catch { /* storage blocked */ } },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/api/auth') onUnauthorized();
  if (!res.ok) {
    // trade/schedule/auth failures carry {success:false,message} or {message}; hand those back to the caller
    if (data && typeof data === 'object' && ('success' in data || path === '/api/auth')) return data as T;
    throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
  }
  return data as T;
}

const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export const api = {
  auth: (code: string) => request<{ token?: string; role?: Role; message?: string }>('/api/auth', body('POST', { code })),
  live: () => request<LiveData>('/api/live'),
  history: () => request<{ points: HistoryPoint[] }>('/api/history'),
  track: (name: string) => request<{ ok: boolean }>('/api/track', body('POST', { name })),
  trade: (b: TradeBody) => request<TradeResult>('/api/trade', body('POST', b)),
  scheduleTrade: (b: ScheduleBody) => request<TradeResult>('/api/schedule-trade', body('POST', b)),
  scheduledTrades: () => request<ScheduledTrade[]>('/api/scheduled-trades'),
  cancelScheduled: (id: string) => request<TradeResult>(`/api/schedule-trade/${id}`, { method: 'DELETE' }),
};
