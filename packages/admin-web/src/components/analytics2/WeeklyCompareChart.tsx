import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeeklyCompareResponse } from '@parking/shared';
import { buildWeeklyCompareChartData } from '../../lib/analytics2';
import { CHART_AXIS, CHART_COMPARE, CHART_GRID, CHART_PRIMARY } from '../../lib/chartTheme';
import { formatCentsAsDollars } from '../../lib/format';

interface WeeklyCompareChartProps {
  data: WeeklyCompareResponse;
}

/** Two-series bar chart comparing this week's revenue by day against last week's. */
export function WeeklyCompareChart({ data }: WeeklyCompareChartProps) {
  const rows = buildWeeklyCompareChartData(data);

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="label" stroke={CHART_AXIS} tick={{ fontSize: 12 }} />
          <YAxis unit="$" stroke={CHART_AXIS} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCentsAsDollars(Math.round(Number(value) * 100))} />
          <Legend />
          <Bar dataKey="thisWeekRevenue" name="This week" fill={CHART_PRIMARY} />
          <Bar dataKey="lastWeekRevenue" name="Last week" fill={CHART_COMPARE} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
