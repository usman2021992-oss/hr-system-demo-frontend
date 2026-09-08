import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── Mock the axios client ─────────────────────────────────────────────────────
const mockPost = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    post: (...args: any[]) => mockPost(...args),
    interceptors: {
      request:  { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  },
}));

import React from 'react';
import { useOfflineSync, OfflineSyncProvider } from '../context/OfflineSyncContext';
import { ToastProvider } from '../context/ToastContext';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  React.createElement(ToastProvider, null,
    React.createElement(OfflineSyncProvider, null, children)
  )
);

// Mock IndexedDB module
let mockOfflineQueue: any[] = [];
let mockDailyState: any = null;

vi.mock('../utils/indexedDB', () => ({
  addOfflineEvent: vi.fn().mockImplementation(async (event) => {
    const id = mockOfflineQueue.length + 1;
    const item = { ...event, id };
    mockOfflineQueue.push(item);
    return id;
  }),
  getOfflineEvents: vi.fn().mockImplementation(async () => {
    return [...mockOfflineQueue];
  }),
  deleteOfflineEvents: vi.fn().mockImplementation(async (ids: number[]) => {
    mockOfflineQueue = mockOfflineQueue.filter(item => !ids.includes(item.id));
  }),
  getPersistedDailyAttendanceState: vi.fn().mockImplementation(() => {
    return mockDailyState;
  }),
  persistDailyAttendanceState: vi.fn().mockImplementation((userId, state) => {
    mockDailyState = state;
  }),
}));

import { getOfflineEvents } from '../utils/indexedDB';

describe('useOfflineSync', () => {
  beforeEach(() => {
    mockOfflineQueue = [];
    mockDailyState = null;
    mockPost.mockReset();
    vi.useFakeTimers();
    // Default: online
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Enqueue ─────────────────────────────────────────────────────────────────

  it('enqueue() persists an event to IndexedDB with a client_uuid', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.enqueue({
        event_type: 'checkin',
        unique_id:  'EMP001',
        event_time: '2024-01-01T09:00:00.000Z',
      });
    });

    const stored = await getOfflineEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ event_type: 'checkin', unique_id: 'EMP001' });
    expect(typeof stored[0].client_uuid).toBe('string');
    expect(stored[0].client_uuid.length).toBeGreaterThan(0);
  });

  it('queueLength updates reactively after enqueue()', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    // Wait for hook initialization
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.queueLength).toBe(0);

    await act(async () => {
      await result.current.enqueue({ event_type: 'checkin',  unique_id: 'EMP001', event_time: new Date().toISOString() });
    });
    expect(result.current.queueLength).toBe(1);

    await act(async () => {
      await result.current.enqueue({ event_type: 'checkout', unique_id: 'EMP001', event_time: new Date().toISOString() });
    });
    expect(result.current.queueLength).toBe(2);
  });

  // ── Online / offline detection ───────────────────────────────────────────────

  it('isOnline reflects navigator.onLine initial state (true)', () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });
    expect(result.current.isOnline).toBe(true);
  });

  it('isOnline is false when navigator.onLine starts as false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });
    expect(result.current.isOnline).toBe(false);
  });

  // ── Sync behaviour ───────────────────────────────────────────────────────────

  it('does NOT send _clientId to the server', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    mockPost.mockImplementation(async (url, data) => {
      const uuids = data.events.map((e: any) => e.client_uuid);
      return {
        data: {
          data: {
            synced: uuids.length,
            failed: 0,
            errors: [],
            syncedUuids: uuids,
          }
        }
      };
    });

    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.enqueue({ event_type: 'checkin', unique_id: 'EMP001', event_time: new Date().toISOString() });
    });

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [, payload] = mockPost.mock.calls[0];
    expect(payload.events[0]).not.toHaveProperty('_clientId');
  });

  it('calls POST /attendance/sync and clears queue when window "online" event fires', async () => {
    // Start offline so drainQueue isn't called on mount
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    mockPost.mockImplementation(async (url, data) => {
      const uuids = data.events.map((e: any) => e.client_uuid);
      return {
        data: {
          data: {
            synced: uuids.length,
            failed: 0,
            errors: [],
            syncedUuids: uuids,
          }
        }
      };
    });

    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.enqueue({ event_type: 'checkin', unique_id: 'EMP001', event_time: new Date().toISOString() });
    });
    expect(result.current.queueLength).toBe(1);

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/attendance/sync',
      expect.objectContaining({ events: expect.any(Array) }),
    );
    expect(result.current.queueLength).toBe(0);
    const stored = await getOfflineEvents();
    expect(stored).toHaveLength(0);
  });

  it('preserves queue if sync POST fails', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    mockPost.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.enqueue({ event_type: 'checkin', unique_id: 'EMP999', event_time: new Date().toISOString() });
    });
    expect(result.current.queueLength).toBe(1);

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Queue must still be intact
    const stored = await getOfflineEvents();
    expect(stored).toHaveLength(1);
  });

  it('isSyncing is true during sync and false after', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    let resolvePost!: (v: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((res) => { resolvePost = res; }));

    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    await act(async () => {
      await result.current.enqueue({ event_type: 'checkin', unique_id: 'EMP001', event_time: new Date().toISOString() });
    });

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    // Kick off the sync (don't await yet)
    act(() => { window.dispatchEvent(new Event('online')); });

    // Wait one microtask so the async function starts
    await act(async () => { await Promise.resolve(); });

    expect(result.current.isSyncing).toBe(true);

    // Now resolve the post
    await act(async () => {
      const uuids = mockOfflineQueue.map(e => e.client_uuid);
      resolvePost({
        data: {
          data: {
            synced: uuids.length,
            failed: 0,
            errors: [],
            syncedUuids: uuids,
          }
        }
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it('uses exponential backoff for retries', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    
    mockPost
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockImplementationOnce(async (url, data) => {
        const uuids = data.events.map((e: any) => e.client_uuid);
        return {
          data: {
            data: {
              synced: uuids.length,
              failed: 0,
              errors: [],
              syncedUuids: uuids,
            }
          }
        };
      });

    const { result } = renderHook(() => useOfflineSync(), { wrapper: TestWrapper });
    await act(async () => {
      await result.current.enqueue({ event_type: 'checkin', unique_id: 'EMP001', event_time: new Date().toISOString() });
    });

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

    // First attempt — fails → schedules retry after 1 s
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(result.current.queueLength).toBe(1); // still queued

    // Advance 1 s → second attempt fires (fails → schedules retry after 2 s)
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledTimes(2);

    // Advance 2 s → third attempt fires (succeeds)
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve(); await Promise.resolve();
    });
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(result.current.queueLength).toBe(0);
  });

  it('prunes events older than 24 h before syncing', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

    // Seed mock queue with a stale event (25 h ago)
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockOfflineQueue = [
      { event_type: 'checkin', unique_id: 'EMP001', event_time: staleTime, client_uuid: 'stale-1', id: 1 }
    ];

    mockPost.mockImplementation(async (url, data) => {
      const uuids = data.events.map((e: any) => e.client_uuid);
      return {
        data: {
          data: {
            synced: uuids.length,
            failed: 0,
            errors: [],
            syncedUuids: uuids,
          }
        }
      };
    });

    renderHook(() => useOfflineSync(), { wrapper: TestWrapper });

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve(); await Promise.resolve();
    });

    // Stale event should have been pruned — nothing sent to server
    expect(mockPost).not.toHaveBeenCalled();
    const stored = await getOfflineEvents();
    expect(stored).toHaveLength(0);
  });
});
