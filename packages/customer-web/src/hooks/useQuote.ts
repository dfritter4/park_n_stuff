import { useEffect, useState } from 'react';
import type { QuoteResponse } from '@parking/shared';
import { apiFetch } from '../api/client';

const DEBOUNCE_MS = 400;

export interface UseQuoteResult {
  quote: QuoteResponse | null;
  isLoading: boolean;
}

/**
 * Fetches the server-authoritative cost quote for a lot/window, debounced so
 * it doesn't fire on every keystroke while the customer is still picking a
 * duration. The local `estimateCostCents` preview remains the instant,
 * optimistic value — this hook's `quote` is `null` until the debounced
 * request resolves, and stays `null` (rather than surfacing an error) if the
 * request fails, so callers can simply fall back to the local estimate.
 */
export function useQuote(
  lotId: string | undefined,
  startISO: string,
  endISO: string,
): UseQuoteResult {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setQuote(null);

    if (!lotId || !startISO || !endISO) {
      setIsLoading(false);
      return;
    }

    const start = new Date(startISO);
    const end = new Date(endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const timer = setTimeout(() => {
      const query = new URLSearchParams({ startTime: startISO, endTime: endISO }).toString();
      apiFetch<QuoteResponse>(`/api/lots/${lotId}/quote?${query}`)
        .then((result) => {
          if (!cancelled) {
            setQuote(result);
          }
        })
        .catch(() => {
          // Non-blocking: leave quote null so the caller keeps its local estimate.
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lotId, startISO, endISO]);

  return { quote, isLoading };
}
