export type NotificationCategory =
  | 'employees'
  | 'shifts'
  | 'attendance'
  | 'leave'
  | 'documents'
  | 'ats'
  | 'onboarding'
  | 'billing'
  | 'manager';

export type NotificationEventDefinition = {
  eventKey: string;
  category: NotificationCategory;
  defaultRoles: string[];
};

export const NOTIFICATION_EVENT_DEFINITIONS: NotificationEventDefinition[] = [
  { eventKey: 'employee.created', category: 'employees', defaultRoles: ['hr', 'admin'] },
  { eventKey: 'employee.updated', category: 'employees', defaultRoles: ['hr', 'admin'] },

  { eventKey: 'shift.assigned', category: 'shifts', defaultRoles: ['employee'] },
  { eventKey: 'shift.changed', category: 'shifts', defaultRoles: ['employee'] },

  { eventKey: 'attendance.anomaly', category: 'attendance', defaultRoles: ['employee', 'store_manager', 'hr'] },

  { eventKey: 'leave.submitted', category: 'leave', defaultRoles: ['store_manager', 'area_manager', 'hr', 'admin'] },
  { eventKey: 'leave.approved', category: 'leave', defaultRoles: ['employee'] },
  { eventKey: 'leave.rejected', category: 'leave', defaultRoles: ['employee'] },

  { eventKey: 'document.uploaded', category: 'documents', defaultRoles: ['employee', 'hr', 'admin'] },
  { eventKey: 'document.signature_required', category: 'documents', defaultRoles: ['employee'] },
  { eventKey: 'document.signed', category: 'documents', defaultRoles: ['hr', 'admin'] },
  { eventKey: 'document.expiring', category: 'documents', defaultRoles: ['employee', 'hr', 'admin'] },

  { eventKey: 'ats.candidate_received', category: 'ats', defaultRoles: ['hr', 'admin'] },
  { eventKey: 'ats.interview_invite', category: 'ats', defaultRoles: ['hr', 'admin'] },
  { eventKey: 'ats.outcome', category: 'ats', defaultRoles: ['hr', 'admin'] },

  { eventKey: 'onboarding.welcome', category: 'onboarding', defaultRoles: ['employee'] },
  { eventKey: 'onboarding.task_reminder', category: 'onboarding', defaultRoles: ['employee'] },

  { eventKey: 'manager.alert', category: 'manager', defaultRoles: ['store_manager', 'area_manager', 'hr', 'admin'] },
];

export const NOTIFICATION_CATEGORY_ORDER: NotificationCategory[] = [
  'employees',
  'shifts',
  'attendance',
  'leave',
  'documents',
  'ats',
  'onboarding',
  'manager',
];
// NOTE: 'billing' is intentionally absent from the order above, and
// `billing.payment_failed` from the definitions, because that list drives the
// per-event settings toggles. The server sends the payment-failure alert with
// the settings check bypassed - a company cannot be allowed to switch off the
// warning that its own access is about to stop - so offering a switch here
// would be offering one that does nothing. The category still exists for the
// notification feed, which is where these do appear.

export const NOTIFICATION_CATEGORY_I18N: Record<NotificationCategory, string> = {
  employees: 'notifications.settingsCategory_employees',
  shifts: 'notifications.settingsCategory_shifts',
  attendance: 'notifications.settingsCategory_attendance',
  leave: 'notifications.settingsCategory_leave',
  documents: 'notifications.settingsCategory_documents',
  ats: 'notifications.settingsCategory_ats',
  onboarding: 'notifications.settingsCategory_onboarding',
  billing: 'notifications.settingsCategory_billing',
  manager: 'notifications.settingsCategory_manager',
};
