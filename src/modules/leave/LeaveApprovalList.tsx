import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Palmtree, Thermometer, Trash2, Lock, CheckCheck, Store } from 'lucide-react';
import { LeaveRequest, LeaveStatus, LeaveBalance, approveLeaveRequest, rejectLeaveRequest, downloadCertificate, cancelLeaveRequest, deleteLeaveRequest, getLeaveBalance, type ApproverOnLeave } from '../../api/leave';
import { getAvatarUrl } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { translateApiError } from '../../utils/apiErrors';
import { leaveVisual } from './leaveStatus';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:                         { bg: 'rgba(107,114,128,0.06)', color: 'var(--text-muted)' },
  'store manager approved':        { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  store_manager_approved:          { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  'store manager rejected':        { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  store_manager_rejected:          { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  'area manager approved':         { bg: 'rgba(139,92,246,0.06)',  color: '#8b5cf6' },
  area_manager_approved:           { bg: 'rgba(139,92,246,0.06)',  color: '#8b5cf6' },
  'area manager rejected':         { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  area_manager_rejected:           { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  'HR approved':                   { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  hr_approved:                     { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  'HR rejected':                   { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  hr_rejected:                     { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  approved:                        { bg: 'rgba(22,163,74,0.06)',   color: 'var(--accent)' },
  rejected:                        { bg: 'rgba(220,38,38,0.06)',   color: 'var(--danger)' },
  cancelled:                       { bg: 'rgba(0,0,0,0.04)',       color: 'var(--text-muted)' },
  admin_approved:                  { bg: 'rgba(22,163,74,0.06)',   color: 'var(--accent)' },
  'admin approved':                { bg: 'rgba(22,163,74,0.06)',   color: 'var(--accent)' },
};

export function StatusBadge({ req }: { req: LeaveRequest }) {
  const { t } = useTranslation();
  // Was a third independent derivation from the status string — it painted a
  // request approved by nobody as an ordinary green APPROVED, exactly like the
  // other two did. All of them now go through leaveStatus.ts.
  const visual = leaveVisual(req);

  return (
    <span
      title={visual.hintKey ? t(`leave.${visual.hintKey}`) : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
        background: visual.fill, color: visual.color,
        border: `1px solid ${visual.border}`,
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        cursor: visual.hintKey ? 'help' : undefined,
      }}
    >
      {visual.state === 'unverified' && <span aria-hidden>⚠</span>}
      {t(`leave.${visual.labelKey}`)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3-step chain stepper
// ---------------------------------------------------------------------------

const CHAIN_STEPS = ['store_manager', 'area_manager', 'hr', 'admin'] as const;
type ChainStep = typeof CHAIN_STEPS[number];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

/**
 * The allocation this request will be drawn from, shown beside the decision.
 *
 * An approver was previously deciding blind and only discovered a missing or
 * exhausted balance when the approval was refused. Fetched per request and
 * cached across cards, since a queue commonly holds several requests from the
 * same person.
 */
const balanceCache = new Map<string, LeaveBalance[]>();

function RequestBalance({ req }: { req: LeaveRequest }) {
  const { t } = useTranslation();
  const year = new Date(req.startDate).getFullYear();
  const key = `${req.userId}:${year}`;
  const [balances, setBalances] = useState<LeaveBalance[] | null>(balanceCache.get(key) ?? null);

  useEffect(() => {
    if (balanceCache.has(key)) { setBalances(balanceCache.get(key)!); return; }
    let alive = true;
    getLeaveBalance({ userId: req.userId, year })
      .then((res) => {
        balanceCache.set(key, res.balances ?? []);
        if (alive) setBalances(res.balances ?? []);
      })
      .catch(() => { if (alive) setBalances([]); });
    return () => { alive = false; };
  }, [key, req.userId, year]);

  if (balances === null) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('common.loading')}</span>;
  }

  const forType = balances.find((b) => b.leaveType === req.leaveType);

  if (!forType) {
    return (
      <span
        title={t('leave.balance_missing_hint')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: '#b45309', cursor: 'help',
        }}
      >
        <span aria-hidden>⚠</span>
        {t('leave.balance_missing', 'Nessun saldo configurato')}
      </span>
    );
  }

  const exhausted = forType.remainingDays <= 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 11.5 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>
        {t(`leave.type_${req.leaveType}`)}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{forType.usedDays}</strong> / {forType.totalDays}
      </span>
      <span style={{ color: exhausted ? '#dc2626' : '#16a34a', fontWeight: exhausted ? 700 : 600 }}>
        ({forType.remainingDays} {t('leave.balance_remaining_short').toLowerCase()})
      </span>
    </span>
  );
}

export function ApprovalStepper({ req }: { req: LeaveRequest }) {
  const { currentApproverRole, status, skippedApprovers, onLeaveSkippedApprovers, escalated, isEmergencyOverride } = req;
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'it' ? 'it' : 'en';

  const fmtDateTime = (isoString: string) => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(locale === 'it' ? 'it-IT' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isRejected = status === 'rejected';

  function stepState(step: ChainStep): 'completed' | 'current' | 'pending' | 'rejected' {
    const isRejectedByThisRole = (status === 'rejected' || status.includes('rejected')) && req.latestActionByRole === step;
    if (isRejectedByThisRole) return 'rejected';

    const isApprovedByThisRole = req.approvedByRoles?.includes(step);
    if (isApprovedByThisRole) return 'completed';

    const isTerminalState = status === 'approved' || status === 'rejected' || status === 'cancelled' || status.includes('rejected');
    if (!isTerminalState && currentApproverRole === step) {
      return 'current';
    }

    return 'pending';
  }

  const activeChainSteps = CHAIN_STEPS.filter(step => {
    const isSkipped = (skippedApprovers || []).includes(step);
    const isOnLeaveSkipped = (onLeaveSkippedApprovers || []).includes(step);
    if (isSkipped && !isOnLeaveSkipped) {
      return false;
    }
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {activeChainSteps.map((step, idx) => {
          const state = stepState(step as ChainStep);
          const isCompleted = state === 'completed';
          const isCurrent   = state === 'current';
          const isRejectedState = state === 'rejected';

          let circleBackground = isRejectedState ? 'var(--danger-bg)' : isCompleted ? 'var(--accent)' : isCurrent ? 'var(--primary)' : 'transparent';
          let circleBorder     = isRejectedState ? 'var(--danger)' : isCompleted ? 'var(--accent)' : isCurrent ? 'var(--primary)' : 'var(--border)';
          let circleTextColor  = isRejectedState ? 'var(--danger)' : (isCompleted || isCurrent) ? '#fff' : 'var(--text-muted)';
          let labelColor       = isRejectedState ? 'var(--danger)' : isCompleted ? 'var(--accent)' : isCurrent ? 'var(--primary)' : 'var(--text-muted)';

          const isOnLeaveSkipped = (onLeaveSkippedApprovers || []).includes(step);
          if (isOnLeaveSkipped) {
            circleBackground = 'rgba(239, 68, 68, 0.08)';
            circleBorder     = 'var(--danger)';
            circleTextColor  = 'var(--danger)';
            labelColor       = 'var(--danger)';
          }

          const nextState = idx < activeChainSteps.length - 1 ? stepState(activeChainSteps[idx + 1] as ChainStep) : 'pending';
          const lineBackground   = nextState === 'pending' || nextState === 'rejected' ? 'var(--border)' : 'var(--accent)';

          const approvalEntry = (req.approvals_history || []).find(h =>
            h.role === step ||
            (h.role === 'system' && h.notes?.toLowerCase().includes(step.toLowerCase()))
          );
          const isAuto = approvalEntry?.action === 'escalated' || (escalated && step === currentApproverRole);
          const approvalTime = approvalEntry?.createdAt
            ? fmtDateTime(approvalEntry.createdAt)
            : (isCompleted && req.lastActionAt && req.latestActionByRole === step ? fmtDateTime(req.lastActionAt) : null);

          return (
            <React.Fragment key={step}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64, position: 'relative' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: circleBackground,
                  border: `2px solid ${circleBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: circleTextColor,
                  transition: 'all 0.2s',
                  boxShadow: isCompleted ? '0 2px 8px rgba(201,151,58,0.35)' : isCurrent ? '0 2px 8px rgba(13,33,55,0.25)' : 'none',
                }}>
                  {isCompleted ? <CheckIcon /> : (isRejectedState || isOnLeaveSkipped) ? <XIcon /> : (
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{idx + 1}</span>
                  )}
                </div>
                
                {/* Escalated / Auto marker */}
                {isAuto && (
                  <div style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 7.5,
                    padding: '2px 5px',
                    borderRadius: 4,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 4px rgba(239,68,68,0.3)',
                    zIndex: 10,
                  }}>
                    AUTO
                  </div>
                )}
                
                <div style={{
                  fontSize: 9, fontWeight: 600, color: labelColor,
                  marginTop: 4, textAlign: 'center', lineHeight: 1.2,
                  letterSpacing: 0.3, textTransform: 'uppercase',
                }}>
                  {t(`leave.approver_${step}`)}
                  {isOnLeaveSkipped && (
                    <div style={{ color: 'var(--danger)', marginTop: 2, fontSize: 8, fontWeight: 800 }}>
                      {t('leave.stepper_leave', 'LEAVE')}
                    </div>
                  )}
                  {/* Who actually decided this step. The role alone does not
                      answer "which store manager approved this?", which is the
                      question an auditor asks first. */}
                  {(approvalEntry?.approverName || approvalEntry?.approverSurname) && (
                    <div style={{
                      fontSize: 8.5, color: 'var(--text-secondary)', marginTop: 2,
                      textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 92,
                    }}>
                      {`${approvalEntry.approverName ?? ''} ${approvalEntry.approverSurname ?? ''}`.trim()}
                    </div>
                  )}
                  {isAuto && !approvalEntry?.approverName && (
                    <div style={{
                      fontSize: 8.5, color: '#b45309', marginTop: 2,
                      textTransform: 'none', fontWeight: 700,
                    }}>
                      {t('leave.stepper_auto_system', 'Sistema')}
                    </div>
                  )}
                  {approvalTime && (
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2, textTransform: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {approvalTime}
                    </div>
                  )}
                </div>
              </div>
              {idx < activeChainSteps.length - 1 && (
                <div style={{
                  flex: 1, height: 2, marginBottom: 22,
                  background: lineBackground,
                  transition: 'background 0.3s',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {isEmergencyOverride && status !== 'rejected' && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{t('leave.emergency_override_label')}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rejection notes modal
// ---------------------------------------------------------------------------

function RejectModal({
  open, onClose, onConfirm, loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Reset state every time the modal opens (prevent stale notes from a prior rejection)
  React.useEffect(() => {
    if (open) { setNotes(''); setError(''); }
  }, [open]);

  function handleConfirm() {
    if (!notes.trim()) { setError(t('leave.reject_notes_required')); return; }
    setError('');
    onConfirm(notes.trim());
  }

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(13,33,55,0.48)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', borderRadius: 12,
        width: 360, maxWidth: '90vw', overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Gold accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />
        <div style={{ padding: 24 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
          {t('leave.reject_title')}
        </div>
        <textarea
          autoFocus
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t('leave.reject_notes_placeholder')}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
            border: '1.5px solid var(--border)', fontFamily: 'inherit',
            boxSizing: 'border-box', resize: 'vertical',
          }}
        />
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'transparent',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--danger)', color: '#fff', fontWeight: 700,
              cursor: 'pointer', fontSize: 13,
            }}
          >
            {loading ? t('common.saving') : t('leave.reject_confirm')}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancel confirmation modal
// ---------------------------------------------------------------------------

function CancelModal({
  open, onClose, onConfirm, loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(13,33,55,0.48)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', borderRadius: 12,
        width: 380, maxWidth: '90vw', overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--danger) 0%, #f97316 100%)' }} />
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            {t('leave.cancel_confirm_title')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.55 }}>
            {t('leave.cancel_confirm_msg')}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontSize: 13, color: 'var(--text)',
                fontWeight: 600,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: 'var(--danger)', color: '#fff', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, opacity: loading ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? t('common.saving') : t('leave.cancel_request')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteModal({
  open, onClose, onConfirm, loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(13,33,55,0.48)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', borderRadius: 12,
        width: 380, maxWidth: '90vw', overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--danger) 0%, #f97316 100%)' }} />
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            {t('leave.delete_confirm_title', 'Elimina richiesta')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.55 }}>
            {t('leave.delete_confirm_msg', 'Sei sicuro di voler eliminare definitivamente questa richiesta di permesso? Questa azione non può essere annullata.')}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: '1.5px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontSize: 13, color: 'var(--text)',
                fontWeight: 600,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: 'var(--danger)', color: '#fff', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, opacity: loading ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? t('common.saving') : t('common.delete', 'Elimina')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main list component
// ---------------------------------------------------------------------------

interface Props {
  requests: LeaveRequest[];
  loading?: boolean;
  onRefresh: () => void;
  /** If true, show approve/reject action buttons */
  showActions?: boolean;
  /**
   * Why the list is empty, so the empty state can say which it is. 'forbidden'
   * means the module permission blocked the fetch; anything else means there
   * genuinely are no rows.
   */
  emptyReason?: 'none' | 'forbidden' | 'no_store' | 'on_leave';
  /** Approvers away on granted leave right now, named in a strip above the list. */
  approversOnLeave?: ApproverOnLeave[];
  /** The viewer's own leave covering today. Set = read-only queue. */
  callerLeave?: { startDate: string; endDate: string; leaveType: string } | null;
}

/**
 * Chain order, mirroring the server. A request is actionable by the role whose
 * turn it is and by every role above it: an area manager does not have to wait
 * for the store manager. Once someone acts the stage moves up, and the roles
 * below it lose their buttons because their turn has passed.
 */
const ROLE_RANK: Record<string, number> = {
  admin: 100, hr: 80, area_manager: 60, store_manager: 40, employee: 20,
};
const rankOf = (r?: string | null) =>
  ROLE_RANK[String(r ?? '').toLowerCase().replace(/s+/g, '_')] ?? 0;

export function LeaveApprovalList({ requests, loading, onRefresh, showActions = false, emptyReason = 'none', approversOnLeave = [], callerLeave = null }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const effectiveApproverRole = user?.role === 'admin' ? 'admin' : user?.role;

  async function handleDownloadCertificate(req: LeaveRequest) {
    try {
      const blob = await downloadCertificate(req.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = req.medicalCertificateName ?? 'certificato-medico';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast(t('leave.certificate_download_error'), 'error');
    }
  }

  async function handleApprove(id: number) {
    setActionLoading(true);
    try {
      await approveLeaveRequest(id);
      showToast(t('leave.approved_success'), 'success');
      onRefresh();
    } catch (err: unknown) {
      showToast(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'), 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(id: number, notes: string) {
    setActionLoading(true);
    try {
      await rejectLeaveRequest(id, notes);
      showToast(t('leave.rejected_success'), 'success');
      setRejectTarget(null);
      onRefresh();
    } catch (err: unknown) {
      showToast(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'), 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (cancelTarget === null) return;
    setActionLoading(true);
    try {
      await cancelLeaveRequest(cancelTarget);
      showToast(t('leave.cancelled_success'), 'success');
      setCancelTarget(null);
      onRefresh();
    } catch (err: unknown) {
      showToast(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'), 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (deleteTarget === null) return;
    setActionLoading(true);
    try {
      await deleteLeaveRequest(deleteTarget);
      showToast(t('leave.deleted_success', 'Richiesta di permesso eliminata'), 'success');
      setDeleteTarget(null);
      onRefresh();
    } catch (err: unknown) {
      showToast(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'), 'error');
    } finally {
      setActionLoading(false);
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    // Use regex to get YYYY, MM, DD from the start of the string
    // This handles both "YYYY-MM-DD" and "YYYY-MM-DDThh:mm..." and ignores any trailing Z or offset
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return iso;
    const [, y, m, d] = match;
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
    return dateObj.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getDurationDays(isoStart: string, isoEnd: string): number {
    const parse = (iso: string) => {
      const match = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return new Date();
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    };
    const s = parse(isoStart);
    const e = parse(isoEnd);
    let count = 0;
    const d = new Date(s);
    while (d <= e) {
      const w = d.getDay();
      if (w !== 0 && w !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function getShortLeaveHours(startTime?: string | null, endTime?: string | null): number | null {
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some((value) => Number.isNaN(value))) return null;
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (endMinutes <= startMinutes) return null;
    return Number(((endMinutes - startMinutes) / 60).toFixed(2));
  }

  function getInitials(surname: string, name: string): string {
    return `${(surname[0] ?? '').toUpperCase()}${(name[0] ?? '').toUpperCase()}`;
  }

  function getAvatarColor(name: string): string {
    const colors = ['#0D2137', '#1d4ed8', '#7c3aed', '#0369a1', '#065f46', '#92400e'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-secondary)', textAlign: 'center' }}>{t('common.loading')}</div>;
  }

  if (requests.length === 0) {
    // Three different situations that all used to render the same blank panel:
    // no permission, no store association, and genuinely nothing to approve.
    // Only the last is normal; the other two need someone to act.
    const blocked = emptyReason === 'forbidden';
    const noStore = emptyReason === 'no_store';
    const onLeave = emptyReason === 'on_leave';

    if (onLeave) {
      return (
        <div style={{
          padding: '44px 32px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(37,99,235,0.10)', color: '#2563eb',
          }}>
            <Palmtree size={22} strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('leave.empty_on_leave_title', 'Sei in ferie')}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.5 }}>
            {t('leave.empty_on_leave_body', 'Sei attualmente in ferie approvate, quindi le richieste sono stete affidate agli altri approvatori. Torneranno qui al tuo rientro.')}
          </div>
        </div>
      );
    }

    if (noStore) {
      return (
        <div style={{
          padding: '44px 32px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(180,83,9,0.10)', color: '#b45309',
          }}>
            <Store size={22} strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('leave.empty_no_store_title', 'Nessun negozio associato')}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 420, lineHeight: 1.5 }}>
            {t('leave.empty_no_store_body', 'Il tuo profilo non è associato ad alcun negozio, quindi non ci sono richieste da mostrare qui. Chiedi a HR o a un amministratore di assegnarti un negozio.')}
          </div>
        </div>
      );
    }
    return (
      <div style={{
        padding: '48px 32px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: blocked ? 'rgba(220,38,38,0.10)' : 'rgba(22,163,74,0.10)',
          color: blocked ? '#dc2626' : '#16a34a',
        }}>
          {blocked ? <Lock size={20} strokeWidth={2.2} /> : <CheckCheck size={22} strokeWidth={2.2} />}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          {blocked
            ? t('leave.empty_forbidden_title', 'Permesso modulo richiesto')
            : t('leave.empty_none_title', 'Nessuna richiesta')}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 380, lineHeight: 1.5 }}>
          {blocked
            ? t('leave.empty_forbidden_body', 'Il tuo ruolo non ha accesso al modulo Permessi. Chiedi a un amministratore di abilitarlo per vedere le richieste da approvare.')
            : t('leave.empty_none_body', 'Non ci sono richieste da mostrare qui al momento.')}
        </div>
      </div>
    );
  }

  return (
    <>
      <RejectModal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={(notes) => rejectTarget !== null && handleReject(rejectTarget, notes)}
        loading={actionLoading}
      />
      <CancelModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        loading={actionLoading}
      />
      <DeleteModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        loading={actionLoading}
      />

      {/* The viewer's own leave. The queue stays fully visible — only the
          decisions are withheld — so "I can see it but cannot act" is stated
          rather than left to be inferred from missing buttons. */}
      {callerLeave && (
        <div style={{
          margin: '4px 16px 0', padding: '11px 14px', borderRadius: 10,
          background: 'var(--surface-warm, rgba(37,99,235,0.07))',
          border: '1px solid rgba(37,99,235,0.20)',
          display: 'flex', alignItems: 'flex-start', gap: 9,
        }}>
          <Palmtree size={15} strokeWidth={2.2} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)', fontWeight: 650 }}>
              {t('leave.caller_on_leave_title', 'Sei in ferie approvate')}
            </strong>{' '}
            {formatDate(callerLeave.startDate)} – {formatDate(callerLeave.endDate)}.{' '}
            {t('leave.caller_on_leave_body', 'Puoi consultare tutte le richieste, ma le decisioni sono affidate agli altri approvatori fino al tuo rientro.')}
          </div>
        </div>
      )}

      {/* Who is away, named. An approver on leave used to just be a silent gap in
          the chain — you could not tell whether nobody had acted or nobody could. */}
      {approversOnLeave.length > 0 && (
        <div style={{
          margin: '4px 16px 0', padding: '10px 12px', borderRadius: 10,
          background: 'var(--surface-warm, rgba(180,83,9,0.06))',
          border: '1px solid rgba(180,83,9,0.16)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        }}>
          <Palmtree size={14} strokeWidth={2.2} style={{ color: '#b45309', flexShrink: 0 }} />
          {approversOnLeave.map((a) => (
            <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {a.avatarFilename ? (
                <img
                  src={getAvatarUrl(a.avatarFilename) ?? undefined}
                  alt=""
                  style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(180,83,9,0.14)', color: '#b45309',
                  fontSize: 9, fontWeight: 700,
                }}>
                  {(a.name?.[0] ?? '').toUpperCase()}{(a.surname?.[0] ?? '').toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                <strong style={{ color: 'var(--text-primary)', fontWeight: 650 }}>
                  {a.name} {a.surname}
                </strong>
                {' '}({t(`roles.${a.role}`, a.role.replace(/_/g, ' '))})
                {' '}{t('leave.approver_on_leave', 'è in ferie')} {formatDate(a.startDate)} – {formatDate(a.endDate)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Inset from the panel edge. The cards previously ran flush against the
          container border, which read as a rendering fault rather than a list. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 16px 16px' }}>
        {requests.slice(0, visibleCount).map((req) => {
          const isVacation = req.leaveType === 'vacation';
          const isShortLeave = req.leaveDurationType === 'short_leave';
          const shortHours = getShortLeaveHours(req.shortStartTime, req.shortEndTime);
          const isRejected = req.status === 'rejected';
          const accentColor = isRejected ? 'var(--danger)' : isVacation ? 'var(--accent)' : '#0369a1';
          const days = getDurationDays(req.startDate, req.endDate);
          const initials = getInitials(req.userSurname ?? '', req.userName ?? '');
          const avatarBg = getAvatarColor((req.userSurname ?? '') + (req.userName ?? ''));

          return (
            <div
              key={req.id}
              className="card-lift"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${accentColor}`,
                borderRadius: 10,
                boxShadow: 'var(--shadow-xs)',
                transition: 'box-shadow 0.15s',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '14px 18px' }}>
                {/* Top row: avatar + name/date + badges */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: req.userAvatarFilename ? 'transparent' : avatarBg, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)',
                    letterSpacing: 0.5, overflow: 'hidden',
                  }}>
                    {req.userAvatarFilename ? (
                      <img
                        src={getAvatarUrl(req.userAvatarFilename) ?? ''}
                        alt={`${req.userName} ${req.userSurname}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : initials}
                  </div>

                  {/* Name + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        {req.userName} {req.userSurname}
                      </span>
                      {/* Leave type badge */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600,
                        color: isVacation ? 'var(--accent)' : '#0369a1',
                        background: isVacation ? 'var(--accent-light)' : 'rgba(3,105,161,0.08)',
                        padding: '1px 8px', borderRadius: 20,
                        border: `1px solid ${isVacation ? 'rgba(201,151,58,0.3)' : 'rgba(3,105,161,0.2)'}`,
                      }}>
                        {isVacation ? <Palmtree size={11} strokeWidth={2.4} /> : <Thermometer size={11} strokeWidth={2.4} />}
                        {t(`leave.type_${req.leaveType}`)}
                      </span>
                      {/* Duration badge */}
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                        background: 'var(--background)', padding: '1px 8px',
                        borderRadius: 20, border: '1px solid var(--border)',
                      }}>
                        {isShortLeave && shortHours != null
                          ? `${shortHours}h`
                          : `${days} ${days === 1 ? t('leave.day_singular', 'giorno') : t('leave.day_plural', 'giorni')}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {isShortLeave
                        ? `${formatDate(req.startDate)} · ${req.shortStartTime ?? '--:--'}-${req.shortEndTime ?? '--:--'}`
                        : (
                          <>
                            {formatDate(req.startDate)}
                            {req.startDate !== req.endDate && <> — {formatDate(req.endDate)}</>}
                          </>
                        )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusBadge req={req} />
                    {req.status === 'cancelled' && (!req.approvedByRoles || req.approvedByRoles.length === 0) && (req.userId === user?.id || user?.role === 'admin') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(req.id);
                        }}
                        disabled={actionLoading}
                        title={t('leave.delete_tooltip', 'Elimina richiesta')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: 'var(--danger)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Trash2 size={13} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {req.notes && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic',
                    marginBottom: 8, paddingLeft: 52,
                  }}>
                    "{req.notes}"
                  </div>
                )}

                {/* Certificate download button */}
                {req.medicalCertificateName && (
                  <div style={{ marginBottom: 8, paddingLeft: 52 }}>
                    <button
                      onClick={() => handleDownloadCertificate(req)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 6,
                        background: 'rgba(3,105,161,0.08)', border: '1px solid rgba(3,105,161,0.25)',
                        color: '#0369a1', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {t('leave.certificate_btn')}
                    </button>
                  </div>
                )}

                {/* Approval chain stepper */}
                <div style={{
                  background: 'var(--background)', borderRadius: 8,
                  padding: '10px 14px', marginTop: 4,
                  border: '1px solid var(--border)',
                }}>
                  <ApprovalStepper req={req} />
                </div>

                {/* Action buttons — approvers */}
                {showActions &&
                  !req.status.includes('rejected') &&
                  req.status !== 'approved' &&
                  req.status !== 'admin_approved' &&
                  req.currentApproverRole !== null &&
                  req.status !== 'cancelled' &&
                  !callerLeave &&
                  (user?.isSuperAdmin ||
                    rankOf(effectiveApproverRole) >= rankOf(req.currentApproverRole)) && (
                  // Balance on the left, actions on the right: the approver
                  // needs to know what the request will be drawn from before
                  // deciding, and the two belong on the same line.
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginTop: 12,
                    paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap',
                  }}>
                    <RequestBalance req={req} />
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={actionLoading}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: 'var(--primary)', color: '#fff',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        opacity: actionLoading ? 0.6 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t('leave.action_approve')}
                    </button>
                    <button
                      onClick={() => setRejectTarget(req.id)}
                      disabled={actionLoading}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 16px', borderRadius: 8,
                        border: '1.5px solid var(--danger)',
                        background: 'transparent', color: 'var(--danger)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        opacity: actionLoading ? 0.6 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      {t('leave.action_reject')}
                    </button>
                    </div>
                  </div>
                )}
                {/* Cancel button — only for the request owner when still pending */}
                {!showActions && req.userId === user?.id && req.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => setCancelTarget(req.id)}
                      disabled={actionLoading}
                      style={{
                         display: 'inline-flex', alignItems: 'center', gap: 6,
                         padding: '7px 16px', borderRadius: 8,
                         border: '1.5px solid var(--danger)',
                         background: 'transparent', color: 'var(--danger)',
                         fontSize: 13, fontWeight: 700, cursor: 'pointer',
                         opacity: actionLoading ? 0.6 : 1,
                         transition: 'all 0.15s',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      {t('leave.cancel_request')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {requests.length > visibleCount && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={() => setVisibleCount(prev => prev + 10)}
            style={{
              padding: '8px 24px',
              borderRadius: '8px',
              border: '1.5px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: 'var(--shadow-xs)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            {t('common.load_more', 'Load More')}
          </button>
        </div>
      )}
    </>
  );
}
