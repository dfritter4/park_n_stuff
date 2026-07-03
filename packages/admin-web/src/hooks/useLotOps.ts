import { useQuery } from '@tanstack/react-query';
import type { CapacityOverride, PricingRule } from '@parking/shared';
import { apiFetch } from '../api/client';

export const PRICING_RULES_QUERY_KEY = (lotId: string) => ['pricingRules', lotId] as const;
export const CAPACITY_OVERRIDES_QUERY_KEY = (lotId: string) => ['capacityOverrides', lotId] as const;

export function usePricingRules(lotId: string) {
  return useQuery({
    queryKey: PRICING_RULES_QUERY_KEY(lotId),
    queryFn: () => apiFetch<PricingRule[]>(`/api/lots/${lotId}/pricing-rules`),
  });
}

export function useCapacityOverrides(lotId: string) {
  return useQuery({
    queryKey: CAPACITY_OVERRIDES_QUERY_KEY(lotId),
    queryFn: () => apiFetch<CapacityOverride[]>(`/api/lots/${lotId}/capacity-overrides`),
  });
}
