import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { InternalAxiosRequestConfig } from 'axios';
import apiClient from '../api/client';
import { login as apiLogin, logout as apiLogout } from '../api/auth';
import { User, PermissionMap } from '../types';
import { useToast } from './ToastContext';
import {
  getStoredToken,
  getStoredRefreshToken,
  storeSession,
  clearSession,
  refreshSession,
  secondsUntilExpiry,
} from '../api/session';

export { resolveStoredToken } from '../api/session';

// Renew the access token this long before it runs out, while the app is open.
const PROACTIVE_REFRESH_SECONDS = 10 * 60;

// Requests whose 401 is an answer about credentials, not an expired session.
function isAuthEndpoint(url: string): boolean {
  return url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout');
}

let redirectingToLogin = false;

/**
 * Full reload to the login page, carrying the current page in ?next= so the
 * user comes back to it (a scanned QR above all). A reload rather than a
 * router navigation so no screen keeps stale data from the ended session.
 */
function redirectToLogin(withNext: boolean): void {
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  const { pathname, search } = window.location;
  const next = withNext && pathname !== '/login' ? `?next=${encodeURIComponent(pathname + search)}` : '';
  window.location.href = `/login${next}`;
}

interface AuthContextValue {
  user: User | null;
  permissions: PermissionMap;
  allowedCompanyIds: number[];
  targetCompanyId: number | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface EffectivePermissionsResponse {
  role: string;
  isSuperAdmin: boolean;
  allowedCompanyIds: number[];
  targetCompanyId: number;
  modules: Record<string, boolean>;
}

// Axios camelizes all response keys, so module names like 'gestione_accessi'
// arrive as 'gestioneAccessi'. We must convert them back to snake_case so they
// match the keys used in Sidebar, ProtectedRoute, and permissionCatalog.
function camelToSnake(s: string): string {
  return s.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [allowedCompanyIds, setAllowedCompanyIds] = useState<number[]>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const mapEffectiveToPermissionMap = (effective: EffectivePermissionsResponse): PermissionMap => {
    const mapped: PermissionMap = {};
    for (const [mod, isEnabled] of Object.entries(effective.modules ?? {})) {
      // Convert camelCase key back to snake_case (Axios auto-camelizes response keys)
      mapped[camelToSnake(mod)] = isEnabled === true;
    }
    return mapped;
  };

  const fetchEffectivePermissions = async (): Promise<void> => {
    const effective = await apiClient.get('/permissions/effective').then((r) => r.data.data as EffectivePermissionsResponse);
    setPermissions(mapEffectiveToPermissionMap(effective));
    setAllowedCompanyIds(effective.allowedCompanyIds ?? []);
    setTargetCompanyId(effective.targetCompanyId ?? null);
  };

  // Set up axios request interceptor (token injection)
  useEffect(() => {
    const reqInterceptor = apiClient.interceptors.request.use((config) => {
      const token = getStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    const endSession = (errorCode: string | null) => {
      clearSession();
      delete apiClient.defaults.headers.common['Authorization'];
      if (errorCode === 'COMPANY_ACCESS_EXPIRED') {
        localStorage.setItem('login_error_code', 'COMPANY_ACCESS_EXPIRED');
      }
      setUser(null);
      setPermissions({});
      setAllowedCompanyIds([]);
      setTargetCompanyId(null);
      // No point coming back to a page of a company whose access has ended.
      redirectToLogin(errorCode !== 'COMPANY_ACCESS_EXPIRED');
    };

    const resInterceptor = apiClient.interceptors.response.use(
      (res) => res,
      async (error) => {
        const config = error.config as (InternalAxiosRequestConfig & { _authRetried?: boolean }) | undefined;
        const requestUrl = (config?.url ?? '') as string;
        const status = error.response?.status;
        const code = (error.response?.data?.code ?? null) as string | null;

        // Wrong credentials on login (or a wrong current password) is the
        // caller's to show, not a sign the session has ended.
        if (isAuthEndpoint(requestUrl) || code === 'INVALID_CURRENT_PASSWORD') {
          return Promise.reject(error);
        }

        if (status === 403 && code === 'COMPANY_ACCESS_EXPIRED') {
          endSession(code);
          return Promise.reject(error);
        }

        if (status !== 401) return Promise.reject(error);

        // The access token ran out: renew it silently and replay the request once.
        if (config && !config._authRetried && getStoredRefreshToken()) {
          config._authRetried = true;
          const result = await refreshSession();
          if (result.status === 'ok') {
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${result.token}`;
            if (config.headers) config.headers.Authorization = `Bearer ${result.token}`;
            return apiClient(config);
          }
          if (result.status === 'unavailable') {
            // Couldn't reach the server — the session may be fine; let this
            // request fail and try again on the next one.
            return Promise.reject(error);
          }
          endSession(result.code);
          return Promise.reject(error);
        }

        endSession(null);
        return Promise.reject(error);
      }
    );

    return () => {
      apiClient.interceptors.request.eject(reqInterceptor);
      apiClient.interceptors.response.eject(resInterceptor);
    };
  }, []);

  const normalizeUser = (u: any): User => {
    if (u && (u.role === 'system_admin' || u.isSuperAdmin === true)) {
      return {
        ...u,
        role: 'admin',
        isSuperAdmin: true,
      };
    }
    return u as User;
  };

  // Restore session on mount
  useEffect(() => {
    const restore = async (): Promise<[User, EffectivePermissionsResponse] | null> => {
      let token = getStoredToken();
      if (!token && !getStoredRefreshToken()) return null;

      // An expired access token (a phone left idle through a shift) is renewed
      // before the first request, so opening a page never bounces to /login.
      const left = secondsUntilExpiry(token);
      if ((!token || (left !== null && left < 60)) && getStoredRefreshToken()) {
        const result = await refreshSession();
        if (result.status === 'ok') token = result.token;
        else if (result.status === 'rejected') {
          clearSession();
          if (result.code === 'COMPANY_ACCESS_EXPIRED') {
            localStorage.setItem('login_error_code', 'COMPANY_ACCESS_EXPIRED');
          }
          return null;
        } else if (!token || (left !== null && left <= 0)) {
          // Server unreachable and the access token is already dead: keep the
          // stored session for the next attempt instead of logging out.
          throw new Error('SESSION_CHECK_UNAVAILABLE');
        }
      }
      if (!token) return null;

      // Set header directly — don't rely on interceptor ordering
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Verify token and load permissions
      return Promise.all([
        apiClient.get('/auth/me').then((r) => r.data.data as User),
        apiClient.get('/permissions/effective').then((r) => r.data.data as EffectivePermissionsResponse),
      ]);
    };

    restore()
      .then((loaded) => {
        if (!loaded) return;
        const [userData, effective] = loaded;
        setUser(normalizeUser(userData));
        setPermissions(mapEffectiveToPermissionMap(effective));
        setAllowedCompanyIds(effective.allowedCompanyIds ?? []);
        setTargetCompanyId(effective.targetCompanyId ?? null);
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        // Only a 401 means the session is actually invalid. Discarding the token
        // on any other failure (a 403 from a secondary bootstrap call, a 5xx, a
        // dropped connection) silently logs the user out of a session that is
        // still perfectly valid, and they cannot get back in by logging in again.
        if (status === 401) {
          clearSession();
          delete apiClient.defaults.headers.common['Authorization'];
        }
        setAllowedCompanyIds([]);
        setTargetCompanyId(null);
        // Only show a toast for unexpected errors (network down, 5xx).
        // A 401 means the token simply expired — silent logout is expected.
        if (status !== 401) {
          showToast(
            'Non è stato possibile verificare la sessione. Riprova.',
            'warning',
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, rememberMe = false) => {
    const { token, refreshToken, user: userData } = await apiLogin(email, password, rememberMe);
    // Keep a single authoritative token location to avoid cross-tab/account confusion.
    storeSession(token, refreshToken, rememberMe);
    redirectingToLogin = false;
    // Set header immediately before fetching permissions
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const effective = await apiClient.get('/permissions/effective').then((r) => r.data.data as EffectivePermissionsResponse);
    setUser(normalizeUser(userData));
    setPermissions(mapEffectiveToPermissionMap(effective));
    setAllowedCompanyIds(effective.allowedCompanyIds ?? []);
    setTargetCompanyId(effective.targetCompanyId ?? null);
  };

  const logout = async () => {
    try { await apiLogout(getStoredRefreshToken()); } catch { /* ignore */ }
    clearSession();
    delete apiClient.defaults.headers.common['Authorization'];
    setUser(null);
    setPermissions({});
    setAllowedCompanyIds([]);
    setTargetCompanyId(null);
  };

  const refreshPermissions = async () => {
    await fetchEffectivePermissions();
  };

  // Renew the access token shortly before it runs out while the app is in use,
  // and as soon as a tab left in the background comes back — so requests rarely
  // meet an expired token at all (the 401 handler above is the fallback).
  useEffect(() => {
    if (!user) return;
    const renewIfDue = () => {
      if (document.visibilityState === 'hidden' || !getStoredRefreshToken()) return;
      const left = secondsUntilExpiry(getStoredToken());
      if (left === null || left > PROACTIVE_REFRESH_SECONDS) return;
      void refreshSession().then((result) => {
        if (result.status === 'ok') {
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${result.token}`;
        }
      });
    };
    renewIfDue();
    document.addEventListener('visibilitychange', renewIfDue);
    const timer = setInterval(renewIfDue, 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', renewIfDue);
      clearInterval(timer);
    };
  }, [user?.id]);

  // Re-fetch permissions when the window regains focus (picks up admin changes to roles),
  // when another tab broadcasts a permission update, and every 5 minutes as a fallback.
  useEffect(() => {
    if (!user) return;
    const refresh = () => { void fetchEffectivePermissions(); };
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'hr_permissions_updated') {
        void fetchEffectivePermissions();
      }
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', handleStorageEvent);
    // Five minutes, as the comment above always said - the code said ten
    // seconds. Each poll replaces the permission map, the allowed-company list
    // and the target company with fresh objects, so every screen reading this
    // context re-rendered six times a minute for every signed-in user. It is
    // only a fallback: a role change already arrives immediately through the
    // focus and storage listeners above.
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', handleStorageEvent);
      clearInterval(timer);
    };
  }, [user?.id]);

  const refreshUser = async () => {
    const userData = await apiClient.get('/auth/me').then((r) => r.data.data as User);
    setUser(normalizeUser(userData));
  };

  return (
    <AuthContext.Provider value={{ user, permissions, allowedCompanyIds, targetCompanyId, loading, login, logout, refreshPermissions, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
