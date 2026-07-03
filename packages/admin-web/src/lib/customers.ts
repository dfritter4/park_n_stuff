/** Raw customer filter state as edited in the UI. */
export interface CustomerFilters {
  search?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

/**
 * Builds the query string for `GET /api/admin/customers` from the current
 * filter/pagination state.
 */
export function buildCustomersSearchParams(filters: CustomerFilters, pagination: Pagination): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) {
    params.set('search', filters.search);
  }
  params.set('page', String(pagination.page));
  params.set('pageSize', String(pagination.pageSize));
  return params;
}

export function buildCustomersQueryString(filters: CustomerFilters, pagination: Pagination): string {
  return buildCustomersSearchParams(filters, pagination).toString();
}
