import apiClient from './client';
import { UserRole } from '../types';

/**
 * Whether the terminal has completed device registration.
 * Independent of `status`, which only controls whether the account can log in —
 * a terminal can be `status: 'active'` while never having been registered.
 */
export type TerminalRegistrationState = 'pending' | 'reset_pending' | 'registered';

/** What the terminal can actually do right now, combining both signals. */
export type TerminalOperationalState = 'operational' | 'pending_registration' | 'reset_pending' | 'disabled';

export interface Terminal {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  registrationState: TerminalRegistrationState;
  companyId: number;
  storeId: number;
  companyName: string;
  storeName: string;
  /** The clock this terminal's clock-in window is judged on. */
  storeTimezone?: string | null;
  plainPassword?: string;
  deviceRegistered: boolean;
  deviceRegisteredAt: string | null;
  deviceMetadata: any;
  lastSeenIp: string | null;
  lastSeenAt: string | null;
  deviceResetPending: boolean;
  /** Set when the terminal has been moved to the deleted list. */
  deletedAt?: string | null;
  deletedByName?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdByName: string | null;
  updatedByName: string | null;
}

/**
 * Collapse account status + registration state into the single state that
 * answers "can this terminal take attendance right now?".
 */
export function getTerminalOperationalState(terminal: Pick<Terminal, 'status' | 'registrationState'>): TerminalOperationalState {
  if (terminal.status !== 'active') return 'disabled';
  if (terminal.registrationState === 'pending') return 'pending_registration';
  if (terminal.registrationState === 'reset_pending') return 'reset_pending';
  return 'operational';
}

export interface ListTerminalsResponse {
  success: boolean;
  data: {
    data: Terminal[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export interface TerminalFilters {
  search?: string;
  status?: string;
  /** Comma-separated TerminalRegistrationState values. */
  registration?: string;
  company_id?: string;
  store_id?: string;
  page?: number;
  limit?: number;
}

export const getTerminals = async (filters: TerminalFilters = {}): Promise<ListTerminalsResponse> => {
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.status) params.append('status', filters.status);
  if (filters.registration) params.append('registration', filters.registration);
  if (filters.company_id) params.append('company_id', filters.company_id);
  if (filters.store_id) params.append('store_id', filters.store_id);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await apiClient.get<ListTerminalsResponse>(`terminals?${params.toString()}`);
  return response.data;
};

export interface StoreTerminalStatus {
  id: number;
  name: string;
  code: string;
  address: string;
  cap: string;
  maxStaff: number;
  companyId: number;
  companyName: string;
  /** The clock this store's shifts are written on and its clock-ins judged against. */
  timezone?: string | null;
  /** A terminal account exists for this store, enabled or not. */
  hasTerminal: boolean;
}

export const getStoresWithTerminalStatus = async (): Promise<StoreTerminalStatus[]> => {
  const response = await apiClient.get<{ success: boolean; data: StoreTerminalStatus[] }>('terminals/stores-status');
  return response.data.data;
};

export interface CreateTerminalPayload {
  storeId: number;
  email: string;
  password: string;
}

export const createTerminal = async (payload: CreateTerminalPayload): Promise<{ success: boolean; data: any }> => {
  const response = await apiClient.post('terminals', payload);
  return response.data;
};

export const updateTerminal = async (id: number, payload: { email?: string; password?: string }): Promise<{ success: boolean; data: any }> => {
  const response = await apiClient.patch(`terminals/${id}`, payload);
  return response.data;
};

/** Moves the terminal to the Super Admin's deleted list. Nothing is destroyed. */
export const deleteTerminal = async (id: number): Promise<{ success: boolean; data: any }> => {
  const response = await apiClient.delete(`terminals/${id}`);
  return response.data;
};

/** The deleted list — Super Admin only. */
export const getDeletedTerminals = async (filters: TerminalFilters = {}): Promise<ListTerminalsResponse> => {
  const params = new URLSearchParams({ deleted: 'true' });
  if (filters.search) params.append('search', filters.search);
  if (filters.company_id) params.append('company_id', filters.company_id);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await apiClient.get<ListTerminalsResponse>(`terminals?${params.toString()}`);
  return response.data;
};

/** Brings a deleted terminal back, inactive. Super Admin only. */
export const restoreTerminal = async (
  id: number,
): Promise<{ success: boolean; message?: string; data: { id: number; email: string; addressRecovered: boolean } }> => {
  const response = await apiClient.post(`terminals/${id}/restore`);
  return response.data;
};

/** Removes a deleted terminal for good. Super Admin only. */
export const permanentlyDeleteTerminal = async (id: number): Promise<{ success: boolean; data: any }> => {
  const response = await apiClient.delete(`terminals/${id}/permanent`);
  return response.data;
};

export const activateTerminal = async (id: number): Promise<{ success: boolean; data: any }> => {
  const response = await apiClient.patch(`terminals/${id}/activate`);
  return response.data;
};

export const deactivateTerminal = async (id: number): Promise<{ success: boolean; data: any }> => {
  const response = await apiClient.patch(`terminals/${id}/deactivate`);
  return response.data;
};

/**
 * The terminal's password, read one at a time.
 *
 * It no longer travels in the list: any authenticated employee could read every
 * password in their company and sign in as a store terminal. Each read is
 * recorded in the audit trail.
 */
export const getTerminalPassword = async (id: number): Promise<string | null> => {
  const response = await apiClient.get<{ success: boolean; data: { password: string | null } }>(`terminals/${id}/password`);
  return response.data.data.password;
};
