import apiClient from './client';
import { Store, StoreOperatingHour } from '../types';

export async function getStores(params?: { targetCompanyId?: number }): Promise<Store[]> {
  const { data } = await apiClient.get('/stores', {
    params: params?.targetCompanyId ? { target_company_id: params.targetCompanyId } : undefined,
  });
  return data.data;
}

export async function getStore(id: number): Promise<Store> {
  const { data } = await apiClient.get(`/stores/${id}`);
  return data.data;
}

export async function createStore(payload: Partial<Store> & { terminal?: { email: string; password?: string } }): Promise<Store> {
  const { data } = await apiClient.post('/stores', payload);
  return data.data;
}

export async function updateStore(id: number, payload: Partial<Store>): Promise<Store> {
  const { data } = await apiClient.put(`/stores/${id}`, payload);
  return data.data;
}

export async function deactivateStore(id: number): Promise<Store> {
  const { data } = await apiClient.delete(`/stores/${id}`);
  return data.data;
}

export async function activateStore(id: number): Promise<Store> {
  const { data } = await apiClient.patch(`/stores/${id}/activate`);
  return data.data;
}

export async function deleteStorePermanent(id: number): Promise<void> {
  await apiClient.delete(`/stores/${id}/permanent`);
}

export async function uploadStoreLogo(id: number, file: File): Promise<{ logoUrl: string }> {
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await apiClient.post(`/stores/${id}/logo`, formData);
  return data.data;
}

export async function deleteStoreLogo(id: number): Promise<void> {
  await apiClient.delete(`/stores/${id}/logo`);
}

export async function getStoreOperatingHours(id: number): Promise<StoreOperatingHour[]> {
  const { data } = await apiClient.get(`/stores/${id}/operating-hours`);
  return data.data.hours;
}

export async function updateStoreOperatingHours(id: number, hours: StoreOperatingHour[]): Promise<StoreOperatingHour[]> {
  const { data } = await apiClient.put(`/stores/${id}/operating-hours`, { hours });
  return data.data.hours;
}
