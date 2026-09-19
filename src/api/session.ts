import axios from 'axios';
import { API_BASE_URL } from './client';

/**
 * Where the session lives in the browser, and how it is renewed.
 *
 * The access token (JWT) lasts 8 hours. Next to it the server hands out a
 * refresh token; when the access token runs out, refreshSession() trades the
 * refresh token for a new one without asking for the password. Both live in the
 * same storage: localStorage for "remember me", sessionStorage otherwise.
 */

export const TOKEN_KEY = 'hr_token';
export const REFRESH_KEY = 'hr_refresh_token';

function decodeJwtClaims(token: string): { iat?: number; exp?: number } | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    // JWT payload is usually base64url; atob expects base64 with padding.
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(window.atob(padded)) as { iat?: number; exp?: number };
  } catch {
    return null;
  }
}

function decodeJwtIat(token: string): number | null {
  const iat = decodeJwtClaims(token)?.iat;
  return Number.isFinite(iat) ? Number(iat) : null;
}

/** Seconds until the token expires; negative once expired, null if unreadable. */
export function secondsUntilExpiry(token: string | null): number | null {
  if (!token) return null;
  const exp = decodeJwtClaims(token)?.exp;
  if (!Number.isFinite(exp)) return null;
  return Number(exp) - Math.floor(Date.now() / 1000);
}

export function resolveStoredToken(localToken: string | null, sessionToken: string | null): string | null {
  if (!localToken && !sessionToken) return null;
  if (localToken && !sessionToken) return localToken;
  if (!localToken && sessionToken) return sessionToken;

  const localIat = decodeJwtIat(localToken!);
  const sessionIat = decodeJwtIat(sessionToken!);

  // Prefer the token with a valid iat when only one is parseable.
  if (localIat !== null && sessionIat === null) return localToken;
  if (localIat === null && sessionIat !== null) return sessionToken;

  // If both invalid/unparseable, keep localStorage precedence for remember-me continuity.
  if (localIat === null && sessionIat === null) return localToken;

  // Both parseable: choose the newest token.
  if (sessionIat! >= localIat!) return sessionToken;
  return localToken;
}

export function getStoredToken(): string | null {
  const localToken = localStorage.getItem(TOKEN_KEY);
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);

  const resolved = resolveStoredToken(localToken, sessionToken);
  if (!resolved) return null;

  // Normalize to a single authoritative storage when both exist.
  if (localToken && sessionToken) {
    if (resolved === sessionToken) {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  return resolved;
}

/** The storage holding the current session (sessionStorage when unclear). */
function sessionStore(): Storage {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(REFRESH_KEY) ? localStorage : sessionStorage;
}

export function getStoredRefreshToken(): string | null {
  return sessionStore().getItem(REFRESH_KEY)
    ?? localStorage.getItem(REFRESH_KEY)
    ?? sessionStorage.getItem(REFRESH_KEY);
}

export function storeSession(token: string, refreshToken: string | null | undefined, rememberMe: boolean): void {
  clearSession();
  const store = rememberMe ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  if (refreshToken) store.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export type RefreshResult =
  | { status: 'ok'; token: string }
  // The server refused: the session is over (code says why, e.g. COMPANY_ACCESS_EXPIRED).
  | { status: 'rejected'; code: string | null }
  // Network or server trouble: the session may still be fine, try again later.
  | { status: 'unavailable' };

let inFlight: Promise<RefreshResult> | null = null;

/**
 * Trades the stored refresh token for a new access token. Concurrent callers
 * share one request. Uses bare axios so the shared client's 401 handling can't
 * recurse into it.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (inFlight) return inFlight;

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return Promise.resolve({ status: 'rejected', code: null });

  inFlight = (async (): Promise<RefreshResult> => {
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
      const token = res.data?.data?.token as string | undefined;
      if (!token) return { status: 'unavailable' };
      // Write back into whichever storage holds the session.
      const store = sessionStore();
      store.setItem(TOKEN_KEY, token);
      store.setItem(REFRESH_KEY, refreshToken);
      return { status: 'ok', token };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code ?? null;
      if (status === 401 || status === 403) return { status: 'rejected', code };
      return { status: 'unavailable' };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
