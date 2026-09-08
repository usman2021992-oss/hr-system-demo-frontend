import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('removes the cache-busting reload parameter after boot', () => {
    window.history.replaceState(null, document.title, '/dipendenti?foo=bar&__hr_app_reload=123#section');

    cleanupChunkReloadParam();

    expect(window.location.pathname).toBe('/dipendenti');
    expect(window.location.search).toBe('?foo=bar');
    expect(window.location.hash).toBe('#section');
  });
});
