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

/**
 * Thin fetch wrapper shared by every customer-web API call. Prefixes paths
 * with the configured API base URL, JSON-encodes bodies, and normalizes all
 * failure modes (network failure, non-2xx with an error envelope, non-2xx
 * without one) into a single `ApiError` so callers only handle one shape.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
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
