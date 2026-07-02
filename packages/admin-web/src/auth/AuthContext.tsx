import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { LoginResponse } from '@parking/shared';
import { apiFetch, clearStoredToken, getStoredToken, setStoredToken } from '../api/client';
import { decodeTokenPayload } from './jwt';
import { useIdleTimeout } from './useIdleTimeout';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface AuthContextValue {
  isAuthenticated: boolean;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<LoginResponse>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(result.token);
    setToken(result.token);
  }, []);

  useIdleTimeout({ enabled: token !== null, timeoutMs: IDLE_TIMEOUT_MS, onIdle: logout });

  const email = useMemo(() => (token ? decodeTokenPayload(token)?.email ?? null : null), [token]);

  const value = useMemo(
    () => ({ isAuthenticated: token !== null, email, login, logout }),
    [token, email, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
