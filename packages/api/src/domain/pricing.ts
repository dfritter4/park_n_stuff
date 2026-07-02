import { ValidationError } from './errors.js';

export function calculateCostCents(hourlyRateCents: number, startTime: Date, endTime: Date): number {
  if (endTime <= startTime) {
    throw new ValidationError('End time must be after start time');
  }

  const minutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  const billableHours = Math.max(1, Math.ceil(minutes / 60));
  return hourlyRateCents * billableHours;
}

export interface HourlyRateRule {
  dayType: 'weekday' | 'weekend' | 'all';
  startHour: number;
  endHour: number;
  hourlyRateCents: number;
}

export function billedHoursFor(startTime: Date, endTime: Date): number {
  if (endTime <= startTime) {
    throw new ValidationError('End time must be after start time');
  }
  const minutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  return Math.max(1, Math.ceil(minutes / 60));
}

/**
 * Resolves the hourly rate that applies to a single UTC hour slot. A rule
 * matches when its [startHour, endHour) range (UTC) contains the slot's hour
 * and its dayType is either 'all' or matches the slot's weekday/weekend
 * bucket (UTC Sat/Sun = weekend). A day-specific match (weekday/weekend)
 * takes priority over an 'all' match covering the same hour. No match falls
 * back to baseRateCents.
 */
export function rateForHour(baseRateCents: number, rules: HourlyRateRule[], slot: Date): number {
  const dow = slot.getUTCDay();
  const hour = slot.getUTCHours();
  const dayType: 'weekday' | 'weekend' = dow === 0 || dow === 6 ? 'weekend' : 'weekday';

  let specificMatch: HourlyRateRule | undefined;
  let allMatch: HourlyRateRule | undefined;

  for (const rule of rules) {
    if (hour < rule.startHour || hour >= rule.endHour) continue;
    if (rule.dayType === dayType) {
      specificMatch = rule;
    } else if (rule.dayType === 'all') {
      allMatch = rule;
    }
  }

  if (specificMatch) return specificMatch.hourlyRateCents;
  if (allMatch) return allMatch.hourlyRateCents;
  return baseRateCents;
}

/**
 * Sums the per-hour rate (via rateForHour) across the billed hours of
 * [startTime, endTime), one hour-slot at a time starting at startTime.
 * billedHours follows the same minimum-1-hour, round-up-partial-hour rule as
 * calculateCostCents, and calculateWindowCostCents(base, [], start, end)
 * equals calculateCostCents(base, start, end) exactly since every slot then
 * resolves to baseRateCents.
 */
export function calculateWindowCostCents(
  baseRateCents: number,
  rules: HourlyRateRule[],
  startTime: Date,
  endTime: Date,
): number {
  const billedHours = billedHoursFor(startTime, endTime);

  let total = 0;
  for (let i = 0; i < billedHours; i++) {
    const slot = new Date(startTime.getTime() + i * 60 * 60 * 1000);
    total += rateForHour(baseRateCents, rules, slot);
  }
  return total;
}
