// Game clock helpers. The site runs on Eastern time, weekdays 9:35-16:00.
const TZ = 'America/Toronto';
const OPEN_MIN = 9 * 60 + 35;
const CLOSE_MIN = 16 * 60;

interface EtParts { y: number; m: number; d: number; h: number; min: number; wd: number }

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short',
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function etParts(ms = Date.now()): EtParts {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: WD[p.weekday] };
}

export const etMinutes = (ms = Date.now()) => { const p = etParts(ms); return p.h * 60 + p.min; };

export function isMarketOpen(ms = Date.now()) {
  const p = etParts(ms);
  const mins = p.h * 60 + p.min;
  return p.wd >= 1 && p.wd <= 5 && mins >= OPEN_MIN && mins < CLOSE_MIN;
}

export function etDayKey(ms = Date.now()) {
  const p = etParts(ms);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function zonedToMs(y: number, m: number, d: number, h: number, min: number) {
  const target = Date.UTC(y, m - 1, d, h, min);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const p = etParts(guess);
    guess -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - target;
  }
  return guess;
}

export function nextMarketOpen(from = Date.now()) {
  const base = etParts(from);
  for (let i = 0; i < 8; i++) {
    const day = new Date(Date.UTC(base.y, base.m - 1, base.d + i));
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const ms = zonedToMs(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 9, 35);
    if (ms > from) return ms;
  }
  return from;
}

export function etTime(ms: number) {
  const today = etDayKey() === etDayKey(ms);
  const p = etParts(ms);
  const hm = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
  if (today) return `${hm} ET`;
  return `${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')} ${hm} ET`;
}

export const HOLD_MS = 60 * 60 * 1000;
