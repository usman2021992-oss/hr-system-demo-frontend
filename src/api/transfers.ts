import client from './client';

export type TransferStatus = 'active' | 'cancelled' | 'completed';

export interface TransferAssignment {
  id: number;
  companyId: number;
  userId: number;
  originStoreId: number;
  targetStoreId: number;
  startDate: string;
  endDate: string;
  cancelOriginShifts: boolean;
  status: TransferStatus;
  reason: string | null;
  notes: string | null;
  createdBy: number | null;
  cancelledBy: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string;
  userSurname: string;
  userEmail: string;
  userAvatarFilename: string | null;
  companyName: string;
  groupName?: string | null;
  originStoreName: string;
  originStoreLogoFilename?: string | null;
  targetStoreName: string;
  targetStoreLogoFilename?: string | null;
  createdByName?: string | null;
  createdBySurname?: string | null;
  createdByAvatarFilename?: string | null;
  cancelledByName?: string | null;
  cancelledBySurname?: string | null;
  cancelledByAvatarFilename?: string | null;
}

export interface TransferLinkedShift {
  id: number;
  assignmentId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'confirmed' | 'cancelled';
  storeId: number;
  storeName: string;
  isSplit: boolean;
  splitStart2: string | null;
  splitEnd2: string | null;
  shiftHours: string | number | null;
}

export interface TransferWarnings {
  existingShifts: number;
  targetStoreShifts: number;
  originStoreShifts: number;
}

export interface TransferCreatePayload {
  user_id: number;
  target_store_id: number;
  origin_store_id?: number | null;
  start_date: string;
  end_date: string;
  cancel_origin_shifts?: boolean;
  reason?: string | null;
  notes?: string | null;
  target_company_id?: number | null;
}

export interface TransferUpdatePayload {
  target_store_id?: number;
  origin_store_id?: number | null;
  start_date?: string;
  end_date?: string;
  cancel_origin_shifts?: boolean;
  reason?: string | null;
  notes?: string | null;
  target_company_id?: number | null;
}

export interface TransferListParams {
  status?: TransferStatus;
  user_id?: number;
  store_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface TransferBlocksParams {
  date_from?: string;
  date_to?: string;
  week?: string;
  month?: string;
  store_id?: number;
  status?: TransferStatus | 'all';
}

export async function listTransfers(params?: TransferListParams): Promise<{ transfers: TransferAssignment[] }> {
  const res = await client.get('/transfers', { params });
  return res.data.data;
}

export async function getTransfer(id: number): Promise<TransferAssignment> {
  const res = await client.get(`/transfers/${id}`);
  return res.data.data as TransferAssignment;
}

export async function listTransferShifts(id: number): Promise<{ transferId: number; shifts: TransferLinkedShift[] }> {
  const res = await client.get(`/transfers/${id}/shifts`);
  return res.data.data;
}

export async function createTransfer(payload: TransferCreatePayload): Promise<{ transfer: TransferAssignment; warnings: TransferWarnings; originShiftsCancelled?: number }> {
  const res = await client.post('/transfers', payload);
  return res.data.data;
}

export async function updateTransfer(id: number, payload: TransferUpdatePayload): Promise<{ transfer: TransferAssignment; warnings: TransferWarnings; originShiftsCancelled?: number; originShiftsRestored?: number }> {
  const res = await client.put(`/transfers/${id}`, payload);
  return res.data.data;
}

export async function cancelTransfer(
  id: number,
  reason?: string,
  options?: { restore_origin_shifts?: boolean },
): Promise<{ transfer: TransferAssignment; detachedShifts: number; cancelledShifts?: number; cancelledTargetShifts?: number; restoredOriginShifts?: number; restoreOriginalShiftsEnabled?: boolean }> {
  const res = await client.post(`/transfers/${id}/cancel`, {
    reason,
    restore_origin_shifts: options?.restore_origin_shifts,
  });
  return res.data.data;
}

export async function deleteTransfer(id: number): Promise<{ id: number; detachedShifts: number; deletedTargetShifts?: number; restoredOriginShifts?: number }> {
  const res = await client.delete(`/transfers/${id}`);
  return res.data.data;
}

export async function completeTransfer(id: number): Promise<TransferAssignment> {
  const res = await client.post(`/transfers/${id}/complete`);
  return res.data.data as TransferAssignment;
}

export async function getTransferBlocks(params: TransferBlocksParams): Promise<{ dateFrom: string; dateTo: string; blocks: TransferAssignment[] }> {
  const res = await client.get('/transfers/blocks', { params });
  return res.data.data;
}

export async function getTransferGuests(params: { store_id?: number; date?: string }): Promise<{ date: string; storeId: number; guests: TransferAssignment[] }> {
  const res = await client.get('/transfers/guests', { params });
  return res.data.data;
}

export async function getEmployeeTransferSchedule(
  userId: number,
  params: { date_from?: string; date_to?: string; week?: string; month?: string },
): Promise<{
  dateFrom: string;
  dateTo: string;
  employee: {
    id: number;
    companyId: number;
    storeId: number | null;
    name: string;
    surname: string;
    role: string;
    avatarFilename: string | null;
  };
  shifts: any[];
  assignments: TransferAssignment[];
}> {
  const res = await client.get(`/transfers/employee-schedule/${userId}`, { params });
  return res.data.data;
}
