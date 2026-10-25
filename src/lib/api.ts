import type { AppData } from '../types';

// data.json is rebuilt and redeployed by the GitHub Action; the query string defeats CDN/browser caches
export async function fetchData(): Promise<AppData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
  return (await res.json()) as AppData;
}
