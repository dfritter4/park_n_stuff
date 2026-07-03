import type { LotCompareResponse } from '@parking/shared';
import { formatCentsAsDollars, formatPercent1 } from '../../lib/format';

interface LotCompareTableProps {
  rows: LotCompareResponse['rows'];
}

export function LotCompareTable({ rows }: LotCompareTableProps) {
  return (
    <table className="lot-compare-table">
      <thead>
        <tr>
          <th>Lot</th>
          <th>Revenue</th>
          <th>Reservations</th>
          <th>Avg occupancy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.lotId}>
            <td>{row.name}</td>
            <td className="num">{formatCentsAsDollars(row.revenueCents)}</td>
            <td className="num">{row.reservations}</td>
            <td className="num">{formatPercent1(row.avgOccupancyPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
