export type AvailabilityLevel = 'green' | 'amber' | 'red';

/**
 * green: >30% of capacity free, amber: 10-30% free, red: <10% free or none
 * left at all (shown as "Full"). Shared by LotList and CapacityBar so both
 * views agree on what counts as "getting full."
 */
export function getAvailabilityLevel(availableSpaces: number, capacity: number): AvailabilityLevel {
  if (availableSpaces <= 0 || capacity <= 0) {
    return 'red';
  }
  const pctFree = availableSpaces / capacity;
  if (pctFree > 0.3) {
    return 'green';
  }
  if (pctFree >= 0.1) {
    return 'amber';
  }
  return 'red';
}
