import Dexie, { type Table } from 'dexie';
import type { DailyReportData, DayAnchor, Holding, Snapshot, TeamWithDelta } from '../types';

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
const TOP_N = 20;
const PRUNE_EVERY = 60; // polls

// Only the user's team, the top 20 and any team opened in HistoryModal are stored (~22 series, not 2,525).
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

let pollCount = 0;

export async function recordSnapshots(teams: TeamWithDelta[], myName: string, myEquity?: number) {
  const names = new Set<string>([myName, ...getTracked()]);
  for (const t of teams) if (t.rank <= TOP_N) names.add(t.name);
  const now = Date.now();
  const rows: Snapshot[] = [];
  for (const t of teams) {
    if (names.has(t.name)) {
      // own series uses the live portfolio equity so the hero number and its chart agree
      rows.push({ teamName: t.name, timestamp: now, equity: t.name === myName && myEquity !== undefined ? myEquity : t.equity, rank: t.rank });
    }
  }
  if (rows.length) await db.snapshots.bulkAdd(rows);
  if (++pollCount % PRUNE_EVERY === 0) await pruneSnapshots();
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

export async function ensureDayAnchor(date: string, equity: number, holdings: Holding[]) {
  const existing = await db.dayAnchors.get(date);
  if (existing) return existing;
  const anchor: DayAnchor = { date, equity, holdings };
  await db.dayAnchors.put(anchor);
  return anchor;
}
