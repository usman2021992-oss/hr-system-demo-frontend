import apiClient from './client';

export interface Notification {
  id: number;
  companyId: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  /** Locale in which title/message were stored (e.g. 'it', 'en'). */
  locale?: string;
  /** Category/module this notification belongs to */
  category?: string;
  /** Recipient details populated for company-scope feeds. */
  recipientName?: string | null;
  recipientSurname?: string | null;
  recipientRole?: string | null;
  recipientAvatarFilename?: string | null;
  /** Additional data for deep linking (e.g. candidateId, interviewId, feedbackId) */
  metadata?: Record<string, any>;
}

export interface NotificationsPage {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
  scope?: 'mine' | 'company';
}

export async function getNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  scope?: 'mine' | 'company';
}): Promise<NotificationsPage> {
  const { unreadOnly, limit, offset, scope } = params ?? {};
  const { data } = await apiClient.get('/notifications', {
    params: {
      unread_only: unreadOnly,
      limit,
      offset,
      scope,
    },
  });
  return data.data as NotificationsPage;
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await apiClient.get('/notifications/unread-count');
  return data.data.count as number;
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data } = await apiClient.patch('/notifications/read-all');
  return data.data.count as number;
}

/**
 * Persists the user's chosen locale to the database.
 * Called whenever the language switcher changes the active language.
 * This ensures background jobs (cron-based notifications) use the correct language.
 */
export async function updateUserLocale(locale: 'it' | 'en'): Promise<void> {
  await apiClient.patch('/auth/locale', { locale });
}

export interface RecentRecipient {
  userId: number;
  name: string;
  surname: string;
  avatarFilename: string | null;
}

/**
 * Fetches recent users (last 24 hours) who received notifications for a specific event type.
 * Used to display avatars in the settings modal.
 */
export async function getRecentRecipients(eventKey: string, companyId?: number): Promise<RecentRecipient[]> {
  const params = companyId ? { company_id: companyId } : {};
  const { data } = await apiClient.get(`/notifications/settings/${eventKey}/recipients`, { params });
  return data.data.recipients as RecentRecipient[];
}

/**
 * Updates the roles and priority for a specific notification event type.
 */
export async function updateNotificationRoles(
  eventKey: string, 
  roles: string[], 
  priority?: string,
  companyId?: number
): Promise<void> {
  const params = companyId ? { company_id: companyId } : {};
  await apiClient.patch(`/notifications/settings/${eventKey}`, { roles, priority }, { params });
}

/**
 * Deletes multiple notifications by their IDs.
 * Only deletes notifications that belong to the authenticated user.
 */
export async function bulkDeleteNotifications(ids: number[]): Promise<number> {
  const { data } = await apiClient.delete('/notifications/bulk-delete', { data: { ids } });
  return data.data.deletedCount as number;
}
