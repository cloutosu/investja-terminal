// Node 22 ESM / Express 5 — proxy between the terminal frontend and investja.org
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import {
  parseDashboard, parseLeaderboard, looksLikeLoginPage, extractErrorMessage,
} from './server/parsers.js';

dotenv.config({ quiet: true });
// $USER is set by the OS shell (root/runner/...) and dotenv won't overwrite it, so force it from .env.
try {
  const fromFile = dotenv.parse(fs.readFileSync(path.join(__dirname, '.env')));
  if (fromFile.USER) process.env.USER = fromFile.USER;
} catch { /* no .env: rely on real environment (Render) */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'https://investja.org').replace(/\/$/, '');
const PORT = Number(process.env.PORT || 3001);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 0);
const RETRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 288; // ~24h of 5-minute retries
const LOGIN_REUSE_MS = 2000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const QUEUE_FILE = path.join(__dirname, 'scheduled-trades.json');
const LOG_FILE = path.join(__dirname, 'trades-log.json');
const EXCHANGES = new Set(['Nasdaq', 'NYSE', 'TSX']);

if (!process.env.USER || !process.env.PASS) {
  console.error('[boot] USER / PASS missing from .env');
  process.exit(1);
}

// ---------- session (singleton mutex) ----------
const jar = new Map();
let activeLoginPromise = null;
let lastLoginAt = 0;

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

function captureCookies(res) {
  const set = res.headers['set-cookie'];
  if (!set) return;
  for (const line of set) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

const http = axios.create({
  baseURL: BASE_URL,
  maxRedirects: 0,
  validateStatus: () => true,
  timeout: 20000,
  headers: { 'User-Agent': UA },
});

// Concurrent callers share one in-flight login. Callers landing within LOGIN_REUSE_MS of a
// finished login reuse it, so a second login can't invalidate the PHP session the first
// caller is still using. The login-per-poll cache bust is preserved at the 5s poll cadence.
async function loginAndGetCookie() {
  if (activeLoginPromise) return activeLoginPromise;
  if (jar.size && Date.now() - lastLoginAt < LOGIN_REUSE_MS) return true;
  activeLoginPromise = (async () => {
    try {
      jar.clear();
      const initRes = await http.get('/private/game/login');
      captureCookies(initRes);
      const body = new URLSearchParams({
        teamname: process.env.USER,
        teampassword: process.env.PASS,
      }).toString();
      const postRes = await http.post('/private/game/login', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
      });
      captureCookies(postRes);
      if (postRes.status !== 302) throw new Error(`login rejected (HTTP ${postRes.status})`);
      lastLoginAt = Date.now();
      return true;
    } finally {
      activeLoginPromise = null;
    }
  })();
  return activeLoginPromise;
}

async function authedGet(p) {
  await loginAndGetCookie();
  let res = await http.get(p, { headers: { Cookie: cookieHeader() } });
  if (res.status === 302 || (res.status === 200 && looksLikeLoginPage(String(res.data)))) {
    lastLoginAt = 0;
    await loginAndGetCookie();
    res = await http.get(p, { headers: { Cookie: cookieHeader() } });
  }
  if (res.status !== 200) throw new Error(`GET ${p} -> HTTP ${res.status}`);
  return String(res.data);
}

// ---------- read endpoints ----------
const memo = new Map();
async function cached(key, fn) {
  if (CACHE_TTL_MS > 0) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  }
  const value = await fn();
  if (CACHE_TTL_MS > 0) memo.set(key, { at: Date.now(), value });
  return value;
}

const getDashboard = () => cached('dash', async () => {
  const { _complete, ...d } = parseDashboard(await authedGet('/private/game'));
  if (!_complete) throw new Error('dashboard parse incomplete (Cash/Loan rows not found)');
  return d;
});
const getLeaderboard = () => cached('lb', async () => parseLeaderboard(await authedGet('/private/game/rankings')));

// ---------- trading ----------
async function executeTrade({ action, exchange, ticker, quantity }) {
  await loginAndGetCookie();
  const body = new URLSearchParams({ exchange, ticker, quantity: String(quantity), action: 'confirm' }).toString();
  const res = await http.post(`/private/game/${action}`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
  });
  if (res.status === 302) {
    const loc = String(res.headers.location || '');
    if (/login/i.test(loc)) return { success: false, message: 'Session expired, try again' };
    memo.clear();
    return { success: true, message: `${action.toUpperCase()} ${quantity} ${ticker} executed` };
  }
  if (res.status === 500) return { success: false, message: 'Server error (HTTP 500) - bad ticker/quantity or rule violation' };
  const msg = extractErrorMessage(String(res.data)) || `Rejected by server (HTTP ${res.status})`;
  return { success: false, message: msg };
}

function validateTrade(b) {
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

// ---------- persistence ----------
function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
let queue = loadJson(QUEUE_FILE, []);
let tradeLog = loadJson(LOG_FILE, []);
const persistQueue = () => saveJson(QUEUE_FILE, queue);
const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(ms));

