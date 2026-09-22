import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupChunkReloadParam,
  isChunkLoadError,
  recoverFromChunkLoadError,
} from '../utils/chunkLoadRecovery';

describe('chunk load recovery', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, document.title, '/dashboard');
  });

  it('detects the text/html JavaScript MIME error shown by browsers', () => {
    expect(isChunkLoadError(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
  });

  it('detects common dynamic import and chunk failure messages', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/ATSPage-abc.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
  });

  it('detects main module script asset failures before React can boot', () => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/index-deadbeef.js';

    expect(isChunkLoadError({ target: script })).toBe(true);
  });

  it('does not treat ordinary runtime errors as chunk failures', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('schedules a cache-busted reload for chunk failures', () => {
    vi.useFakeTimers();
    const reload = vi.fn();

    const recovered = recoverFromChunkLoadError(
      new TypeError("'text/html' is not a valid JavaScript MIME type."),
      { now: () => 12345, reload }
    );

    expect(recovered).toBe(true);
    vi.runAllTimers();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.calls[0][0]).toContain('__hr_app_reload=12345');

    vi.useRealTimers();
  });

  it('does not schedule duplicate reloads for the same failure burst', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const error = new TypeError("'text/html' is not a valid JavaScript MIME type.");

    expect(recoverFromChunkLoadError(error, { now: () => 1000, reload })).toBe(true);
    expect(recoverFromChunkLoadError(error, { now: () => 1100, reload })).toBe(true);

    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('throttles repeated reloads to avoid infinite loops', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const error = new TypeError("'text/html' is not a valid JavaScript MIME type.");

    expect(recoverFromChunkLoadError(error, { now: () => 1000, reload })).toBe(true);
    expect(recoverFromChunkLoadError(error, { now: () => 2000, reload })).toBe(true);
    expect(recoverFromChunkLoadError(error, { now: () => 3000, reload })).toBe(false);

    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('removes the cache-busting reload parameters after boot', () => {
    window.history.replaceState(
      null,
      document.title,
      '/dipendenti?foo=bar&__hr_app_reload=123&__hr_app_reload_n=1#section'
    );

    cleanupChunkReloadParam();

    expect(window.location.pathname).toBe('/dipendenti');
    expect(window.location.search).toBe('?foo=bar');
    expect(window.location.hash).toBe('#section');
  });

  it('carries the attempt count in the reload URL', () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const error = new TypeError("'text/html' is not a valid JavaScript MIME type.");

    recoverFromChunkLoadError(error, { now: () => 1000, reload });
    vi.runAllTimers();

    // Without this the next page load cannot know it is not the first attempt.
    expect(reload.mock.calls[0][0]).toContain('__hr_app_reload_n=1');

    vi.useRealTimers();
  });
});

/**
 * The failure that made phones flicker.
 *
 * iOS Safari in Private Browsing, with "Block All Cookies", or inside an
 * in-app webview hands back a Storage object and then throws on write. The
 * reload counter silently never persisted, so every reload looked like the
 * first, the cap was never reached, and the page reloaded forever.
 */
describe('chunk load recovery when the browser blocks storage', () => {
  const realSessionStorage = window.sessionStorage;

  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, document.title, '/dashboard');

    // How iOS Safari behaves in Private Browsing: the object is there and
    // reads fine, then throws the moment anything is written. Replacing the
    // whole object rather than spying on Storage.prototype, because jsdom's
    // sessionStorage does not dispatch through that prototype - a spy there
    // silently does nothing and the test passes against the wrong code path.
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('QuotaExceededError');
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: realSessionStorage,
    });
    vi.useRealTimers();
  });

  it('is genuinely simulating a browser that refuses to store anything', () => {
    expect(() => window.sessionStorage.setItem('x', '1')).toThrow();
  });

  /**
   * Without durable storage the counters live in module scope, which is right
   * for the real thing - they last exactly as long as the page does - and
   * means each test has to start from a freshly imported module, the way each
   * page load does.
   */
  const freshPageLoad = async () => {
    vi.resetModules();
    return import('../utils/chunkLoadRecovery');
  };

  it('still stops after the maximum number of reloads', async () => {
    // Fake timers before the dynamic import: awaiting the import with fake
    // timers already installed is fine, the reverse order loses the first
    // scheduled callback.
    vi.useFakeTimers();
    const fresh = await freshPageLoad();
    const reload = vi.fn();
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/HomePage-abc.js');

    // Spaced past the duplicate-burst grace period, so these are three
    // genuinely separate failures rather than one reported repeatedly.
    expect(fresh.recoverFromChunkLoadError(error, { now: () => 1000, reload })).toBe(true);
    expect(fresh.recoverFromChunkLoadError(error, { now: () => 2000, reload })).toBe(true);
    // Before the fix this was `true` forever, and the phone reloaded forever.
    expect(fresh.recoverFromChunkLoadError(error, { now: () => 3000, reload })).toBe(false);

    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('collapses one failure reported twice into a single reload', async () => {
    const fresh = await freshPageLoad();
    vi.useFakeTimers();
    const reload = vi.fn();
    const error = new TypeError('Importing a module script failed.');

    // The global error handler and the React error boundary both see it.
    expect(fresh.recoverFromChunkLoadError(error, { now: () => 1000, reload })).toBe(true);
    expect(fresh.recoverFromChunkLoadError(error, { now: () => 1100, reload })).toBe(true);

    vi.runAllTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refuses to reload again when the URL says it already tried twice', async () => {
    // A phone that has already been round the loop twice. The count rides in
    // the URL because it is the only thing that survives a reload here.
    window.history.replaceState(null, document.title, '/dashboard?__hr_app_reload_n=2');
    vi.resetModules();
    const fresh = await import('../utils/chunkLoadRecovery');

    const reload = vi.fn();
    const recovered = fresh.recoverFromChunkLoadError(
      new TypeError('Failed to fetch dynamically imported module: /assets/x.js'),
      { now: () => 5000, reload }
    );

    expect(recovered).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
