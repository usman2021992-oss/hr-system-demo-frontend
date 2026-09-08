import axios from 'axios';

// In production (Vercel), set VITE_API_URL to your Railway backend URL.
// Must include protocol: https://xxxx.up.railway.app (NOT just xxxx.up.railway.app)
// In development, Vite's proxy forwards /api to localhost:3000.
let apiBase = import.meta.env.VITE_API_URL || '';
// Defensive: auto-add protocol when the value was set without one.
// Prefer http for localhost/127.0.0.1/0.0.0.0 and https otherwise.
if (apiBase && !apiBase.startsWith('http://') && !apiBase.startsWith('https://')) {
  if (apiBase.startsWith('localhost') || apiBase.startsWith('127.') || apiBase.startsWith('0.0.0.0')) {
    apiBase = `http://${apiBase}`;
  } else {
    apiBase = `https://${apiBase}`;
  }
}
const BASE_URL = apiBase ? `${apiBase}/api` : '/api';

/** Absolute API base URL — usable in feed URLs shared with external services. */
export function getApiBaseUrl(): string {
  return apiBase ? `${apiBase}/api` : `${window.location.origin}/api`;
}

// ── Key transformers ──────────────────────────────────────────────────────────

function toCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function toSnake(s: string): string {
  return s.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(camelizeKeys);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof File) && !(obj instanceof Blob)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), camelizeKeys(v)])
    );
  }
  return obj;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function snakeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(snakeKeys);
  }
  if (
    obj !== null && typeof obj === 'object' &&
    !(obj instanceof File) &&
    !(obj instanceof Blob) &&
    !(obj instanceof FormData)
  ) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toSnake(k), snakeKeys(v)])
    );
  }
  return obj;
}

// ── Axios instance ────────────────────────────────────────────────────────────

const client = axios.create({ baseURL: BASE_URL });

// Request: convert camelCase body + params → snake_case + Add language headers
client.interceptors.request.use((config) => {
  // Add language headers
  const lang = localStorage.getItem('hr_lang') || 'it';
  config.headers['x-lang'] = lang;
  config.headers['Accept-Language'] = lang === 'it' ? 'it-IT,it;q=0.9' : 'en-US,en;q=0.9';

  if (config.data !== undefined && config.data !== null) {
    config.data = snakeKeys(config.data);
  }
  if (config.params !== undefined && config.params !== null) {
    config.params = snakeKeys(config.params);
  }
  return config;
});

// Response: convert snake_case keys → camelCase
client.interceptors.response.use(
  (res) => {
    if (res.data !== undefined && res.data !== null) {
      res.data = camelizeKeys(res.data);
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 402 && err.response?.data?.code === 'LICENSE_LIMIT_REACHED') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('license-limit', { detail: err.response.data })
        );
      }
    }

    if (err.response?.status === 403) {
      const code = err.response?.data?.code || err.response?.data?.error;
      if (code === 'SUBSCRIPTION_REQUIRED' || code === 'SUBSCRIPTION_BLOCKED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('billing-restriction', {
              detail: {
                code,
                message: err.response.data.message,
              },
            })
          );
        }
      }
    }
    return Promise.reject(err);
  }
);

const TOKEN_KEY = 'hr_token';

/**
 * Returns an authenticated URL for a user avatar file.
 * Uses a ?token= query param so that <img> tags (which can't set headers) work.
 * Works in dev (relative URL via Vite proxy) and production (absolute Railway URL).
 */
export function getAvatarUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  const base = apiBase; // '' in dev (uses Vite proxy), full URL in prod
  return `${base}/uploads/avatars/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function getCompanyLogoUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  const base = apiBase;
  return `${base}/uploads/company-logos/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function getCompanyBannerUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  const base = apiBase;
  return `${base}/uploads/company-banners/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function getStoreLogoUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  const base = apiBase;
  return `${base}/uploads/store-logos/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function getMessageAttachmentUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  const base = apiBase;
  return `${base}/uploads/message-attachments/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function getPublicAvatarUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = apiBase;
  return `${base}/uploads/public-avatars/${filename}`;
}

export function getPublicStoreLogoUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = apiBase;
  return `${base}/uploads/public-store-logos/${filename}`;
}

export function getResumeUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  const base = apiBase; // '' in dev (uses Vite proxy), full URL in prod
  
  // Extract filename from path if it contains 'public-cv/'
  // Database stores: "public-cv/filename.pdf"
  // Backend expects: /uploads/public-cv/filename
  let filename = path;
  if (path.includes('public-cv/')) {
    // Extract everything after 'public-cv/'
    filename = path.substring(path.indexOf('public-cv/') + 'public-cv/'.length);
  }
  
  // Construct URL: /uploads/public-cv/:filename
  const url = base ? `${base}/uploads/public-cv/${filename}` : `/uploads/public-cv/${filename}`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export default client;
