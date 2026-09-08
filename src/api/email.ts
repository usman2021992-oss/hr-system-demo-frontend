import apiClient from './client';

export interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
}

export interface EmailConfigResponse {
  superAdmin: boolean;
  company?: {
    id: number;
    name: string;
  };
  config?: SmtpConfig;
}

export async function getEmailConfig(companyId?: number): Promise<EmailConfigResponse> {
  const params: Record<string, any> = {};
  if (companyId) params.company_id = companyId;
  const res = await apiClient.get('/email/config', { params });
  return res.data.data;
}

export async function saveEmailConfig(config: SmtpConfig, companyId?: number): Promise<void> {
  const payload = companyId ? { ...config, companyId } : config;
  await apiClient.put('/email/config', payload);
}

export async function verifyEmailConfig(companyId?: number): Promise<boolean> {
  const payload = companyId ? { companyId } : {};
  const res = await apiClient.post('/email/verify', payload);
  return res.data.data.success;
}


// ---------------------------------------------------------------------------
// Platform mailbox
//
// Separate from the per-company config above. A company's SMTP sends that
// company's own mail; this one sends the platform's - billing warnings to a
// customer's account owner, and the operator copy. Super admin only.
// ---------------------------------------------------------------------------

export interface PlatformSmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  /** Comma-separated addresses copied on every failed payment. */
  billingAlertEmail: string;
  /** The password is never sent to the browser; this says whether one exists. */
  hasPassword: boolean;
  /** Host, user and password all present - enough to attempt a send. */
  configured: boolean;
  /** Set by Verify, so "filled in" and "proved to work" stay distinguishable. */
  verifiedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
  hasAlertEmail: boolean;
}

export interface PlatformSmtpInput {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  /** Empty means "keep the stored password". */
  smtpPass: string;
  smtpFrom: string;
  billingAlertEmail: string;
}

export async function getPlatformEmailConfig(): Promise<PlatformSmtpConfig> {
  const res = await apiClient.get('/email/platform-config');
  return res.data.data;
}

export async function savePlatformEmailConfig(
  config: PlatformSmtpInput
): Promise<PlatformSmtpConfig> {
  const res = await apiClient.put('/email/platform-config', config);
  return res.data.data;
}

export async function verifyPlatformEmailConfig(): Promise<{
  ok: boolean;
  error: string | null;
  config: PlatformSmtpConfig;
}> {
  const res = await apiClient.post('/email/platform-verify', {});
  return res.data.data;
}

export async function sendPlatformTestEmail(to: string): Promise<{
  sent: boolean;
  status: string;
  transport: string;
  error: string | null;
}> {
  const res = await apiClient.post('/email/platform-test', { to });
  return res.data.data;
}
