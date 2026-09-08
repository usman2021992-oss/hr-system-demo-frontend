import apiClient from './client';
import { Employee, EmployeeAssociationsResponse, EmployeeListResponse } from '../types';

export interface EmployeeListParams {
  search?: string;
  storeId?: number;
  department?: string;
  status?: string;
  role?: string;
  page?: number;
  limit?: number;
  targetCompanyId?: number | null;
  excludeAdmins?: boolean;
  includeStoreTerminals?: boolean;
  /** Area managers: employees in supervised stores (aligned with shift assignment). */
  forShiftPlanning?: boolean;
  includeSensitive?: boolean;
}

// ── API functions ─────────────────────────────────────────────────────────────
// Note: client.ts has global camelizeKeys/snakeKeys interceptors — no manual
// field mapping is needed here.

export async function getEmployees(params?: EmployeeListParams): Promise<EmployeeListResponse> {
  const query: Record<string, string | number> = {};
  if (params?.search) query.search = params.search;
  if (params?.storeId != null) query.store_id = params.storeId;
  if (params?.department) query.department = params.department;
  if (params?.status) query.status = params.status;
  if (params?.role) query.role = params.role;
  if (params?.page != null) query.page = params.page;
  if (params?.limit != null) query.limit = params.limit;
  if (params?.targetCompanyId != null) query.target_company_id = params.targetCompanyId;
  if (params?.excludeAdmins) query.exclude_admins = 1;
  if (params?.includeStoreTerminals) query.include_store_terminals = 1;
  if (params?.forShiftPlanning) query.for_shift_planning = 1;
  if (params?.includeSensitive) query.include_sensitive = 1;
  const { data } = await apiClient.get('/employees', { params: query });
  return data.data;
}

export async function getEmployee(id: number): Promise<Employee> {
  const { data } = await apiClient.get(`/employees/${id}`);
  return data.data;
}

export async function getEmployeeAssociations(id: number): Promise<EmployeeAssociationsResponse> {
  const { data } = await apiClient.get(`/employees/${id}/associations`);
  return data.data;
}

export async function createEmployee(payload: Partial<Employee> & { email: string; name: string; surname: string; role: string; password?: string }): Promise<Employee> {
  const { data } = await apiClient.post('/employees', payload);
  return data.data;
}

export async function updateEmployee(id: number, payload: Partial<Employee> & { password?: string }): Promise<Employee> {
  const { data } = await apiClient.put(`/employees/${id}`, payload);
  return data.data;
}

export async function deactivateEmployee(id: number): Promise<Employee> {
  const { data } = await apiClient.delete(`/employees/${id}`);
  return data.data;
}

export async function deleteEmployeePermanently(id: number): Promise<{ id: number }> {
  const { data } = await apiClient.delete(`/employees/${id}/permanent`);
  return data.data;
}

export async function activateEmployee(id: number): Promise<Employee> {
  const { data } = await apiClient.patch(`/employees/${id}/activate`);
  return data.data;
}

export async function resetEmployeeDevice(id: number): Promise<Employee> {
  const { data } = await apiClient.patch(`/employees/${id}/device-reset`);
  return data.data;
}

export async function uploadEmployeeAvatar(id: number, file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append('avatar', file);
  const { data } = await apiClient.post(`/employees/${id}/avatar`, formData);
  return data.data;
}

export async function deleteEmployeeAvatar(id: number): Promise<void> {
  await apiClient.delete(`/employees/${id}/avatar`);
}

export interface ImportTemplate {
  id: number;
  companyId: number;
  name: string;
  mappingJson: Record<string, string>;
  createdAt: string;
}

export async function getImportTemplates(): Promise<ImportTemplate[]> {
  const { data } = await apiClient.get('/employees/import-templates');
  return data.data;
}

export async function saveImportTemplate(name: string, mappingJson: Record<string, string>): Promise<ImportTemplate> {
  const { data } = await apiClient.post('/employees/import-templates', { name, mappingJson });
  return data.data;
}

export async function deleteImportTemplate(id: number): Promise<void> {
  await apiClient.delete(`/employees/import-templates/${id}`);
}

/* ── Bulk import ─────────────────────────────────────────────────────────── */

export interface ImportPrecheck {
  /** Every work email already in the tenant, lowercased. */
  emails: string[];
  stores: Array<{ id: number; name: string; companyId: number; maxStaff: number; activeCount: number }>;
}

export interface BulkImportFailure {
  rowIndex: number;
  code: string;
  detail?: string;
}

export interface BulkImportResponse {
  created: Array<{ rowIndex: number; id: number; email: string; uniqueId: string }>;
  createdCount: number;
  failures: BulkImportFailure[];
  warnings: BulkImportFailure[];
}

/**
 * Reference data for validating a file before anything is written. Fetched from
 * a dedicated endpoint rather than the paginated employee list, which is capped
 * and would miss duplicates in a large tenant.
 */
export async function getImportPrecheck(): Promise<ImportPrecheck> {
  const { data } = await apiClient.get('/employees/import-precheck');
  return data.data;
}

/**
 * Creates every supplied row inside one server-side transaction: either all of
 * them land or none do, so a failure never leaves a half-imported file behind.
 */
export async function bulkImportEmployees(
  rows: Array<Record<string, unknown>>,
): Promise<BulkImportResponse> {
  const { data } = await apiClient.post('/employees/bulk-import', { rows });
  return data.data;
}

