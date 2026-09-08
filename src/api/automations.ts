import api from './client';

export interface AutomationSettingPayload {
  isEnabled?: boolean;
  recipientRoles?: string[];
  companyId?: number;
}

export const automationsApi = {
  getAutomations: async (companyId?: number) => {
    const response = await api.get('/automations', { params: { companyId } });
    return response.data.data;
  },

  updateAutomation: async (id: string, payload: AutomationSettingPayload) => {
    const response = await api.put(`/automations/${id}`, payload);
    return response.data.data;
  },
};
