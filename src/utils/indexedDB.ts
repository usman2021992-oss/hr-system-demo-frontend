/**
 * A lightweight utility to manage an offline attendance queue in IndexedDB.
 * Also provides localStorage-based helpers to persist today's confirmed
 * attendance state so that offline mode can restore it correctly.
 */

// ── localStorage attendance state persistence ─────────────────────────────

export interface PersistedDailyState {
  checkedIn: boolean;
  breakStarted: boolean;
  breakEnded: boolean;
  checkedOut: boolean;
  hasShift: boolean;
  hasLeave: boolean;
  date: string; // YYYY-MM-DD — used to auto-expire stale entries
}

function dailyStateKey(userId: number | string): string {
  return `hr_attendance_state_${userId}`;
}

/**
 * Persist the current attendance state for a user to localStorage.
 * Keyed by userId and stamped with today's date so stale data is ignored.
 */
export function persistDailyAttendanceState(
  userId: number | string,
  state: Omit<PersistedDailyState, 'date'>
): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const payload: PersistedDailyState = { ...state, date: today };
    localStorage.setItem(dailyStateKey(userId), JSON.stringify(payload));
  } catch (err) {
    console.warn('[AttendanceState] Failed to persist state to localStorage:', err);
  }
}

/**
 * Read back today's persisted attendance state for a user.
 * Returns null if nothing is stored or the stored entry is from a previous day.
 */
export function getPersistedDailyAttendanceState(
  userId: number | string
): Omit<PersistedDailyState, 'date'> | null {
  try {
    const raw = localStorage.getItem(dailyStateKey(userId));
    if (!raw) return null;
    const parsed: PersistedDailyState = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) {
      // Stale entry from a previous day — clear it
      localStorage.removeItem(dailyStateKey(userId));
      return null;
    }
    return {
      checkedIn: !!parsed.checkedIn,
      breakStarted: !!parsed.breakStarted,
      breakEnded: !!parsed.breakEnded,
      checkedOut: !!parsed.checkedOut,
      hasShift: !!parsed.hasShift,
      hasLeave: !!parsed.hasLeave,
    };
  } catch (err) {
    console.warn('[AttendanceState] Failed to read persisted state from localStorage:', err);
    return null;
  }
}

const DB_NAME = 'hr_offline_db';
const STORE_NAME = 'attendance_events';
const DB_VERSION = 1;

export interface OfflineAttendanceEvent {
  id?: number;          // Managed by IndexedDB (autoIncrement)
  client_uuid: string;  // Unique ID for deduplication
  event_type: 'checkin' | 'checkout' | 'break_start' | 'break_end';
  event_time: string;   // ISO timestamp captured at client side
  qr_token?: string;    // The QR token scanned
  notes?: string;
  user_id?: number;
  unique_id?: string;
  device_fingerprint?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

export async function addOfflineEvent(event: OfflineAttendanceEvent): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(event);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineEvents(): Promise<OfflineAttendanceEvent[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteOfflineEvents(ids: number[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    ids.forEach(id => store.delete(id));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
