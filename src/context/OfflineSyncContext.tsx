import { useTranslation } from 'react-i18next';
import React, { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import client from '../api/client';
import { useToast } from './ToastContext';
import { 
  getOfflineEvents, 
  deleteOfflineEvents, 
  addOfflineEvent,
  getPersistedDailyAttendanceState,
  type OfflineAttendanceEvent 
} from '../utils/indexedDB';

const BATCH_SIZE = 100;

export interface DailyOfflineState {
  checkedIn: boolean;
  breakStarted: boolean;
  breakEnded: boolean;
  checkedOut: boolean;
  hasShift: boolean;
  hasLeave: boolean;
}

interface OfflineSyncContextValue {
  queueLength: number;
  isOnline: boolean;
  isSyncing: boolean; // New: state tracking the active background sync process
  lastSyncTime: number; // New: timestamp of the last successful batch sync
  enqueue: (event: Omit<OfflineAttendanceEvent, 'id' | 'client_uuid'> & { client_uuid?: string }) => Promise<void>;
  drainQueue: () => Promise<void>;
  /** Derive today's attendance state purely from the offline IndexedDB queue */
  getTodayOfflineState: (userId?: number) => Promise<DailyOfflineState>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | undefined>(undefined);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const syncingRef = useRef(false);
  const [queueLength, setQueueLength] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const { showToast } = useToast();
  const { t } = useTranslation();

  const retryDelayRef = useRef(1000);
  const retryTimeoutRef = useRef<any>(null);

  const refreshQueueLength = useCallback(async () => {
    try {
      const events = await getOfflineEvents();
      setQueueLength(events.length);
    } catch (err) {
      console.error('[OfflineSync] Failed to refresh queue length:', err);
    }
  }, []);

  const drainQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    let events: OfflineAttendanceEvent[] = [];
    try {
      events = await getOfflineEvents();
    } catch (err) {
      console.error('[OfflineSync] Failed to read IndexedDB:', err);
      return;
    }

    // Prune events older than 24 hours
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    const staleEvents = events.filter(e => {
      const t = new Date(e.event_time).getTime();
      return isNaN(t) || t < cutoff;
    });
    const validEvents = events.filter(e => {
      const t = new Date(e.event_time).getTime();
      return !isNaN(t) && t >= cutoff;
    });

    if (staleEvents.length > 0) {
      const staleIds = staleEvents.map(e => e.id).filter((id): id is number => id !== undefined);
      if (staleIds.length > 0) {
        console.log(`[OfflineSync] Pruning ${staleIds.length} stale events older than 24 hours.`);
        await deleteOfflineEvents(staleIds);
      }
    }

    if (validEvents.length === 0) {
      await refreshQueueLength();
      return;
    }

    console.log(`[OfflineSync] Found ${validEvents.length} pending events. Starting background sync...`);
    syncingRef.current = true;
    setIsSyncing(true);
    
    try {
      let remaining = [...validEvents];
      let totalSynced = 0;
      console.log(`[OfflineSync] Processing queue of ${remaining.length} items in batches of ${BATCH_SIZE}...`);
      while (remaining.length > 0) {
        console.log(`[OfflineSync] Sync iteration starting. Current queue size: ${remaining.length}`);
        if (!navigator.onLine) {
          console.warn('[OfflineSync] Sync interrupted: connection lost.');
          break;
        }

        const batch = remaining.slice(0, BATCH_SIZE);
        remaining = remaining.slice(BATCH_SIZE);
        
        const payload = batch.map(e => ({
          event_type: e.event_type,
          user_id: e.user_id,
          unique_id: e.unique_id,
          event_time: e.event_time,
          qr_token: e.qr_token,
          notes: e.notes,
          client_uuid: e.client_uuid,
          device_fingerprint: e.device_fingerprint
        }));

        console.log(`[OfflineSync] Sending batch of ${batch.length} events... Payload:`, payload);
        const res = await client.post('/attendance/sync', { events: payload });
        
        const result = res.data?.data || res.data;
        console.log('[OfflineSync] Server response received:', result);
        
        const confirmedUuids = result?.syncedUuids || result?.synced_uuids || [];
        const syncedCount = result?.synced ?? 0;
        const failedCount = result?.failed ?? 0;

        console.log(`[OfflineSync] Server result: Synced=${syncedCount}, Failed=${failedCount}, ConfirmedUUIDs=${confirmedUuids.length}`);
        totalSynced += syncedCount;

        const itemsToDelete = batch
          .filter((e) => e.client_uuid && (confirmedUuids as string[]).includes(e.client_uuid))
          .map((e) => e.id as number);

        if (itemsToDelete.length > 0) {
          console.log(`[OfflineSync] SUCCESS: Deleting ${itemsToDelete.length} events from local IndexedDB.`);
          await deleteOfflineEvents(itemsToDelete);
        } else {
          console.warn('[OfflineSync] WARNING: No events were cleared from local DB in this batch.');
        }

        if (result?.failed > 0 || (result?.errors && result.errors.length > 0)) {
          const firstError = result.errors?.[0] || 'Unknown reason';
          console.warn(`[OfflineSync] Batch partial failure: ${result.failed} events failed.`, result.errors);
          showToast(`Sync alert: ${result.failed} records could not be saved. Reason: ${firstError}`, 'warning');
        }
      }

      console.log(`[OfflineSync] Sync sequence finished. Synced ${totalSynced} items total.`);
      setLastSyncTime(Date.now());
      await refreshQueueLength();
      retryDelayRef.current = 1000; // Reset backoff delay on success
      
      if (totalSynced > 0) {
        showToast(
          t('attendance.syncSuccessCount', { count: totalSynced, defaultValue: `${totalSynced} presenze offline sincronizzate con successo` }),
          'success'
        );
      }
    } catch (err: any) {
      console.error('[OfflineSync] Sync failed (will retry later):', err);
      // Detailed error breakdown
      const status = err.response?.status;
      const serverMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      const code = err.response?.data?.code || 'FETCH_ERROR';
      
      console.error(`[OfflineSync] Error Details: Status=${status}, Code=${code}, Message=${serverMsg}`);

      if (err.response) {
        showToast(`Sync alert (${status}): ${serverMsg}`, 'warning');
      } else {
        showToast(`Network Error: Ensure your phone can reach ${window.location.host}`, 'warning');
      }

      // Schedule retry with exponential backoff
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => {
        void drainQueue();
      }, retryDelayRef.current);
      retryDelayRef.current = retryDelayRef.current * 2;
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshQueueLength, showToast, t]);

  const enqueue = useCallback(async (event: Omit<OfflineAttendanceEvent, 'id' | 'client_uuid'> & { client_uuid?: string }) => {
    // Robust UUID v4 polyfill for non-secure contexts (192.168.x.x)
    const generateUUID = () => {
      try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      } catch (e) {}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    const finalEvent: Omit<OfflineAttendanceEvent, 'id'> = {
      ...event,
      client_uuid: event.client_uuid || generateUUID()
    };
    await addOfflineEvent(finalEvent);
    await refreshQueueLength();
    console.log('[OfflineSync] Event saved to local queue.');
  }, [refreshQueueLength]);

  /**
   * Derive today's attendance state by merging two sources:
   *   1. localStorage — state last confirmed/persisted from the server (handles
   *      actions performed while online that never entered the IndexedDB queue).
   *   2. IndexedDB offline queue — events queued while offline that have not
   *      yet been synced to the server.
   *
   * Both sources are OR-merged (a flag is true if either source says true),
   * which gives the most complete and accurate picture of today's state.
   */
  const getTodayOfflineState = useCallback(async (userId?: number): Promise<DailyOfflineState> => {
    const state: DailyOfflineState = {
      checkedIn: false,
      breakStarted: false,
      breakEnded: false,
      checkedOut: false,
      hasShift: true,  // Default to true if no persisted state (be permissive)
      hasLeave: false, // Default to false if no persisted state
    };
    try {
      // ── Source 1: localStorage persisted state (from last server sync) ──
      if (userId != null) {
        const persisted = getPersistedDailyAttendanceState(userId);
        if (persisted) {
          console.log('[OfflineSync] Restored attendance state from localStorage:', persisted);
          state.checkedIn    = state.checkedIn    || persisted.checkedIn;
          state.breakStarted = state.breakStarted || persisted.breakStarted;
          state.breakEnded   = state.breakEnded   || persisted.breakEnded;
          state.checkedOut   = state.checkedOut   || persisted.checkedOut;
          state.hasShift     = persisted.hasShift;
          state.hasLeave     = persisted.hasLeave;
        }
      }

      // ── Source 2: IndexedDB queue (offline-queued events not yet synced) ──
      const allEvents = await getOfflineEvents();
      const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const todayEvents = allEvents.filter((e) => {
        const dateMatch = e.event_time?.slice(0, 10) === todayStr;
        const userMatch = userId == null || e.user_id === userId;
        return dateMatch && userMatch;
      });
      for (const e of todayEvents) {
        if (e.event_type === 'checkin')     state.checkedIn    = true;
        if (e.event_type === 'break_start') state.breakStarted = true;
        if (e.event_type === 'break_end')   state.breakEnded   = true;
        if (e.event_type === 'checkout')    state.checkedOut   = true;
      }
    } catch (err) {
      console.error('[OfflineSync] Failed to read offline state:', err);
    }
    return state;
  }, []);

  // Global Listeners
  useEffect(() => {
    // Initial refresh
    void refreshQueueLength();
    if (navigator.onLine) void drainQueue();

    const handleOnline = () => { 
      console.log('[OfflineSync] Internet restored. Triggering sync...');
      setIsOnline(true); 
      void drainQueue(); 
      showToast('Connection restored. Syncing attendance...', 'success');
    };
    const handleOffline = () => {
      console.log('[OfflineSync] Connection lost.');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodic check (every 30 seconds) in case 'online' event is missed
    const interval = setInterval(() => {
      if (navigator.onLine) void drainQueue();
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [drainQueue, refreshQueueLength, showToast]);

  return (
    <OfflineSyncContext.Provider value={{ queueLength, isOnline, isSyncing, lastSyncTime, enqueue, drainQueue, getTodayOfflineState }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (context === undefined) {
    throw new Error('useOfflineSync must be used within an OfflineSyncProvider');
  }
  return context;
}
