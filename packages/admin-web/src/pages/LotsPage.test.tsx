import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Lot } from '@parking/shared';
import { LotsPage } from './LotsPage';

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Loop Garage',
    address: '123 Main St',
    neighborhood: 'Loop',
    lat: 47.6062,
    lng: -122.3321,
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

function renderLotsPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LotsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LotsPage bulk status mutation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invalidates and refetches lots even when a bulk status update partially fails', async () => {
    const lotA = makeLot({ id: 'a', name: 'Lot A', status: 'active' });
    const lotB = makeLot({ id: 'b', name: 'Lot B', status: 'active' });

    let serverLots = [lotA, lotB];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url === '/api/lots') {
        return jsonResponse(serverLots);
      }

      // Lot A's update reaches the server and succeeds...
      if (method === 'PUT' && url === '/api/lots/a') {
        serverLots = serverLots.map((lot) => (lot.id === 'a' ? { ...lot, status: 'maintenance' } : lot));
        return jsonResponse(serverLots.find((lot) => lot.id === 'a'));
      }

      // ...while Lot B's rejects, so Promise.all in bulkStatusMutation rejects too.
      if (method === 'PUT' && url === '/api/lots/b') {
        return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Lot b update failed' } }, 500);
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderLotsPage(queryClient);

    await screen.findByText('Lot A');

    fireEvent.click(screen.getByLabelText('Select Lot A'));
    fireEvent.click(screen.getByLabelText('Select Lot B'));
    fireEvent.click(screen.getByRole('button', { name: /mark maintenance/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    // The mutation as a whole rejects, and its error still surfaces...
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/lot b update failed/i);
    });

    // ...but the table must still be reconciled with true server state: the
    // lot that DID update server-side (Lot A) has to show as "maintenance"
    // once the post-mutation refetch resolves, not be left stale as "active".
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['lots'] });

    await waitFor(() => {
      const row = screen.getByText('Lot A').closest('tr');
      expect(row).not.toBeNull();
      expect(row).toHaveTextContent('maintenance');
    });

    // Selection is cleared once the bulk action settles, success or not.
    await waitFor(() => {
      expect(screen.getByLabelText('Select Lot A')).not.toBeChecked();
      expect(screen.getByLabelText('Select Lot B')).not.toBeChecked();
    });
  });
});
