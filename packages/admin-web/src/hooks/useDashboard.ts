import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardResponse } from '@parking/shared';
import { apiFetch } from '../api/client';

const REFETCH_INTERVAL_MS = 15000;

export function useDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiFetch<DashboardResponse>('/api/admin/dashboard'),
    refetchInterval: REFETCH_INTERVAL_MS,
    placeholderData: keepPreviousData,
  });
}
