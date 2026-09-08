export type UserRole = 'admin' | 'hr' | 'area_manager' | 'store_manager' | 'employee' | 'store_terminal';

export interface User {
  id: number;
  companyId: number | null;
  storeId: number | null;
  supervisorId: number | null;
  name: string;
  surname: string | null;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  isSuperAdmin: boolean;
  avatarFilename?: string | null;

  // Device binding (employee self-service only)
  isDeviceRegistered?: boolean;
  deviceResetPending?: boolean;
  requiresDeviceRegistration?: boolean;
  uniqueId?: string | null;
  deviceMetadata?: any;
  lastSeenIp?: string | null;
  lastSeenAt?: string | null;
}

export interface Company {
  id: number;
  name: string;
  slug?: string;
  isActive: boolean;
  logoFilename?: string | null;
  bannerFilename?: string | null;
  groupId?: number | null;
  groupName?: string | null;
  ownerUserId?: number | null;
  ownerName?: string | null;
  ownerSurname?: string | null;
  ownerAvatarFilename?: string | null;
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
  timezones?: string | null;
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
  storeCount: number;
  employeeCount: number;
  activeDevicesCount: number;
  employeeDevicesCount?: number;
  storageUsedBytes: number;
  createdAt: string;
}

export interface Store {
  id: number;
  companyId: number;
  companyName?: string;   // populated when super admin fetches across companies
  groupName?: string | null;
  companyLogoFilename?: string | null;
  logoFilename?: string | null;
  name: string;
  code: string;
  address: string | null;
  cap: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  timezone?: string | null;
  maxStaff: number | null;
  isActive: boolean;
  employeeCount?: number;
  createdAt: string;

  // Record audit trail. Null on stores created before these were tracked.
  updatedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

export interface StoreOperatingHour {
  id?: number;
  storeId?: number;
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  peakStartTime?: string | null;
  peakEndTime?: string | null;
  plannedShiftCount?: number | null;
  plannedStaffCount?: number | null;
  shiftPlanNotes?: string | null;
  isClosed: boolean;
}

export interface Employee {
  id: number;
  companyId: number;
  storeId: number | null;
  supervisorId: number | null;
  name: string;
  surname: string;
  email: string;
  role: UserRole;
  uniqueId: string | null;
  department: string | null;
  hireDate: string | null;
  contractEndDate: string | null;
  terminationDate: string | null;
  workingType: 'full_time' | 'part_time' | null;
  weeklyHours: number | null;
  status: 'active' | 'inactive';
  isSuperAdmin?: boolean;
  firstAidFlag: boolean;
  maritalStatus: string | null;
  storeName?: string;
  supervisorName?: string;
  companyName?: string;
  companyGroupName?: string | null;
  // Sensitive — only returned for admin/hr or self
  personalEmail?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  gender?: string | null;
  iban?: string | null;
  phone?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  cap?: string | null;
  contractType?: string | null;
  probationMonths?: number | null;
  terminationType?: string | null;
  avatarFilename?: string | null;

  // Device binding (HR/admin view)
  deviceResetPending?: boolean;
  deviceRegistered?: boolean;
  deviceRegisteredAt?: string | null;
  deviceMetadata?: any;
  lastSeenIp?: string | null;
  lastSeenAt?: string | null;

