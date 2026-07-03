import type { ReservationStatus } from '@parking/shared';

const RESERVATION_STATUSES: readonly ReservationStatus[] = ['active', 'completed', 'cancelled'];

function isReservationStatus(value: string): value is ReservationStatus {
  return (RESERVATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Raw reservation filter state as edited in the UI / carried in the URL.
 * `from`/`to` are "YYYY-MM-DD" date-input values (inclusive calendar days in
 * the admin's local time); they're converted to UTC instant boundaries only
 * when building the outgoing API query string.
 */
export interface ReservationFilters {
  lotId?: string;
  status?: ReservationStatus;
  from?: string;
  to?: string;
  search?: string;
  activeNow?: boolean;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

/** Converts a "YYYY-MM-DD" date-input value into a UTC start-of-day ISO instant. */
export function dateInputToRangeStartISO(value: string): string {
  return `${value}T00:00:00.000Z`;
}

/** Converts a "YYYY-MM-DD" date-input value into a UTC end-of-day ISO instant. */
export function dateInputToRangeEndISO(value: string): string {
  return `${value}T23:59:59.999Z`;
}

/**
 * Builds the query string for `GET /api/admin/reservations` from the current
 * filter/pagination state. `from`/`to` are widened to inclusive UTC-day
 * boundaries so a selected calendar day is fully covered regardless of the
 * admin's timezone offset from UTC.
 */
export function buildReservationsSearchParams(filters: ReservationFilters, pagination: Pagination): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.lotId) {
    params.set('lotId', filters.lotId);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.from) {
    params.set('from', dateInputToRangeStartISO(filters.from));
  }
  if (filters.to) {
    params.set('to', dateInputToRangeEndISO(filters.to));
  }
  if (filters.search) {
    params.set('search', filters.search);
  }
  if (filters.activeNow) {
    params.set('activeNow', 'true');
  }
  params.set('page', String(pagination.page));
  params.set('pageSize', String(pagination.pageSize));
  return params;
}

export function buildReservationsQueryString(filters: ReservationFilters, pagination: Pagination): string {
  return buildReservationsSearchParams(filters, pagination).toString();
}

/**
 * Reads raw filter state back out of a URLSearchParams (e.g. the page's own
 * `location.search`), so links like LotsPage's "View current"
 * (`/reservations?lotId=X&activeNow=true`) seed the filter bar correctly.
 */
export function filtersFromSearchParams(params: URLSearchParams): ReservationFilters {
  const status = params.get('status');
  return {
    lotId: params.get('lotId') ?? undefined,
    status: status && isReservationStatus(status) ? status : undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    search: params.get('search') ?? undefined,
    activeNow: params.get('activeNow') === 'true' ? true : undefined,
  };
}
