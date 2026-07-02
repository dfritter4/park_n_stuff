import type { AnalyticsResponse } from '@parking/shared';

const HOURS_PER_DAY = 24;

export interface OccupancyChartRow {
  hour: number;
  [date: string]: number | undefined;
}

export interface OccupancyChartData {
  dates: string[];
  rows: OccupancyChartRow[];
}

/**
 * Pivots the flat `hourlyOccupancy` list (one entry per date+hour) into the
 * wide, per-hour-row shape recharts' `LineChart` expects: one row per hour
 * (0-23) with a column per date so each date can be rendered as its own
 * `Line`.
 */
export function buildOccupancyChartData(
  hourlyOccupancy: AnalyticsResponse['hourlyOccupancy'],
): OccupancyChartData {
  const dates = Array.from(new Set(hourlyOccupancy.map((entry) => entry.date))).sort();

  const rows: OccupancyChartRow[] = Array.from({ length: HOURS_PER_DAY }, (_, hour) => ({ hour }));
  for (const entry of hourlyOccupancy) {
    rows[entry.hour][entry.date] = entry.occupancyPct;
  }

  return { dates, rows };
}

export interface RevenueChartRow {
  date: string;
  revenue: number;
}

/** Converts daily revenue cents to dollars for the revenue bar chart. */
export function toRevenueChartData(dailyRevenue: AnalyticsResponse['dailyRevenue']): RevenueChartRow[] {
  return dailyRevenue.map((entry) => ({ date: entry.date, revenue: entry.revenueCents / 100 }));
}
