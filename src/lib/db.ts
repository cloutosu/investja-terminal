import Dexie, { type Table } from 'dexie';
import type { DailyReportData, DayAnchor, Snapshot } from '../types';

// Market history now lives on the server (per-minute, 24 h). Only daily reports are kept locally.
// The legacy tables stay declared so existing browsers upgrade without a schema error.
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
