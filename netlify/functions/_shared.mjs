import { getStore } from '@netlify/blobs';
import { makeClient } from '../../server/core.js';

// Netlify env: INVESTJA_USER / INVESTJA_PASS (plain USER also works)
export const session = () =>
  makeClient({
    baseUrl: process.env.BASE_URL || 'https://investja.org',
    user: process.env.INVESTJA_USER || process.env.USER,
    pass: process.env.INVESTJA_PASS || process.env.PASS,
  });

const mem = new Map();
export function openStore() {
  try {
    const s = getStore('investja');
    return {
      get: async (k, fb) => (await s.get(k, { type: 'json' })) ?? fb,
      set: (k, v) => s.setJSON(k, v),
    };
  } catch {
    // not on Netlify (local tests): in-memory
    return { get: async (k, fb) => mem.get(k) ?? fb, set: async (k, v) => { mem.set(k, structuredClone(v)); } };
  }
}
