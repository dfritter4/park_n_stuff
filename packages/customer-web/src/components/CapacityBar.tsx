import { getAvailabilityLevel } from '../lib/availability';

interface CapacityBarProps {
  availableSpaces: number;
  capacity: number;
}

export function CapacityBar({ availableSpaces, capacity }: CapacityBarProps) {
  const level = getAvailabilityLevel(availableSpaces, capacity);
  const occupied = Math.max(0, capacity - availableSpaces);
  const pctOccupied = capacity > 0 ? Math.min(1, occupied / capacity) : 1;
  const label = availableSpaces <= 0 ? 'Full' : `${availableSpaces} of ${capacity} spaces available`;

  return (
    <div className="capacity-bar">
      <div className="capacity-bar-track" role="progressbar" aria-valuenow={availableSpaces} aria-valuemin={0} aria-valuemax={capacity} aria-label="Spaces available">
        <div
          className={`capacity-bar-fill capacity-bar-fill-${level}`}
          style={{ width: `${pctOccupied * 100}%` }}
        />
      </div>
      <span className={`capacity-bar-label capacity-bar-label-${level}`}>{label}</span>
    </div>
  );
}
