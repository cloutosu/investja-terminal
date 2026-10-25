import { tickOnce } from '../../server/core.js';
import { openStore, session, TARGET } from './_shared.mjs';

// Runs every minute on Netlify's scheduler: due trades, then scrape + history + movers.
export default async () => {
  try {
    console.log('[tick]', JSON.stringify(await tickOnce(openStore(), session, TARGET())));
  } catch (e) {
    console.error('[tick] failed:', e.message);
  }
};

export const config = { schedule: '* * * * *' };
