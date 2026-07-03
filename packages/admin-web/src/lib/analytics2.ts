import type { DeclinesResponse, ForecastResponse, HeatmapResponse, WeeklyCompareResponse } from '@parking/shared';

const HOURS_PER_DAY = 24;

/** @deprecated moved to `lib/chartTheme`; re-exported here for backward compatibility. */
export { heatmapColor } from './chartTheme';

/** Formats a "YYYY-MM-DD" date string as a short UTC weekday name (e.g. "Mon"). */
export function formatWeekdayShort(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date);
}

export interface WeeklyCompareChartRow {
  label: string;
  thisWeekRevenue: number;
  lastWeekRevenue: number;
}

/**
 * Pairs this-week and last-week `DayPoint`s by index (both series are 7
 * consecutive UTC days, so index `i` in each is the same weekday exactly one
 * week apart) into rows suitable for a two-series bar chart, converting
 * revenue cents to dollars.
 */
export function buildWeeklyCompareChartData(response: WeeklyCompareResponse): WeeklyCompareChartRow[] {
  const length = Math.max(response.thisWeek.length, response.lastWeek.length);

  return Array.from({ length }, (_, i) => {
    const thisWeek = response.thisWeek[i];
    const lastWeek = response.lastWeek[i];
    const labelSource = thisWeek?.date ?? lastWeek?.date;

    return {
      label: labelSource ? formatWeekdayShort(labelSource) : `Day ${i + 1}`,
      thisWeekRevenue: (thisWeek?.revenueCents ?? 0) / 100,
      lastWeekRevenue: (lastWeek?.revenueCents ?? 0) / 100,
    };
  });
}

export interface ForecastChartRow {
  hour: number;
  [date: string]: number | undefined;
}

export interface ForecastChartData {
  dates: string[];
  rows: ForecastChartRow[];
}

/**
 * Pivots the flat `points` list (one entry per date+hour) into the wide,
 * per-hour-row shape recharts' `LineChart` expects: one row per hour (0-23)
 * with a column per date so each of the forecast's 7 days can be rendered as
 * its own `Line`. Mirrors `buildOccupancyChartData`.
 */
export function buildForecastChartData(points: ForecastResponse['points']): ForecastChartData {
  const dates = Array.from(new Set(points.map((point) => point.date))).sort();

  const rows: ForecastChartRow[] = Array.from({ length: HOURS_PER_DAY }, (_, hour) => ({ hour }));
  for (const point of points) {
    rows[point.hour][point.date] = point.projectedOccupancyPct;
  }

  return { dates, rows };
}

export interface DeclinesChartRow {
  date: string;
  count: number;
  amount: number;
}

/** Converts declines-by-day amount cents to dollars for the mini bar chart. */
export function toDeclinesChartData(byDay: DeclinesResponse['byDay']): DeclinesChartRow[] {
  return byDay.map((entry) => ({ date: entry.date, count: entry.count, amount: entry.amountCents / 100 }));
}

/** Builds a `dow-hour` lookup key matching `HeatmapResponse['cells']` entries. */
export function heatmapCellKey(dow: number, hour: number): string {
  return `${dow}-${hour}`;
}

/** Indexes heatmap cells by `dow-hour` for O(1) lookup while rendering the grid. */
export function indexHeatmapCells(cells: HeatmapResponse['cells']): Map<string, number> {
  return new Map(cells.map((cell) => [heatmapCellKey(cell.dow, cell.hour), cell.occupancyPct]));
}
