import apiClient from './client';
import { Company } from '../types';

export interface CompanyProfilePayload {
  registrationNumber?: string | null;
  vatNumber?: string | null;
  sdiRecipientCode?: string | null;
  pecEmail?: string | null;
  companyEmail?: string | null;
  companyPhoneNumbers?: string | null;
  officesLocations?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  currency?: string | null;
  pricePerEmployee?: number | null;
  pricePerDevice?: number | null;
  extraStoragePricePerGb?: number | null;
  storageLimitGb?: number | null;
  accessValidFrom?: string | null;
  accessValidTo?: string | null;
  discountPercent?: number | null;
  discountValidFrom?: string | null;
  discountValidTo?: string | null;
  billReminderDaysBefore?: number | null;
  gracePeriodDays?: number | null;
}

export async function getCompanies(): Promise<Company[]> {
  const { data } = await apiClient.get('/companies');
  return data.data;
}

export async function getCompanyById(id: number): Promise<Company> {
  const { data } = await apiClient.get(`/companies/${id}`);
  return data.data;
}

export async function updateCompany(id: number, payload: { name: string; groupId?: number | null } & CompanyProfilePayload): Promise<Company> {
  const { data } = await apiClient.put(`/companies/${id}`, payload);
  return data.data;
}

export async function createCompany(payload: { name: string; groupId?: number | null; ownerUserId?: number | null } & CompanyProfilePayload): Promise<Company> {
  const { data } = await apiClient.post('/companies', payload);
  return data.data;
}

export async function deactivateCompany(id: number): Promise<Company> {
  const { data } = await apiClient.patch(`/companies/${id}/deactivate`);
  return data.data;
}

export async function activateCompany(id: number): Promise<Company> {
  const { data } = await apiClient.patch(`/companies/${id}/activate`);
  return data.data;
}

export async function deleteCompanyPermanent(id: number): Promise<{ id: number }> {
  const { data } = await apiClient.delete(`/companies/${id}`);
  return data.data;
}

export async function uploadCompanyLogo(id: number, file: File): Promise<{ logoUrl: string }> {
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await apiClient.post(`/companies/${id}/logo`, formData);
  return data.data;
}

export async function deleteCompanyLogo(id: number): Promise<void> {
  await apiClient.delete(`/companies/${id}/logo`);
}

export async function uploadCompanyBanner(id: number, file: File): Promise<{ bannerUrl: string }> {
  const formData = new FormData();
  formData.append('banner', file);
  const { data } = await apiClient.post(`/companies/${id}/banner`, formData);
  return data.data;
}

export async function deleteCompanyBanner(id: number): Promise<void> {
  await apiClient.delete(`/companies/${id}/banner`);
}

export async function transferCompanyOwnership(id: number, ownerUserId: number): Promise<Company> {
  const { data } = await apiClient.patch(`/companies/${id}/owner`, { ownerUserId });
  return data.data;
}
