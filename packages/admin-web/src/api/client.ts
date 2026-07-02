export const ADMIN_TOKEN_KEY = 'admin_token';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const { error } = value as { error: unknown };
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code: unknown }).code === 'string' &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export function getStoredToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * Thin fetch wrapper shared by every admin-web API call. Prefixes paths with
 * the configured API base URL, JSON-encodes bodies, attaches the stored admin
 * JWT as a Bearer token when present, and normalizes all failure modes
 * (network failure, non-2xx with an error envelope, non-2xx without one) into
 * a single `ApiError`. A 401 response on a request that carried a stored
 * token means the session is no longer valid, so it clears the token and
 * sends the user back to /login. A 401 with no stored token (e.g. a failed
 * login attempt) is not a session expiry — it's left to the normal
 * `ApiError` envelope path so callers like the login form can render the
 * server's error message inline.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.', 0);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearStoredToken();
      window.location.href = '/login';
    }

    if (isErrorEnvelope(body)) {
      throw new ApiError(body.error.code, body.error.message, response.status);
    }
    throw new ApiError(
      'INTERNAL_ERROR',
      `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return body as T;
}

/**
 * Variant of `apiFetch` for endpoints that respond with a binary payload
 * (e.g. a CSV export) rather than JSON. Shares the same base URL, Bearer
 * token attachment, and 401 handling (redirect only applies when a token was
 * present on the request); on a non-2xx response it attempts to parse a JSON
 * error envelope the same way `apiFetch` does.
 */
export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const token = getStoredToken();

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Unable to reach the server. Check your connection.', 0);
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearStoredToken();
      window.location.href = '/login';
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (isErrorEnvelope(body)) {
      throw new ApiError(body.error.code, body.error.message, response.status);
    }
    throw new ApiError(
      'INTERNAL_ERROR',
      `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return response.blob();
}
