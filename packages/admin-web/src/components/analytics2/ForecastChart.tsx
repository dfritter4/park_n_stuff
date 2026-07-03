import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ForecastResponse } from '@parking/shared';
import { buildForecastChartData } from '../../lib/analytics2';

const LINE_COLORS = ['#4f8cff', '#ff8a4f', '#4fd18c', '#c14fff', '#ffd24f', '#4fd1c1', '#ff4f7a'];

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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" label={{ value: 'Hour', position: 'insideBottom', offset: -4 }} />
          <YAxis unit="%" domain={[0, 100]} />
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)}%`}
            labelFormatter={(hour) => `Hour ${hour}`}
          />
          <Legend />
          {dates.map((date, index) => (
            <Line
              key={date}
              type="monotone"
              dataKey={date}
              name={date}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              connectNulls
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
