/**
 * Shared recharts styling constants. Recharts props take literal color
 * strings (not CSS custom properties), so these mirror the design tokens in
 * `index.css` and must be kept in sync with them by hand.
 */
export const CHART_PRIMARY = '#4353d9';
export const CHART_COMPARE = '#a5aee8';
export const CHART_GRID = '#e5e7ec';
export const CHART_AXIS = '#8a8f9b';
export const CHART_DANGER = '#bc3222';

/**
 * Occupancy-percentage color scale for the heatmap grid, lightest at low
 * occupancy and darkest as lots approach capacity. Buckets are inclusive of
 * their upper threshold so a cell exactly on a boundary (e.g. 20%) falls into
 * the lower/lighter bucket rather than the next one up.
 */
const HEATMAP_BUCKETS: Array<{ maxPct: number; color: string }> = [
  { maxPct: 20, color: '#eef2ff' },
  { maxPct: 40, color: '#c7d7fe' },
  { maxPct: 60, color: '#8ea3fb' },
  { maxPct: 80, color: '#5570f3' },
  { maxPct: 100, color: '#2f3fb8' },
];

/** Maps an occupancy percentage (0-100, clamped) to a heatmap cell color. */
export function heatmapColor(occupancyPct: number): string {
  const clamped = Math.min(100, Math.max(0, occupancyPct));
  const bucket = HEATMAP_BUCKETS.find((b) => clamped <= b.maxPct);
  return (bucket ?? HEATMAP_BUCKETS[HEATMAP_BUCKETS.length - 1]).color;
}
