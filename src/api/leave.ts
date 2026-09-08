import apiClient from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaveType = 'vacation' | 'sick';
export type LeaveDurationType = 'full_day' | 'short_leave';

export type LeaveStatus =
  | 'pending'
  | 'store manager approved'
  | 'store manager rejected'
  | 'area manager approved'
  | 'area manager rejected'
  | 'HR approved'
  | 'HR rejected'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'admin_approved'
  | 'admin approved';

export interface LeaveRequest {
  id: number;
  companyId: number;
  userId: number;
  storeId: number | null;
  leaveType: LeaveType;
  startDate: string;       // ISO date YYYY-MM-DD
  endDate: string;         // ISO date YYYY-MM-DD
  leaveDurationType?: LeaveDurationType;
  shortStartTime?: string | null;
  shortEndTime?: string | null;
  status: LeaveStatus;
  currentApproverRole: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userSurname?: string;
  userRole?: string;
  userAvatarFilename?: string | null;
  storeName?: string | null;
  storeLogoFilename?: string | null;
  companyName?: string | null;
  medicalCertificateName?: string | null;
  skippedApprovers?: string[];
  onLeaveSkippedApprovers?: string[];
  approvedByRoles?: string[] | null;
  /**
   * True once the request has been reassigned or chased by the inactivity job.
   * It does NOT mean approved — the job never approves.
   */
  escalated?: boolean;
  /**
   * The person who granted the leave. NULL on a request that reached an
   * approved-looking status without a human decision, which is exactly the
   * state the escalation defect produced. The badge keys off this rather than
   * off the status string, so a request can never *look* approved unless
   * somebody actually approved it.
   */
  approvedBy?: number | null;
  approvedAt?: string | null;
  /** Last time the inactivity job solicited the current approver. */
  lastReminderAt?: string | null;
  isEmergencyOverride?: boolean;
  isArchived?: boolean;
  lastActionAt?: string | null;
  latestAction?: 'approved' | 'rejected' | null;
  latestActionAt?: string | null;
  latestActionByName?: string | null;
  latestActionBySurname?: string | null;
  latestActionByRole?: string | null;
  approvals_history?: ApprovalHistoryEntry[] | null;
}

export interface ApprovalHistoryEntry {
  role: string;
  action: 'approved' | 'rejected' | 'escalated';
  createdAt: string;
  notes: string | null;
  approverName: string | null;
  approverSurname: string | null;
}

export interface LeaveBalance {
  id: number;
  companyId: number;
  userId: number;
  year: number;
  leaveType: LeaveType;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  updatedAt: string;
}

export interface SubmitLeavePayload {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  leaveDurationType?: LeaveDurationType;
  shortStartTime?: string;
  shortEndTime?: string;
  notes?: string;
  certificate?: File;   // optional medical certificate (sick leave only)
}

export interface LeaveListParams {
  userId?: number;
  status?: LeaveStatus;
  leaveType?: LeaveType;
  dateFrom?: string;
  dateTo?: string;
  storeId?: number;
  archived?: boolean;
  page?: number;
  limit?: number;
}

export interface LeaveListResponse {
  requests: LeaveRequest[];
  total: number;
  page?: number;
  limit?: number;
  pages?: number;
  /**
   * Set when the viewer's role is store-scoped but they have no stores to
   * scope to. Their queue is then correctly empty, but that is
   * indistinguishable on screen from "nothing to approve" — this says which.
   */
  scopeIssue?: 'no_store_association' | null;
  /** True when the viewer is away on granted leave. The queue is still shown;
   *  only the decision buttons are withheld. */
  callerOnLeave?: boolean;
  /** The viewer's own leave covering today, for the explanatory banner. */
  callerLeave?: { startDate: string; endDate: string; leaveType: string } | null;
  /** Approvers in this company who are away right now, for the UI to name. */
  approversOnLeave?: ApproverOnLeave[];
}

/** An approver who is on granted leave today. */
export interface ApproverOnLeave {
  userId: number;
  name: string;
  surname: string;
  role: string;
  avatarFilename: string | null;
  startDate: string;
  endDate: string;
}

