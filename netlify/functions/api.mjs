import crypto from 'node:crypto';
import { buildReport, logTrade, runTick, validateTrade } from '../../server/core.js';
import { openStore, session } from './_shared.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/\/$/, '');
  const store = openStore();
  try {
    if (path === '/api/health' && req.method === 'GET') return json({ ok: true, queued: (await store.get('queue', [])).length });

    if (path === '/api/live' && req.method === 'GET') return json(await session().live());
    if (path === '/api/dashboard' && req.method === 'GET') return json((await session().live()).dashboard);
    if (path === '/api/leaderboard' && req.method === 'GET') return json((await session().live()).leaderboard);

    if (path === '/api/trade' && req.method === 'POST') {
      const v = validateTrade(await req.json().catch(() => null));
      if (v.error) return json({ success: false, message: v.error }, 400);
      const client = session();
      await client.login();
      const result = await client.trade(v.trade);
      if (result.success) await logTrade(store, v.trade, 'manual');
      return json(result);
    }

    if (path === '/api/schedule-trade' && req.method === 'POST') {
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

    if (path === '/api/scheduled-trades' && req.method === 'GET') return json(await store.get('queue', []));

    const del = path.match(/^\/api\/schedule-trade\/([\w-]+)$/);
    if (del && req.method === 'DELETE') {
      const queue = await store.get('queue', []);
      const next = queue.filter((t) => t.id !== del[1]);
      if (next.length === queue.length) return json({ success: false, message: 'not found' }, 404);
      await store.set('queue', next);
      return json({ success: true });
    }

    if (path === '/api/run-scheduler-tick' && req.method === 'POST') return json(await runTick(store, session));

    if (path === '/api/generate-daily-report' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (!b.date || !Number.isFinite(b.startEquity) || !Number.isFinite(b.endEquity)) return json({ error: 'date, startEquity, endEquity required' }, 400);
      return json(await buildReport(store, b));
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error(`[${req.method} ${path}]`, e.message);
    return json({ error: e.message }, 502);
  }
};

export const config = { path: '/api/*' };
