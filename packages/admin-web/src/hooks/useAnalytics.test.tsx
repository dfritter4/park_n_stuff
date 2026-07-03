import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAnalytics, useDayBreakdown } from './useAnalytics';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useAnalytics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches all-lots analytics when lotId is omitted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ hourlyOccupancy: [], dailyRevenue: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAnalytics(), { wrapper: wrapperFor(newQueryClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics?days=30', expect.anything());
  });

  it('appends &lotId= when a lot is selected', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ hourlyOccupancy: [], dailyRevenue: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAnalytics('lot-a'), { wrapper: wrapperFor(newQueryClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics?days=30&lotId=lot-a', expect.anything());
  });

  it('caches all-lots and per-lot data under separate query keys', async () => {
    const queryClient = newQueryClient();
    const fetchMock = vi.fn(async () => jsonResponse({ hourlyOccupancy: [], dailyRevenue: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result: allLotsResult } = renderHook(() => useAnalytics(), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(allLotsResult.current.isSuccess).toBe(true));

    const { result: lotAResult } = renderHook(() => useAnalytics('lot-a'), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(lotAResult.current.isSuccess).toBe(true));

    // Distinct queryKeys mean both fetches actually happen (no accidental
    // cache collision between "all lots" and a specific lot's data).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/analytics?days=30', expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/analytics?days=30&lotId=lot-a', expect.anything());
  });
});

describe('useDayBreakdown', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the all-lots day breakdown when lotId is omitted', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ rows: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDayBreakdown('2026-07-01'), { wrapper: wrapperFor(newQueryClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics/day/2026-07-01', expect.anything());
  });

  it('appends ?lotId= when a lot is selected', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ rows: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDayBreakdown('2026-07-01', 'lot-a'), {
      wrapper: wrapperFor(newQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/analytics/day/2026-07-01?lotId=lot-a', expect.anything());
  });

  it('does not fetch when date is empty', () => {
    const fetchMock = vi.fn(async () => jsonResponse({ rows: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useDayBreakdown(''), { wrapper: wrapperFor(newQueryClient()) });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
