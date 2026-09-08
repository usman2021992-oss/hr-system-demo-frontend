import apiClient from './client';
import {
  BillingOverview,
  BillingTransaction,
  LicenseQuote,
  LicenseSnapshot,
  PaymentProvider,
  SuperAdminBillingCompanyRow,
  BillingTaxRate,
  BillingTestNoticeResult,
  NoticeRecipients,
  StripeTaxRateOption,
} from '../types';

export type { NoticeRecipients };

export const billingApi = {
  /**
   * Initiates hosted Stripe or PayPal checkout session
   */
  createCheckoutSession: async (
    provider: PaymentProvider,
    companyId?: number,
    licenses?: { employeeLicenses: number; terminalLicenses: number }
  ): Promise<{ checkoutUrl: string; billingAttemptId: number }> => {
    const { data } = await apiClient.post('/billing/checkout', {
      provider,
      companyId,
      ...(licenses || {}),
    });
    return data;
  },

  /**
   * Retrieves company subscription overview, live usage, and pricing
   */
  getBillingOverview: async (companyId?: number): Promise<BillingOverview> => {
    const params = companyId ? { companyId } : {};
    const { data } = await apiClient.get('/billing/overview', { params });
    return data;
  },

  /**
   * Retrieves paginated payment transactions history
   */
  getTransactions: async (
    page = 1,
    limit = 20,
    companyId?: number
  ): Promise<{
    data: BillingTransaction[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> => {
    const params: Record<string, any> = { page, limit };
    if (companyId) params.companyId = companyId;
    const { data } = await apiClient.get('/billing/transactions', { params });
    return data;
  },

  /**
   * Cancels subscription at the end of current billing period
   */
  cancelSubscription: async (companyId?: number): Promise<{ success: boolean }> => {
    const { data } = await apiClient.post('/billing/cancel', { companyId });
    return data;
  },

  /**
   * Reactivates a pending cancelled subscription
   */
  reactivateSubscription: async (companyId?: number): Promise<{ success: boolean }> => {
    const { data } = await apiClient.post('/billing/reactivate', { companyId });
    return data;
  },

  /**
   * Manually syncs live active employee and terminal quantities with gateway
   */
  /**
   * Current allowance, usage and any change in flight.
   */
  getLicenses: async (companyId?: number): Promise<LicenseSnapshot> => {
    const params = companyId ? { companyId } : {};
    const { data } = await apiClient.get('/billing/licenses', { params });
    return data;
  },

  /**
   * What a proposed license change would cost. No side effects.
   */
  quoteLicenses: async (
    employeeLicenses: number,
    terminalLicenses: number,
    companyId?: number
  ): Promise<LicenseQuote> => {
    const { data } = await apiClient.post('/billing/licenses/quote', {
      employeeLicenses,
      terminalLicenses,
      companyId,
    });
    return data;
  },

  /**
   * Buys more licenses (charged now, prorated) or schedules a reduction.
   * An increase is granted only once the provider confirms payment.
   */
  changeLicenses: async (
    employeeLicenses: number,
    terminalLicenses: number,
    companyId?: number
  ): Promise<{
    status: 'applied' | 'awaiting_payment' | 'scheduled';
    applied: boolean;
    amountDueNow: number;
    /** Tax on the prorated charge, and the gross actually collected. */
    taxPercent?: number;
    taxDueNow?: number;
    totalDueNow?: number;
    additionalMonthly?: number;
    newMonthlyTotal?: number;
    newMonthlyTotalWithTax?: number;
    currency: string;
    extraEmployees?: number;
    extraTerminals?: number;
    newEmployees: number;
    newTerminals: number;
    effectiveAt?: string;
    approveUrl?: string;
    deferredReason?: 'PAYPAL_NO_MIDCYCLE_CHARGE';
  }> => {
    const { data } = await apiClient.post('/billing/licenses', {
      employeeLicenses,
      terminalLicenses,
      companyId,
    });
    return data;
  },

  /**
   * Asks the provider what happened to an upgrade still shown as pending and
   * settles it. The way out when the UI says "awaiting confirmation".
   */
  verifyPendingUpgrade: async (
    companyId?: number
  ): Promise<{
    changed: boolean;
    outcome: 'paid' | 'failed' | 'pending' | 'none';
    licenses: LicenseSnapshot;
  }> => {
    const { data } = await apiClient.post('/billing/licenses/verify', { companyId });
    return data;
  },

  /**
   * Hosted page for replacing the card on an active subscription.
   */
  updatePaymentMethod: async (companyId?: number): Promise<{ url: string }> => {
    const { data } = await apiClient.post('/billing/payment-method', { companyId });
    return data;
  },

  /**
   * Lightweight restriction check used by the app shell.
   */
  getStatus: async (): Promise<{
    isBlocked: boolean;
    restricted: boolean;
    reason?: string | null;
    gracePeriodEndsAt?: string | null;
  }> => {
    const { data } = await apiClient.get('/billing/status');
    return data;
  },

  /**
   * The audit trail behind the licensed quantities.
   */
  getHeadcountHistory: async (
    companyId?: number,
    limit = 100
  ): Promise<{
    events: Array<{
      id: number;
      resourceType: 'employee' | 'terminal';
      changeType: 'added' | 'removed';
      delta: number;
      resultingCount: number;
      userLabel: string | null;
      /** Employee photo, read live so a changed photo shows everywhere. */
      avatarFilename: string | null;
      /** For a terminal, the logo and name of the store it belongs to. */
      storeLogoFilename: string | null;
      storeName: string | null;
      billedAt: string | null;
      occurredAt: string;
    }>;
    totals: { employeeCount: number; deviceCount: number };
  }> => {
    const params: Record<string, any> = { limit };
    if (companyId) params.companyId = companyId;
    const { data } = await apiClient.get('/billing/headcount-history', { params });
    return data;
  },

  /**
   * Who a failed-payment warning for this company would actually reach.
   * Resolved by the same code the real alert uses, so the settings page shows
   * what would happen rather than what ought to.
   */
  getNoticeRecipients: async (companyId?: number): Promise<NoticeRecipients> => {
    const { data } = await apiClient.get('/billing/notices/recipients', {
      params: companyId ? { company_id: companyId } : {},
    });
    return data;
  },

  /**
   * The tax rates that exist on the Stripe account, so one can be picked from
   * a list rather than copied between browser tabs.
   */
  listAvailableTaxRates: async (): Promise<{
    rates: StripeTaxRateOption[];
    error?: string;
  }> => {
    const { data } = await apiClient.get('/billing/tax/available');
    return data;
  },

  /**
   * Points the platform at a different Stripe Tax Rate, then reads it straight
   * back from Stripe so the caller sees the real percentage.
   */
  setTaxRate: async (stripeTaxRateId: string): Promise<BillingTaxRate> => {
    const { data } = await apiClient.put('/billing/tax', {
      stripe_tax_rate_id: stripeTaxRateId,
    });
    return data;
  },

  /**
   * The tax rate every total on this page is built from.
   */
  getTaxRate: async (): Promise<BillingTaxRate> => {
    const { data } = await apiClient.get('/billing/tax');
    return data;
  },

  /**
   * Re-reads the rate from Stripe. Stripe owns it; this only refreshes the
   * local copy, so it is safe to press at any time.
   */
  syncTaxRate: async (): Promise<BillingTaxRate> => {
    const { data } = await apiClient.post('/billing/tax/sync');
    return data;
  },

  /**
   * Rehearses the failed-payment alert: same recipients, same mail server,
   * same in-app notification, everything marked as a test. Changes nothing
   * about the subscription.
   */
  sendTestFailureNotice: async (companyId?: number): Promise<BillingTestNoticeResult> => {
    const { data } = await apiClient.post(
      '/billing/notices/test',
      companyId ? { company_id: companyId } : {}
    );
    return data;
  },

  /**
   * Super Admin overview of all tenant companies
   */
  getSuperAdminOverview: async (): Promise<SuperAdminBillingCompanyRow[]> => {
    const { data } = await apiClient.get('/billing/admin/overview');
    return data;
  },

  /**
   * Super Admin detail view for a company
   */
  getAdminCompanyBilling: async (
    companyId: number
  ): Promise<BillingOverview> => {
    const { data } = await apiClient.get(`/billing/admin/companies/${companyId}`);
    return data;
  },
};

export default billingApi;
