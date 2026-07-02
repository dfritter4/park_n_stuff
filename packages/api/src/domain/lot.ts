import type { LotStatus } from '@parking/shared';

export function isReservable(status: LotStatus): boolean {
  return status === 'active';
}

export function availableSpaces(capacity: number, activeCount: number): number {
  return Math.max(0, capacity - activeCount);
}
