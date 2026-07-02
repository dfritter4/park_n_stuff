import { Link } from 'react-router-dom';
import type { Lot } from '@parking/shared';
import { getAvailabilityLevel } from '../lib/availability';

export { getAvailabilityLevel } from '../lib/availability';

function formatRate(hourlyRateCents: number): string {
  return `$${(hourlyRateCents / 100).toFixed(2)}/hr`;
}

interface LotListProps {
  lots: Lot[];
}

export function LotList({ lots }: LotListProps) {
  if (lots.length === 0) {
    return <p className="lot-list-empty">No lots found.</p>;
  }

  return (
    <ul className="lot-list">
      {lots.map((lot) => {
        const level = getAvailabilityLevel(lot.availableSpaces, lot.capacity);
        const availabilityLabel = lot.availableSpaces <= 0 ? 'Full' : `${lot.availableSpaces} spaces`;

        return (
          <li key={lot.id} className="lot-list-item">
            <Link to={`/lots/${lot.id}`} className="lot-list-link">
              <div className="lot-list-main">
                <span className="lot-list-name">{lot.name}</span>
                <span className="lot-list-neighborhood">{lot.neighborhood}</span>
              </div>
              <div className="lot-list-meta">
                <span
                  className={`availability-badge availability-${level}`}
                  data-testid="availability-badge"
                >
                  {availabilityLabel}
                </span>
                <span className="lot-list-rate">{formatRate(lot.hourlyRateCents)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
