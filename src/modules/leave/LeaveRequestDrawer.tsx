import React, { useMemo, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock3, Palmtree, Thermometer } from 'lucide-react';
import { submitLeaveRequest, LeaveDurationType, LeaveType, getLeaveBalance } from '../../api/leave';
import { useToast } from '../../context/ToastContext';
import { DatePicker } from '../../components/ui/DatePicker';
import { formatLocalDate } from '../../utils/date';
import { translateApiError } from '../../utils/apiErrors';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

function getWorkingDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let count = 0;
  const current = new Date(s);
  while (current <= e) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function LeaveRequestDrawer({ open, onClose, onSubmitted, initialStartDate, initialEndDate }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const today = useMemo(() => formatLocalDate(new Date()), []);

  const [leaveType, setLeaveType] = useState<LeaveType>('vacation');
  const [leaveDurationType, setLeaveDurationType] = useState<LeaveDurationType>('full_day');
  const [startDate, setStartDate] = useState(initialStartDate || today);
  const [endDate, setEndDate] = useState(initialEndDate || today);
  const [shortStartTime, setShortStartTime] = useState('');
  const [shortEndTime, setShortEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [certificate, setCertificate] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [balances, setBalances] = useState<any[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    if (open) {
      reset();
      setLoadingBalance(true);
      getLeaveBalance({ year: new Date(startDate).getFullYear() })
        .then((res) => {
          setBalances(res.balances || []);
        })
        .catch(() => {})
        .finally(() => setLoadingBalance(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && startDate) {
      getLeaveBalance({ year: new Date(startDate).getFullYear() })
        .then((res) => {
          setBalances(res.balances || []);
        })
        .catch(() => {});
    }
  }, [startDate, open]);

  function reset() {
    setLeaveType('vacation');
    setLeaveDurationType('full_day');
    setStartDate(initialStartDate || today);
    setEndDate(initialEndDate || today);
    setShortStartTime('');
    setShortEndTime('');
    setNotes('');
    setCertificate(null);
    setError(null);
  }

  useEffect(() => {
    if (leaveType !== 'vacation') {
      setLeaveDurationType('full_day');
      setShortStartTime('');
      setShortEndTime('');
    }
  }, [leaveType]);

  useEffect(() => {
    if (leaveDurationType === 'short_leave') {
      setEndDate(startDate);
    }
  }, [leaveDurationType, startDate]);

  const shortLeaveHours = useMemo(() => {
    if (!shortStartTime || !shortEndTime) return null;
    const [startHour, startMinute] = shortStartTime.split(':').map(Number);
    const [endHour, endMinute] = shortEndTime.split(':').map(Number);
    if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
      return null;
    }
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    if (endMinutes <= startMinutes) return null;
    return Number(((endMinutes - startMinutes) / 60).toFixed(2));
  }, [shortEndTime, shortStartTime]);

  const matchingBalance = useMemo(() => {
    return balances.find((b) => b.leaveType === leaveType);
  }, [balances, leaveType]);

  const remainingDays = useMemo(() => {
    return matchingBalance ? matchingBalance.remainingDays : 0;
  }, [matchingBalance]);

  const requestedDays = useMemo(() => {
    if (leaveDurationType === 'short_leave' && shortLeaveHours != null) {
      return parseFloat((shortLeaveHours / 8).toFixed(2));
    }
    return getWorkingDays(startDate, endDate);
  }, [leaveDurationType, shortLeaveHours, startDate, endDate]);

  const exceedsBalance = useMemo(() => {
    return matchingBalance && requestedDays > remainingDays;
  }, [matchingBalance, requestedDays, remainingDays]);

  const hasNoBalance = useMemo(() => {
    return !loadingBalance && balances.length === 0;
  }, [loadingBalance, balances]);

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError(t('leave.error_dates_required'));
      return;
    }
    const todayStr = formatLocalDate(new Date());
    if (startDate < todayStr) {
      setError(t('leave.error_past_date'));
      return;
    }
    if (new Date(startDate + 'T00:00:00') > new Date(endDate + 'T00:00:00')) {
      setError(t('leave.error_date_range'));
      return;
    }

    if (leaveDurationType === 'short_leave') {
      if (leaveType !== 'vacation') {
        setError(t('leave.error_short_vacation_only', 'Short leave is available only for vacation.'));
        return;
      }
      if (startDate !== endDate) {
        setError(t('leave.error_short_same_day', 'Short leave must start and end on the same day.'));
        return;
      }
      if (!shortStartTime || !shortEndTime) {
        setError(t('leave.error_short_time_required', 'Start and end time are required for short leave.'));
        return;
      }
      if (shortLeaveHours == null || shortLeaveHours <= 0) {
        setError(t('leave.error_short_time_range', 'End time must be after start time.'));
        return;
      }
      if (shortLeaveHours >= 24) {
        setError(t('leave.error_short_duration', 'Short leave must be less than 24 hours.'));
        return;
      }
    }

    setLoading(true);
    try {
      await submitLeaveRequest({
        leaveType,
        startDate,
        endDate,
        leaveDurationType,
        shortStartTime: leaveDurationType === 'short_leave' ? shortStartTime : undefined,
        shortEndTime: leaveDurationType === 'short_leave' ? shortEndTime : undefined,
        notes: notes || undefined,
        certificate: leaveType === 'sick' && certificate ? certificate : undefined,
      });
      showToast(t('leave.submitted_success'), 'success');
      reset();
      onSubmitted();
    } catch (err: unknown) {
      setError(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="drawer-backdrop"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(13,33,55,0.34)',
          zIndex: 1000,
        }}
      />
      {/* Drawer panel */}
      <div
        className="drawer-panel"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(460px, 100vw)',
          background: 'var(--surface)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('leave.new_request')}
          </span>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, color: 'var(--text-secondary)', lineHeight: 1,
            }}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {hasNoBalance && (
            <div style={{
              marginBottom: 16, padding: '12px 16px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderLeft: '4px solid #f59e0b',
              borderRadius: 8, color: '#b45309', fontSize: 13,
              display: 'flex', alignItems: 'flex-start', gap: 10
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
              <div>
                <strong style={{ display: 'block', marginBottom: 2 }}>{t('leave.balance_not_configured_title', 'Saldo Non Configurato')}</strong>
                <span>{t('leave.balance_not_configured_desc', "Non è stato ancora configurato un piano ferie/permessi per te per quest'anno. Si prega di contattare le Risorse Umane (HR) della propria azienda per l'allocazione dei giorni spettanti.")}</span>
              </div>
            </div>
          )}

          {exceedsBalance && (
            <div style={{
              marginBottom: 16, padding: '12px 16px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderLeft: '4px solid #f59e0b',
              borderRadius: 8, color: '#b45309', fontSize: 13,
              display: 'flex', alignItems: 'flex-start', gap: 10
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
              <div>
                <strong style={{ display: 'block', marginBottom: 2 }}>{t('leave.insufficient_balance_title', 'Saldo Insufficiente')}</strong>
                <span>
                  {t('leave.insufficient_balance_desc', 'La richiesta di {{requested}} giorni supera il saldo rimanente di {{remaining}} giorni. Puoi comunque inviare la richiesta per approvazione.', {
                    requested: requestedDays,
                    remaining: remainingDays
                  })}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 8, color: '#dc2626', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Leave type toggle */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {t('leave.type_label')}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { key: 'vacation', label: t('leave.type_vacation'), icon: <Palmtree size={13} strokeWidth={2.4} /> },
                { key: 'sick', label: t('leave.type_sick'), icon: <Thermometer size={13} strokeWidth={2.4} /> },
              ] as const).map((typeOption) => (
                <button
                  key={typeOption.key}
                  type="button"
                  onClick={() => setLeaveType(typeOption.key as LeaveType)}
                  style={{
                    flex: 1, padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: leaveType === typeOption.key
                      ? (typeOption.key === 'vacation' ? 'var(--accent-light)' : 'rgba(245,158,11,0.08)')
                      : '#ffffff',
                    color: leaveType === typeOption.key
                      ? (typeOption.key === 'vacation' ? 'var(--accent)' : '#f59e0b')
                      : 'var(--text-secondary)',
                    border: `1px solid ${
                      leaveType === typeOption.key
                        ? (typeOption.key === 'vacation' ? 'var(--accent)' : 'rgba(245,158,11,0.3)')
                        : '#d1d5db'
                    }`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {typeOption.icon}
                  {typeOption.label}
                </button>
              ))}
            </div>
          </div>

          {leaveType === 'vacation' ? (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                {t('leave.duration_mode_label', 'Duration')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                    { key: 'full_day', label: t('leave.duration_full_day', 'Full day leave'), icon: <CalendarDays size={13} strokeWidth={2.4} /> },
                    { key: 'short_leave', label: t('leave.duration_short_leave', 'Short leave'), icon: <Clock3 size={13} strokeWidth={2.4} /> },
                ] as const).map((option) => {
                  const selected = leaveDurationType === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setLeaveDurationType(option.key)}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${
                          selected
                            ? (option.key === 'full_day' ? 'var(--accent)' : '#8b5cf6')
                            : '#d1d5db'
                        }`,
                        background: selected
                          ? (option.key === 'full_day' ? 'var(--accent-light)' : 'rgba(139,92,246,0.08)')
                          : '#ffffff',
                        color: selected
                          ? (option.key === 'full_day' ? 'var(--accent)' : '#8b5cf6')
                          : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 18, fontSize: 12, color: 'var(--text-muted)' }}>
              {t('leave.sick_full_day_hint', 'Sick leave is managed as full day leave.')}
            </div>
          )}

          {/* Start date */}
          <div style={{ marginBottom: 18 }}>
            <DatePicker
              label={t('leave.start_date')}
              value={startDate}
              onChange={setStartDate}
            />
          </div>

          {/* End date */}
          <div style={{ marginBottom: 18 }}>
            <DatePicker
              label={t('leave.end_date')}
              value={endDate}
              onChange={setEndDate}
              disabled={leaveDurationType === 'short_leave'}
              placement="top"
            />
          </div>

          {leaveDurationType === 'short_leave' && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                {t('leave.short_leave_time_range', 'Time range')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  type="time"
                  value={shortStartTime}
                  onChange={(e) => setShortStartTime(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: 'var(--text-primary)',
                    padding: '9px 10px',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
                <input
                  type="time"
                  value={shortEndTime}
                  onChange={(e) => setShortEndTime(e.target.value)}
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: 'var(--text-primary)',
                    padding: '9px 10px',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                {shortLeaveHours != null
                  ? t('leave.short_leave_hours', { hours: shortLeaveHours })
                  : t('leave.short_leave_hint', 'Select start and end time for a short leave.')}
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {t('leave.notes_label')} <span style={{ fontWeight: 400 }}>({t('common.optional')})</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={t('leave.notes_placeholder')}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14,
                border: '1px solid #d1d5db', background: '#ffffff',
                color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Certificate upload (sick leave only) */}
          {leaveType === 'sick' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', marginBottom: 6,
                fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.03em', textTransform: 'uppercase',
              }}>
                {t('leave.medical_certificate')}{' '}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                  {t('leave.medical_certificate_hint')}
                </span>
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                border: '1px dashed #d1d5db',
                background: '#ffffff',
              }}>
                <input
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; setCertificate(f ?? null); }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                  PDF
                </span>
                <span style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  flex: 1,
                }}>
                  {certificate ? certificate.name : t('leave.certificate_upload')}
                </span>
                {certificate && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setCertificate(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </label>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8, fontSize: 15, fontWeight: 700,
              background: loading ? 'var(--border)' : 'var(--primary)',
              color: '#fff', border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? t('common.saving') : t('leave.submit_request')}
          </button>
        </form>
      </div>
    </>
  );

  return ReactDOM.createPortal(drawer, document.body);
}
