import client from './client';

export interface ExternalTableColumnDef {
  field: string;
  englishLabel: string;
  type: string;
  description: string;
}

export interface ExternalTableCatalogItem {
  table: 'depositi' | 'ingressi';
  englishName: string;
  description: string;
  columns: ExternalTableColumnDef[];
}

export interface ExternalDbOverview {
  connections: {
    internal: {
      ok: boolean;
      message: string;
      checkedAt: string;
      database: string | null;
    };
    external: {
      configured: boolean;
      ok: boolean;
      host: string | null;
      database: string | null;
      port: number | null;
      message: string;
      checkedAt: string;
      code?: string;
    };
    externalConfig: {
      configured: boolean;
      host: string | null;
      database: string | null;
      port: number | null;
    };
  };
  databases: {
    internal: {
      engine: string;
      databaseName: string | null;
      tableCount: number;
      connected: boolean;
      checkedAt: string;
    };
    external: {
      engine: string;
      databaseName: string | null;
      tableCount: number;
      connected: boolean;
      configured: boolean;
      checkedAt: string;
    };
  };
  counts: {
    companies: number;
    stores: number;
    employees: number;
    localTables: number;
    externalTables: number;
  };
  companies: Array<{
    id: number;
    name: string;
    slug: string;
    isActive: boolean;
    storeCount: number;
    employeeCount: number;
  }>;
  stores: Array<{
    id: number;
    companyId: number;
    companyName: string;
    name: string;
    code: string;
    isActive: boolean;
    employeeCount: number;
  }>;
  employees: Array<{
    id: number;
    companyId: number;
    companyName: string;
    storeId: number | null;
    storeName: string | null;
    name: string;
    surname: string;
    email: string;
    role: string;
    status: string;
  }>;
  localTables: Array<{
    tableName: string;
  }>;
  externalTables: Array<{
    tableName: string;
  }>;
  localTableDetails: Array<{
    tableName: string;
    rowEstimate: number;
    dataBytes: number;
    indexBytes: number;
    totalBytes: number;
    totalSizePretty: string;
    columns: Array<{
      columnName: string;
      dataType: string;
      isNullable: boolean;
      maxLength: number | null;
    }>;
  }>;
  externalTableDetails: Array<{
    tableName: string;
    engine: string | null;
    rowEstimate: number;
    dataBytes: number;
    indexBytes: number;
    totalBytes: number;
    totalSizePretty: string;
    columns: Array<{
      columnName: string;
      dataType: string;
      isNullable: boolean;
      maxLength: number | null;
    }>;
  }>;
}

export interface ExternalDepositoRow {
  externalStoreCode: string;
  storeName: string | null;
  companyName: string | null;
  mappedLocalStoreId: number | null;
  mappedLocalStoreName: string | null;
  mappedLocalStoreCode: string | null;
  availableDays: number;
  availableFromDate: string | null;
  availableToDate: string | null;
}

