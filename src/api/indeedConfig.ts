import apiClient from './client';

export interface IndeedConfigStatus {
  company?: { id: number; name: string };
  encryptionAvailable?: boolean;
  apiTokenConfigured: boolean;
  apiTokenMask: string | null;
  apiTokenSource: 'company' | 'environment' | 'none';
  secretConfigured: boolean;
  secretMask: string | null;
  secretSource: 'company' | 'environment' | 'none';
}

export async function getIndeedConfig(companyId?: number): Promise<IndeedConfigStatus> {
  const { data } = await apiClient.get('/integrations/indeed/config', {
    params: companyId ? { company_id: companyId } : undefined,
  });
  return data.data as IndeedConfigStatus;
}

export async function saveIndeedConfig(
  payload: { apiToken?: string; secret?: string; companyId?: number },
): Promise<IndeedConfigStatus> {
  const { data } = await apiClient.put('/integrations/indeed/config', payload);
  return data.data as IndeedConfigStatus;
}

export async function clearIndeedConfig(companyId?: number): Promise<IndeedConfigStatus> {
  const { data } = await apiClient.delete('/integrations/indeed/config', {
    params: companyId ? { company_id: companyId } : undefined,
  });
  return data.data as IndeedConfigStatus;
}
