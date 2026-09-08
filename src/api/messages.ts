import apiClient from './client';
import { Message } from '../types';

export async function getMessages(companyId?: number | null): Promise<Message[]> {
  const { data } = await apiClient.get('/messages', {
    params: companyId != null ? { company_id: companyId } : undefined,
  });
  return data.data;
}

export async function getUnreadCount(companyId?: number | null): Promise<number> {
  const { data } = await apiClient.get('/messages/unread-count', {
    params: companyId != null ? { company_id: companyId } : undefined,
  });
  return data.data.unreadCount;
}

export interface SendMessagePayload {
  recipientId: number;
  subject?: string;
  body?: string;
  companyId?: number | null;
  attachmentFilename?: string | null;
}

export async function sendMessage(payload: SendMessagePayload): Promise<Message> {
  const { data } = await apiClient.post('/messages', {
    recipientId: payload.recipientId,
    subject: payload.subject,
    body: payload.body,
    companyId: payload.companyId,
    attachmentFilename: payload.attachmentFilename,
  });
  return data.data;
}

export async function markMessageAsRead(id: number, companyId?: number | null): Promise<Message> {
  const { data } = await apiClient.patch(`/messages/${id}/read`, companyId != null ? { company_id: companyId } : undefined);
  return data.data;
}

export async function editMessage(id: number, body: string, companyId?: number | null, subject?: string, attachmentFilename?: string): Promise<Message> {
  const { data } = await apiClient.patch(`/messages/${id}`, { body, subject, attachmentFilename }, {
    params: companyId != null ? { company_id: companyId } : undefined,
  });
  return data.data;
}

export async function deleteMessage(id: number, companyId?: number | null): Promise<{ id: number }> {
  const { data } = await apiClient.delete(`/messages/${id}`, {
    params: companyId != null ? { company_id: companyId } : undefined,
  });
  return data.data;
}

export interface HrRecipient {
  recipientId: number;
  recipientName: string;
}

export async function getHrRecipient(companyId?: number | null): Promise<HrRecipient> {
  const { data } = await apiClient.get('/messages/hr', {
    params: companyId != null ? { company_id: companyId } : undefined,
  });
  return data.data;
}
