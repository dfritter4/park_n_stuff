import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DeclinesResponse } from '@parking/shared';
import { toDeclinesChartData } from '../../lib/analytics2';
import { formatCentsAsDollars, formatDateTime } from '../../lib/format';
import { MetricCard } from '../MetricCard';

interface DeclinesSectionProps {
  data: DeclinesResponse;
}

/** Total-declines metric, a small per-day count chart, and a table of recent declines. */
export function DeclinesSection({ data }: DeclinesSectionProps) {
  const chartData = toDeclinesChartData(data.byDay);

  return (
    <div className="declines-section">
      <MetricCard label="Declined attempts" value={String(data.total)} />

      <div className="chart-wrapper declines-chart">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(value) => [value, 'Declines']} />
            <Bar dataKey="count" name="Declines" fill="#c0341f" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="declines-recent-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Amount</th>
            <th>Card</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {data.recent.map((decline, index) => (
            <tr key={`${decline.createdAt}-${index}`}>
              <td>{decline.lotName}</td>
              <td>{formatCentsAsDollars(decline.amountCents)}</td>
              <td>•••• {decline.cardLast4}</td>
              <td>{formatDateTime(decline.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
