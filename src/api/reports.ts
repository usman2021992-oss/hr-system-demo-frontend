import apiClient from './client';

export type ReportCadence = 'daily' | 'weekly' | 'monthly';
export type OwnerRole = 'admin' | 'hr';

export interface ReportConfigData {
  reportId: string;
  day: number;
  time: string;
  recipients: string[];
  sections: string[];
  status: string;
  runCount?: number;
  lastGenerated?: string | null;
  thresholds?: Record<string, number>;
  maxPages?: number;
  maxRowsPerSection?: number;
  retentionCount?: number;
  ownerUserId?: number | null;
  storeId?: number | null;
}

/** One dashboard row: the Admin (company scope) or an HR user (store scope). */
export interface ReportOwner {
  userId: number;
  name: string;
  role: OwnerRole;
  avatarFilename: string | null;
  storeId: number | null;
  /** Company name for the Admin; store name for an HR user. */
  scopeLabel: string;
  reports: { reportId: string; cadence: ReportCadence; defaultStatus: string }[];
}

/** The headline numbers this report will lead with. */
export interface ReportPreview {
  reportId: string;
  periodStart: string;
  periodEnd: string;
  maxRowsPerSection: number;
  highlights: {
    scheduledShifts: number;
    completedShifts: number;
    completionRate: number;
    anomalies: number;
    previousAnomalies: number;
    pendingLeave: number;
    headcount: number;
  };
}

export interface ReportHistoryItem {
  id: number;
  reportId: string;
  generatedAt: string;
  sizeBytes: number;
  sections: string[];
  targetDate: string;
}

export interface ReportHistoryPage {
  items: ReportHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SaveReportConfigInput {
  day?: number;
  time?: string;
  recipients?: string[];
  sections?: string[];
  status?: string;
  thresholds?: Record<string, number>;
  maxRowsPerSection?: number;
  retentionCount?: number;
  ownerUserId?: number | null;
  storeId?: number | null;
}

function companyParams(companyId?: number) {
  return companyId ? { company_id: companyId } : undefined;
}

/** The dashboard rows: Admin first, then one HR row per store. */
export async function getReportOwners(companyId?: number): Promise<ReportOwner[]> {
  const { data } = await apiClient.get('/reports/owners', { params: companyParams(companyId) });
  return data.data;
}

export async function getReportConfigurations(companyId?: number): Promise<ReportConfigData[]> {
  const { data } = await apiClient.get('/reports/configurations', { params: companyParams(companyId) });
  return data.data;
}

export async function saveReportConfiguration(
  reportId: string,
  config: SaveReportConfigInput,
  companyId?: number
): Promise<ReportConfigData> {
  const { data } = await apiClient.put(
    `/reports/configurations/${reportId}`,
    { ...config, company_id: companyId },
    { params: companyParams(companyId) }
  );
  return data.data;
}

/** Shows the reader, inside the Configure modal, what this report will actually say. */
export async function getReportPreview(reportId: string, companyId?: number, ownerUserId?: number): Promise<ReportPreview> {
  const { data } = await apiClient.get(`/reports/configurations/${reportId}/preview`, {
    params: { ...companyParams(companyId), owner_user_id: ownerUserId },
  });
  return data.data;
}

export async function downloadLastReport(reportId: string, companyId?: number, ownerUserId?: number): Promise<Blob> {
  const { data } = await apiClient.get(`/reports/configurations/${reportId}/download-last`, {
    params: { ...companyParams(companyId), owner_user_id: ownerUserId },
    responseType: 'blob',
  });
  return data;
}

export async function sendReportNow(reportId: string, companyId?: number, ownerUserId?: number): Promise<{ sentTo: string[] }> {
  const { data } = await apiClient.post(
    `/reports/configurations/${reportId}/send-now`,
    { company_id: companyId, owner_user_id: ownerUserId },
    { params: companyParams(companyId) }
  );
  return data.data;
}

export async function getReportHistory(
  companyId?: number,
  opts: { limit?: number; offset?: number } = {}
): Promise<ReportHistoryPage> {
  const { data } = await apiClient.get('/reports/history', {
    params: { ...companyParams(companyId), limit: opts.limit ?? 8, offset: opts.offset ?? 0 },
  });
  return data.data;
}

export async function downloadArchivedReport(id: number, companyId?: number): Promise<Blob> {
  const { data } = await apiClient.get(`/reports/history/${id}/download`, {
    params: companyParams(companyId),
    responseType: 'blob',
  });
  return data;
}

export async function deleteArchivedReport(id: number, companyId?: number): Promise<void> {
  await apiClient.delete(`/reports/history/${id}`, { params: companyParams(companyId) });
}

export async function purgeReportHistory(olderThanDays: number, companyId?: number): Promise<{ deleted: number }> {
  const { data } = await apiClient.delete('/reports/history', {
    params: { ...companyParams(companyId), olderThanDays },
  });
  return data.data;
}
