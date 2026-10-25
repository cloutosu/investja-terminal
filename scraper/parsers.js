// Node 22 ESM / cheerio — HTML parsers for investja.org pages (pure, no network)
import * as cheerio from 'cheerio';

export function parseMoney(raw) {
  if (raw == null) return 0;
  const s = String(raw);
  const neg = /^\s*[-(−]/.test(s) || /-\s*\$/.test(s);
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

function findLabelled($, label) {
  let found = null;
  $('.card-body table tr').each((_, tr) => {
    if (found !== null) return;
    const text = clean($(tr).text());
    const idx = text.indexOf(label);
    if (idx === -1) return;
    found = parseMoney(text.slice(idx + label.length));
  });
  return found;
}

export function parseDashboard(html) {
  const $ = cheerio.load(html);
  const holdings = [];
  $('table.portfolio tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 5) return; // header / footer rows
    const c = (i) => clean($(cells[i]).text());
    const quantity = parseInt(c(2).replace(/[^0-9-]/g, ''), 10);
    if (!c(1) || !Number.isFinite(quantity)) return;
    holdings.push({
      exchange: c(0),
      ticker: c(1),
      quantity,
      totalValue: parseMoney(c(3)),
      currentPrice: parseMoney(c(4)),
    });
  });
  const cash = findLabelled($, 'Cash:');
  const loan = findLabelled($, 'Loan:');
  return { cash: cash ?? 0, loan: loan ?? 0, holdings, _complete: cash !== null && loan !== null };
}

export function parseLeaderboard(html) {
  const $ = cheerio.load(html);
  const teams = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 5) return;
    const c = (i) => clean($(cells[i]).text());
    const rank = parseInt(c(0).replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(rank)) return;
    teams.push({ rank, name: c(1), school: c(2), location: c(3), equity: parseMoney(c(4)) });
  });
  return teams;
}

export function looksLikeLoginPage(html) {
  return /name=["']teampassword["']/i.test(html);
}

export function extractErrorMessage(html) {
  const $ = cheerio.load(html);
  const sel = ['.alert-danger', '.alert-error', '.alert', '.error', '.message', '.flash'];
  for (const s of sel) {
    const t = clean($(s).first().text());
    if (t) return t.slice(0, 240);
  }
  return null;
}
