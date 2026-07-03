import { Fragment } from 'react';
import type { HeatmapResponse } from '@parking/shared';
import { heatmapCellKey, heatmapColor, indexHeatmapCells } from '../../lib/analytics2';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface OccupancyHeatmapProps {
  cells: HeatmapResponse['cells'];
}

/** 7 (Sun-Sat) x 24 (hour) CSS-grid heatmap of average occupancy, color-scaled per cell. */
export function OccupancyHeatmap({ cells }: OccupancyHeatmapProps) {
  const byKey = indexHeatmapCells(cells);

  return (
    <div className="heatmap-grid" role="table" aria-label="Occupancy heatmap by day of week and hour">
      <div className="heatmap-corner" aria-hidden="true" />
      {HOURS.map((hour) => (
        <div key={`hour-${hour}`} className="heatmap-hour-label">
          {hour}
        </div>
      ))}
      {DOW_LABELS.map((dowLabel, dow) => (
        <Fragment key={`row-${dow}`}>
          <div className="heatmap-dow-label">{dowLabel}</div>
          {HOURS.map((hour) => {
            const occupancyPct = byKey.get(heatmapCellKey(dow, hour)) ?? 0;
            return (
              <div
                key={`cell-${dow}-${hour}`}
                className="heatmap-cell"
                style={{ backgroundColor: heatmapColor(occupancyPct) }}
                title={`${dowLabel} ${String(hour).padStart(2, '0')}:00 — ${occupancyPct.toFixed(1)}%`}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
