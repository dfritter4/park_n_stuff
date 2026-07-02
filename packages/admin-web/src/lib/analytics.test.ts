import { describe, expect, it } from 'vitest';
import { buildOccupancyChartData, toRevenueChartData } from './analytics';
import type { AnalyticsResponse } from '@parking/shared';

describe('buildOccupancyChartData', () => {
  const hourlyOccupancy: AnalyticsResponse['hourlyOccupancy'] = [
    { date: '2026-06-30', hour: 0, occupancyPct: 10 },
    { date: '2026-06-30', hour: 1, occupancyPct: 20 },
    { date: '2026-07-01', hour: 0, occupancyPct: 30 },
    { date: '2026-07-01', hour: 1, occupancyPct: 40 },
  ];

  it('returns the distinct dates sorted ascending', () => {
    const { dates } = buildOccupancyChartData(hourlyOccupancy);
    expect(dates).toEqual(['2026-06-30', '2026-07-01']);
  });

  it('produces 24 rows, one per hour, regardless of how many hours have data', () => {
    const { rows } = buildOccupancyChartData(hourlyOccupancy);
    expect(rows).toHaveLength(24);
    expect(rows.map((r) => r.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('pivots each date into its own column keyed by date on the matching hour row', () => {
    const { rows } = buildOccupancyChartData(hourlyOccupancy);
    expect(rows[0]).toMatchObject({ hour: 0, '2026-06-30': 10, '2026-07-01': 30 });
    expect(rows[1]).toMatchObject({ hour: 1, '2026-06-30': 20, '2026-07-01': 40 });
  });

  it('leaves hours with no data for a given date undefined for that date column', () => {
    const { rows } = buildOccupancyChartData(hourlyOccupancy);
    expect(rows[2]['2026-06-30']).toBeUndefined();
  });

  it('returns 24 empty-hour rows and no dates for empty input', () => {
    const { rows, dates } = buildOccupancyChartData([]);
    expect(dates).toEqual([]);
    expect(rows).toHaveLength(24);
  });
});

describe('toRevenueChartData', () => {
  it('converts revenue cents to dollars for each day', () => {
    const dailyRevenue: AnalyticsResponse['dailyRevenue'] = [
      { date: '2026-06-30', revenueCents: 12345, reservations: 4 },
      { date: '2026-07-01', revenueCents: 0, reservations: 0 },
    ];

    expect(toRevenueChartData(dailyRevenue)).toEqual([
      { date: '2026-06-30', revenue: 123.45 },
      { date: '2026-07-01', revenue: 0 },
    ]);
  });
});
