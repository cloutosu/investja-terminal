export interface Team {
  rank: number;
  name: string;
  school: string;
  location?: string;
  equity: number;
  prevEquity?: number;
}
export interface TeamWithDelta extends Team {
  deltaDollar: number;
  deltaPercent: number;
}
export type Exchange = 'Nasdaq' | 'NYSE' | 'TSX';
export interface Holding {
  exchange: Exchange | string;
  ticker: string;
  quantity: number;
  totalValue: number;
  currentPrice: number;
}
export interface Portfolio {
  cash: number;
  loan: number;
  holdings: Holding[];
}
export type TradeAction = 'buy' | 'sell';
export interface TradeBody { action: TradeAction; exchange: string; ticker: string; quantity: number }
export interface TradeResult { success: boolean; message: string }
export interface ScheduleBody extends TradeBody { executeAt: number }
export interface ScheduledTrade extends ScheduleBody {
  id: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'retrying' | 'failed';
  lastError: string | null;
  nextAttemptAt: number;
}
export type Role = 'owner' | 'viewer';
export type MoverKey = '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
export interface MoverRow { name: string; rank: number; equity: number; delta: number; pct: number }
export interface MoverWindow { ready: boolean; gainers: MoverRow[]; losers: MoverRow[]; me: MoverRow | null }
export interface MoversData { t: number; windows: Record<MoverKey, MoverWindow> }
export interface LiveData {
  timestamp: number;
  teams: Team[];
  portfolio: Portfolio;
  anchor: DayAnchor;
  trades: { buys: number; sells: number };
  movers: MoversData | null;
  status: { at: number; error: string | null } | null;
}
export interface Snapshot {
  id?: number;
  teamName: string;
  timestamp: number;
  equity: number;
  rank: number;
}
export interface DayAnchor {
  date: string;
  equity: number;
  holdings: Holding[];
}
export interface ReportContributor {
  ticker: string;
  amount: number;
}
export interface DailyReportData {
  id?: number;
  date: string;
  pnl: number;
  pnlPercent: number;
  startEquity: number;
  endEquity: number;
  topContributor: ReportContributor | null;
  biggestDrag: ReportContributor | null;
  buys: number;
  sells: number;
  generatedAt: number;
}
export interface HistoryPoint {
  t: number;
  /** your cash and loan at that minute (absent on older points) */
  cash?: number;
  loan?: number;
  /** team name -> [equity, rank] */
  eq: Record<string, [number, number]>;
}
export interface Pulse {
  id: number;
  delta: number;
  ticker: string | null;
}
