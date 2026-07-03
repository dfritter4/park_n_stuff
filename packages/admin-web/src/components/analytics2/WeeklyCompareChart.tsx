import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeeklyCompareResponse } from '@parking/shared';
import { buildWeeklyCompareChartData } from '../../lib/analytics2';

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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis unit="$" />
          <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
          <Legend />
          <Bar dataKey="thisWeekRevenue" name="This week" fill="#4f8cff" />
          <Bar dataKey="lastWeekRevenue" name="Last week" fill="#c7d7fe" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
