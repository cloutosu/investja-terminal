// Node 20 ESM — access codes -> signed tokens. Owner can trade; viewer is read-only.
import crypto from 'node:crypto';

const TTL_MS = 12 * 3600 * 1000;
const MAX_FAILS = 6;
const LOCK_MS = 15 * 60 * 1000;

const key = (env) => crypto.createHash('sha256').update(`${env.ACCESS_CODE}|${env.INVESTJA_PASS || ''}`).digest();
const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const mac = (env, body) => crypto.createHmac('sha256', key(env)).update(body).digest('base64url');

export function roleForCode(env, code) {
  if (!env.ACCESS_CODE || !code) return null;
  if (same(code, env.ACCESS_CODE)) return 'owner';
  if (env.VIEW_CODE && same(code, env.VIEW_CODE)) return 'viewer';
  return null;
}

export function signToken(env, role) {
  const body = `${role}.${Date.now() + TTL_MS}`;
  return `${body}.${mac(env, body)}`;
}

export function verifyToken(env, token) {
  if (!env.ACCESS_CODE) return null;
  const [role, exp, sig] = String(token || '').split('.');
  if ((role !== 'owner' && role !== 'viewer') || !sig || Number(exp) < Date.now()) return null;
  return same(sig, mac(env, `${role}.${exp}`)) ? role : null;
}

// Per-IP failure counter kept in the store; 6 misses locks that IP for 15 minutes.
export async function checkLock(store, ip) {
  const fails = await store.get('auth-fails', {});
  const f = fails[ip];
  return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0;
}
export async function recordFail(store, ip) {
  const fails = await store.get('auth-fails', {});
  const now = Date.now();
  for (const k of Object.keys(fails)) if ((fails[k].last ?? 0) < now - LOCK_MS) delete fails[k];
  const f = fails[ip] ?? { n: 0, until: 0 };
  f.n += 1;
  f.last = now;
  if (f.n >= MAX_FAILS) { f.until = now + LOCK_MS; f.n = 0; }
  fails[ip] = f;
  await store.set('auth-fails', fails);
  return MAX_FAILS - f.n;
}
export async function clearFails(store, ip) {
  const fails = await store.get('auth-fails', {});
  if (fails[ip]) { delete fails[ip]; await store.set('auth-fails', fails); }
}
