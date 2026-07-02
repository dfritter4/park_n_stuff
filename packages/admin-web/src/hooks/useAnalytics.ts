import { useQuery } from '@tanstack/react-query';
import type { AnalyticsResponse, DayBreakdownResponse } from '@parking/shared';
import { apiFetch } from '../api/client';

const ANALYTICS_DAYS = 30;

export function useAnalytics() {
  return useQuery({
    queryKey: ['admin', 'analytics', ANALYTICS_DAYS],
    queryFn: () => apiFetch<AnalyticsResponse>(`/api/admin/analytics?days=${ANALYTICS_DAYS}`),
  });
}

export function useDayBreakdown(date: string) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'day', date],
    queryFn: () => apiFetch<DayBreakdownResponse>(`/api/admin/analytics/day/${date}`),
    enabled: date !== '',
  });
}
