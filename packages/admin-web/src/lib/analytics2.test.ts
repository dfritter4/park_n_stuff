import { describe, expect, it } from 'vitest';
import type { ForecastResponse, WeeklyCompareResponse } from '@parking/shared';
import {
  buildForecastChartData,
  buildWeeklyCompareChartData,
  formatWeekdayShort,
  heatmapCellKey,
  heatmapColor,
  indexHeatmapCells,
  toDeclinesChartData,
} from './analytics2';

describe('heatmapColor', () => {
  it('buckets 0% into the lightest color', () => {
    expect(heatmapColor(0)).toBe('#eef2ff');
  });

  it('is inclusive of a bucket upper boundary', () => {
    expect(heatmapColor(20)).toBe('#eef2ff');
    expect(heatmapColor(40)).toBe('#c7d7fe');
    expect(heatmapColor(60)).toBe('#8ea3fb');
    expect(heatmapColor(80)).toBe('#5570f3');
    expect(heatmapColor(100)).toBe('#2f3fb8');
  });

  it('rolls just over a boundary into the next bucket', () => {
    expect(heatmapColor(20.1)).toBe('#c7d7fe');
    expect(heatmapColor(80.1)).toBe('#2f3fb8');
  });

  it('clamps values above 100 into the darkest bucket', () => {
    expect(heatmapColor(150)).toBe('#2f3fb8');
  });

  it('clamps negative values into the lightest bucket', () => {
    expect(heatmapColor(-10)).toBe('#eef2ff');
  });
});

describe('formatWeekdayShort', () => {
  it('formats a UTC date string as a short weekday name without a timezone shift', () => {
    // 2026-06-28 is a Sunday (UTC); a naive local-time parse could shift this
    // to Saturday depending on the runner's timezone offset.
    expect(formatWeekdayShort('2026-06-28')).toBe('Sun');
    expect(formatWeekdayShort('2026-06-29')).toBe('Mon');
  });
});

describe('buildWeeklyCompareChartData', () => {
  const response: WeeklyCompareResponse = {
    thisWeek: [
      { date: '2026-06-29', revenueCents: 20000, reservations: 5 },
      { date: '2026-06-30', revenueCents: 10000, reservations: 3 },
    ],
    lastWeek: [
      { date: '2026-06-22', revenueCents: 15000, reservations: 4 },
      { date: '2026-06-23', revenueCents: 5000, reservations: 1 },
    ],
  };

  it('pairs this-week and last-week entries by index and converts cents to dollars', () => {
    expect(buildWeeklyCompareChartData(response)).toEqual([
      { label: 'Mon', thisWeekRevenue: 200, lastWeekRevenue: 150 },
      { label: 'Tue', thisWeekRevenue: 100, lastWeekRevenue: 50 },
    ]);
  });

  it('fills a missing entry on either side with zero revenue', () => {
    const uneven: WeeklyCompareResponse = {
      thisWeek: [{ date: '2026-06-29', revenueCents: 20000, reservations: 5 }],
      lastWeek: [],
    };
    expect(buildWeeklyCompareChartData(uneven)).toEqual([{ label: 'Mon', thisWeekRevenue: 200, lastWeekRevenue: 0 }]);
  });

  it('returns an empty array for empty input', () => {
    expect(buildWeeklyCompareChartData({ thisWeek: [], lastWeek: [] })).toEqual([]);
  });
});

describe('buildForecastChartData', () => {
  const points: ForecastResponse['points'] = [
    { date: '2026-07-04', hour: 0, projectedOccupancyPct: 25 },
    { date: '2026-07-04', hour: 1, projectedOccupancyPct: 30 },
    { date: '2026-07-05', hour: 0, projectedOccupancyPct: 40 },
  ];

  it('returns the distinct dates sorted ascending', () => {
    expect(buildForecastChartData(points).dates).toEqual(['2026-07-04', '2026-07-05']);
  });

  it('produces 24 rows, one per hour', () => {
    const { rows } = buildForecastChartData(points);
    expect(rows).toHaveLength(24);
    expect(rows.map((r) => r.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('pivots each date into its own column keyed by date on the matching hour row', () => {
    const { rows } = buildForecastChartData(points);
    expect(rows[0]).toMatchObject({ hour: 0, '2026-07-04': 25, '2026-07-05': 40 });
    expect(rows[1]).toMatchObject({ hour: 1, '2026-07-04': 30 });
    expect(rows[1]['2026-07-05']).toBeUndefined();
  });

  it('returns 24 empty-hour rows and no dates for empty input', () => {
    const { rows, dates } = buildForecastChartData([]);
    expect(dates).toEqual([]);
    expect(rows).toHaveLength(24);
  });
});

describe('toDeclinesChartData', () => {
  it('converts amount cents to dollars and keeps count as-is', () => {
    expect(
      toDeclinesChartData([
        { date: '2026-06-04', count: 47, amountCents: 187200 },
        { date: '2026-06-05', count: 0, amountCents: 0 },
      ]),
    ).toEqual([
      { date: '2026-06-04', count: 47, amount: 1872 },
      { date: '2026-06-05', count: 0, amount: 0 },
    ]);
  });
});

describe('heatmapCellKey / indexHeatmapCells', () => {
  it('builds a stable dow-hour key', () => {
    expect(heatmapCellKey(0, 5)).toBe('0-5');
    expect(heatmapCellKey(6, 23)).toBe('6-23');
  });

  it('indexes cells for O(1) lookup by dow-hour', () => {
    const index = indexHeatmapCells([
      { dow: 0, hour: 0, occupancyPct: 11.5 },
      { dow: 3, hour: 14, occupancyPct: 62.25 },
    ]);
    expect(index.get(heatmapCellKey(0, 0))).toBe(11.5);
    expect(index.get(heatmapCellKey(3, 14))).toBe(62.25);
    expect(index.get(heatmapCellKey(1, 1))).toBeUndefined();
  });
});
