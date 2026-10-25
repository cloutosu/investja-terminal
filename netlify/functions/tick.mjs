import { runTick } from '../../server/core.js';
import { openStore, session } from './_shared.mjs';

// Netlify runs this on a cron, replacing cron-job.org. It exits early when nothing is due.
export default async () => {
  const summary = await runTick(openStore(), session);
  console.log('[tick]', JSON.stringify(summary));
};

export const config = { schedule: '* * * * *' };
