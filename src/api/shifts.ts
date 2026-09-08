import client from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Shift {
  id: number;
  companyId: number;
  storeId: number;
  userId: number;
  assignmentId?: number | null;
  timezone?: string | null;
  date: string;          // may be 'YYYY-MM-DD' or full ISO — use .split('T')[0] to normalize
  startTime: string;     // 'HH:MM:SS'
  endTime: string;       // 'HH:MM:SS'
  startAtUtc?: string | null;
  endAtUtc?: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  breakStartAtUtc?: string | null;
  breakEndAtUtc?: string | null;
  breakType: 'fixed' | 'flexible';
  breakMinutes: number | null;
  isSplit: boolean;
  splitStart2: string | null;
  splitEnd2: string | null;
  splitStart2AtUtc?: string | null;
  splitEnd2AtUtc?: string | null;
  isOffDay: boolean;
  status: 'scheduled' | 'confirmed' | 'cancelled';
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  storeName: string;
  userName: string;
  userSurname: string;
  userAvatarFilename?: string | null;
  shiftHours: string | number | null;
}

function normalizeDateOnly(value: string): string {
  if (!value) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.split('T')[0];
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Times arrive from the server already expressed in the store's own timezone —
// s.start_time is the wall-clock instruction ("09:00 at Varese") and start_at_utc
// was derived from it in that same zone. Re-rendering them in the VIEWER's zone
// used to be the other half of the Varese outage: the calendar showed the manager
// her own 09:00 back, which hid the fault from the only person who could see it,
// and because the calendar also seeds the edit form, saving wrote the converted
// number back. Displaying what the server sent is both simpler and correct.

function normalizeShift(shift: Shift): Shift {
  return { ...shift, date: normalizeDateOnly(shift.date) };
}

export interface ShiftTemplate {
  id: number;
  companyId: number;
  storeId: number;
  storeName?: string;
  companyName?: string;
  name: string;
  templateData: Record<string, unknown>;
  createdBy: number | null;
  createdAt: string;
}

export interface CreateShiftPayload {
  user_id: number;
  store_id: number;
  date: string;
  timezone?: string;
  start_time: string;
  end_time: string;
  break_type?: 'fixed' | 'flexible';
  break_start?: string | null;
  break_end?: string | null;
  break_minutes?: number | null;
  is_split?: boolean;
  split_start2?: string | null;
  split_end2?: string | null;
  is_off_day?: boolean;
  notes?: string | null;
  status?: 'scheduled' | 'confirmed' | 'cancelled';
  /**
   * Acknowledges a LEAVE_CONFLICT warning: the employee has approved leave on
   * this date and the operator has chosen to schedule them anyway.
   */
  confirm_leave_conflict?: boolean;
}

export type UpdateShiftPayload = Partial<CreateShiftPayload>;

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function listShifts(params: {
  week?: string;
  month?: string;
  store_id?: number;
  user_id?: number;
  company_id?: number;
  start_date?: string;
  end_date?: string;
}): Promise<{ shifts: Shift[] }> {
  const res = await client.get('/shifts', {
    params: {
      ...params,
    },
  });
  return {
    ...res.data.data,
    shifts: (res.data.data.shifts as Shift[]).map(normalizeShift),
  };
}

export async function createShift(payload: CreateShiftPayload): Promise<Shift> {
  const res = await client.post('/shifts', {
    ...payload,
  });
  return normalizeShift(res.data.data as Shift);
}

export async function updateShift(id: number, payload: UpdateShiftPayload): Promise<Shift> {
  const res = await client.put(`/shifts/${id}`, {
    ...payload,
  });
  return normalizeShift(res.data.data as Shift);
}

export async function deleteShift(id: number): Promise<void> {
  await client.delete(`/shifts/${id}`);
}

export async function copyWeek(payload: {
  store_id: number;
  source_week: string;
  target_week: string;
}): Promise<{ copied: number; shifts: Shift[] }> {
  const res = await client.post('/shifts/copy-week', payload);
  return {
    ...res.data.data,
    shifts: (res.data.data.shifts as Shift[]).map(normalizeShift),
  };
}

/** Confirm all scheduled shifts for an employee in the given ISO week (admin / hr / area_manager). */
export async function approveWeekForEmployee(payload: {
  user_id: number;
  week: string;
  store_id?: number | null;
}): Promise<{ updated: number }> {
  const res = await client.post('/shifts/approve-week', payload);
  return res.data.data;
}

export async function listTemplates(store_id?: number): Promise<{ templates: ShiftTemplate[] }> {
  const res = await client.get('/shifts/templates', { params: store_id ? { store_id } : {} });
  return res.data.data;
}

export async function createTemplate(payload: {
  store_id: number;
  name: string;
  template_data: Record<string, unknown>;
}): Promise<ShiftTemplate> {
  const res = await client.post('/shifts/templates', payload);
  return res.data.data;
}

export async function updateTemplate(id: number, payload: {
  store_id: number;
  name: string;
  template_data: Record<string, unknown>;
}): Promise<ShiftTemplate> {
  const res = await client.put(`/shifts/templates/${id}`, payload);
  return res.data.data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await client.delete(`/shifts/templates/${id}`);
}

export async function exportShifts(params: { store_id?: number; week?: string; format?: 'csv' | 'xlsx' | 'pdf' }): Promise<Blob> {
  const res = await client.get('/shifts/export', {
    params,
    responseType: 'blob',
  });
  return res.data as Blob;
}

export async function downloadImportTemplate(): Promise<Blob> {
  const res = await client.get('/shifts/import-template', { responseType: 'blob' });
  return res.data as Blob;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  total: number;
}

export async function importShifts(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await client.post('/shifts/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data as ImportResult;
}

