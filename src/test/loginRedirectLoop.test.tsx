/**
 * The login-page flicker.
 *
 * A 401 ends the session and reloads the browser to /login. When the request
 * that produced it keeps being made - the offline attendance queue drains on
 * every boot - and the browser is already sitting on /login, that reload loads
 * the page onto itself and the whole thing happens again a moment later. The
 * module-level guard inside the redirect cannot stop it, because a reload
 * resets it. On a phone it looks like the login page flickering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';

const captured: { onError?: (e: unknown) => unknown } = {};

vi.mock('../api/client', () => ({
  default: {
    defaults: { headers: { common: {} as Record<string, string> } },
    get: vi.fn(() => Promise.resolve({ data: { data: {} } })),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: {
        use: (_ok: unknown, onErr: (e: unknown) => unknown) => { captured.onError = onErr; return 1; },
        eject: vi.fn(),
      },
    },
  },
}));

const HREF_SENTINEL = 'http://localhost/__not-navigated__';

function setLocation(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { pathname, search, href: HREF_SENTINEL, origin: 'http://localhost' },
  });
}

/**
 * Mount AuthProvider fresh, so the module's own redirect guard starts unset.
 *
 * Both providers are imported after the reset: a stale ToastProvider from the
 * previous module graph is a different React context, and AuthProvider would
 * not find it.
 */
async function mountAuth() {
  vi.resetModules();
  const [{ AuthProvider }, { ToastProvider }] = await Promise.all([
    import('../context/AuthContext'),
    import('../context/ToastContext'),
  ]);
  render(
    React.createElement(ToastProvider, null,
      React.createElement(AuthProvider, null, React.createElement('div', null, 'app'))
    )
  );
  await waitFor(() => expect(captured.onError).toBeTypeOf('function'));
}

/** A 401 from an ordinary (non-auth) endpoint, as the interceptor receives it. */
function unauthorized(url: string) {
  return {
    config: { url },
    response: { status: 401, data: {} },
  };
}

describe('redirect to login', () => {
  const realLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    captured.onError = undefined;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
  });

  it('does not reload the login page onto itself', async () => {
    setLocation('/login');
    await mountAuth();

    await expect(captured.onError!(unauthorized('/attendance/sync'))).rejects.toBeDefined();

    // The session is already over and the login form is already on screen.
    // Reloading here is what turned one stale queued event into a flicker.
    expect(window.location.href).toBe(HREF_SENTINEL);
  });

  it('does not reload it either when a ?next= is already on the URL', async () => {
    setLocation('/login', '?next=%2Fpresenze%2Fscan%3Ftoken%3Dabc');
    await mountAuth();

    await expect(captured.onError!(unauthorized('/attendance/sync'))).rejects.toBeDefined();

    expect(window.location.href).toBe(HREF_SENTINEL);
  });

  it('does redirect from a real page, carrying it in ?next=', async () => {
    setLocation('/presenze/scan', '?token=abc.def');
    await mountAuth();

    await expect(captured.onError!(unauthorized('/attendance/sync'))).rejects.toBeDefined();

    expect(window.location.href).toBe(
      `/login?next=${encodeURIComponent('/presenze/scan?token=abc.def')}`
    );
  });

  it('drops ?next= when the company access has ended, so nobody returns to it', async () => {
    setLocation('/dipendenti');
    await mountAuth();

    await expect(
      captured.onError!({ config: { url: '/employees' }, response: { status: 403, data: { code: 'COMPANY_ACCESS_EXPIRED' } } })
    ).rejects.toBeDefined();

    expect(window.location.href).toBe('/login');
    expect(localStorage.getItem('login_error_code')).toBe('COMPANY_ACCESS_EXPIRED');
  });
});
