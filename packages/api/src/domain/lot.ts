import type { LotStatus } from '@parking/shared';

export function isReservable(status: LotStatus): boolean {
  return status === 'active';
}

export function availableSpaces(capacity: number, activeCount: number): number {
  return Math.max(0, capacity - activeCount);
}

export interface CapacityOverrideWindow {
  spacesClosed: number;
  startsAt: Date;
  endsAt: Date | null;
}

/**
 * Capacity remaining after subtracting overrides that overlap [window.start,
 * window.end): an override overlaps when it starts before the window ends
 * and (it has no end / is open-ended, or it ends after the window starts).
 * Clamped to a minimum of 0.
 */
export function effectiveCapacity(
  capacity: number,
  overrides: CapacityOverrideWindow[],
  window: { start: Date; end: Date },
): number {
  const closed = overrides
    .filter((o) => o.startsAt < window.end && (o.endsAt === null || o.endsAt > window.start))
    .reduce((sum, o) => sum + o.spacesClosed, 0);
  return Math.max(0, capacity - closed);
}
