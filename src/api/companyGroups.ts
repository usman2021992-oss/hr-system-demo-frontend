import apiClient from './client';

export interface CompanyGroup {
  id: number;
  name: string;
  companies?: { id: number; name: string }[];
}

export interface GroupVisibilityCompany {
  id: number;
  name: string;
  isActive: boolean;
  hasActiveHr: boolean;
  hasActiveAreaManager: boolean;
}

export interface GroupRoleVisibility {
  hr: boolean;
  areaManager: boolean;
  companies?: GroupVisibilityCompany[];
}

export async function getCompanyGroups(): Promise<CompanyGroup[]> {
  const { data } = await apiClient.get('/company-groups');
  return data.data;
}

export async function createCompanyGroup(payload: { name: string }): Promise<CompanyGroup> {
  const { data } = await apiClient.post('/company-groups', payload);
  return data.data;
}

export async function getGroupRoleVisibility(groupId: number): Promise<GroupRoleVisibility> {
  const { data } = await apiClient.get(`/company-groups/${groupId}/role-visibility`);
  return data.data;
}

export async function updateGroupRoleVisibility(
  groupId: number,
  payload: { hr: boolean; areaManager: boolean }
): Promise<void> {
  await apiClient.put(`/company-groups/${groupId}/role-visibility`, payload);
}

export async function updateCompanyGroup(groupId: number, payload: { name: string }): Promise<CompanyGroup> {
  const { data } = await apiClient.put(`/company-groups/${groupId}`, payload);
  return data.data;
}

export async function deleteCompanyGroup(groupId: number): Promise<void> {
  await apiClient.delete(`/company-groups/${groupId}`);
}

