import apiClient from './client';

export interface DeviceStatusResponse {
  isDeviceRegistered: boolean;
  deviceResetPending: boolean;
  requiresDeviceRegistration: boolean;
  isDeviceMatched?: boolean;
}

export interface RegisterDevicePayload {
  fingerprint: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceEvent {
  id: number;
  userId: number;
  eventType: 'registered' | 'mismatch_blocked' | 'admin_bypass' | 'reset' | 'suspicious_ip';
  ipAddress: string | null;
  userAgent: string | null;
  metadata: any;
  createdAt: string;
}

export async function getDeviceStatus(fingerprint?: string): Promise<DeviceStatusResponse> {
  const { data } = await apiClient.get('/device/status', {
    params: fingerprint ? { fingerprint } : undefined,
  });
  return data.data as DeviceStatusResponse;
}

export async function registerDevice(payload: RegisterDevicePayload): Promise<DeviceStatusResponse> {
  const { data } = await apiClient.post('/device/register', payload);
  return data.data as DeviceStatusResponse;
}

export async function getDeviceHistory(userId: number): Promise<DeviceEvent[]> {
  const { data } = await apiClient.get(`/device/history/${userId}`);
  return data.data as DeviceEvent[];
}

export interface ReRegisterDevicePayload {
  email: string;
  password: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
}

export async function reRegisterDevice(payload: ReRegisterDevicePayload): Promise<{ success: boolean }> {
  const { data } = await apiClient.post('/device/re-register', payload);
  return data.data;
}

export interface CheckDeviceRegistrationPayload {
  email: string;
  password: string;
  fingerprint: string;
}

export interface CheckDeviceRegistrationResponse {
  found: boolean;
  /** Set when nothing matched, so the UI can render a localised message. */
  code?: string;
  details?: {
    name: string;
    surname: string;
    email: string;
    role: string;
    /** True when the device is held by a store terminal rather than a person. */
    isTerminal: boolean;
    storeName: string | null;
    storeCode: string | null;
    registeredAt: string;
    ipAddress: string | null;
    browser: string | null;
    browserVersion: string | null;
    os: string | null;
    deviceModel: string | null;
  };
}

export async function checkDeviceRegistrationApi(payload: CheckDeviceRegistrationPayload): Promise<CheckDeviceRegistrationResponse> {
  const { data } = await apiClient.post('/device/check-fingerprint', payload);
  return data.data as CheckDeviceRegistrationResponse;
}

