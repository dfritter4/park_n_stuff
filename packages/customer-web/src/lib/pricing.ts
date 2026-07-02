/**
 * Client-side mirror of the server's billing rule (packages/api/src/domain/pricing.ts):
 * bill in whole hours, rounded up, with a one-hour minimum. Used only for a live
 * cost preview before submission — the server remains the source of truth for the
 * charged amount.
 */
export function estimateCostCents(
  hourlyRateCents: number,
  startISO: string,
  endISO: string,
): number | null {
  const start = new Date(startISO);
  const end = new Date(endISO);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  const minutes = (end.getTime() - start.getTime()) / (1000 * 60);
  const billableHours = Math.max(1, Math.ceil(minutes / 60));
  return hourlyRateCents * billableHours;
}
