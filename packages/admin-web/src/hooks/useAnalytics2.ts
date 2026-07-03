import { useQuery } from '@tanstack/react-query';
import type { DeclinesResponse, ForecastResponse, HeatmapResponse, LotCompareResponse, WeeklyCompareResponse } from '@parking/shared';
import { apiFetch } from '../api/client';

const LOT_COMPARE_DAYS = 30;
const DECLINES_DAYS = 30;

/** `lotId` omitted (or `undefined`) aggregates the heatmap across all lots. */
export function useHeatmap(lotId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'heatmap', lotId ?? 'all'],
    queryFn: () => apiFetch<HeatmapResponse>(`/api/admin/analytics/heatmap${lotId ? `?lotId=${lotId}` : ''}`),
  });
}

export function useWeeklyCompare() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'weekly-compare'],
    queryFn: () => apiFetch<WeeklyCompareResponse>('/api/admin/analytics/weekly-compare'),
  });
}

export function useLotCompare(days: number = LOT_COMPARE_DAYS) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'lot-compare', days],
    queryFn: () => apiFetch<LotCompareResponse>(`/api/admin/analytics/lot-compare?days=${days}`),
  });
}

/** The forecast endpoint requires a lotId; the query stays disabled until one is selected. */
export function useForecast(lotId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'forecast', lotId],
    queryFn: () => apiFetch<ForecastResponse>(`/api/admin/analytics/forecast?lotId=${lotId}`),
    enabled: Boolean(lotId),
  });
}

export function useDeclines(days: number = DECLINES_DAYS) {
  return useQuery({
    queryKey: ['admin', 'analytics', 'declines', days],
    queryFn: () => apiFetch<DeclinesResponse>(`/api/admin/analytics/declines?days=${days}`),
  });
}
