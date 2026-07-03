import { describe, expect, it } from 'vitest';
import { formatDayType, formatHourRange, formatOverrideWindow } from './lotOps';

describe('formatDayType', () => {
  it('labels weekday, weekend, and all-days rules', () => {
    expect(formatDayType('weekday')).toBe('Weekday');
    expect(formatDayType('weekend')).toBe('Weekend');
    expect(formatDayType('all')).toBe('All days');
  });
});

describe('formatHourRange', () => {
  it('formats a start/end hour pair as zero-padded "HH:00–HH:00"', () => {
    expect(formatHourRange(7, 19)).toBe('07:00–19:00');
  });

  it('formats a single-digit start hour with a leading zero', () => {
    expect(formatHourRange(6, 10)).toBe('06:00–10:00');
  });

  it('formats an end hour of 24 (end of day) without wrapping to 00', () => {
    expect(formatHourRange(17, 24)).toBe('17:00–24:00');
  });
});

describe('formatOverrideWindow', () => {
  it('formats a closed window with both a start and an end', () => {
    const label = formatOverrideWindow('2026-07-02T10:00:00.000Z', '2026-07-02T14:00:00.000Z');
    expect(label).toContain('–');
    expect(label).not.toContain('open-ended');
  });

  it('labels a window with no endsAt as open-ended', () => {
    const label = formatOverrideWindow('2026-07-02T10:00:00.000Z', null);
    expect(label).toContain('open-ended');
  });
});
