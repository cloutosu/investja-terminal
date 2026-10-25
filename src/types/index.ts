export interface Team {
  rank: number;
  name: string;
  school: string;
  location: string;
  equity: number;
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
export interface TradeBody {
  action: TradeAction;
  exchange: string;
  ticker: string;
  quantity: number;
}
export interface TradeResult {
  success: boolean;
  message: string;
}
export interface ScheduleBody extends TradeBody {
  executeAt: number;
}
export interface ScheduledTrade extends ScheduleBody {
  id: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'retrying' | 'failed';
  lastError: string | null;
  nextAttemptAt: number;
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
export interface DailyReportRequest {
  date: string;
  startEquity: number;
  endEquity: number;
  startHoldings: Holding[];
  endHoldings: Holding[];
}
export interface Pulse {
  id: number;
  delta: number;
  ticker: string | null;
}
