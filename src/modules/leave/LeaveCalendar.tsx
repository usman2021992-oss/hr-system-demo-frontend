import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Palmtree, Thermometer, X, CheckCheck, XCircle, FileText, Clock } from 'lucide-react';
import { getLeaveRequests, LeaveRequest, approveLeaveRequest, rejectLeaveRequest, downloadCertificate } from '../../api/leave';
import { getStores } from '../../api/stores';
import { Store } from '../../types';
import { getAvatarUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StatusBadge, ApprovalStepper } from './LeaveApprovalList';
import { translateApiError } from '../../utils/apiErrors';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { listShifts, Shift } from '../../api/shifts';
import { CalendarPopover, rectOf } from './CalendarPopover';
import { SelectMenu } from '../../components/ui/SelectMenu';
import { leaveVisual, LEAVE_TYPE_TINT } from './leaveStatus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function initials(name?: string, surname?: string): string {
  const n = (name ?? '').trim();
  const s = (surname ?? '').trim();
  if (!n && !s) return 'U';
  if (!s) return n.slice(0, 1).toUpperCase();
  return `${n.slice(0, 1)}${s.slice(0, 1)}`.toUpperCase();
}

function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} -> ${endDate}`;
}

function formatLeaveStatus(status: string, t: any): string {
  const normalized = String(status ?? '').toLowerCase().replace(/\s+/g, '_');
  return t(`leave.status_${normalized}`, status || t('leave.status_pending', 'Pending'));
}

function formatCompactLeaveStatus(status: string, t: any): string {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized.includes('rejected')) return t('leave.status_rejected', 'Rejected');
  if (normalized.includes('pending') || normalized === 'pending') return t('leave.pending_short', 'pend.');
  return t('leave.approved_label', 'Approved');
}

function LegendDot({ color, label, icon }: { color: string; label: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
      {icon ?? <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      <span style={{ fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 4;

export default function LeaveCalendar({ onDayClick, onRefresh }: { onDayClick?: (date: string) => void; onRefresh?: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'it' ? 'it' : 'en';
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isMobile, isTablet } = useBreakpoint();
  
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  
  // Details Modal State
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [hoveredBlockKey, setHoveredBlockKey] = useState<string | null>(null);
  /**
   * Anchor rects for the floating cards. Held here rather than derived at
   * render time because the cards are portalled out of the scroll container —
   * see CalendarPopover for why that matters.
   */
  const [blockAnchor, setBlockAnchor] = useState<DOMRect | null>(null);
  const [dayAnchor, setDayAnchor] = useState<DOMRect | null>(null);

  /**
   * Closing the day card is deferred by a beat, because the card is portalled:
   * the moment the pointer leaves the cell on its way to the card, the cell's
   * mouseleave fires. The delay gives the card a chance to say "I have it".
   */
  const dayCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDayClose = useCallback(() => {
    if (dayCloseTimer.current) {
      clearTimeout(dayCloseTimer.current);
      dayCloseTimer.current = null;
    }
  }, []);

  const closeDayCard = useCallback(() => {
    cancelDayClose();
    dayCloseTimer.current = setTimeout(() => {
      setHoveredDay(null);
      setDayAnchor(null);
    }, 140);
  }, [cancelDayClose]);

  // A pending close must not fire after the component is gone.
  useEffect(() => cancelDayClose, [cancelDayClose]);

  // Opening a request from inside the day card should dismiss the card, or it
  // floats above the modal that replaced it.
  useEffect(() => {
    if (!selectedRequest) return;
    cancelDayClose();
    setHoveredDay(null);
    setDayAnchor(null);
    setHoveredBlockKey(null);
  }, [selectedRequest, cancelDayClose]);

  const [shiftsForTarget, setShiftsForTarget] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [cancelShiftsChecked, setCancelShiftsChecked] = useState(true);

  useEffect(() => {
    if (!selectedRequest) {
      setShiftsForTarget([]);
      setCancelShiftsChecked(true);
      return;
    }

    let active = true;
    setShiftsLoading(true);
    setShiftsForTarget([]);

    listShifts({
      user_id: selectedRequest.userId,
      start_date: selectedRequest.startDate,
      end_date: selectedRequest.endDate,
    })
      .then((res) => {
        if (!active) return;
        const activeShifts = res.shifts.filter((s) => s.status !== 'cancelled');
        setShiftsForTarget(activeShifts);
      })
      .catch((err) => {
        console.error('Error fetching shifts for leave calendar details:', err);
      })
      .finally(() => {
        if (active) setShiftsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRequest]);

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | 'all'>('all');
  const [fetchingStores, setFetchingStores] = useState(false);

  const canFilterByStore = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'area_manager' || user?.isSuperAdmin;

  useEffect(() => {
    if (canFilterByStore) {
      setFetchingStores(true);
      getStores()
        .then(setStores)
        .catch(() => setStores([]))
        .finally(() => setFetchingStores(false));
    }
  }, [canFilterByStore]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const firstDay = formatDate(new Date(year, month, 1));
      const lastDay = formatDate(new Date(year, month, daysInMonth(year, month)));
      const params: any = { dateFrom: firstDay, dateTo: lastDay };
      if (selectedStoreId !== 'all') {
        params.storeId = selectedStoreId;
      }
      const res = await getLeaveRequests(params);
      // Exclude only cancelled requests; rejected requests remain visible with their current status.
      setRequests(res.requests.filter((r) =>
        r.status !== 'cancelled'
      ));
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, selectedStoreId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (req: LeaveRequest) => {
    setActionLoading(true);
    try {
      await approveLeaveRequest(req.id, undefined, cancelShiftsChecked && shiftsForTarget.length > 0);
      showToast(t('leave.approved_success'), 'success');
      setSelectedRequest(null);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      showToast(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectNotes.trim()) {
      setRejectError(t('leave.reject_notes_required'));
      return;
    }
    setActionLoading(true);
    try {
      await rejectLeaveRequest(rejectTarget.id, rejectNotes);
      showToast(t('leave.rejected_success'), 'success');
      setRejectTarget(null);
      setSelectedRequest(null);
      fetchData();
      if (onRefresh) onRefresh();
    } catch (err: unknown) {
      setRejectError(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadCert = async (req: LeaveRequest) => {
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
  };

  // Build day -> requests map
  const dayMap = new Map<string, LeaveRequest[]>();
  for (const req of requests) {
    const start = new Date(req.startDate + 'T12:00:00');
    const end = new Date(req.endDate + 'T12:00:00');
    const d = new Date(start);
    while (d <= end) {
      if (d.getMonth() === month && d.getFullYear() === year) {
        const key = formatDate(d);
        const arr = dayMap.get(key) ?? [];
        arr.push(req);
        dayMap.set(key, arr);
      }
      d.setDate(d.getDate() + 1);
    }
  }

  const DAY_LABELS = [
    t('shifts.dayMon', 'Mon'),
    t('shifts.dayTue', 'Tue'),
    t('shifts.dayWed', 'Wed'),
    t('shifts.dayThu', 'Thu'),
    t('shifts.dayFri', 'Fri'),
    t('shifts.daySat', 'Sat'),
    t('shifts.daySun', 'Sun'),
  ];

  const monthLabel = new Date(year, month, 1).toLocaleDateString(
    i18n.language === 'it' ? 'it-IT' : 'en-US',
    { month: 'long', year: 'numeric' },
  );

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const todayStr = formatDate(new Date());

  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
  const daysInMonthTotal = daysInMonth(year, month);

  const cells: (Date | null)[] = (isMobile || isTablet)
    ? Array.from({ length: daysInMonthTotal }, (_, i) => new Date(year, month, i + 1))
    : [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonthTotal }, (_, i) => new Date(year, month, i + 1)),
      ];
  if (!isMobile && !isTablet) {
    while (cells.length % 7 !== 0) cells.push(null);
  }

  const summaryHoverCardStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    minWidth: 220,
    maxWidth: 280,
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.44)',
    background: '#ffffff',
    boxShadow: '0 14px 36px rgba(15,23,42,0.22)',
    padding: '8px 9px',
    zIndex: 100,
  };

  const renderAvatar = (req: LeaveRequest, size = 18): React.ReactNode => {
    const avatarUrl = getAvatarUrl(req.userAvatarFilename);
    const initialsStr = initials(req.userName, req.userSurname);
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt=""
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(148,163,184,0.45)' }}
        />
      );
    }
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e3a5f, #3a7bd5)',
          color: '#fff',
          fontSize: size <= 20 ? '0.52rem' : '0.8rem',
          fontWeight: 800,
          border: '1px solid rgba(148,163,184,0.45)',
        }}
      >
        {initialsStr}
      </span>
    );
  };

  const effectiveApproverRole = user?.role === 'admin' ? 'admin' : user?.role;
  const canAct = (req: LeaveRequest) => {
    return req.status !== 'approved' &&
      !req.status.includes('rejected') &&
      req.status !== 'cancelled' &&
      !!effectiveApproverRole &&
      (user?.role === 'admin' || (user?.role === 'hr' && req.status !== 'HR approved') || req.currentApproverRole === effectiveApproverRole);
  };

  return (
    <div style={{
      padding: (isMobile || isTablet) ? '12px 16px' : '24px 32px',
      background: 'var(--surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Navigation — flat navy, no gradient. A gradient behind a row of small
          controls muddies their edges; a single solid tone keeps them crisp. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
        flexWrap: 'wrap',
        padding: (isMobile || isTablet) ? '10px 12px' : '14px 18px',
        borderRadius: 14,
        background: '#12395F',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 14px rgba(13,33,55,0.16)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
          background: 'rgba(255,255,255,0.10)', borderRadius: 10, padding: 3,
          border: '1px solid rgba(255,255,255,0.14)',
        }}>
          <button
            onClick={prevMonth}
            aria-label={t('common.previous', 'Previous')}
            style={{
              padding: '6px 8px', color: '#fff', borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronLeft size={18} />
          </button>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            minWidth: 118, textAlign: 'center', userSelect: 'none', padding: '0 4px',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: 15, color: '#fff', lineHeight: 1.1,
              textTransform: 'capitalize', whiteSpace: 'nowrap', letterSpacing: '-0.01em',
            }}>
              {monthLabel.split(' ')[0]}
            </span>
            <span style={{
              fontSize: 10, color: 'rgba(255,255,255,0.62)', marginTop: 2,
              fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.06em',
            }}>
              {monthLabel.split(' ')[1] || new Date().getFullYear()}
            </span>
          </div>
          <button
            onClick={nextMonth}
            aria-label={t('common.next', 'Next')}
            style={{
              padding: '6px 8px', color: '#fff', borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={goToday}
          style={{
            fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff', border: 'none', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {t('common.today', 'Today')}
        </button>

        {canFilterByStore && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.62)',
              whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {t('employees.store_label', 'Store')}
            </span>
            {/* Custom menu rather than a native select: the OS popup ignores
                our styling entirely and rendered an unreadable plain list. The
                company name becomes a secondary hint instead of being crammed
                into the label in brackets. */}
            <SelectMenu
              tone="dark"
              // Store names carry a company suffix, so a narrow control forced
              // the list to truncate exactly the part that distinguishes them.
              minWidth={300}
              disabled={fetchingStores}
              ariaLabel={t('employees.store_label', 'Store')}
              value={String(selectedStoreId)}
              onChange={(val) => setSelectedStoreId(val === 'all' ? 'all' : parseInt(val, 10))}
              options={[
                { value: 'all', label: t('common.all_stores', 'All Stores') },
                ...stores.map(s => ({
                  value: String(s.id),
                  label: s.name,
                  hint: s.groupName ?? s.companyName ?? undefined,
                })),
              ]}
            />
          </div>
        )}
      </div>

      {/* Legend — outside the dark banner so it stays readable, and now covers
          the states as well as the types, since the chips encode both. */}
      <div style={{
        display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 14, paddingLeft: 2,
      }}>
        <LegendDot color={LEAVE_TYPE_TINT.vacation.rail} label={t('leave.type_vacation')} icon={<Palmtree size={12} color={LEAVE_TYPE_TINT.vacation.rail} />} />
        <LegendDot color={LEAVE_TYPE_TINT.sick.rail} label={t('leave.type_sick')} icon={<Thermometer size={12} color={LEAVE_TYPE_TINT.sick.rail} />} />
        <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <LegendDot color="#d97706" label={t('leave.badge_escalated', 'Sollecitata')} />
        <LegendDot color="#dc2626" label={t('leave.badge_unverified', 'Da verificare')} />
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px',
            border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
            animation: 'spin 0.7s linear infinite',
          }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        </div>
      )}

      {!loading && (
        <div style={{ padding: 0, overflowX: 'visible' }}>
          {/* No min-width and no horizontal scroll: the grid fits whatever
              width it is given. Entry chips shrink and ellipsise instead, so
              the month is always readable in one view. */}
          <div style={{ width: '100%' }}>
            {/* Day headers */}
            {!isMobile && !isTablet && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 6, marginBottom: 8,
              }}>
                {DAY_LABELS.map((label, i) => (
                  <div key={label} style={{
                    textAlign: 'center',
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    // Weekend headers muted, so the week reads at a glance.
                    color: i >= 5 ? 'var(--text-muted)' : 'var(--primary)',
                    padding: '7px 0',
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    background: 'var(--surface-warm)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}>
                    {label}
                  </div>
                ))}
              </div>
            )}

            {/* Day cells */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(7, minmax(0, 1fr))',
              gap: (isMobile || isTablet) ? 12 : 6
            }}>
              {cells.map((date, idx) => {
                if (!date) {
                  return <div key={`empty-${idx}`} style={{ minHeight: 104 }} />;
                }
              const dateStr = formatDate(date);
              const dayReqs = dayMap.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isHovered = hoveredDay === dateStr;
              const hasLeaves = dayReqs.length > 0;
              const dow = date.getDay();
              const isWeekend = dow === 0 || dow === 6;

              return (
                <div
                  key={dateStr}
                  style={{
                    minWidth: 0,
                    minHeight: 118,
                    borderRadius: 10,
                    border: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                    padding: 8,
                    cursor: 'pointer',
                    // Flat fills. Weekends sit back a shade so the working week
                    // stands out, the same cue the shifts calendar uses.
                    background: isToday
                      ? 'rgba(201,151,58,0.07)'
                      : isWeekend
                        ? 'var(--surface-warm)'
                        : 'var(--surface)',
                    transition: 'box-shadow 0.15s, transform 0.15s',
                    position: 'relative',
                    transform: isHovered ? 'translateY(-1px)' : undefined,
                    boxShadow: isHovered
                      ? '0 6px 18px rgba(15,23,42,0.10)'
                      : hasLeaves ? 'var(--shadow-xs)' : undefined,
                  }}
                  onMouseEnter={(e) => {
                    cancelDayClose();
                    setHoveredDay(dateStr);
                    setDayAnchor(rectOf(e));
                  }}
                  onMouseLeave={closeDayCard}
                  onClick={(e) => {
                    // Only open day click if we didn't click a specific leave item
                    if (e.target === e.currentTarget && onDayClick) {
                      onDayClick(dateStr);
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginBottom: 6,
                  }}>
                    <div style={{
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? 'var(--accent)' : 'var(--text)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.9rem',
                      lineHeight: 1,
                    }}>
                      {isToday ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: '50%',
                          background: 'var(--accent)', color: '#fff', fontWeight: 700,
                          boxShadow: '0 0 0 3px rgba(201,151,58,0.16)',
                        }}>
                          {date.getDate()}
                        </span>
                      ) : date.getDate()}
                    </div>

                    {(isMobile || isTablet) && (
                      <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        fontFamily: 'var(--font-display)',
                      }}>
                        {DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                      </div>
                    )}
                  </div>

                  {hasLeaves && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {dayReqs.slice(0, MAX_VISIBLE).map((req) => {
                        const isVacation = req.leaveType === 'vacation';
                        // Type sets the hue, state sets the treatment — so a
                        // reader can tell vacation from sick AND settled from
                        // still-open at a glance, which one colour cannot do.
                        const tint = LEAVE_TYPE_TINT[isVacation ? 'vacation' : 'sick'];
                        const visual = leaveVisual(req);
                        const isApproved = visual.state === 'approved';
                        const needsAttention = visual.state === 'unverified' || visual.state === 'escalated';
                        const isPending = !isApproved && !needsAttention
                          && visual.state !== 'cancelled' && visual.state !== 'rejected';

                        const color = needsAttention ? visual.color : tint.color;
                        // Flat fills, no gradients: at chip size a gradient just
                        // reads as a smudge. Open entries sit lighter than
                        // settled ones, which carries the same information.
                        const bg = needsAttention
                          ? visual.fill
                          : (isPending ? `${tint.rail}14` : `${tint.rail}24`);
                        const borderLeft = needsAttention ? visual.rail : tint.rail;
                        const border = needsAttention ? visual.border : `${tint.rail}2e`;
                        const Icon = isVacation ? Palmtree : Thermometer;

                        return (
                          <div 
                            key={req.id} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRequest(req);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              borderRadius: 4,
                              borderLeft: `3px solid ${borderLeft}`,
                              borderTop: `1px solid ${border}`,
                              borderRight: `1px solid ${border}`,
                              borderBottom: `1px solid ${border}`,
                              background: bg,
                              color: color,
                              padding: '4px 7px 4px 8px',
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              lineHeight: 1.2,
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'transform 0.1s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.02)';
                              setHoveredBlockKey(`${req.id}-${dateStr}`);
                              setBlockAnchor(rectOf(e));
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              setHoveredBlockKey(null);
                              setBlockAnchor(null);
                            }}
                          >
                            <Icon size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                              {isVacation ? t('leave.type_vacation', 'Vacation') : t('leave.type_sick', 'Sick leave')}
                            </span>

                            <div style={{
                              marginLeft: 'auto',
                              background: 'rgba(255,255,255,0.7)',
                              padding: '1px 4px',
                              borderRadius: 3,
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              color: color,
                              lineHeight: 1.4,
                            }}>
                              {isApproved ? t('leave.approved_short', 'Appr.') : t('leave.pending_short', 'pend.')}
                            </div>

                            {hoveredBlockKey === `${req.id}-${dateStr}` && (
                              <CalendarPopover anchor={blockAnchor}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    {renderAvatar(req, 24)}
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 800, fontSize: 12, lineHeight: 1.25 }}>
                                        {req.userName} {req.userSurname}
                                      </div>
                                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                        {req.storeName ?? t('employees.noStore', 'No store')}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                    <Icon size={12} strokeWidth={2.5} style={{ color: tint.rail }} />
                                    <span style={{ fontWeight: 700, color: tint.color }}>
                                      {isVacation ? t('leave.type_vacation', 'Vacation') : t('leave.type_sick', 'Sick leave')}
                                    </span>
                                  </div>

                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {req.leaveDurationType === 'short_leave'
                                      ? `${new Date(req.startDate).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')} · ${req.shortStartTime ?? '--:--'} – ${req.shortEndTime ?? '--:--'}`
                                      : `${new Date(req.startDate).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')} → ${new Date(req.endDate).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')}`}
                                  </div>

                                  {/* Same state vocabulary as the list badge — an
                                      auto-approved request reads DA VERIFICARE here too. */}
                                  <span
                                    title={visual.hintKey ? t(`leave.${visual.hintKey}`) : undefined}
                                    style={{
                                      marginTop: 2, alignSelf: 'flex-start',
                                      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
                                      padding: '3px 8px', borderRadius: 20,
                                      background: visual.fill,
                                      color: visual.color,
                                      border: `1px solid ${visual.border}`,
                                    }}
                                  >
                                    {t(`leave.${visual.labelKey}`)}
                                  </span>
                                </div>
                              </CalendarPopover>
                            )}
                          </div>
                        );
                      })}
                      {/* A chip like the others, not loose text: it is the
                          control that reveals the rest of the day, so it has to
                          look like something you can act on. Hovering it opens
                          the full day list, where each row can be hovered for
                          detail or clicked to open the request. */}
                      {dayReqs.length > MAX_VISIBLE && (
                        <div
                          onMouseEnter={(e) => {
                            e.stopPropagation();
                            setHoveredBlockKey(null);   // let the day card win
                            setHoveredDay(dateStr);
                            setDayAnchor(rectOf(e));
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHoveredDay(dateStr);
                            setDayAnchor(rectOf(e));
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            borderRadius: 4,
                            border: '1px dashed var(--border)',
                            background: 'var(--surface-warm)',
                            color: 'var(--text-secondary)',
                            padding: '3px 7px',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            transition: 'background 0.12s, color 0.12s',
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'var(--surface)';
                            e.currentTarget.style.color = 'var(--primary)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'var(--surface-warm)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                        >
                          +{dayReqs.length - MAX_VISIBLE} {t('common.more', 'more')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hover tooltip for full list */}
                  {/* Portalled: an absolutely-positioned card here used to push
                      the scroll container and shift the grid under the pointer.
                      CalendarPopover also handles the flip-up / edge cases that
                      the manual top/bottom/left/right juggling approximated. */}
                  {/* Only when no individual entry is hovered. A chip's
                      mouseenter bubbles up to the day cell, so without this
                      both the day summary and the entry card opened together. */}
                  {isHovered && hasLeaves && !hoveredBlockKey && (
                    <CalendarPopover
                      anchor={dayAnchor}
                      // Interactive: the rows inside are the way into a request
                      // when the day has more entries than the cell can show.
                      interactive
                      onMouseEnter={cancelDayClose}
                      onMouseLeave={closeDayCard}
                    >
                      {(() => {
                        const vacations = dayReqs.filter(r => r.leaveType === 'vacation');
                        const sickLeaves = dayReqs.filter(r => r.leaveType === 'sick');

                        return (
                          <>
                            {/* Vacation Group */}
                            {vacations.length > 0 && (
                              <div style={{ marginBottom: sickLeaves.length > 0 ? 10 : 0 }}>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  color: '#1e40af',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  marginBottom: 8,
                                  paddingBottom: 4,
                                  borderBottom: '1px solid rgba(30,64,175,0.1)'
                                }}>
                                  <Palmtree size={13} strokeWidth={2.5} />
                                  <span>{t('leave.type_vacation', 'Vacation')} {vacations.length}</span>
                                </div>
                                {vacations.map((req, vIdx) => (
                                  <div
                                    key={req.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedRequest(req);
                                    }}
                                    style={{
                                      padding: '4px 0',
                                      marginBottom: vIdx === vacations.length - 1 ? 0 : 4,
                                      cursor: 'pointer',
                                      borderRadius: 4,
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                      {renderAvatar(req)}
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                                        {req.userName} {req.userSurname}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: 2, paddingLeft: 25, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                      {req.storeName ?? t('employees.noStore', 'No store')} {req.companyName ? `• ${req.companyName}` : ''}
                                    </div>
                                    <div style={{ marginTop: 1, paddingLeft: 25, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                      {formatDateRange(req.startDate, req.endDate)}
                                    </div>
                                    <div style={{ marginTop: 3, paddingLeft: 25 }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                        borderRadius: 999,
                                        border: '1px solid rgba(37,99,235,0.25)',
                                        background: 'rgba(219,234,254,0.6)',
                                        color: '#1e40af',
                                        fontSize: '0.52rem', fontWeight: 800, padding: '1px 7px'
                                      }}>
                                        {formatLeaveStatus(req.status, t)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Sick Leave Group */}
                            {sickLeaves.length > 0 && (
                              <div>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  color: '#92400e',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  marginBottom: 8,
                                  paddingBottom: 4,
                                  borderBottom: '1px solid rgba(146,64,14,0.1)'
                                }}>
                                  <Thermometer size={13} strokeWidth={2.5} />
                                  <span>{t('leave.type_sick', 'Sick leave')} {sickLeaves.length}</span>
                                </div>
                                {sickLeaves.map((req, sIdx) => (
                                  <div
                                    key={req.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedRequest(req);
                                    }}
                                    style={{
                                      padding: '4px 0',
                                      marginBottom: sIdx === sickLeaves.length - 1 ? 0 : 4,
                                      cursor: 'pointer',
                                      borderRadius: 4,
                                      transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                      {renderAvatar(req)}
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                                        {req.userName} {req.userSurname}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: 2, paddingLeft: 25, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                      {req.storeName ?? t('employees.noStore', 'No store')} {req.companyName ? `• ${req.companyName}` : ''}
                                    </div>
                                    <div style={{ marginTop: 1, paddingLeft: 25, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                      {formatDateRange(req.startDate, req.endDate)}
                                    </div>
                                    <div style={{ marginTop: 3, paddingLeft: 25 }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                        borderRadius: 999,
                                        border: '1px solid rgba(217,119,6,0.25)',
                                        background: 'rgba(254,243,199,0.7)',
                                        color: '#92400e',
                                        fontSize: '0.52rem', fontWeight: 800, padding: '1px 7px'
                                      }}>
                                        {formatLeaveStatus(req.status, t)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </CalendarPopover>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedRequest && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSelectedRequest(null)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }} />
          <div 
            style={{ 
              position: 'relative', width: '100%', maxWidth: 460, 
              background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {renderAvatar(selectedRequest, 36)}
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{selectedRequest.userName} {selectedRequest.userSurname}</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedRequest.userRole ? t(`roles.${selectedRequest.userRole}`, selectedRequest.userRole) : ''}</div>
                </div>
              </div>
              <button onClick={() => setSelectedRequest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={modalLabelStyle}>{t('leave.type_label')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {selectedRequest.leaveType === 'vacation' ? <Palmtree size={16} /> : <Thermometer size={16} />}
                    {t(`leave.type_${selectedRequest.leaveType}`)}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={modalLabelStyle}>{t('leave.col_status')}</label>
                  <StatusBadge req={selectedRequest} />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={modalLabelStyle}>{t('leave.col_period')}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  <Clock size={16} />
                  {selectedRequest.leaveDurationType === 'short_leave'
                    ? `${formatDate(new Date(selectedRequest.startDate))} · ${selectedRequest.shortStartTime ?? '--:--'} - ${selectedRequest.shortEndTime ?? '--:--'}`
                    : formatDateRange(selectedRequest.startDate, selectedRequest.endDate)}
                </div>
              </div>

              {selectedRequest.notes && (
                <div style={{ marginBottom: 20 }}>
                  <label style={modalLabelStyle}>{t('leave.notes_label')}</label>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{selectedRequest.notes}"</div>
                </div>
              )}

              {selectedRequest.medicalCertificateName && (
                <div style={{ marginBottom: 20 }}>
                  <button 
                    onClick={() => handleDownloadCert(selectedRequest)}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: 8, 
                      padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--surface-warm)', color: 'var(--primary)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    <FileText size={16} />
                    {t('leave.certificate_btn')}
                  </button>
                </div>
              )}

              <div style={{ background: 'var(--background)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.5px' }}>
                  {t('leave.approval_chain', 'Approval Flow')}
                </div>
                <ApprovalStepper req={selectedRequest} />
              </div>

              {/* Existing Shifts Checklist */}
              {canAct(selectedRequest) && (
                <div style={{ marginTop: 20, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
                    {t('leave.shifts_to_cancel_title', 'Turni in questo periodo')}
                  </div>
                  {shiftsLoading ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                      {t('leave.loading_shifts', 'Caricamento turni...')}
                    </div>
                  ) : shiftsForTarget.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px', background: 'var(--surface-warm)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                      {t('leave.no_shifts_for_period', 'Nessun turno in questo periodo')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto', paddingRight: 4, marginBottom: 12 }}>
                      {shiftsForTarget.map((shift) => {
                        const isConfirmed = shift.status === 'confirmed';
                        return (
                          <div key={shift.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: 'var(--surface-warm)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 12,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700 }}>{new Date(shift.date).toLocaleDateString(locale === 'it' ? 'it-IT' : 'en-GB')}</span>
                              <span style={{ color: 'var(--text-muted)' }}>
                                ({shift.startTime.substring(0, 5)} - {shift.endTime.substring(0, 5)})
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{shift.storeName}</span>
                            </div>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: isConfirmed ? 'rgba(22,163,74,0.1)' : 'rgba(245,158,11,0.1)',
                              color: isConfirmed ? '#16a34a' : '#d97706',
                            }}>
                              {isConfirmed ? t('shifts.status_confirmed', 'Confermato') : t('shifts.status_scheduled', 'Programmato')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {shiftsForTarget.length > 0 && (
                    <div style={{
                      background: 'rgba(245,158,11,0.06)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 10,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={cancelShiftsChecked}
                          onChange={(e) => setCancelShiftsChecked(e.target.checked)}
                          style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                          {t('leave.cancel_shifts_checkbox', 'Annulla i turni programmati e confermati')}
                        </span>
                      </label>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {t('leave.cancel_shifts_guide', 'Se abilitato, l\'approvazione del permesso annullerà automaticamente i turni mostrati sopra e ne sottrarrà le ore dal riepilogo.')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {canAct(selectedRequest) && (
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button
                    onClick={() => handleApprove(selectedRequest)}
                    disabled={actionLoading}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '12px 0', borderRadius: 10, border: 'none',
                      background: 'var(--primary)', color: '#fff',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(13,33,55,0.2)'
                    }}
                  >
                    <CheckCheck size={18} />
                    {t('leave.action_approve')}
                  </button>
                  <button
                    onClick={() => setRejectTarget(selectedRequest)}
                    disabled={actionLoading}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '12px 0', borderRadius: 10, border: '1.5px solid var(--danger)',
                      background: 'transparent', color: 'var(--danger)',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    <XCircle size={18} />
                    {t('leave.action_reject')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setRejectTarget(null)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }} />
          <div 
            style={{ 
              position: 'relative', width: '100%', maxWidth: 380, 
              background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: 24 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{t('leave.reject_title')}</h3>
            <textarea
              autoFocus
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder={t('leave.reject_notes_placeholder')}
              style={{
                width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid var(--border)',
                fontFamily: 'inherit', fontSize: 14, resize: 'vertical', boxSizing: 'border-box'
              }}
            />
            {rejectError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{rejectError}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setRejectTarget(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button 
                onClick={handleReject} 
                disabled={actionLoading}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                {actionLoading ? t('common.saving') : t('leave.reject_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--text)',
};

const modalLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6
};
