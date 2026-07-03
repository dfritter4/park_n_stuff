import { useQuery } from '@tanstack/react-query';
import type { AnalyticsResponse, DayBreakdownResponse } from '@parking/shared';
import { apiFetch } from '../api/client';

const ANALYTICS_DAYS = 30;

/** `lotId` omitted (or `undefined`) aggregates analytics across all lots. */
export function useAnalytics(lotId?: string) {
  return useQuery({
    queryKey: ['admin', 'analytics', ANALYTICS_DAYS, lotId ?? 'all'],
    queryFn: () =>
      apiFetch<AnalyticsResponse>(
        `/api/admin/analytics?days=${ANALYTICS_DAYS}${lotId ? `&lotId=${lotId}` : ''}`,
      ),
  });
}

/** `lotId` omitted (or `undefined`) aggregates the day breakdown across all lots. */
export function useDayBreakdown(date: string, lotId?: string) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'day', date, lotId ?? 'all'],
    queryFn: () =>
      apiFetch<DayBreakdownResponse>(`/api/admin/analytics/day/${date}${lotId ? `?lotId=${lotId}` : ''}`),
    enabled: date !== '',
  });
}
