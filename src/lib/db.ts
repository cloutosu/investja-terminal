import Dexie, { type Table } from 'dexie';
import type { DailyReportData, DayAnchor, HistoryPoint, Snapshot, TeamWithDelta } from '../types';

class InvestJADB extends Dexie {
  snapshots!: Table<Snapshot, number>;
  dailyReports!: Table<DailyReportData, number>;
  dayAnchors!: Table<DayAnchor, string>;

  constructor() {
    super('investja');
    this.version(1).stores({ snapshots: '++id, teamName, timestamp' });
    this.version(2).stores({
      snapshots: '++id, teamName, timestamp, [teamName+timestamp]',
      dailyReports: '++id, &date',
      dayAnchors: 'date',
    });
  }
}

export const db = new InvestJADB();

const FIVE_SEC_WINDOW = 2 * 60 * 60 * 1000;
const MINUTE_WINDOW = 24 * 60 * 60 * 1000;
const TRACK_KEY = 'investja.tracked';

// Only the user's team, the top 20 and any team opened in HistoryModal are stored, not all 2,525.
export function getTracked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRACK_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function trackTeam(name: string) {
  const s = getTracked();
  if (s.has(name)) return;
  s.add(name);
  try { localStorage.setItem(TRACK_KEY, JSON.stringify([...s])); } catch { /* storage blocked */ }
}

// Own team + top 20 arrive pre-recorded in data.json (the scraper keeps 24 h, so charts exist
// even when nobody had the page open). Import only what we don't have yet.
export async function importHistory(history: HistoryPoint[], myName: string) {
  const lastRow = await db.snapshots
    .where('[teamName+timestamp]')
    .between([myName, 0], [myName, Dexie.maxKey])
    .last();
  const last = lastRow?.timestamp ?? 0;
  const fresh = history.filter((p) => p.t > last);
  if (!fresh.length) return false;
  const rows: Snapshot[] = [];
  for (const p of fresh) {
    for (const [teamName, [equity, rank]] of Object.entries(p.eq)) rows.push({ teamName, timestamp: p.t, equity, rank });
  }
  await db.snapshots.bulkAdd(rows);
  await pruneSnapshots();
  return true;
}

// Teams the user opened in HistoryModal that aren't in the scraper's top 20 are recorded per sync.
export async function recordTracked(teams: TeamWithDelta[], timestamp: number) {
  const rows: Snapshot[] = [];
  for (const name of getTracked()) {
    const t = teams.find((x) => x.name === name);
    if (!t) continue;
    const exists = await db.snapshots.where('[teamName+timestamp]').equals([name, timestamp]).count();
    if (!exists) rows.push({ teamName: name, timestamp, equity: t.equity, rank: t.rank });
  }
  if (rows.length) await db.snapshots.bulkAdd(rows);
}

// 5s resolution for 2h, thinned to one point per minute until 24h, then dropped.
export async function pruneSnapshots() {
  const now = Date.now();
  await db.snapshots.where('timestamp').below(now - MINUTE_WINDOW).delete();
  const old = await db.snapshots.where('timestamp').below(now - FIVE_SEC_WINDOW).toArray();
  const seen = new Set<string>();
  const drop: number[] = [];
  for (const s of old) {
    const key = `${s.teamName}|${Math.floor(s.timestamp / 60000)}`;
    if (seen.has(key)) drop.push(s.id!);
    else seen.add(key);
  }
  if (drop.length) await db.snapshots.bulkDelete(drop);
}

export function readSnapshots(teamName: string, sinceMs: number) {
  return db.snapshots
    .where('[teamName+timestamp]')
    .between([teamName, sinceMs], [teamName, Dexie.maxKey])
    .toArray();
}
