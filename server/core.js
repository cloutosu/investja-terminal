// Node 20 ESM — investja.org client + trade queue logic on native fetch (used by the Netlify Functions)
import { parseDashboard, parseLeaderboard, looksLikeLoginPage, extractErrorMessage } from './parsers.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export const EXCHANGES = new Set(['Nasdaq', 'NYSE', 'TSX']);
export const RETRY_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 288;
const LOCK_MS = 90 * 1000;

export function dayKey(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(ms));
}

// One client = one session. Each function invocation logs in once, which is what busts the page cache.
export function makeClient({ baseUrl, user, pass }) {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const capture = (res) => {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const call = async (path, init = {}) => {
    const res = await fetch(baseUrl.replace(/\/$/, '') + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      ...init,
      headers: { 'User-Agent': UA, Cookie: cookieHeader(), ...init.headers },
    });
    capture(res);
    return res;
  };
  const form = (obj) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(obj).toString(),
  });

  async function login() {
    jar.clear();
    await call('/private/game/login');
    const res = await call('/private/game/login', form({ teamname: user, teampassword: pass }));
    if (res.status !== 302) throw new Error(`login rejected (HTTP ${res.status})`);
  }
  async function get(path) {
    const res = await call(path);
    const text = await res.text();
    if (res.status === 302 || looksLikeLoginPage(text)) throw new Error('session rejected');
    if (res.status !== 200) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    return text;
  }

  return {
    login,
    async live() {
      await login();
      const [dash, board] = [await get('/private/game'), await get('/private/game/rankings')];
      const { _complete, ...dashboard } = parseDashboard(dash);
      if (!_complete) throw new Error('dashboard parse incomplete (Cash/Loan rows not found)');
      return { dashboard, leaderboard: parseLeaderboard(board) };
    },
    async trade({ action, exchange, ticker, quantity }) {
      const res = await call(`/private/game/${action}`, form({ exchange, ticker, quantity: String(quantity), action: 'confirm' }));
      if (res.status === 302) {
        if (/login/i.test(res.headers.get('location') || '')) return { success: false, message: 'Session expired, try again' };
        return { success: true, message: `${action.toUpperCase()} ${quantity} ${ticker} executed` };
      }
      if (res.status === 500) return { success: false, message: 'Server error (HTTP 500) - bad ticker/quantity or rule violation' };
      return { success: false, message: extractErrorMessage(await res.text()) || `Rejected by server (HTTP ${res.status})` };
    },
  };
}

export function validateTrade(b) {
  const action = String(b?.action || '').toLowerCase();
  const exchange = EXCHANGES.has(b?.exchange) ? b.exchange : null;
  const ticker = String(b?.ticker || '').trim().toUpperCase();
  const quantity = Number(b?.quantity);
  if (action !== 'buy' && action !== 'sell') return { error: 'action must be buy or sell' };
  if (!exchange) return { error: 'exchange must be Nasdaq, NYSE or TSX' };
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return { error: 'invalid ticker' };
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: 'quantity must be a positive integer' };
  return { trade: { action, exchange, ticker, quantity } };
}

// store: { get(key, fallback), set(key, value) } holding JSON
export async function logTrade(store, t, source) {
  const log = await store.get('trades-log', []);
  log.push({ at: Date.now(), day: dayKey(Date.now()), action: t.action, exchange: t.exchange, ticker: t.ticker, quantity: t.quantity, source });
  await store.set('trades-log', log.slice(-2000));
}

export async function runTick(store, makeSession) {
  const now = Date.now();
  let queue = await store.get('queue', []);
  const due = queue.filter((t) => t.status !== 'failed' && t.executeAt <= now && (t.nextAttemptAt ?? 0) <= now && (t.lockedUntil ?? 0) <= now);
  const summary = { executed: 0, failed: 0, waiting: queue.length };
  if (!due.length) return summary;

  // soft lock so an overlapping tick (cron + schedule) skips what this one is working on
  for (const t of due) t.lockedUntil = now + LOCK_MS;
  await store.set('queue', queue);

  const client = makeSession();
  let loginError = null;
  try { await client.login(); } catch (e) { loginError = e.message; }

  for (const task of due) {
    let result;
    try {
      result = loginError ? { success: false, message: loginError } : await client.trade(task);
    } catch (e) {
      result = { success: false, message: e.message };
    }
    queue = await store.get('queue', []);
    const idx = queue.findIndex((t) => t.id === task.id);
    if (idx === -1) continue; // cancelled meanwhile
    if (result.success) {
      queue.splice(idx, 1);
      await logTrade(store, task, 'scheduled');
      summary.executed++;
    } else {
      const t = queue[idx];
      t.attempts = (t.attempts || 0) + 1;
      t.lastError = result.message;
      t.status = t.attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying';
      t.nextAttemptAt = Date.now() + RETRY_MS;
      delete t.lockedUntil;
      summary.failed++;
    }
    await store.set('queue', queue);
  }
  summary.waiting = (await store.get('queue', [])).length;
  return summary;
}

export async function buildReport(store, { date, startEquity, endEquity, startHoldings = [], endHoldings = [] }) {
  const pnl = endEquity - startEquity;
  const startBy = new Map(startHoldings.map((h) => [h.ticker, h]));
  const contrib = [];
  for (const e of endHoldings) {
    const s = startBy.get(e.ticker);
    if (!s || !s.quantity) continue;
    contrib.push({ ticker: e.ticker, amount: e.totalValue - s.totalValue * (e.quantity / s.quantity) });
  }
  contrib.sort((a, b) => b.amount - a.amount);
  const log = (await store.get('trades-log', [])).filter((t) => t.day === date);
  return {
    date, pnl, pnlPercent: startEquity > 0 ? (pnl / startEquity) * 100 : 0, startEquity, endEquity,
    topContributor: contrib.find((c) => c.amount > 0) || null,
    biggestDrag: [...contrib].reverse().find((c) => c.amount < 0) || null,
    buys: log.filter((t) => t.action === 'buy').length,
    sells: log.filter((t) => t.action === 'sell').length,
    generatedAt: Date.now(),
  };
}
