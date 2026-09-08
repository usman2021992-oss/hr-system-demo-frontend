import type { TFunction } from 'i18next';

/**
 * Extracts the backend error `code` from an Axios error response and returns
 * the corresponding i18n string. Falls back to `fallback` (if provided) or
 * the generic `errors.DEFAULT` key.
 *
 * Usage:
 *   catch (err) {
 *     setError(translateApiError(err, t));
 *   }
 */
/**
 * Returns `null` for request cancellations (ERR_CANCELED) so callers can
 * skip state updates entirely: `const msg = translateApiError(...); if (msg) setError(msg);`
 */
export function translateApiError(
  err: unknown,
  t: TFunction,
  fallback?: string,
): string | null {
  const axiosErr = err as {
    response?: {
      data?: {
        code?: string;
        message?: string;
        error?: string;
        errors?: Record<string, string[] | string>;
      };
      status?: number;
    };
    code?: string;
    message?: string;
  };

  // Silently swallow request cancellations (AbortController / Axios cancel)
  if (axiosErr?.code === 'ERR_CANCELED') {
    return null;
  }

  // Network error — no response from server
  const isNetworkError =
    !axiosErr?.response &&
    (axiosErr?.code === 'ERR_NETWORK' ||
      axiosErr?.code === 'ECONNABORTED' ||
      axiosErr?.message === 'Network Error');

  if (isNetworkError) {
    return (t as (key: string) => string)('errors.NETWORK_ERROR');
  }

  const data = axiosErr?.response?.data;
  const code = data?.code;

  if (code && typeof code === 'string') {
    // Use defaultValue so i18next returns the fallback when the key is absent
    // rather than the key string itself — works regardless of fallbackLng config.
    const translated = (t as (key: string, opts: { defaultValue: string }) => string)(
      `errors.${code}`,
      { defaultValue: '' },
    );
    if (translated) return translated;
  }

  const status = axiosErr?.response?.status;

  if (status === 422) {
    if (data?.errors && typeof data.errors === 'object') {
      const errorMessages = Object.entries(data.errors)
        .flatMap(([_, msgs]) => (Array.isArray(msgs) ? msgs : [msgs]))
        .filter(Boolean)
        .join(' ');
      if (errorMessages) return errorMessages;
    }

  }
  
  const apiMsg = data?.message || data?.error;
  if (apiMsg && typeof apiMsg === 'string') {
    return apiMsg;
  }

  return fallback ?? (t as (key: string) => string)('errors.DEFAULT');
}

export function getApiErrorCode(err: unknown): string | null {
  const axiosErr = err as {
    response?: {
      data?: {
        code?: string;
      };
    };
  };

  const code = axiosErr?.response?.data?.code;
  return typeof code === 'string' && code ? code : null;
}
