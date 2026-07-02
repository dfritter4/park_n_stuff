import type { DayBreakdownResponse } from '@parking/shared';
import { formatCentsAsDollars, formatHourLabel, formatPercent1 } from '../lib/format';

interface DayBreakdownTableProps {
  rows: DayBreakdownResponse['rows'];
}

export function DayBreakdownTable({ rows }: DayBreakdownTableProps) {
  return (
    <table className="day-breakdown-table">
      <thead>
        <tr>
          <th>Hour</th>
          <th>Reservations</th>
          <th>Revenue</th>
          <th>Occupancy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.hour}>
            <td>{formatHourLabel(row.hour)}</td>
            <td>{row.reservations}</td>
            <td>{formatCentsAsDollars(row.revenueCents)}</td>
            <td>{formatPercent1(row.occupancyPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