function logTrade(t, source) {
  tradeLog.push({ at: Date.now(), day: dayKey(Date.now()), action: t.action, exchange: t.exchange, ticker: t.ticker, quantity: t.quantity, source });
  if (tradeLog.length > 5000) tradeLog = tradeLog.slice(-5000);
  saveJson(LOG_FILE, tradeLog);
}

// ---------- scheduler ----------
let tickRunning = false;
async function runSchedulerTick() {
  if (tickRunning) return { skipped: true };
  tickRunning = true;
  const summary = { executed: 0, failed: 0, waiting: queue.length };
  try {
    const now = Date.now();
    const due = queue.filter((t) => t.status !== 'failed' && t.executeAt <= now && (t.nextAttemptAt ?? 0) <= now);
    for (const task of due) {
      let result;
      try {
        result = await executeTrade(task);
      } catch (e) {
        result = { success: false, message: e.message };
      }
      if (result.success) {
        queue = queue.filter((t) => t.id !== task.id);
        logTrade(task, 'scheduled');
        summary.executed++;
      } else {
        task.attempts = (task.attempts || 0) + 1;
        task.lastError = result.message;
        task.status = task.attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying';
        task.nextAttemptAt = Date.now() + RETRY_MS;
        summary.failed++;
      }
      persistQueue();
    }
    summary.waiting = queue.length;
    return summary;
  } finally {
    tickRunning = false;
  }
}

// ---------- daily report ----------
function buildReport({ date, startEquity, endEquity, startHoldings = [], endHoldings = [] }) {
  const pnl = endEquity - startEquity;
  const startBy = new Map(startHoldings.map((h) => [h.ticker, h]));
  const contrib = [];
  for (const e of endHoldings) {
    const s = startBy.get(e.ticker);
    if (!s || !s.quantity) continue; // opened today: no price-only basis
    contrib.push({ ticker: e.ticker, amount: e.totalValue - s.totalValue * (e.quantity / s.quantity) });
  }
  contrib.sort((a, b) => b.amount - a.amount);
  const top = contrib.find((c) => c.amount > 0) || null;
  const drag = [...contrib].reverse().find((c) => c.amount < 0) || null;
  const day = tradeLog.filter((t) => t.day === date);
  return {
    date,
    pnl,
    pnlPercent: startEquity > 0 ? (pnl / startEquity) * 100 : 0,
    startEquity,
    endEquity,
    topContributor: top,
    biggestDrag: drag,
    buys: day.filter((t) => t.action === 'buy').length,
    sells: day.filter((t) => t.action === 'sell').length,
    generatedAt: Date.now(),
  };
}

// ---------- app ----------
const app = express();
const allowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
if (process.env.FRONTEND_URL) allowed.add(process.env.FRONTEND_URL.replace(/\/$/, ''));
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '256kb' }));

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    console.error(`[${req.method} ${req.path}]`, e.message);
    res.status(502).json({ error: e.message });
  }
};

app.get('/api/health', (_req, res) => res.json({ ok: true, queued: queue.length }));
app.get('/api/dashboard', wrap(async (_req, res) => res.json(await getDashboard())));
app.get('/api/leaderboard', wrap(async (_req, res) => res.json(await getLeaderboard())));

app.post('/api/trade', wrap(async (req, res) => {
  const v = validateTrade(req.body);
  if (v.error) return res.status(400).json({ success: false, message: v.error });
  const result = await executeTrade(v.trade);
  if (result.success) logTrade(v.trade, 'manual');
  res.json(result);
}));

app.post('/api/schedule-trade', wrap(async (req, res) => {
  const v = validateTrade(req.body);
  if (v.error) return res.status(400).json({ success: false, message: v.error });
  const executeAt = Number(req.body?.executeAt);
  if (!Number.isFinite(executeAt) || executeAt <= 0) {
    return res.status(400).json({ success: false, message: 'executeAt must be unix milliseconds' });
  }
  const task = { id: crypto.randomUUID(), ...v.trade, executeAt, createdAt: Date.now(), attempts: 0, status: 'pending', lastError: null, nextAttemptAt: 0 };
  queue.push(task);
  queue.sort((a, b) => a.executeAt - b.executeAt);
  persistQueue();
  res.status(201).json({ success: true, message: 'scheduled', task });
}));

app.get('/api/scheduled-trades', (_req, res) => res.json(queue));

app.delete('/api/schedule-trade/:id', (req, res) => {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== req.params.id);
  if (queue.length === before) return res.status(404).json({ success: false, message: 'not found' });
  persistQueue();
  res.json({ success: true });
});

app.post('/api/run-scheduler-tick', wrap(async (_req, res) => res.json(await runSchedulerTick())));

app.post('/api/generate-daily-report', (req, res) => {
  const b = req.body || {};
  if (!b.date || !Number.isFinite(b.startEquity) || !Number.isFinite(b.endEquity)) {
    return res.status(400).json({ error: 'date, startEquity, endEquity required' });
  }
  res.json(buildReport(b));
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`[server] investja proxy listening on :${PORT} -> ${BASE_URL} (queue: ${queue.length})`));
}
export { app, buildReport };
