export type GaugeStatus = 'success' | 'warning' | 'danger';

/**
 * Maps an occupancy percentage to a status color bucket for gauge fills:
 * comfortably under capacity (<70%) reads as healthy, 70-90% as filling up,
 * and over 90% as at/near capacity.
 */
export function gaugeColor(pct: number): GaugeStatus {
  if (pct > 90) {
    return 'danger';
  }
  if (pct >= 70) {
    return 'warning';
  }
  return 'success';
}
