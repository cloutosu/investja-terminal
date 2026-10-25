import crypto from 'node:crypto';
import { ingest, logTrade, tickOnce, trackTeam, validateTrade } from '../../server/core.js';
import { checkLock, clearFails, recordFail, roleForCode, signToken, verifyToken } from '../../server/auth.js';
import { env, openStore, session, TARGET } from './_shared.mjs';

const STALE_MS = 150 * 1000;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ipOf = (req) => req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/\/$/, '');
  const store = openStore();
  const e = env();

  try {
    if (path === '/api/health' && req.method === 'GET') return json({ ok: true, configured: !!e.ACCESS_CODE });
    if (!e.ACCESS_CODE) return json({ error: 'ACCESS_CODE is not set on the server' }, 503);

    if (path === '/api/auth' && req.method === 'POST') {
      const ip = ipOf(req);
      const mins = await checkLock(store, ip);
      if (mins) return json({ message: `Too many attempts. Try again in ${mins} min.` }, 429);
      const { code } = (await req.json().catch(() => ({}))) ?? {};
      const role = roleForCode(e, String(code ?? ''));
      if (!role) {
        await sleep(700);
        return json({ message: `Incorrect code. ${await recordFail(store, ip)} attempts left.` }, 401);
      }
      await clearFails(store, ip);
      return json({ token: signToken(e, role), role });
    }

    const role = verifyToken(e, (req.headers.get('authorization') || '').replace(/^Bearer /, ''));
    if (!role) return json({ error: 'unauthorized' }, 401);
    const owner = () => role === 'owner';
    const forbidden = () => json({ error: 'owner only' }, 403);

    if (path === '/api/live' && req.method === 'GET') {
      let latest = await store.get('latest', null);
      if (!latest || Date.now() - latest.timestamp > STALE_MS) {
        // scheduler missed a beat (or first ever load): refresh inline
        await tickOnce(store, session, TARGET()).catch(() => {});
        latest = await store.get('latest', latest);
      }
      if (!latest) return json({ error: (await store.get('status', null))?.error || 'no data yet' }, 503);
      return json({ ...latest, movers: await store.get('movers', null), status: await store.get('status', null) });
    }

    if (path === '/api/history' && req.method === 'GET') return json({ points: await store.get('history', []) });

    if (path === '/api/track' && req.method === 'POST') {
      const { name } = (await req.json().catch(() => ({}))) ?? {};
      if (typeof name !== 'string' || !name || name.length > 120) return json({ error: 'name required' }, 400);
      await trackTeam(store, name);
      return json({ ok: true });
    }

    if (path === '/api/trade' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const v = validateTrade(await req.json().catch(() => null));
      if (v.error) return json({ success: false, message: v.error }, 400);
      const client = session();
      await client.login();
      const result = await client.trade(v.trade);
      if (result.success) {
        await logTrade(store, v.trade, 'manual');
        // same session: refresh the numbers so the UI shows the fill immediately
        await ingest(store, await client.scrape(), Date.now(), TARGET()).catch((err) => console.error('[post-trade ingest]', err.message));
      }
      return json(result);
    }

    if (path === '/api/schedule-trade' && req.method === 'POST') {
      if (!owner()) return forbidden();
      const body = await req.json().catch(() => null);
      const v = validateTrade(body);
      if (v.error) return json({ success: false, message: v.error }, 400);
      const executeAt = Number(body.executeAt);
      if (!Number.isFinite(executeAt) || executeAt <= 0) return json({ success: false, message: 'executeAt must be unix milliseconds' }, 400);
      const queue = await store.get('queue', []);
      const task = { id: crypto.randomUUID(), ...v.trade, executeAt, createdAt: Date.now(), attempts: 0, status: 'pending', lastError: null, nextAttemptAt: 0 };
      queue.push(task);
      queue.sort((a, b) => a.executeAt - b.executeAt);
      await store.set('queue', queue);
      return json({ success: true, message: 'scheduled', task }, 201);
    }

    if (path === '/api/scheduled-trades' && req.method === 'GET') {
      if (!owner()) return forbidden();
      return json(await store.get('queue', []));
    }

    const del = path.match(/^\/api\/schedule-trade\/([\w-]+)$/);
    if (del && req.method === 'DELETE') {
      if (!owner()) return forbidden();
      const queue = await store.get('queue', []);
      const next = queue.filter((t) => t.id !== del[1]);
      if (next.length === queue.length) return json({ success: false, message: 'not found' }, 404);
      await store.set('queue', next);
      return json({ success: true });
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    console.error(`[${req.method} ${path}]`, err.message);
    return json({ error: err.message }, 502);
  }
};

export const config = { path: '/api/*' };
