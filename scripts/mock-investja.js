// Node 22 ESM / Express — local stand-in for investja.org (dev + verification only)
import express from 'express';

const app = express();
app.use(express.urlencoded({ extended: false }));
const sessions = new Set();
const teams = Array.from({ length: 2525 }, (_, i) => ({
  name: i === 6 ? 'Rahman Power Squared' : `Team ${i + 1}`,
  school: i === 6 ? 'Northview Heights' : `School ${(i % 90) + 1}`,
  loc: 'Toronto, ON',
  equity: 180000 - i * 40 + Math.random() * 500,
}));
teams[0].name = 'Trevizo'; teams[1].name = 'Chrysanthemum';
const holdings = [
  { ex: 'Nasdaq', t: 'STAK', q: 93992, p: 1.23 },
  { ex: 'TSX', t: 'POM', q: 1200, p: 3.1 },
];
let cash = 1234.56, loan = 45760.5;
const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const authed = (req) => sessions.has((req.headers.cookie || '').match(/ci_session=([^;]+)/)?.[1]);
const wall = (req, res, next) => (authed(req) ? next() : res.redirect(302, '/private/game/login'));

app.get('/private/game/login', (_req, res) => {
  res.set('Set-Cookie', 'ci_session=anon; Path=/');
  res.send('<form method="post"><input name="teamname"><input name="teampassword"></form>');
});
app.post('/private/game/login', (req, res) => {
  if (!req.body.teamname || req.body.teampassword !== (process.env.MOCK_PASS || 'mock')) {
    return res.send('<form><input name="teamname"><input name="teampassword"></form>');
  }
  teams.forEach((t) => { t.equity += (Math.random() - 0.45) * 300; }); // fresh login = fresh numbers
  holdings.forEach((h) => { h.p = +(h.p * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2); });
  const sid = Math.random().toString(36).slice(2);
  sessions.add(sid);
  res.set('Set-Cookie', `ci_session=${sid}; Path=/`).redirect(302, '/private/game');
});
app.get('/private/game', wall, (_req, res) => {
  const rows = holdings.map((h) => `<tr><td>${h.ex}</td><td>${h.t}</td><td>${h.q}</td><td>${fmt(h.q * h.p)}</td><td>${fmt(h.p)}</td></tr>`).join('');
  res.send(`<div class="card-body"><table><tr><td>Cash:</td><td>${fmt(cash)}</td></tr><tr><td>Loan:</td><td>${fmt(loan)}</td></tr></table></div>
  <table class="portfolio"><tr><th>Exchange</th><th>Ticker</th><th>Qty</th><th>Total</th><th>Price</th></tr>${rows}</table>`);
});
app.get('/private/game/rankings', wall, (_req, res) => {
  const sorted = [...teams].sort((a, b) => b.equity - a.equity);
  res.send('<table><tr><th>Rank</th></tr>' + sorted.map((t, i) => `<tr><td>${i + 1}</td><td>${t.name}</td><td>${t.school}</td><td>${t.loc}</td><td>${fmt(t.equity)}</td></tr>`).join('') + '</table>');
});
for (const a of ['buy', 'sell']) {
  app.post(`/private/game/${a}`, wall, (req, res) => {
    if (req.body.ticker === 'BAD') return res.status(500).send('boom');
    if (process.env.MOCK_CLOSED) return res.send('<div class="alert">Market is closed.</div>');
    res.redirect(302, '/private/game?tab=dashboard');
  });
}
app.listen(4000, () => console.log('[mock] investja on :4000'));
