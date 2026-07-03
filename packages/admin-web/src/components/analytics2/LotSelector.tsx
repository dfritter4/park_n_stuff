import type { Lot } from '@parking/shared';

interface LotSelectorProps {
  id: string;
  label: string;
  lots: Lot[];
  value: string;
  onChange: (value: string) => void;
  includeAllOption?: boolean;
}

/** Shared lot-picker used by both the occupancy heatmap and the forecast chart. */
export function LotSelector({ id, label, lots, value, onChange, includeAllOption = false }: LotSelectorProps) {
  return (
    <div className="analytics2-lot-selector">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {includeAllOption && <option value="all">All lots</option>}
        {lots.map((lot) => (
          <option key={lot.id} value={lot.id}>
            {lot.name}
          </option>
        ))}
      </select>
    </div>
  );
}
