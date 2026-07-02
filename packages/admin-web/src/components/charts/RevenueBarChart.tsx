import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsResponse } from '@parking/shared';
import { toRevenueChartData } from '../../lib/analytics';

interface RevenueBarChartProps {
  dailyRevenue: AnalyticsResponse['dailyRevenue'];
}

export function RevenueBarChart({ dailyRevenue }: RevenueBarChartProps) {
  const data = toRevenueChartData(dailyRevenue);

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis unit="$" />
          <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
          <Bar dataKey="revenue" name="Revenue" fill="#4f8cff" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
