import apiClient from './client';
import { getStoredRefreshToken } from './session';
import { User, PermissionMap } from '../types';

export interface LoginResponse {
  token: string;
  /** Renews the session once `token` expires (see api/session.ts). */
  refreshToken?: string;
  user: User & { companyId: number; storeId: number | null; supervisorId: number | null };
}

export async function login(email: string, password: string, rememberMe = false): Promise<LoginResponse> {
  const { data } = await apiClient.post('/auth/login', { email, password, rememberMe });
  return data.data;
}

export async function logout(refreshToken?: string | null): Promise<void> {
  await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {});
}

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get('/auth/me');
  return data.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ token: string }> {
  // Our own refresh token is spared when the server ends the other sessions.
  const refreshToken = getStoredRefreshToken() ?? undefined;
  const { data } = await apiClient.put('/auth/password', { currentPassword, newPassword, refreshToken });
  return data.data;
}

export async function getMyPermissions(): Promise<PermissionMap> {
  const { data } = await apiClient.get('/permissions/my');
  return data.data;
}
