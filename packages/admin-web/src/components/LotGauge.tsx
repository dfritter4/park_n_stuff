import { formatCentsAsDollars } from '../lib/format';
import { gaugeColor } from '../lib/ui';

interface LotGaugeProps {
  name: string;
  capacity: number;
  occupied: number;
  revenueTodayCents: number;
}

export function LotGauge({ name, capacity, occupied, revenueTodayCents }: LotGaugeProps) {
  const occupancyPct = capacity > 0 ? Math.min(100, (occupied / capacity) * 100) : 0;
  const status = gaugeColor(occupancyPct);

  return (
    <div className="lot-gauge">
      <div className="lot-gauge-header">
        <p className="lot-gauge-name">{name}</p>
        <span className={`lot-gauge-pct lot-gauge-pct-${status}`}>{Math.round(occupancyPct)}%</span>
      </div>
      <div className="lot-gauge-bar-track" role="progressbar" aria-valuenow={occupancyPct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`lot-gauge-bar-fill lot-gauge-bar-fill-${status}`} style={{ width: `${occupancyPct}%` }} />
      </div>
      <p className="lot-gauge-occupancy">
        <span className="lot-gauge-fraction">
          {occupied} / {capacity}
        </span>{' '}
        occupied
      </p>
      <p className="lot-gauge-revenue">{formatCentsAsDollars(revenueTodayCents)} today</p>
    </div>
  );
}
