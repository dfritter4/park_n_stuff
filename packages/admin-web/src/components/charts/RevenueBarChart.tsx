import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsResponse } from '@parking/shared';
import { toRevenueChartData } from '../../lib/analytics';
import { CHART_AXIS, CHART_GRID, CHART_PRIMARY } from '../../lib/chartTheme';
import { formatCentsAsDollars } from '../../lib/format';

interface RevenueBarChartProps {
  dailyRevenue: AnalyticsResponse['dailyRevenue'];
}

export function RevenueBarChart({ dailyRevenue }: RevenueBarChartProps) {
  const data = toRevenueChartData(dailyRevenue);

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis dataKey="date" stroke={CHART_AXIS} tick={{ fontSize: 12 }} />
          <YAxis unit="$" stroke={CHART_AXIS} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCentsAsDollars(Math.round(Number(value) * 100))} />
          <Bar dataKey="revenue" name="Revenue" fill={CHART_PRIMARY} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
