import apiClient from './client';

export interface DocumentCategory {
  id: number;
  companyId: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  /** How many documents currently sit in this category. */
  documentCount?: number;
}

export interface EmployeeDocument {
  id: number;
  companyId: number;
  employeeId: number;
  categoryId: number | null;
  fileName: string;
  mimeType: string | null;
  requiresSignature: boolean;
  signedAt: string | null;
  signedByUserId: number | null;
  expiresAt: string | null;
  isVisibleToRoles: string[];
  isDeleted: boolean;
  deletedAt: string | null;
  restoredAt: string | null;
  restoredBy: number | null;
  uploadedByUserId: number;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
  sourceTable?: 'documents' | 'employee_documents';
  employeeName?: string;
  employeeSurname?: string;
  title?: string;
}

export interface BulkUploadResult {
  uploadId: number;
  totalFiles: number;
  matchedFiles: number;
  unmatchedFiles: number;
  unmatchedFileNames: string[];
}

export async function getMyDocuments(): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get('/documents/my');
  return data.data as EmployeeDocument[];
}

export async function getCategories(includeInactive = false): Promise<DocumentCategory[]> {
  const { data } = await apiClient.get('/documents/categories', {
    params: includeInactive ? { includeInactive: true } : undefined,
  });
  return data.data as DocumentCategory[];
}

export async function createCategory(name: string, companyId: number): Promise<DocumentCategory> {
  const { data } = await apiClient.post('/documents/categories', { name, company_id: companyId });
  return data.data as DocumentCategory;
}

export async function updateCategory(id: number, payload: { name?: string; isActive?: boolean; companyId: number; currentCompanyId: number }): Promise<DocumentCategory> {
  const { data } = await apiClient.patch(`/documents/categories/${id}`, {
    name: payload.name,
    is_active: payload.isActive,
    company_id: payload.companyId,
    current_company_id: payload.currentCompanyId,
  });
  return data.data as DocumentCategory;
}

export async function deleteCategory(id: number, currentCompanyId?: number): Promise<void> {
  await apiClient.delete(`/documents/categories/${id}`, { 
    params: { current_company_id: currentCompanyId } 
  });
}

export async function getEmployeeDocuments(employeeId: number): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get(`/documents/employee/${employeeId}`);
  return data.data as EmployeeDocument[];
}

