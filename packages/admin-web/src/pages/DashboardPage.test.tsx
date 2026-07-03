import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardResponse } from '@parking/shared';
import { DashboardPage } from './DashboardPage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderDashboardPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const dashboard: DashboardResponse = {
  revenueTodayCents: 123456,
  activeReservations: 7,
  averageOccupancyPct: 42.5,
  lots: [{ lotId: 'lot-1', name: 'Loop Garage', capacity: 250, occupied: 42, revenueTodayCents: 5000 }],
  recentReservations: [
    {
      reservationNumber: 'RES-1',
      lotName: 'Downtown Deck',
      startTime: '2026-07-02T10:00:00.000Z',
      endTime: '2026-07-02T12:00:00.000Z',
      totalCostCents: 1500,
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('DashboardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an accessible loading status while the dashboard fetch is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    renderDashboardPage(newQueryClient());

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders metric cards, lot gauges, and recent activity once loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(dashboard)));

    renderDashboardPage(newQueryClient());

    await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).not.toBeInTheDocument());

    expect(screen.getByText('Revenue today')).toBeInTheDocument();
    expect(screen.getByText('$1234.56')).toBeInTheDocument();
    expect(screen.getByText('Loop Garage')).toBeInTheDocument();
    expect(screen.getByText('42 / 250')).toBeInTheDocument();
    expect(screen.getByText('RES-1')).toBeInTheDocument();
    expect(screen.getByText('Downtown Deck')).toBeInTheDocument();
  });

  it('renders an alert when the dashboard fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { code: 'SERVER_ERROR', message: 'boom' } }, 500)));

    renderDashboardPage(newQueryClient());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load the dashboard/i);
  });
});