  // Record audit trail. Null on records created before these were tracked.
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

export interface EmployeeAssociationEntry {
  id: number;
  name: string;
  surname: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  isSuperAdmin?: boolean;
  companyId: number;
  companyName: string;
  storeId: number | null;
  storeName: string | null;
  supervisorId: number | null;
  avatarFilename: string | null;
}

export interface EmployeeAssociationStore {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
  logoFilename?: string | null;
  employees: EmployeeAssociationEntry[];
}

export interface EmployeeAssociationCompany {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  logoFilename?: string | null;
  groupName?: string | null;
  stores: EmployeeAssociationStore[];
  unassignedEmployees: EmployeeAssociationEntry[];
  employeeCount: number;
}

export interface EmployeeAssociationsResponse {
  subject: {
    id: number;
    role: UserRole;
    companyId: number;
    companyName: string | null;
    storeId: number | null;
    storeName: string | null;
    supervisorId: number | null;
    name: string;
    surname: string;
    email: string;
    status: 'active' | 'inactive';
    avatarFilename: string | null;
  };
  scope: 'company' | 'company_group' | 'managed' | 'store' | 'self' | 'none';
  summary: {
    companyCount: number;
    storeCount: number;
    employeeCount: number;
  };
  companies: EmployeeAssociationCompany[];
}

export type TrainingType = 'product' | 'general' | 'low_risk_safety' | 'fire_safety';

export interface Training {
  id: number;
  userId: number;
  companyId: number;
  trainingType: TrainingType;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MedicalCheck {
  id: number;
  userId: number;
  companyId: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Message {
  id: number;
  companyId: number;
  companyName?: string | null;
  senderId: number;
  recipientId: number;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  senderName?: string;
  senderRole?: UserRole;
  senderAvatarFilename?: string | null;
  recipientName?: string;
  recipientRole?: UserRole;
  recipientAvatarFilename?: string | null;
  direction?: 'received' | 'sent';
  attachmentFilename?: string | null;
}

export interface PermissionGrid {
  grid: Record<string, Record<string, boolean>>;
  moduleMeta: Record<string, { active: boolean }>;
}

export type PermissionMap = Record<string, boolean>;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
}

export interface EmployeeListResponse {
  employees: Employee[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export type PaymentProvider = 'stripe' | 'paypal';
export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';

export interface Subscription {
  id: number;
  companyId?: number;
  provider: PaymentProvider;
  status: SubscriptionStatus;
  seatQuantity: number;
  deviceQuantity: number;
  pendingSeatQuantity: number | null;
  pendingDeviceQuantity: number | null;
  unitPriceEmployee: number;
  unitPriceDevice: number;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodEndsAt: string | null;
  billReminderDaysBefore?: number;
  gracePeriodDays?: number;
  createdAt?: string;
}

export type BillingTransactionKind =
  | 'activation'
  | 'renewal'
  | 'license_upgrade'
  /** Under the provider's minimum charge: nothing taken, carried forward. */
  | 'carried_over'
  | 'failed';

export interface BillingTransaction {
  /** What the payment was, so its label can be translated. */
  kind?: BillingTransactionKind | null;
  id: number;
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  description: string | null;
  seatQuantity?: number;
  deviceQuantity?: number;
  /** Unit prices as charged, so a receipt can show each line amount. */
  unitPriceEmployeeCents?: number | null;
  unitPriceDeviceCents?: number | null;
  /** The billing cycle this payment covered. */
  periodStart?: string | null;
  periodEnd?: string | null;
  /** The card as it was when this payment was taken. */
  paymentMethodBrand?: string | null;
  paymentMethodLast4?: string | null;
  /**
   * How the total split into licences and tax, as the provider reported it.
   * Null on payments taken before a tax rate was configured.
   */
  subtotalCents?: number | null;
  taxCents?: number | null;
  taxPercent?: number | null;
  /** For a failed payment: who was warned, and whether the mail went out. */
  notice?: BillingNoticeDelivery | null;
  invoiceUrl: string | null;
  failureCode?: string | null;
  failureMessage: string | null;
  attemptCount?: number;
  paidAt: string | null;
  createdAt: string;
}

export interface LicenseSnapshot {
  /** False for companies grandfathered in before the billing module. */
  billingEnforced?: boolean;
  hasSubscription: boolean;
  status: string | null;
  employeesLicensed: number;
  employeesInUse: number;
  employeesRemaining: number;
  terminalsLicensed: number;
  terminalsInUse: number;
  terminalsRemaining: number;
  pendingUpgrade: {
    employees: number;
    terminals: number;
    amountCents: number | null;
    requestedAt: string | null;
  } | null;
  scheduledReduction: { employees: number | null; terminals: number | null } | null;
}

export interface LicenseQuote {
  extraEmployees: number;
  extraTerminals: number;
  isIncrease: boolean;
  isDecrease: boolean;
  additionalMonthly: number;
  amountDueNow: number;
  amountDueNowCents: number;
  newMonthlyTotal: number;
  remainingRatio: number;
  daysRemaining: number | null;
  /** Length of the current billing period in whole days. */
  totalDays?: number;
  /**
   * Tax the provider adds on top. `amountDueNow` is the net licence cost;
   * `totalDueNow` is what is actually charged. Zero when no rate is configured.
   */
  taxPercent?: number;
  taxDueNow?: number;
  totalDueNow?: number;
  newMonthlyTax?: number;
  newMonthlyTotalWithTax?: number;
}

/**
 * The tax rate as the platform mirrors it from Stripe.
 *
 * Stripe owns the rate; this is the local copy every total is built from.
 * `source` and `syncedAt` are shown next to the percentage because "the rate
 * is 22%" and "the rate was 22% when we last managed to ask Stripe" are
 * different claims, and only one of them is safe to bill on.
 */
export interface BillingTaxRate {
  percent: number;
  enabled: boolean;
  stripeTaxRateId: string | null;
  displayName: string | null;
  jurisdiction: string | null;
  /** True when the rate is carved out of the price rather than added to it. */
  inclusive: boolean;
  active: boolean;
  source: 'stripe' | 'env';
  syncedAt: string | null;
  syncError: string | null;
  /** What is written onto a PayPal plan, so the two can be compared on screen. */
  paypalPercent: number;
  /** Only on the sync response: whether the refresh actually reached Stripe. */
  ok?: boolean;
  /**
   * Only on a sync or a rate change: what it took to bring live subscriptions
   * in line. Stripe tax rate objects are immutable, so a changed percentage is
   * a new object and every existing subscription has to be re-pointed at it.
   * PayPal cannot be corrected without the subscriber approving a new plan,
   * so those are counted and reported instead.
   */
  realignment?: {
    stripeUpdated: number;
    stripeChecked: number;
    paypalStale: number;
    errors: string[];
  };
}

export type BillingNoticeStatus = 'sent' | 'skipped' | 'failed' | 'no_recipient';

/**
 * The outcome of a rehearsed failed-payment alert.
 *
 * Reported channel by channel rather than as one success flag, because the
 * useful answers are specific: the owner was emailed but the operator copy
 * bounced, or nothing was emailed at all because the company has no SMTP
 * configured and only the in-app alert went out.
 */
export interface BillingTestNoticeResult {
  companyName: string;
  ownerEmail: string | null;
  ownerStatus: BillingNoticeStatus;
  ownerError: string | null;
  copyTo: string | null;
  copyStatus: BillingNoticeStatus | null;
  inAppCount: number;
  sentAt: string;
}

/**
 * Who a failed-payment warning would reach for one company, and from where.
 *
 * Used to draw the delivery diagram on the platform email settings page:
 * sender, purpose, recipient — resolved by the same backend code the real
 * alert uses, so the picture cannot drift from the behaviour.
 */
export interface NoticeRecipients {
  companyId: number;
  companyName: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  companyEmail: string | null;
  /** How many people get the in-app alert, which cannot bounce. */
  inAppRecipients: number;
  platform: {
    configured: boolean;
    from: string | null;
    alertEmail: string | null;
  };
}

/** Where a failed-payment warning went, and whether it arrived. */
export interface BillingNoticeDelivery {
  emailTo: string | null;
  emailStatus: BillingNoticeStatus | null;
  emailError: string | null;
  emailAt: string | null;
  copyTo: string | null;
  copyStatus: BillingNoticeStatus | null;
  inAppCount: number;
  /** Which mailbox carried it: the platform's own, or the company's SMTP. */
  transport?: 'platform' | 'company' | 'none' | null;
}

export interface BillingOverview {
  company: {
    id: number;
    name: string;
    currency: string;
    vatNumber?: string | null;
    sdiRecipientCode?: string | null;
    pecEmail?: string | null;
    pricePerEmployee: number;
    pricePerDevice: number;
    /** Price before discount, for showing what the discount saved. */
    listPricePerEmployee?: number;
    listPricePerDevice?: number;
    discountPercent?: number;
    discountActive?: boolean;
  };
  subscription: Subscription | null;
  liveUsage: {
    employeeCount: number;
    deviceCount: number;
    calculatedMonthlyTotal: number;
    /** Tax the provider will add to that total. Zero when no rate is set. */
    calculatedTax?: number;
  };
  /** The tax rate in force, so a tax line can be labelled rather than guessed. */
  taxPercent?: number;
  /** Where that rate came from and how fresh it is. */
  tax?: BillingTaxRate;
  readiness?: {
    canCheckout: boolean;
    missingFields: string[];
    pricingConfigured: boolean;
    hasBillableQuantity: boolean;
    activeProvider: 'stripe' | 'paypal' | null;
  };
  /** What the company bought versus what it is using. */
  licenses?: LicenseSnapshot;
  /** The card the provider will bill, when there is one on file. */
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  transactions: BillingTransaction[];
}

export interface SuperAdminBillingCompanyRow {
  id: number;
  name: string;
  slug: string;
  currency: string;
  pricePerEmployee: number;
  pricePerDevice: number;
  billReminderDaysBefore: number;
  gracePeriodDays: number;
  employeeCount: number;
  activeDevicesCount: number;
  subscriptionId: number | null;
  provider: PaymentProvider | null;
  subscriptionStatus: SubscriptionStatus | null;
  seatQuantity: number | null;
  deviceQuantity: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  gracePeriodEndsAt: string | null;
  lastPaidAt: string | null;
  totalRevenueCents: number | null;
}

