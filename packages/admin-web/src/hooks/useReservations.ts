import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminReservationDetail, AdminReservationListResponse } from '@parking/shared';
import { apiFetch } from '../api/client';
import { buildReservationsQueryString, type Pagination, type ReservationFilters } from '../lib/reservations';

export function useReservations(filters: ReservationFilters, pagination: Pagination) {
  const queryString = buildReservationsQueryString(filters, pagination);
  return useQuery({
    queryKey: ['admin', 'reservations', queryString],
    queryFn: () => apiFetch<AdminReservationListResponse>(`/api/admin/reservations?${queryString}`),
    placeholderData: keepPreviousData,
  });
}

export const RESERVATION_DETAIL_QUERY_KEY = (id: string) => ['admin', 'reservations', 'detail', id] as const;

export function useReservationDetail(id: string | undefined) {
  return useQuery({
    queryKey: RESERVATION_DETAIL_QUERY_KEY(id ?? ''),
    queryFn: () => apiFetch<AdminReservationDetail>(`/api/admin/reservations/${id}`),
    enabled: id !== undefined,
  });
}
