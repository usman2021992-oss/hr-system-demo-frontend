import client from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType = 'checkin' | 'checkout' | 'break_start' | 'break_end';
export type AttendanceSource = 'qr' | 'manual' | 'sync';

export interface AttendanceEvent {
  id: number;
  companyId: number;
  storeId: number;
  userId: number;
  eventType: EventType;
  eventTime: string;        // ISO timestamp
  source: AttendanceSource;
  qrTokenId: number | null;
  shiftId: number | null;
  notes: string | null;
  createdAt: string;
  // Note: joined fields (userName, userSurname, storeName) are only present on
  // list responses (GET /attendance), not on the checkin response (POST /attendance/checkin).
  userName?: string;
  userSurname?: string;
  storeName?: string;
}

export interface QrTokenResponse {
  token: string;
  nonce: string;
  storeId: number;
  expiresIn: number;
  tokenId: number;
}

export interface CheckinPayload {
  qrToken: string;
  eventType: EventType;
  uniqueId?: string;   // Employee unique text ID (preferred)
  userId?: number;     // Legacy numeric ID (fallback)
  // Device binding: fingerprint of the employee's current device.
  // Will be sent as device_fingerprint to the backend.
  deviceFingerprint?: string;
  deviceMetadata?: Record<string, any>;
  notes?: string;
}

export interface AttendanceListParams {
  userId?: number;
  storeId?: number;
  /** Cross-company filter, used by super-admin views. */
  companyId?: number;
  dateFrom?: string;
  dateTo?: string;
  eventType?: EventType;
  search?: string;
  timezone?: string;
  limit?: number;
  offset?: number;
}

export interface AttendanceListResponse {
  events: AttendanceEvent[];
  total: number;
  hasMore: boolean;
}

function resolveBrowserTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone && timezone.trim().length > 0 ? timezone : 'Europe/Rome';
  } catch {
    return 'Europe/Rome';
  }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Generate a QR token for a store (returns JWT string + metadata). */
export async function generateQrToken(storeId: number): Promise<QrTokenResponse> {
  const { data } = await client.get('/qr/generate', { params: { store_id: storeId } });
  if (!data.data) throw new Error('Risposta QR non valida dal server');
  return data.data as QrTokenResponse;
}

/** Record an attendance event by submitting the QR token string. */
export async function recordCheckin(payload: CheckinPayload): Promise<AttendanceEvent> {
  const { data } = await client.post('/attendance/checkin', payload);
  return data.data as AttendanceEvent;
}

/** List attendance events (management roles only). */
export async function listAttendanceEvents(
  params?: AttendanceListParams,
): Promise<AttendanceListResponse> {
  const requestParams: AttendanceListParams = {
    ...(params ?? {}),
    timezone: params?.timezone ?? resolveBrowserTimezone(),
  };
  const { data } = await client.get('/attendance', { params: requestParams });
  return data.data as AttendanceListResponse;
}

/** List the current employee's own attendance events (employee role only). */
export async function listMyAttendanceEvents(params?: {
  dateFrom?: string;
  dateTo?: string;
  deviceFingerprint?: string;
  timezone?: string;
}): Promise<AttendanceListResponse> {
  const requestParams = {
    ...(params ?? {}),
    timezone: params?.timezone ?? resolveBrowserTimezone(),
  };
  const { data } = await client.get('/attendance/my', { params: requestParams });
  return data.data as AttendanceListResponse;
}

export interface DailyStateResponse {
  hasShift: boolean;
  hasLeave: boolean;
  state: {
    checkedIn: boolean;
    breakStarted: boolean;
    breakEnded: boolean;
    checkedOut: boolean;
  };
}

/** Get today's attendance state for the calling employee. Used to initialise the state machine. */
export async function getDailyState(): Promise<DailyStateResponse> {
  const { data } = await client.get('/attendance/daily-state');
  return (data?.data ?? data) as DailyStateResponse;
}
