import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ForecastResponse } from '@parking/shared';
import { buildForecastChartData } from '../../lib/analytics2';
import { CHART_AXIS, CHART_GRID, CHART_LINE_COLORS } from '../../lib/chartTheme';
import { formatPercent1 } from '../../lib/format';

interface ForecastChartProps {
  points: ForecastResponse['points'];
}

/** Projected occupancy for the next 7 days, one line per day plotted against hour-of-day. */
export function ForecastChart({ points }: ForecastChartProps) {
  const { dates, rows } = buildForecastChartData(points);

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
          <XAxis
            dataKey="hour"
            stroke={CHART_AXIS}
            tick={{ fontSize: 12 }}
            label={{ value: 'Hour', position: 'insideBottom', offset: -4 }}
          />
          <YAxis unit="%" domain={[0, 100]} stroke={CHART_AXIS} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatPercent1(Number(value))} labelFormatter={(hour) => `Hour ${hour}`} />
          <Legend />
          {dates.map((date, index) => (
            <Line
              key={date}
              type="monotone"
              dataKey={date}
              name={date}
              stroke={CHART_LINE_COLORS[index % CHART_LINE_COLORS.length]}
              connectNulls
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
