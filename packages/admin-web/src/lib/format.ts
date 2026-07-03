export function formatCentsAsDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatPercent1(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Formats an hour-of-day integer (0-23) as a zero-padded "HH:00" label. */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Formats a Date as a local "YYYY-MM-DD" string for date-input defaults and API params. */
export function todayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTimeRange(startISO: string, endISO: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatter.format(new Date(startISO))} – ${formatter.format(new Date(endISO))}`;
}

/** Formats an ISO timestamp as a local date + time string for detail views. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/** Formats a Date as a local "YYYY-MM-DDTHH:mm" string for `datetime-local` input values/defaults. */
export function toDatetimeLocalInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
