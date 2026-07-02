import { formatCentsAsDollars } from '../lib/format';

interface LotGaugeProps {
  name: string;
  capacity: number;
  occupied: number;
  revenueTodayCents: number;
}

export function LotGauge({ name, capacity, occupied, revenueTodayCents }: LotGaugeProps) {
  const occupancyPct = capacity > 0 ? Math.min(100, (occupied / capacity) * 100) : 0;

  return (
    <div className="lot-gauge">
      <p className="lot-gauge-name">{name}</p>
      <div className="lot-gauge-bar-track" role="progressbar" aria-valuenow={occupancyPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="lot-gauge-bar-fill" style={{ width: `${occupancyPct}%` }} />
      </div>
      <p className="lot-gauge-occupancy">
        {occupied} / {capacity} occupied
      </p>
      <p className="lot-gauge-revenue">{formatCentsAsDollars(revenueTodayCents)} today</p>
    </div>
  );
}
