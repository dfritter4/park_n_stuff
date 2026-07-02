import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the parsed JSON body on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1', name: 'Loop Garage' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ id: string; name: string }>('/api/lots/1');

    expect(result).toEqual({ id: '1', name: 'Loop Garage' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lots/1',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('throws an ApiError parsed from the error envelope on a failed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { code: 'LOT_NOT_FOUND', message: 'Lot not found' } },
        404,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/lots/missing')).rejects.toMatchObject({
      code: 'LOT_NOT_FOUND',
      message: 'Lot not found',
      status: 404,
    });
  });

  it('throws an ApiError with code NETWORK_ERROR when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/lots')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('throws an ApiError instance so callers can narrow with instanceof', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/lots')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws an INTERNAL_ERROR ApiError when a failed response has no parseable envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not json', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/lots')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 500,
    });
  });
});
