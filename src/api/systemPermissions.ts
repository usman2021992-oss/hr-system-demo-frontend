import apiClient from './client';

export interface CompanyGrid {
  // Axios client camelizes response keys from backend:
  // - area_manager -> areaManager
  // - store_manager -> storeManager
  // - store_terminal -> storeTerminal
  turni: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  permessi: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  presenze: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  saldi: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  anomalie: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  negozi: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  dipendenti: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  trasferimenti: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  messaggi: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  impostazioni: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  gestione_accessi?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  terminali?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  documenti?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  team_documents?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  ats?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  onboarding?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  notifiche?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  automazioni?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
  report?: { admin: boolean; hr: boolean; areaManager: boolean; storeManager: boolean; employee: boolean; storeTerminal: boolean };
}

export interface CompanyPermissions {
  id: number;
  name: string;
  grid: CompanyGrid;
}

export async function getCompaniesPermissions(): Promise<{ companies: CompanyPermissions[] }> {
  const { data } = await apiClient.get('/permissions/companies');
  return data.data;
}

export interface SystemPermissionUpdate {
  role: 'admin' | 'hr' | 'area_manager' | 'store_manager' | 'employee' | 'store_terminal';
  module:
    | 'turni'
    | 'permessi'
    | 'presenze'
    | 'anomalie'
    | 'saldi'
    | 'negozi'
    | 'dipendenti'
    | 'trasferimenti'
    | 'messaggi'
    | 'impostazioni'
    | 'gestione_accessi'
    | 'terminali'
    | 'documenti'
    | 'team_documents'
    | 'ats'
    | 'onboarding'
    | 'notifiche'
    | 'automazioni'
    | 'report';
  enabled: boolean;
}

export async function updateCompanyPermissions(
  companyId: number,
  updates: SystemPermissionUpdate[]
): Promise<void> {
  await apiClient.put(`/permissions/companies/${companyId}`, { updates });
}
