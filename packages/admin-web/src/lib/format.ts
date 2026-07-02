export function formatCentsAsDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatPercent1(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTimeRange(startISO: string, endISO: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(startISO))} – ${formatter.format(new Date(endISO))}`;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Formats a timestamp as a short relative duration ("just now", "5m ago",
 * "3h ago", "2d ago") relative to `now` (defaults to the current time).
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();

  if (diffMs < MINUTE_MS) {
    return 'just now';
  }
  if (diffMs < HOUR_MS) {
    return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  }
  if (diffMs < DAY_MS) {
    return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  }
  return `${Math.floor(diffMs / DAY_MS)}d ago`;
}
