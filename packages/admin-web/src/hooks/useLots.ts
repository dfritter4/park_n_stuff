import { useQuery } from '@tanstack/react-query';
import type { Lot } from '@parking/shared';
import { apiFetch } from '../api/client';

export const LOTS_QUERY_KEY = ['lots'] as const;

export function useLots() {
  return useQuery({
    queryKey: LOTS_QUERY_KEY,
    queryFn: () => apiFetch<Lot[]>('/api/lots'),
  });
}
