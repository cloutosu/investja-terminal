import { getStore } from '@netlify/blobs';
import { makeClient } from '../../server/core.js';

export const env = () => process.env;
export const TARGET = () => process.env.TARGET_TEAM || 'Rahman Power Squared';

// Netlify env: INVESTJA_USER / INVESTJA_PASS
export const session = () =>
  makeClient({
    baseUrl: process.env.BASE_URL || 'https://investja.org',
    user: process.env.INVESTJA_USER, // never plain USER: the OS sets that to the shell user
    pass: process.env.INVESTJA_PASS,
  });

const mem = new Map();
const memStore = {
  get: async (k, fb) => (mem.has(k) ? structuredClone(mem.get(k)) : fb),
  set: async (k, v) => { mem.set(k, structuredClone(v)); },
  del: async (k) => { mem.delete(k); },
  list: async (prefix) => [...mem.keys()].filter((k) => k.startsWith(prefix)),
};

export function openStore() {
  try {
    const s = getStore({ name: 'investja', consistency: 'strong' });
    return {
      get: async (k, fb) => (await s.get(k, { type: 'json' })) ?? fb,
      set: (k, v) => s.setJSON(k, v),
      del: (k) => s.delete(k),
      list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
    };
  } catch {
    return memStore; // not on Netlify (local dev and tests)
  }
}
