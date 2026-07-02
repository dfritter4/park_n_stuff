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
  /** Non-deleted, active-status lots only — also the input set for averageOccupancyPct. */
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

export interface AnalyticsRepository {
  getDashboardData(): Promise<DashboardData>;
  /** Last `days` UTC days (inclusive of today), gap-free. */
  getDailyRevenue(days: number): Promise<DailyRevenuePoint[]>;
  /** Last 7 UTC days x 24h = 168 gap-free rows, oldest to newest. */
  getHourlyOccupancy(): Promise<HourlyOccupancyPoint[]>;
  /** 24 gap-free rows (hour 0-23) for the given UTC date (YYYY-MM-DD). */
  getDayBreakdown(date: string): Promise<DayBreakdownRow[]>;
  /** All reservations (any status), for CSV export. */
  getExportRows(): Promise<ExportReservationRow[]>;
}