export interface BalanceResponse {
  balances: LeaveBalance[];
  year: number;
  userId: number;
  balanceVisible?: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Submit a new leave request. */
export async function submitLeaveRequest(payload: SubmitLeavePayload): Promise<LeaveRequest> {
  if (payload.certificate) {
    const form = new FormData();
    form.append('leave_type', payload.leaveType);
    form.append('start_date', payload.startDate);
    form.append('end_date', payload.endDate);
    if (payload.leaveDurationType) form.append('leave_duration_type', payload.leaveDurationType);
    if (payload.shortStartTime) form.append('short_start_time', payload.shortStartTime);
    if (payload.shortEndTime) form.append('short_end_time', payload.shortEndTime);
    if (payload.notes) form.append('notes', payload.notes);
    form.append('certificate', payload.certificate);
    const { data } = await apiClient.post('/leave', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data as LeaveRequest;
  }
  const { data } = await apiClient.post('/leave', {
    leave_type: payload.leaveType,
    start_date: payload.startDate,
    end_date: payload.endDate,
    leave_duration_type: payload.leaveDurationType,
    short_start_time: payload.shortStartTime,
    short_end_time: payload.shortEndTime,
    notes: payload.notes,
  });
  return data.data as LeaveRequest;
}

/** List leave requests (scope determined server-side by role). */
export async function getLeaveRequests(params?: LeaveListParams): Promise<LeaveListResponse> {
  const { data } = await apiClient.get('/leave', { params });
  return data.data as LeaveListResponse;
}

/** Get the pending approval queue for the current user's role. */
export async function getPendingLeaveApprovals(): Promise<LeaveListResponse> {
  const { data } = await apiClient.get('/leave/pending');
  return data.data as LeaveListResponse;
}

/** Approve a leave request. */
export async function approveLeaveRequest(id: number, notes?: string, cancel_shifts?: boolean): Promise<LeaveRequest> {
  const { data } = await apiClient.put(`/leave/${id}/approve`, { notes, cancel_shifts });
  return data.data as LeaveRequest;
}

/** Reject a leave request (notes are mandatory). */
export async function rejectLeaveRequest(id: number, notes: string): Promise<LeaveRequest> {
  const { data } = await apiClient.put(`/leave/${id}/reject`, { notes });
  return data.data as LeaveRequest;
}

/** Get leave balances for a user. */
export async function getLeaveBalance(params?: { userId?: number; year?: number }): Promise<BalanceResponse> {
  const { data } = await apiClient.get('/leave/balance', { params });
  return data.data as BalanceResponse;
}

export interface AllBalancesResponse {
  year: number;
  /** Keyed by user id. Employees with no allocation are simply absent. */
  balances: Record<number, LeaveBalance[]>;
}

/**
 * Every balance in scope in a single request.
 *
 * The admin panel previously issued one `/leave/balance` call per employee,
 * which is why it capped itself at 50 people. This replaces the whole fan-out.
 */
export async function getAllLeaveBalances(params?: {
  year?: number;
  companyId?: number;
  storeId?: number;
}): Promise<AllBalancesResponse> {
  const query: Record<string, number> = {};
  if (params?.year != null) query.year = params.year;
  if (params?.companyId != null) query.company_id = params.companyId;
  if (params?.storeId != null) query.store_id = params.storeId;
  const { data } = await apiClient.get('/leave/balances', { params: query });
  return data.data as AllBalancesResponse;
}

export interface SetBalancePayload {
  userId: number;
  year: number;
  leaveType: LeaveType;
  /**
   * `null` removes the allocation (admin only, refused once days are used);
   * `0` is a real allocation of zero days, which displays as 0 and leaves the
   * employee with nothing to spend.
   */
  totalDays: number | null;
}

/** Admin/HR sets the total_days allocation for an employee balance (upsert). */
/**
 * Upsert an allocation, or clear it.
 *
 * `totalDays: 0` removes the allocation entirely (admin only, and refused once
 * days have been used), taking the employee back to not-configured — which is
 * what blocks HR/Admin from approving their leave. The response then carries
 * `{ cleared: true }` instead of a balance row.
 */
export async function setLeaveBalance(
  payload: SetBalancePayload,
): Promise<LeaveBalance | { cleared: true }> {
  const { data } = await apiClient.put('/leave/balance', {
    user_id:    payload.userId,
    year:       payload.year,
    leave_type: payload.leaveType,
    total_days: payload.totalDays,
  });
  return data.data as LeaveBalance | { cleared: true };
}

/** Download a medical certificate for a sick leave request. */
export async function downloadCertificate(leaveId: number): Promise<Blob> {
  const { data } = await apiClient.get(`/leave/${leaveId}/certificate`, { responseType: 'blob' });
  return data as Blob;
}

export interface LeaveBlock {
  id: number;
  companyId: number;
  companyName?: string | null;
  userId: number;
  userName: string;
  userSurname: string;
  userAvatarFilename?: string | null;
  storeId: number | null;
  storeName?: string | null;
  leaveType: 'vacation' | 'sick';
  startDate: string;
  endDate: string;
  status: string;
}

export interface AdminCreateLeavePayload {
  userId: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  leaveDurationType?: LeaveDurationType;
  shortStartTime?: string;
  shortEndTime?: string;
  notes?: string;
}

/** Admin/HR creates a leave on behalf of an employee (auto-approved, balance deducted). */
export async function createLeaveOnBehalf(payload: AdminCreateLeavePayload): Promise<LeaveRequest> {
  const { data } = await apiClient.post('/leave/admin', {
    user_id:    payload.userId,
    leave_type: payload.leaveType,
    start_date: payload.startDate,
    end_date:   payload.endDate,
    leave_duration_type: payload.leaveDurationType,
    short_start_time: payload.shortStartTime,
    short_end_time: payload.shortEndTime,
    notes:      payload.notes,
  });
  return data.data as LeaveRequest;
}

/** Delete a leave request (admin only). */
export async function deleteLeaveRequest(id: number): Promise<void> {
  await apiClient.delete(`/leave/${id}`);
}

/** Return approved/pending leave requests in a date range as block objects. */
export async function getLeaveBlocks(dateFrom: string, dateTo: string): Promise<LeaveBlock[]> {
  const res = await getLeaveRequests({ dateFrom, dateTo });
  return res.requests
    .filter((r) => r.status !== 'rejected')
    .map((r) => ({
      id:          r.id,
      companyId:   r.companyId,
      companyName: (r as LeaveRequest & { companyName?: string | null }).companyName ?? null,
      userId:      r.userId,
      userName:    r.userName ?? '',
      userSurname: r.userSurname ?? '',
      userAvatarFilename: r.userAvatarFilename ?? null,
      storeId:     r.storeId ?? null,
      storeName:   (r as LeaveRequest & { storeName?: string | null }).storeName ?? null,
      leaveType:   r.leaveType,
      startDate:   r.startDate,
      endDate:     r.endDate,
      status:      r.status,
    }));
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
  total: number;
}

/** Export balances as an Excel blob */
export async function exportLeaveBalances(year: number): Promise<Blob> {
  const { data } = await apiClient.get('/leave/balance/export', {
    params: { year },
    responseType: 'blob',
  });
  return data as Blob;
}

/** Download empty balances import template */
export async function downloadLeaveBalanceTemplate(): Promise<Blob> {
  const { data } = await apiClient.get('/leave/balance/import-template', {
    responseType: 'blob',
  });
  return data as Blob;
}

/** Upload an Excel/CSV file to bulk import balances */
export async function importLeaveBalances(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post('/leave/balance/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data as ImportResult;
}

export const cancelLeaveRequest = async (id: number): Promise<LeaveRequest> => {
  return apiClient.put(`/leave/${id}/cancel`).then((res) => res.data.data);
};

// ---------------------------------------------------------------------------
// Approval Config
// ---------------------------------------------------------------------------

export interface ApprovalLevel {
  id: number;
  role: string;
  enabled: boolean;
  sortOrder: number;
}

/** Get approval chain configuration for a company. */
export async function getApprovalConfig(companyId?: number): Promise<ApprovalLevel[]> {
  const { data } = await apiClient.get('/leave/approval-config', {
    params: companyId != null ? { company_id: companyId } : {},
  });
  return data.data as ApprovalLevel[];
}

/** Update approval chain configuration. */
export async function updateApprovalConfig(
  companyId: number,
  levels: Array<{ role: string; enabled: boolean; sort_order: number }>,
): Promise<ApprovalLevel[]> {
  const { data } = await apiClient.put('/leave/approval-config', {
    company_id: companyId,
    levels,
  });
  return data.data as ApprovalLevel[];
}

/** Archive a leave request (Admin/HR only). */
export async function archiveLeaveRequest(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.put(`/leave/${id}/archive`);
  return data.data;
}

/**
 * Send a request that was auto-approved with no human decision back to HR.
 *
 * Those requests sit in a terminal approved status, so they cannot be approved
 * again — and re-approving them on the spot would miss the point, which is that
 * nobody ever decided. Admin only.
 */
export async function reopenLeaveRequest(id: number): Promise<LeaveRequest> {
  const { data } = await apiClient.put(`/leave/${id}/reopen`);
  return data.data as LeaveRequest;
}
