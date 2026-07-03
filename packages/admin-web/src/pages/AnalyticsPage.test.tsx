import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AnalyticsResponse,
  DayBreakdownResponse,
  DeclinesResponse,
  ForecastResponse,
  HeatmapResponse,
  Lot,
  LotCompareResponse,
  WeeklyCompareResponse,
} from '@parking/shared';
import { AnalyticsPage } from './AnalyticsPage';

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'lot-a',
    name: 'Loop Garage',
    address: '123 Main St',
    neighborhood: 'Loop',
    lat: 41.88,
    lng: -87.63,
    capacity: 100,
    hourlyRateCents: 850,
    status: 'active',
    availableSpaces: 40,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderAnalyticsPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

/** Finds the `<section>` ancestor of the heading with the given text. */
async function findSection(headingText: string): Promise<HTMLElement> {
  const heading = await screen.findByText(headingText);
  const section = heading.closest('section');
  if (!section) {
    throw new Error(`No <section> ancestor found for heading "${headingText}"`);
  }
  return section as HTMLElement;
}

describe('AnalyticsPage analytics2 sections', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the heatmap, weekly compare, lot compare, forecast, and declines sections with fetched data', async () => {
    const lots = [makeLot({ id: 'lot-a', name: 'Loop Garage' }), makeLot({ id: 'lot-b', name: 'River North' })];

    const analytics: AnalyticsResponse = { hourlyOccupancy: [], dailyRevenue: [] };
    const dayBreakdown: DayBreakdownResponse = { rows: [] };
    const heatmap: HeatmapResponse = {
      cells: [{ dow: 0, hour: 0, occupancyPct: 12.5 }],
    };
    const weeklyCompare: WeeklyCompareResponse = {
      thisWeek: [{ date: '2026-06-29', revenueCents: 20000, reservations: 5 }],
      lastWeek: [{ date: '2026-06-22', revenueCents: 15000, reservations: 4 }],
    };
    const lotCompare: LotCompareResponse = {
      rows: [{ lotId: 'lot-a', name: 'Loop Garage', revenueCents: 500000, reservations: 120, avgOccupancyPct: 42.5 }],
    };
    const forecast: ForecastResponse = {
      points: [{ date: '2026-07-04', hour: 0, projectedOccupancyPct: 25 }],
    };
    const declines: DeclinesResponse = {
      total: 3,
      byDay: [{ date: '2026-06-30', count: 3, amountCents: 4500 }],
      recent: [{ lotName: 'Loop Garage', amountCents: 1500, cardLast4: '4242', createdAt: '2026-06-30T12:00:00.000Z' }],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/api/lots') return jsonResponse(lots);
      if (url.startsWith('/api/admin/analytics/day/')) return jsonResponse(dayBreakdown);
      if (url.startsWith('/api/admin/analytics?')) return jsonResponse(analytics);
      if (url.startsWith('/api/admin/analytics/heatmap')) return jsonResponse(heatmap);
      if (url.startsWith('/api/admin/analytics/weekly-compare')) return jsonResponse(weeklyCompare);
      if (url.startsWith('/api/admin/analytics/lot-compare')) return jsonResponse(lotCompare);
      if (url.startsWith('/api/admin/analytics/forecast')) return jsonResponse(forecast);
      if (url.startsWith('/api/admin/analytics/declines')) return jsonResponse(declines);

      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAnalyticsPage(newQueryClient());

    // Lot selector defaults to the first lot once lots load.
    const select = await screen.findByLabelText('Lot');
    await waitFor(() => expect(select).toHaveValue('lot-a'));

    // Heatmap renders a cell with the fetched occupancy in its tooltip.
    const heatmapSection = await findSection('Occupancy heatmap (last 30 days)');
    await waitFor(() => {
      expect(within(heatmapSection).getByTitle('Sun 00:00 — 12.5%')).toBeInTheDocument();
    });

    // Weekly compare renders once data loads (chart SVG replaces the loading text).
    const weeklyCompareSection = await findSection('This week vs last week revenue');
    await waitFor(() => expect(within(weeklyCompareSection).queryByText('Loading…')).not.toBeInTheDocument());

    // Lot compare table renders the fetched row.
    const lotCompareSection = await findSection('Lot comparison (last 30 days)');
    await waitFor(() => {
      expect(within(lotCompareSection).getByRole('columnheader', { name: 'Avg occupancy' })).toBeInTheDocument();
      expect(within(lotCompareSection).getByText('Loop Garage')).toBeInTheDocument();
      expect(within(lotCompareSection).getByText('$5000.00')).toBeInTheDocument();
    });

    // Forecast fetches once the lot selector has a concrete lot id, and renders.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/analytics/forecast?lotId=lot-a'),
        expect.anything(),
      );
    });
    const forecastSection = await findSection('Occupancy forecast (next 7 days)');
    await waitFor(() => expect(within(forecastSection).queryByText('Loading…')).not.toBeInTheDocument());

    // Declines section renders the total metric and a recent-decline row.
    const declinesSection = await findSection('Declined payments (last 30 days)');
    await waitFor(() => {
      expect(within(declinesSection).getByText('Declined attempts')).toBeInTheDocument();
      expect(declinesSection.querySelector('.metric-card-value')).toHaveTextContent('3');
      expect(within(declinesSection).getByText('•••• 4242')).toBeInTheDocument();
    });
  });

  it('prompts to pick a lot for the forecast until a lot has loaded', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/api/lots') return jsonResponse([]);
      if (url.startsWith('/api/admin/analytics/day/')) return jsonResponse({ rows: [] });
      if (url.startsWith('/api/admin/analytics?')) return jsonResponse({ hourlyOccupancy: [], dailyRevenue: [] });
      if (url.startsWith('/api/admin/analytics/heatmap')) return jsonResponse({ cells: [] });
      if (url.startsWith('/api/admin/analytics/weekly-compare')) return jsonResponse({ thisWeek: [], lastWeek: [] });
      if (url.startsWith('/api/admin/analytics/lot-compare')) return jsonResponse({ rows: [] });
      if (url.startsWith('/api/admin/analytics/declines')) return jsonResponse({ total: 0, byDay: [], recent: [] });

      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAnalyticsPage(newQueryClient());

    await screen.findByText('Select a specific lot above to view its forecast.');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/admin/analytics/forecast'), expect.anything());
  });
});
