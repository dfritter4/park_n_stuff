import { describe, expect, it } from 'vitest';
import {
  buildReservationsQueryString,
  dateInputToRangeEndISO,
  dateInputToRangeStartISO,
  filtersFromSearchParams,
} from './reservations';

describe('buildReservationsQueryString', () => {
  it('includes only page and pageSize when no filters are set', () => {
    const qs = buildReservationsQueryString({}, { page: 1, pageSize: 25 });
    expect(new URLSearchParams(qs)).toEqual(new URLSearchParams('page=1&pageSize=25'));
  });

  it('includes lotId, status and search when set', () => {
    const qs = buildReservationsQueryString(
      { lotId: 'lot-1', status: 'active', search: 'Jane' },
      { page: 2, pageSize: 25 },
    );
    const params = new URLSearchParams(qs);
    expect(params.get('lotId')).toBe('lot-1');
    expect(params.get('status')).toBe('active');
    expect(params.get('search')).toBe('Jane');
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('25');
  });

  it('widens from/to date-input values to inclusive UTC-day boundaries', () => {
    const qs = buildReservationsQueryString({ from: '2026-06-01', to: '2026-06-07' }, { page: 1, pageSize: 25 });
    const params = new URLSearchParams(qs);
    expect(params.get('from')).toBe('2026-06-01T00:00:00.000Z');
    expect(params.get('to')).toBe('2026-06-07T23:59:59.999Z');
  });

  it('sends activeNow=true only when the toggle is on', () => {
    expect(new URLSearchParams(buildReservationsQueryString({ activeNow: true }, { page: 1, pageSize: 25 })).get('activeNow')).toBe(
      'true',
    );
    expect(
      new URLSearchParams(buildReservationsQueryString({ activeNow: false }, { page: 1, pageSize: 25 })).has('activeNow'),
    ).toBe(false);
  });
});

describe('date boundary helpers', () => {
  it('converts a date-input value to UTC start/end of day', () => {
    expect(dateInputToRangeStartISO('2026-01-15')).toBe('2026-01-15T00:00:00.000Z');
    expect(dateInputToRangeEndISO('2026-01-15')).toBe('2026-01-15T23:59:59.999Z');
  });
});

describe('filtersFromSearchParams', () => {
  it('parses lotId and activeNow from a URL like the LotsPage "View current" link', () => {
    const filters = filtersFromSearchParams(new URLSearchParams('lotId=lot-1&activeNow=true'));
    expect(filters).toEqual({
      lotId: 'lot-1',
      status: undefined,
      from: undefined,
      to: undefined,
      search: undefined,
      activeNow: true,
    });
  });

  it('ignores an invalid status value rather than passing it through', () => {
    const filters = filtersFromSearchParams(new URLSearchParams('status=bogus'));
    expect(filters.status).toBeUndefined();
  });

  it('round-trips a full filter set', () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams('lotId=lot-1&status=completed&from=2026-01-01&to=2026-01-31&search=abc&activeNow=false'),
    );
    expect(filters).toEqual({
      lotId: 'lot-1',
      status: 'completed',
      from: '2026-01-01',
      to: '2026-01-31',
      search: 'abc',
      activeNow: undefined,
    });
  });
});
