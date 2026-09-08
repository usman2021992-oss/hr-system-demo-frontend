import client from './client';

export const STORE_ACTIVITY_TYPES = [
  'window_display',
  'campaign_launch',
  'visual_merchandising',
  'promo_setup',
  'event_activation',
  'seasonal_changeover',
  'pop_up_corner',
  'store_cleaning',
  'deep_cleaning',
  'maintenance_repair',
  'decoration_renovation',
  'layout_change',
  'store_reset',
  'product_restock',
  'inventory_count',
  'price_update',
  'audit_inspection',
  'staff_training',
  'custom_activity',
] as const;

export type StoreActivityType = (typeof STORE_ACTIVITY_TYPES)[number];
export const CUSTOM_ACTIVITY_TYPE: StoreActivityType = 'custom_activity';

export interface WindowDisplayActivity {
  id: number;
  companyId: number;
  storeId: number;
  storeName?: string | null;
  date: string; // Deprecated: use startDate
  startDate: string;
  endDate: string;
  yearMonth: string;
  flaggedBy: number;
  activityType: StoreActivityType;
  activityIcon: string | null;
  customActivityName: string | null;
  durationHours: number | null;
  notes: string | null;
  flaggedByName?: string | null;
  flaggedBySurname?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWindowDisplayResult {
  created: WindowDisplayActivity[];
  skipped: string[];
}

export async function getWindowDisplay(storeId: number, month: string): Promise<WindowDisplayActivity[]> {
  const res = await client.get('/window-display', {
    params: { storeId, month },
  });
  const data = res.data.data;
  if (Array.isArray(data)) return data as WindowDisplayActivity[];
  return data ? [data as WindowDisplayActivity] : [];
}

export async function listWindowDisplayActivities(month: string, storeId?: number, companyId?: number): Promise<WindowDisplayActivity[]> {
  const res = await client.get('/window-display', {
    params: {
      month,
      ...(storeId ? { storeId } : {}),
      ...(companyId ? { companyId } : {}),
    },
  });

  const payload = res.data.data;
  if (Array.isArray(payload)) return payload as WindowDisplayActivity[];
  if (payload) return [payload as WindowDisplayActivity];
  return [];
}

export async function createWindowDisplay(payload: {
  storeId: number;
  date?: string; // Deprecated: use startDate/endDate/dates
  startDate?: string;
  endDate?: string;
  dates?: string[]; // Preferred: one single-day activity per date
  activityType?: StoreActivityType;
  activityIcon?: string | null;
  customActivityName?: string | null;
  durationHours?: number | null;
  notes?: string | null;
  companyId?: number | null;
}): Promise<CreateWindowDisplayResult> {
  const requestBody = {
    store_id: payload.storeId,
    date: payload.date, // Deprecated
    start_date: payload.startDate,
    end_date: payload.endDate,
    dates: payload.dates,
    activity_type: payload.activityType,
    activity_icon: payload.activityIcon,
    custom_activity_name: payload.customActivityName,
    duration_hours: payload.durationHours,
    notes: payload.notes,
    company_id: payload.companyId,
  };

  const res = await client.post('/window-display', requestBody);
  const data = res.data.data;
  if (data && Array.isArray(data.created)) {
    return { created: data.created as WindowDisplayActivity[], skipped: (data.skipped ?? []) as string[] };
  }
  // Legacy single-object response
  return { created: data ? [data as WindowDisplayActivity] : [], skipped: [] };
}

export async function updateWindowDisplay(
  id: number,
  payload: {
    date?: string; // Deprecated: use startDate/endDate
    startDate?: string;
    endDate?: string;
    activityType?: StoreActivityType;
    activityIcon?: string | null;
    customActivityName?: string | null;
    durationHours?: number | null;
    notes?: string | null;
    companyId?: number | null;
  },
): Promise<WindowDisplayActivity> {
  const requestBody = {
    date: payload.date, // Deprecated
    start_date: payload.startDate,
    end_date: payload.endDate,
    activity_type: payload.activityType,
    activity_icon: payload.activityIcon,
    custom_activity_name: payload.customActivityName,
    duration_hours: payload.durationHours,
    notes: payload.notes,
    company_id: payload.companyId,
  };

  const res = await client.put(`/window-display/${id}`, requestBody);
  return res.data.data as WindowDisplayActivity;
}

export async function deleteWindowDisplay(id: number, companyId?: number): Promise<void> {
  await client.delete(`/window-display/${id}`, {
    params: companyId ? { companyId } : undefined,
  });
}
