import { ValidationError } from './errors.js';

export function calculateCostCents(hourlyRateCents: number, startTime: Date, endTime: Date): number {
  if (endTime <= startTime) {
    throw new ValidationError('End time must be after start time');
  }

  const minutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  const billableHours = Math.max(1, Math.ceil(minutes / 60));
  return hourlyRateCents * billableHours;
}
