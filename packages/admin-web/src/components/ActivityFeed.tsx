import type { DashboardResponse } from '@parking/shared';
import { formatCentsAsDollars, formatRelativeTime, formatTimeRange } from '../lib/format';

interface ActivityFeedProps {
  reservations: DashboardResponse['recentReservations'];
}

export function ActivityFeed({ reservations }: ActivityFeedProps) {
  if (reservations.length === 0) {
    return <p className="activity-feed-empty">No recent reservations.</p>;
  }

  return (
    <ul className="activity-feed">
      {reservations.slice(0, 10).map((reservation) => (
        <li key={reservation.reservationNumber} className="activity-feed-item">
          <div className="activity-feed-primary-group">
            <span className="activity-feed-status-dot" aria-hidden="true" />
            <div className="activity-feed-primary">
              <span className="activity-feed-reservation-number">{reservation.reservationNumber}</span>
              <span className="activity-feed-lot-name">{reservation.lotName}</span>
            </div>
          </div>
          <div className="activity-feed-secondary">
            <span>{formatTimeRange(reservation.startTime, reservation.endTime)}</span>
            <span>{formatCentsAsDollars(reservation.totalCostCents)}</span>
            <span className="activity-feed-created-at">{formatRelativeTime(reservation.createdAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