export async function uploadDocument(
  employeeId: number,
  file: File,
  options?: {
    categoryId?: number | null;
    requiresSignature?: boolean;
    expiresAt?: string | null;
    visibleToRoles?: string[];
  },
): Promise<{ id: number; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.categoryId != null) formData.append('category_id', String(options.categoryId));
  if (options?.requiresSignature) formData.append('requires_signature', 'true');
  if (options?.expiresAt) formData.append('expires_at', options.expiresAt);
  if (options?.visibleToRoles) formData.append('visible_to_roles', JSON.stringify(options.visibleToRoles));

  const { data } = await apiClient.post(`/documents/employee/${employeeId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data as { id: number; fileName: string };
}

export async function downloadDocument(id: number, fileName: string, source?: string): Promise<void> {
  const response = await apiClient.get(`/documents/${id}/download`, { 
    params: { source },
    responseType: 'blob' 
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function deleteDocument(id: number): Promise<void> {
  await apiClient.delete(`/documents/${id}`);
}

export async function getDeletedDocuments(employeeId?: number, tab?: 'my' | 'team'): Promise<EmployeeDocument[]> {
  const { data } = await apiClient.get('/documents/trash', {
    params: { employee_id: employeeId, tab }
  });
  return data.data as EmployeeDocument[];
}

export async function restoreDocument(id: number, source: 'documents' | 'employee_documents'): Promise<void> {
  await apiClient.post(`/documents/${source}/${id}/restore`);
}

export async function permanentlyDeleteDocument(id: number, source?: string): Promise<void> {
  await apiClient.delete(`/documents/${id}/permanent`, {
    params: { source }
  });
}

export async function updateDocumentVisibility(id: number, roles: string[]): Promise<void> {
  await apiClient.patch(`/documents/${id}/visibility`, { roles });
}

export async function signDocument(id: number, lang?: string, signedAt?: string, signedAtDisplay?: string): Promise<EmployeeDocument> {
  const { data } = await apiClient.post(`/documents/${id}/sign`, { signedAt, signedAtDisplay }, {
    headers: lang ? { 'x-lang': lang } : undefined
  });
  return data.data as EmployeeDocument;
}

export async function bulkUploadDocuments(file: File): Promise<BulkUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post('/documents/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data as BulkUploadResult;
}

export interface AutomationSetting {
  jobKey: string;
  enabled: boolean;
}

export async function getAutomationSettings(): Promise<AutomationSetting[]> {
  const { data } = await apiClient.get('/notifications/automation-settings');
  return data.data.settings as AutomationSetting[];
}

export async function updateAutomationSetting(jobKey: string, enabled: boolean): Promise<void> {
  await apiClient.patch(`/notifications/automation-settings/${jobKey}`, { enabled });
}

export interface NotificationSetting {
  id: number;
  companyId: number;
  eventKey: string;
  enabled: boolean;
  roles: string[];
  priority?: string;
  locale?: string;
  category?: string;
}

export async function getNotificationSettings(companyId?: number): Promise<NotificationSetting[]> {
  const params = companyId ? { company_id: companyId } : {};
  const { data } = await apiClient.get('/notifications/settings', { params });
  return data.data.settings as NotificationSetting[];
}

export async function updateNotificationSetting(eventKey: string, enabled: boolean, roles?: string[], companyId?: number): Promise<NotificationSetting> {
  const params = companyId ? { company_id: companyId } : {};
  const { data } = await apiClient.patch(`/notifications/settings/${eventKey}`, { enabled, roles }, { params });
  return data.data.setting as NotificationSetting;
}

// --- Step 1 & 2 Unified Upload ---

export async function uploadDocumentUnified(
  file: File,
  options?: {
    categoryId?: number | null;
    requiresSignature?: boolean;
    expiresAt?: string | null;
    visibleToRoles?: string[];
    employeeId?: number | null;
    companyId?: number | null;
    extractZip?: boolean;
    /** Receives 0-100 as the file is transferred, for the step 1 progress bar. */
    onProgress?: (percent: number) => void;
  }
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('extract_zip', options?.extractZip === false ? 'false' : 'true');
  if (options?.categoryId != null) formData.append('category_id', String(options.categoryId));
  if (options?.requiresSignature) formData.append('requires_signature', 'true');
  if (options?.expiresAt) formData.append('expires_at', options.expiresAt);
  if (options?.visibleToRoles) formData.append('visible_to_roles', JSON.stringify(options.visibleToRoles));
  if (options?.employeeId != null) formData.append('employee_id', String(options.employeeId));
  if (options?.companyId != null) formData.append('company_id', String(options.companyId));

  const { data } = await apiClient.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: options?.onProgress
      ? (event) => {
          // Without a known total we can still show motion, but not a real
          // percentage - cap at 99 so the bar only completes on the response.
          if (!event.total) return options.onProgress!(99);
          options.onProgress!(Math.min(99, Math.round((event.loaded * 100) / event.total)));
        }
      : undefined,
  });
  return data.data;
}


export interface MatchPreviewEntry {
  documentId: number | null;
  fileName: string;
  matched: boolean;
  outcome: 'assigned' | 'ambiguous' | 'unmatched';
  reason: string;
  employee: { id: number; name: string; surname: string; companyId: number | null } | null;
  suggestions: Array<{ id: number; name: string; surname: string; companyId: number | null; reason: string }>;
}

/**
 * Re-runs employee matching for files already uploaded, without changing
 * anything. Used when the operator switches company mid-wizard, since company
 * is a hard gate on auto-assignment.
 */
export async function previewDocumentMatches(
  files: Array<{ documentId?: number; fileName: string }>,
  companyId: number | null
): Promise<MatchPreviewEntry[]> {
  const { data } = await apiClient.post('/documents/match-preview', { files, company_id: companyId });
  return data.data.files as MatchPreviewEntry[];
}

export interface DocumentUpdatePayload {
  title: string;
  /** Category name; must exist and be active for the target company. */
  category?: string | null;
  employee_id: number | null;
  requires_signature?: boolean;
  expires_at?: string | null;
  visible_to_roles?: string[];
  company_id?: number | null;
  confirm?: boolean;
  notify?: boolean;
}

export async function updateDocumentGeneric(id: number, payload: DocumentUpdatePayload): Promise<void> {
  await apiClient.put(`/documents/${id}`, payload);
}

export async function getDocumentsGeneric(tab?: 'my' | 'team'): Promise<any[]> {
  const { data } = await apiClient.get('/documents', { params: { tab } });
  return data.data;
}

export async function downloadDocumentGeneric(id: number, filename: string, source?: string): Promise<void> {
  const response = await apiClient.get(`/documents/${id}/download`, {
    params: { source },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function getDocumentPreviewUrlGeneric(id: number, mimeType: string, source?: string): Promise<string> {
  const response = await apiClient.get(`/documents/${id}/download`, {
    params: { source },
    responseType: 'blob',
  });
  return window.URL.createObjectURL(new Blob([response.data], { type: mimeType }));
}

export async function cleanupDraftDocuments(documentIds: number[]): Promise<void> {
  if (!documentIds || documentIds.length === 0) return;
  try {
    await apiClient.post('/documents/cleanup-drafts', { documentIds });
  } catch {
    /* ignore */
  }
}
