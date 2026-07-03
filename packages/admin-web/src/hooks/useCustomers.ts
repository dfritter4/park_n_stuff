import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminCustomerDetail, AdminCustomerListResponse } from '@parking/shared';
import { apiFetch } from '../api/client';
import { buildCustomersQueryString, type CustomerFilters, type Pagination } from '../lib/customers';

export const CUSTOMERS_QUERY_KEY = ['admin', 'customers'] as const;

export function useCustomers(filters: CustomerFilters, pagination: Pagination) {
  const queryString = buildCustomersQueryString(filters, pagination);
  return useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, queryString],
    queryFn: () => apiFetch<AdminCustomerListResponse>(`/api/admin/customers?${queryString}`),
    placeholderData: keepPreviousData,
  });
}

export const CUSTOMER_DETAIL_QUERY_KEY = (id: string) => ['admin', 'customers', 'detail', id] as const;

export function useCustomerDetail(id: string | undefined) {
  return useQuery({
    queryKey: CUSTOMER_DETAIL_QUERY_KEY(id ?? ''),
    queryFn: () => apiFetch<AdminCustomerDetail>(`/api/admin/customers/${id}`),
    enabled: id !== undefined,
  });
}
