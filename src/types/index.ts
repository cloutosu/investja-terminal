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
  /** team name -> [equity, rank] */
  eq: Record<string, [number, number]>;
}
export interface AppData {
  timestamp: number;
  teams: Team[];
  portfolio: Portfolio;
  anchor: DayAnchor;
  history: HistoryPoint[];
}
export interface Pulse {
  id: number;
  delta: number;
  ticker: string | null;
}
