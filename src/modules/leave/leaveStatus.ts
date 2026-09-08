/**
 * One place that decides what a leave request's state IS, and how it looks.
 *
 * Both the list badge and the calendar chip used to re-derive this from the
 * status string, and disagreed: a request that reached an approved-looking
 * status with no approving user rendered as a normal green approval in both.
 * `approvedBy` is the fact — a person on the record — so it drives everything
 * here, and the two views can no longer drift apart.
 */
import { LeaveRequest } from '../../api/leave';

export type LeaveState =
  | 'cancelled'
  | 'rejected'
  | 'approved'      // granted by a person
  | 'unverified'    // approved-looking, but nobody approved it
  | 'escalated'     // chased or auto-advanced by the inactivity job
  | 'in_progress'   // partway up the chain
  | 'pending';      // untouched

export interface LeaveStateVisual {
  state: LeaveState;
  /** Main ink colour. */
  color: string;
  /** Saturated edge used for the calendar chip's left rail. */
  rail: string;
  /** Soft fill, gradient-ready. */
  fill: string;
  border: string;
  /** i18n key under `leave.` for the short label. */
  labelKey: string;
  /** i18n key under `leave.` for the explanatory tooltip, when one is warranted. */
  hintKey?: string;
}

const VISUALS: Record<LeaveState, Omit<LeaveStateVisual, 'state'>> = {
  cancelled: {
    color: '#6b7280', rail: '#9ca3af', fill: 'rgba(107,114,128,0.10)',
    border: 'rgba(107,114,128,0.22)', labelKey: 'badge_cancelled',
  },
  rejected: {
    color: '#dc2626', rail: '#ef4444', fill: 'rgba(220,38,38,0.10)',
    border: 'rgba(220,38,38,0.22)', labelKey: 'badge_rejected',
  },
  approved: {
    color: '#15803d', rail: '#16a34a', fill: 'rgba(22,163,74,0.12)',
    border: 'rgba(22,163,74,0.24)', labelKey: 'badge_approved',
  },
  unverified: {
    color: '#b91c1c', rail: '#dc2626', fill: 'rgba(220,38,38,0.14)',
    border: 'rgba(220,38,38,0.32)', labelKey: 'badge_unverified',
    hintKey: 'badge_unverified_hint',
  },
  escalated: {
    color: '#b45309', rail: '#d97706', fill: 'rgba(217,119,6,0.12)',
    border: 'rgba(217,119,6,0.26)', labelKey: 'badge_escalated',
    hintKey: 'badge_escalated_hint',
  },
  in_progress: {
    color: '#1d4ed8', rail: '#3b82f6', fill: 'rgba(59,130,246,0.10)',
    border: 'rgba(59,130,246,0.22)', labelKey: 'badge_in_progress',
  },
  pending: {
    color: '#6b7280', rail: '#9ca3af', fill: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.20)', labelKey: 'badge_pending',
  },
};

export function leaveState(req: Pick<LeaveRequest, 'status' | 'approvedBy' | 'escalated' | 'currentApproverRole'>): LeaveState {
  const s = (req.status ?? '').toLowerCase().replace(/ /g, '_');

  if (s === 'cancelled') return 'cancelled';
  if (s.includes('rejected')) return 'rejected';

  // "Looks approved" = no further approver and a terminal-ish status. The
  // chain is company-configurable, so the absence of a next approver is the
  // reliable signal, not the status name.
  const looksApproved =
    s === 'approved' || s === 'admin_approved' || (s === 'hr_approved' && !req.currentApproverRole);

  if (looksApproved) return req.approvedBy != null ? 'approved' : 'unverified';

  if (req.escalated) return 'escalated';
  if (s === 'pending') return 'pending';
  return 'in_progress';
}

export function leaveVisual(req: Parameters<typeof leaveState>[0]): LeaveStateVisual {
  const state = leaveState(req);
  return { state, ...VISUALS[state] };
}

/** Leave type tint, kept separate so a chip can show type AND state. */
export const LEAVE_TYPE_TINT: Record<string, { color: string; rail: string; fill: string }> = {
  vacation: { color: '#1e40af', rail: '#2563eb', fill: 'rgba(219,234,254,0.75)' },
  sick:     { color: '#9a3412', rail: '#ea580c', fill: 'rgba(255,237,213,0.75)' },
};