export interface ExternalStoreMapping {
  id: number;
  companyId: number;
  companyName: string;
  externalCompanyName: string | null;
  localStoreId: number;
  localStoreName: string;
  localStoreCode: string;
  externalStoreCode: string;
  externalStoreName: string | null;
  notes: string | null;
  isActive: boolean;
  sourceTable: string;
  createdBy: number | null;
  createdByName: string | null;
  createdBySurname: string | null;
  createdByAvatarFilename: string | null;
  updatedBy: number | null;
  updatedByName: string | null;
  updatedBySurname: string | null;
  updatedByAvatarFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalIngressiSummary {
  totalDays: number;
  nonZeroDays: number;
  totalVisitors: number;
  avgVisitors: number;
  minVisitors: number;
  maxVisitors: number;
  weekdayAverages: Array<{
    dayOfWeek: number;
    days: number;
    avgVisitors: number;
  }>;
}

export interface ExternalIngressiResponse {
  externalStoreCode: string;
  externalStoreName: string | null;
  localStoreId: number | null;
  fromDate: string;
  toDate: string;
  rows: Array<{
    date: string;
    externalStoreCode: string;
    visitors: number;
  }>;
  summary: ExternalIngressiSummary;
  detailColumns: string[];
  detailRows: Array<Record<string, string | number | boolean | null>>;
}

export interface ExternalTableDataResponse {
  tableName: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface ExternalAffluencePreviewRow {
  dayOfWeek: number;
  timeSlot: string;
  estimatedVisitors: number;
  level: 'low' | 'medium' | 'high';
  requiredStaff: number;
  currentLevel: 'low' | 'medium' | 'high' | null;
  currentRequiredStaff: number | null;
  deltaRequiredStaff: number | null;
  currentScheduledStaff: number;
  deltaToScheduledStaff: number;
  coverageStatus: 'under' | 'balanced' | 'over';
}

export interface ExternalAffluencePreviewResponse {
  storeId: number;
  externalStoreCode: string;
  externalStoreName: string | null;
  fromDate: string;
  toDate: string;
  visitorsPerStaff: number;
  sourceSummary: ExternalIngressiSummary;
  recommendations: ExternalAffluencePreviewRow[];
}

export interface ExternalAffluenceCalculationSettings {
  visitorsPerStaff: number;
  lowMaxStaff: number;
  mediumMaxStaff: number;
  coverageTolerance: number;
  slotWeights: Array<{
    timeSlot: string;
    weight: number;
  }>;
}

export interface ExternalAffluenceWeekResponse {
  storeId: number;
  companyId: number;
  companyName: string;
  localStoreName: string;
  localStoreCode: string;
  externalStoreCode: string;
  externalStoreName: string | null;
  week: string | null;
  fromDate: string;
  toDate: string;
  settings: ExternalAffluenceCalculationSettings;
  sourceSummary: ExternalIngressiSummary;
  recommendations: ExternalAffluencePreviewRow[];
}

export interface ExternalAffluenceConfigurationResponse {
  storeId: number;
  companyId: number;
  companyName: string;
  localStoreName: string;
  localStoreCode: string;
  localStoreLogoFilename: string | null;
  integration: {
    mapped: boolean;
    externalStoreCode: string | null;
    externalStoreName: string | null;
    notes: string | null;
    isActive: boolean;
    mappedByUserId: number | null;
    mappedByName: string | null;
    mappedBySurname: string | null;
    mappedByAvatarFilename: string | null;
    mappedAt: string | null;
  };
  settings: ExternalAffluenceCalculationSettings;
}

export interface SyncExternalAffluenceResponse {
  storeId: number;
  externalStoreCode: string;
  externalStoreName: string | null;
  fromDate: string;
  toDate: string;
  visitorsPerStaff: number;
  overwriteDefault: boolean;
  syncedRows: number;
  sourceSummary: ExternalIngressiSummary;
}

export async function getExternalCatalog(targetCompanyId?: number): Promise<ExternalTableCatalogItem[]> {
  const { data } = await client.get('/external-affluence/catalog', {
    params: targetCompanyId ? { target_company_id: targetCompanyId } : undefined,
  });
  return data.data.tables;
}

export async function getExternalOverview(targetCompanyId?: number): Promise<ExternalDbOverview> {
  const { data } = await client.get('/external-affluence/overview', {
    params: targetCompanyId ? { target_company_id: targetCompanyId } : undefined,
  });
  return data.data;
}

export async function listExternalDepositi(params?: {
  search?: string;
  limit?: number;
  targetCompanyId?: number;
}): Promise<ExternalDepositoRow[]> {
  const { data } = await client.get('/external-affluence/depositi', {
    params: {
      ...(params?.search ? { search: params.search } : {}),
      ...(params?.limit ? { limit: params.limit } : {}),
      ...(params?.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data.rows;
}

export async function listExternalMappings(targetCompanyId?: number): Promise<ExternalStoreMapping[]> {
  const { data } = await client.get('/external-affluence/mappings', {
    params: targetCompanyId ? { target_company_id: targetCompanyId } : undefined,
  });

  return data.data.mappings;
}

export async function upsertExternalMapping(
  storeId: number,
  payload: {
    externalStoreCode: string;
    notes?: string | null;
    targetCompanyId?: number;
  },
): Promise<ExternalStoreMapping> {
  const { data } = await client.put(`/external-affluence/mappings/${storeId}`, {
    external_store_code: payload.externalStoreCode,
    notes: payload.notes ?? null,
    ...(payload.targetCompanyId ? { target_company_id: payload.targetCompanyId } : {}),
  });

  return data.data.mapping;
}

export async function deleteExternalMapping(storeId: number, targetCompanyId?: number): Promise<void> {
  await client.delete(`/external-affluence/mappings/${storeId}`, {
    params: targetCompanyId ? { target_company_id: targetCompanyId } : undefined,
  });
}

export async function getExternalIngressi(params: {
  storeId?: number;
  externalStoreCode?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  targetCompanyId?: number;
}): Promise<ExternalIngressiResponse> {
  const { data } = await client.get('/external-affluence/ingressi', {
    params: {
      ...(params.storeId ? { store_id: params.storeId } : {}),
      ...(params.externalStoreCode ? { external_store_code: params.externalStoreCode } : {}),
      ...(params.fromDate ? { from_date: params.fromDate } : {}),
      ...(params.toDate ? { to_date: params.toDate } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data;
}

export async function getExternalAffluencePreview(params: {
  storeId: number;
  fromDate?: string;
  toDate?: string;
  targetCompanyId?: number;
}): Promise<ExternalAffluencePreviewResponse> {
  const { data } = await client.get('/external-affluence/affluence-preview', {
    params: {
      store_id: params.storeId,
      ...(params.fromDate ? { from_date: params.fromDate } : {}),
      ...(params.toDate ? { to_date: params.toDate } : {}),
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data;
}

export async function getExternalWeekAffluence(params: {
  storeId: number;
  week?: string;
  fromDate?: string;
  toDate?: string;
  targetCompanyId?: number;
}): Promise<ExternalAffluenceWeekResponse> {
  const { data } = await client.get('/external-affluence/week-affluence', {
    params: {
      store_id: params.storeId,
      ...(params.week ? { week: params.week } : {}),
      ...(params.fromDate ? { from_date: params.fromDate } : {}),
      ...(params.toDate ? { to_date: params.toDate } : {}),
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data;
}

export async function getExternalAffluenceConfiguration(params: {
  storeId: number;
  targetCompanyId?: number;
}): Promise<ExternalAffluenceConfigurationResponse> {
  const { data } = await client.get('/external-affluence/configuration', {
    params: {
      store_id: params.storeId,
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data;
}

export async function updateExternalAffluenceConfiguration(payload: {
  storeId: number;
  visitorsPerStaff?: number;
  lowMaxStaff?: number;
  mediumMaxStaff?: number;
  coverageTolerance?: number;
  slotWeights?: Array<{ timeSlot: string; weight: number }>;
  targetCompanyId?: number;
}): Promise<ExternalAffluenceConfigurationResponse> {
  await client.patch('/external-affluence/configuration', {
    store_id: payload.storeId,
    ...(payload.visitorsPerStaff != null ? { visitors_per_staff: payload.visitorsPerStaff } : {}),
    ...(payload.lowMaxStaff != null ? { low_max_staff: payload.lowMaxStaff } : {}),
    ...(payload.mediumMaxStaff != null ? { medium_max_staff: payload.mediumMaxStaff } : {}),
    ...(payload.coverageTolerance != null ? { coverage_tolerance: payload.coverageTolerance } : {}),
    ...(payload.slotWeights ? {
      slot_weights: payload.slotWeights.map((slot) => ({
        time_slot: slot.timeSlot,
        weight: slot.weight,
      })),
    } : {}),
    ...(payload.targetCompanyId ? { target_company_id: payload.targetCompanyId } : {}),
  });

  return getExternalAffluenceConfiguration({
    storeId: payload.storeId,
    ...(payload.targetCompanyId ? { targetCompanyId: payload.targetCompanyId } : {}),
  });
}

export async function getExternalTableData(params: {
  tableName: string;
  limit?: number;
  targetCompanyId?: number;
}): Promise<ExternalTableDataResponse> {
  const { data } = await client.get('/external-affluence/table-data', {
    params: {
      table_name: params.tableName,
      ...(params.limit ? { limit: params.limit } : {}),
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data;
}

export async function syncExternalAffluence(payload: {
  storeId: number;
  fromDate?: string;
  toDate?: string;
  overwriteDefault?: boolean;
  targetCompanyId?: number;
}): Promise<SyncExternalAffluenceResponse> {
  const { data } = await client.post('/external-affluence/sync-affluence', {
    store_id: payload.storeId,
    ...(payload.fromDate ? { from_date: payload.fromDate } : {}),
    ...(payload.toDate ? { to_date: payload.toDate } : {}),
    ...(typeof payload.overwriteDefault === 'boolean' ? { overwrite_default: payload.overwriteDefault } : {}),
    ...(payload.targetCompanyId ? { target_company_id: payload.targetCompanyId } : {}),
  });

  return data.data;
}

export interface ForecastSlot {
  timeSlot: string;
  slotWeight: number;
  estimatedVisitors: number;
  level: 'low' | 'medium' | 'high';
  requiredStaff: number;
  currentScheduledStaff: number;
  deltaToScheduledStaff: number;
  coverageStatus: 'under' | 'balanced' | 'over';
}

export interface ForecastDay {
  date: string;
  dayOfWeek: number;
  isOverridden: boolean;
  overriddenVisitors: number | null;
  overrideNote: string | null;
  estimatedDailyVisitors: number;
  effectiveDailyVisitors: number;
  slots: ForecastSlot[];
}

export interface ExternalAffluenceForecastResponse {
  storeId: number;
  companyId: number;
  fromDate: string;
  toDate: string;
  days: ForecastDay[];
  settings: ExternalAffluenceCalculationSettings;
}

export async function getExternalAffluenceForecast(params: {
  storeId: number;
  fromDate?: string;
  toDate?: string;
  targetCompanyId?: number;
}): Promise<ExternalAffluenceForecastResponse> {
  const { data } = await client.get('/external-affluence/forecast', {
    params: {
      store_id: params.storeId,
      ...(params.fromDate ? { from_date: params.fromDate } : {}),
      ...(params.toDate ? { to_date: params.toDate } : {}),
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });

  return data.data;
}

export async function upsertForecastOverride(payload: {
  storeId: number;
  date: string;
  visitorsOverride: number;
  note?: string | null;
  targetCompanyId?: number;
}): Promise<void> {
  await client.put('/external-affluence/forecast/override', {
    store_id: payload.storeId,
    date: payload.date,
    visitors_override: payload.visitorsOverride,
    note: payload.note ?? null,
    ...(payload.targetCompanyId ? { target_company_id: payload.targetCompanyId } : {}),
  });
}

export async function deleteForecastOverride(params: {
  storeId: number;
  date: string;
  targetCompanyId?: number;
}): Promise<void> {
  await client.delete('/external-affluence/forecast/override', {
    params: {
      store_id: params.storeId,
      date: params.date,
      ...(params.targetCompanyId ? { target_company_id: params.targetCompanyId } : {}),
    },
  });
}
