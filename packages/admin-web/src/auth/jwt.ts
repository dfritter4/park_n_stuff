interface AdminTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Decodes the payload of a JWT without verifying its signature. The token is
 * always freshly issued by our own login endpoint and only used here to read
 * the admin's email for display, so signature verification is unnecessary —
 * the server remains the sole authority that checks the signature on every
 * request via requireAdmin.
 */
export function decodeTokenPayload(token: string): AdminTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as AdminTokenPayload;
  } catch {
    return null;
  }
}
