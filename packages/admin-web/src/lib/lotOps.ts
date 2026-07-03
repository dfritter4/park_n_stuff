import type { DayType } from '@parking/shared';
import { formatDateTime, formatHourLabel } from './format';

/** Human-readable label for a pricing-rule day type. */
export function formatDayType(dayType: DayType): string {
  switch (dayType) {
    case 'weekday':
      return 'Weekday';
    case 'weekend':
      return 'Weekend';
    case 'all':
      return 'All days';
    default:
      return dayType;
  }
}

/** Formats a pricing rule's [startHour, endHour) window as "HH:00–HH:00" (UTC hours). */
export function formatHourRange(startHour: number, endHour: number): string {
  return `${formatHourLabel(startHour)}–${formatHourLabel(endHour)}`;
}

/** Formats a capacity override's active window; a null `endsAt` means the override is open-ended. */
export function formatOverrideWindow(startsAt: string, endsAt: string | null): string {
  const start = formatDateTime(startsAt);
  return endsAt ? `${start} – ${formatDateTime(endsAt)}` : `${start} – open-ended`;
}
