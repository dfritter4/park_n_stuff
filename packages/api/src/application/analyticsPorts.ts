/**
 * Analytics-specific ports, split out from ports.ts because the analytics read
 * model (dashboard/analytics/day-breakdown/export) has a different shape than
 * the write-side domain records above and would otherwise crowd that file.
 */
export interface DashboardLotSnapshot {
  lotId: string;
  name: string;
  capacity: number;
  occupied: number;
  revenueTodayCents: number;
}

export interface DashboardRecentReservation {
  reservationNumber: string;
  lotName: string;
  startTime: Date;
  endTime: Date;
  totalCostCents: number;
  createdAt: Date;
}

export interface DashboardData {
  revenueTodayCents: number;
  activeReservations: number;
  /** All non-deleted lots (active and maintenance) — also the input set for averageOccupancyPct. */
  lots: DashboardLotSnapshot[];
  recentReservations: DashboardRecentReservation[];
}

export interface DailyRevenuePoint {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  revenueCents: number;
  reservations: number;
}

export interface HourlyOccupancyPoint {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  /** UTC hour of day, 0-23. */
  hour: number;
  occupancyPct: number;
}

export interface DayBreakdownRow {
  /** UTC hour of day, 0-23. */
  hour: number;
  reservations: number;
  revenueCents: number;
  occupancyPct: number;
}

export interface ExportReservationRow {
  reservationNumber: string;
  lotName: string;
  startTime: Date;
  endTime: Date;
  status: 'active' | 'completed' | 'cancelled';
  totalCostCents: number;
  createdAt: Date;
}

export interface HeatmapCell {
  /** UTC day of week, 0=Sunday. */
  dow: number;
  /** UTC hour of day, 0-23. */
  hour: number;
  occupancyPct: number;
}

export interface WeekDayPoint {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  revenueCents: number;
  reservations: number;
}

export interface WeeklyCompareData {
  thisWeek: WeekDayPoint[];
  lastWeek: WeekDayPoint[];
}

export interface LotCompareRow {
  lotId: string;
  name: string;
  revenueCents: number;
  reservations: number;
  avgOccupancyPct: number;
}

export interface ForecastPoint {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  /** UTC hour of day, 0-23. */
  hour: number;
  projectedOccupancyPct: number;
}

export interface DeclineDayPoint {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  count: number;
  amountCents: number;
}

export interface RecentDecline {
  lotName: string;
  amountCents: number;
  cardLast4: string;
  createdAt: Date;
}

export interface DeclinesData {
  total: number;
  byDay: DeclineDayPoint[];
  recent: RecentDecline[];
}

export interface AnalyticsRepository {
  getDashboardData(): Promise<DashboardData>;
  /**
   * Last `days` UTC days (inclusive of today), gap-free. When `lotId` is null,
   * revenue is counted across all lots; when set, only payments for that
   * lot's reservations are counted.
   */
  getDailyRevenue(days: number, lotId: string | null): Promise<DailyRevenuePoint[]>;
  /**
   * Last 7 UTC days x 24h = 168 gap-free rows, oldest to newest. When `lotId`
   * is null the denominator is total non-deleted lot capacity and the
   * numerator excludes deleted-lot reservations; when set, the denominator is
   * that lot's capacity and the numerator is scoped to it.
   */
  getHourlyOccupancy(lotId: string | null): Promise<HourlyOccupancyPoint[]>;
  /**
   * 24 gap-free rows (hour 0-23) for the given UTC date (YYYY-MM-DD). When
   * `lotId` is set, reservations, revenue, and occupancy are all scoped to
   * that lot (occupancy denominator becomes that lot's capacity).
   */
  getDayBreakdown(date: string, lotId: string | null): Promise<DayBreakdownRow[]>;
  /** All reservations (any status), for CSV export. */
  getExportRows(): Promise<ExportReservationRow[]>;
  /**
   * Mean occupancy per (UTC dow, UTC hour) over the last 30 days, 168 gap-free
   * cells. When `lotId` is null the denominator is total non-deleted lot
   * capacity and the numerator excludes deleted-lot reservations; when set,
   * the denominator is that lot's capacity and the numerator is scoped to it.
   */
  getHeatmap(lotId: string | null): Promise<HeatmapCell[]>;
  /** Last 7 full UTC days vs. the 7 UTC days before that (today excluded), gap-free. */
  getWeeklyCompare(): Promise<WeeklyCompareData>;
  /** Per non-deleted lot: revenue/reservations over the last `days` days, avg occupancy over the same window. */
  getLotCompare(days: number): Promise<LotCompareRow[]>;
  /** Next 7 UTC dates x 24h = 168 gap-free points for `lotId`, projected from the last-30-days (dow, hour) means. */
  getForecast(lotId: string): Promise<ForecastPoint[]>;
  /** Decline totals/by-day over the last `days` days, plus the 50 most recent declines overall. */
  getDeclines(days: number): Promise<DeclinesData>;
}
