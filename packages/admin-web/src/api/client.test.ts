import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiFetchBlob, ApiError } from './client';

const TOKEN_KEY = 'admin_token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('resolves with the parsed JSON body on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1', name: 'Loop Garage' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ id: string; name: string }>('/api/lots/1');

    expect(result).toEqual({ id: '1', name: 'Loop Garage' });
  });

  it('throws an ApiError parsed from the error envelope on a failed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'LOT_NOT_FOUND', message: 'Lot not found' } }, 404),
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

  it('does not add an Authorization header when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/admin/dashboard');

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('adds a Bearer Authorization header when a token is stored', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/admin/dashboard');

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('clears the stored token and redirects to /login on a 401 response', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'stale-token');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid admin credentials' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const originalLocation = window.location;
    const locationStub = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });

    await expect(apiFetch('/api/admin/dashboard')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(locationStub.href).toBe('/login');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('does not clear the token or redirect on a 401 response when no token was stored (e.g. a failed login)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const originalLocation = window.location;
    const locationStub = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });

    await expect(apiFetch('/api/admin/auth/login', { method: 'POST' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(locationStub.href).toBe('');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});

describe('apiFetchBlob', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('resolves with a Blob on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('date,revenue\n2026-01-01,10.00', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetchBlob('/api/admin/analytics/export');

    expect(result).toBeInstanceOf(Blob);
    expect(await result.text()).toBe('date,revenue\n2026-01-01,10.00');
  });

  it('adds a Bearer Authorization header when a token is stored', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('csv', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetchBlob('/api/admin/analytics/export');

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });

  it('clears the stored token and redirects to /login on a 401 response when a token was stored', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'stale-token');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid admin credentials' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const originalLocation = window.location;
    const locationStub = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });

    await expect(apiFetchBlob('/api/admin/analytics/export')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(locationStub.href).toBe('/login');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('throws an ApiError with code NETWORK_ERROR when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetchBlob('/api/admin/analytics/export')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('does not clear the token or redirect on a 401 response when no token was stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid admin credentials' } }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);

    const originalLocation = window.location;
    const locationStub = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });

    await expect(apiFetchBlob('/api/admin/analytics/export')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(locationStub.href).toBe('');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});
