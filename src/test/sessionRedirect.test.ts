import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeNextPath } from '../utils/safeNextPath';
import { capturePendingScan, pendingScanPath, clearPendingScan } from '../utils/pendingScan';

function qrToken(expSecondsFromNow: number): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  return `${enc({ alg: 'HS256' })}.${enc({ companyId: 1, storeId: 39, nonce: 'n', exp })}.sig`;
}

describe('safeNextPath', () => {
  it('accepts in-app paths with a query string', () => {
    expect(safeNextPath('/presenze/scan?token=abc.def')).toBe('/presenze/scan?token=abc.def');
  });

  it.each([
    [null], [''], ['https://evil.example'], ['//evil.example'], ['/\\evil.example'], ['javascript:alert(1)'], ['/a\nb'],
  ])('rejects %j', (raw) => {
    expect(safeNextPath(raw as string | null)).toBeNull();
  });
});

describe('pending QR scan', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('keeps the token from a scan URL and hands back the scan path while valid', () => {
    const token = qrToken(170);
    window.history.replaceState(null, '', `/presenze/scan?token=${encodeURIComponent(token)}`);
    capturePendingScan();
    expect(pendingScanPath()).toBe(`/presenze/scan?token=${encodeURIComponent(token)}`);
  });

  it('ignores other pages', () => {
    window.history.replaceState(null, '', '/dipendenti?token=x');
    capturePendingScan();
    expect(pendingScanPath()).toBeNull();
  });

  it('drops an expired QR', () => {
    window.history.replaceState(null, '', `/presenze/scan?token=${encodeURIComponent(qrToken(2))}`);
    capturePendingScan();
    expect(pendingScanPath()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('is cleared once the scan page is reached', () => {
    window.history.replaceState(null, '', `/presenze/scan?token=${encodeURIComponent(qrToken(170))}`);
    capturePendingScan();
    clearPendingScan();
    expect(pendingScanPath()).toBeNull();
  });

  it('expires as time passes', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date());
      window.history.replaceState(null, '', `/presenze/scan?token=${encodeURIComponent(qrToken(60))}`);
      capturePendingScan();
      expect(pendingScanPath()).not.toBeNull();
      vi.setSystemTime(Date.now() + 61_000);
      expect(pendingScanPath()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
