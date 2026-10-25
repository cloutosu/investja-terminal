// Node 20 ESM / axios + cheerio — logs in to investja.org, scrapes rankings + dashboard, writes public/data.json
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDashboard, parseLeaderboard, looksLikeLoginPage } from './scraper/parsers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL || 'https://investja.org').replace(/\/$/, '');
const USER = process.env.INVESTJA_USER;
const PASS = process.env.INVESTJA_PASS;
const TARGET_TEAM = process.env.TARGET_TEAM || 'Rahman Power Squared';
const PREV = process.env.PREV_DATA; // URL of the last deployed data.json, or a file path (local runs)
const OUT = path.join(__dirname, 'public', 'data.json');
const HISTORY_MS = 24 * 3600 * 1000;
const TOP_N = 20;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const http = axios.create({ baseURL: BASE_URL, maxRedirects: 0, validateStatus: () => true, timeout: 30000, headers: { 'User-Agent': UA } });
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const capture = (res) => {
  for (const line of res.headers['set-cookie'] ?? []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
};
const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(ms));

async function login() {
  capture(await http.get('/private/game/login'));
  const res = await http.post(
    '/private/game/login',
    new URLSearchParams({ teamname: USER, teampassword: PASS }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() } },
  );
  capture(res);
  if (res.status !== 302) throw new Error(`login rejected (HTTP ${res.status}); check INVESTJA_USER / INVESTJA_PASS`);
}

async function get(p) {
  const res = await http.get(p, { headers: { Cookie: cookie() } });
  const html = String(res.data);
  if (res.status !== 200 || looksLikeLoginPage(html)) throw new Error(`GET ${p} failed (HTTP ${res.status})`);
  return html;
}

async function loadPrev() {
  if (!PREV) return null;
  try {
    const raw = /^https?:/.test(PREV)
      ? (await axios.get(PREV, { timeout: 15000, responseType: 'json', headers: { 'Cache-Control': 'no-cache' }, params: { t: Date.now() } })).data
      : JSON.parse(fs.readFileSync(PREV, 'utf8'));
    return raw && Array.isArray(raw.teams) ? raw : null;
  } catch (e) {
    console.warn('[scrape] no previous data (first run?):', e.message);
    return null;
  }
}

async function run() {
  if (!USER || !PASS) throw new Error('INVESTJA_USER / INVESTJA_PASS are not set');

  // fresh login every run: investja caches pages until a new session is created
  await login();
  const teams = parseLeaderboard(await get('/private/game/rankings'));
  const dash = parseDashboard(await get('/private/game'));
  // Never overwrite good data with a half-parsed page.
  if (!teams.length) throw new Error('rankings parsed to 0 teams (selectors changed or page not authenticated)');
  if (!dash._complete) throw new Error('dashboard parse incomplete (Cash/Loan rows not found)');
  const { _complete, ...portfolio } = dash;

  const now = Date.now();
  const prev = await loadPrev();
  const equity = portfolio.holdings.reduce((s, h) => s + h.totalValue, 0) + portfolio.cash - portfolio.loan;
  const date = dayKey(now);
  // first scrape of the ET day = start-of-day basis for "earned today" and the daily report
  const anchor = prev?.anchor?.date === date ? prev.anchor : { date, equity, holdings: portfolio.holdings };

  const prevEq = new Map((prev?.teams ?? []).map((t) => [t.name, t.equity]));
  const outTeams = teams.map((t) => {
    const row = { rank: t.rank, name: t.name, school: t.school, equity: t.equity };
    if (prevEq.has(t.name)) row.prevEquity = prevEq.get(t.name);
    return row;
  });

  // own team + top 20, 24h, so charts exist even when nobody had the page open
  const point = { t: now, eq: {} };
  for (const t of teams) if (t.rank <= TOP_N) point.eq[t.name] = [t.equity, t.rank];
  point.eq[TARGET_TEAM] = [equity, teams.find((t) => t.name === TARGET_TEAM)?.rank ?? 0];
  const history = [...(prev?.history ?? []), point].filter((p) => p.t > now - HISTORY_MS);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify({ timestamp: now, teams: outTeams, portfolio, anchor, history }));
  fs.renameSync(`${OUT}.tmp`, OUT);
  console.log(`[scrape] ${teams.length} teams, ${portfolio.holdings.length} holdings, equity ${equity.toFixed(2)}, history ${history.length} pts`);
}

run().catch((e) => {
  console.error('[scrape] failed:', e.message);
  process.exit(1);
});
