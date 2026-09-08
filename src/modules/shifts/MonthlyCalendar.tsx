import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Clock3, Moon, Palmtree, Store as StoreIcon, Thermometer, Users } from 'lucide-react';
import { Shift } from '../../api/shifts';
import { LeaveBlock } from '../../api/leave';
import { TransferAssignment } from '../../api/transfers';
import { WindowDisplayActivity } from '../../api/windowDisplay';
import { getAvatarUrl } from '../../api/client';
import { getActivityIcon, getActivityPalette, getActivityTypeLabel } from './storeActivityCatalog';
import { Store as StoreModel } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';

interface MonthlyCalendarProps {
  shifts: Shift[];
  currentDate: Date;
  onDayClick: (date: string) => void;
  leaveBlocks?: LeaveBlock[];
  transferBlocks?: TransferAssignment[];
  windowDisplayActivities?: WindowDisplayActivity[];
  onWindowDisplayClick?: (date: string, activity?: WindowDisplayActivity) => void;
  stores?: StoreModel[];
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addUserToDateSet(map: Map<string, Set<number>>, dateKey: string, userId: number): void {
  const set = map.get(dateKey) ?? new Set<number>();
  set.add(userId);
  map.set(dateKey, set);
}

function initialsFromName(fullName: string): string {
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function activityVisual(activity: WindowDisplayActivity): { icon: string; background: string; border: string; accentBorder: string; color: string } {
  const palette = getActivityPalette(activity.activityType);
  return {
    icon: getActivityIcon(activity.activityType, activity.activityIcon),
    background: palette.background,
    border: palette.border,
    accentBorder: palette.accentBorder,
    color: palette.color,
  };
}

function solidColor(color: string, fallback: string): string {
  const match = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return color;
  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 3) return fallback;
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function formatDateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} -> ${endDate}`;
}

function userDisplayName(name: string | null | undefined, surname: string | null | undefined, fallback: string): string {
  const full = `${name ?? ''} ${surname ?? ''}`.trim();
  return full || fallback;
}

interface HoverPersonInfo {
  id: number;
  fullName: string;
  avatarFilename: string | null;
}

interface MonthlyLeaveEntry {
  id: number;
  user: HoverPersonInfo;
  leaveType: 'vacation' | 'sick';
  startDate: string;
  endDate: string;
  status: string;
  storeName: string;
  companyName: string;
}

interface MonthlyOffDayEntry {
  key: string;
  user: HoverPersonInfo;
  storeName: string;
  companyName: string;
}

interface MonthlyTransferEntry {
  id: number;
  user: HoverPersonInfo;
  companyName: string;
  originStoreName: string;
  targetStoreName: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
}

export default function MonthlyCalendar({
  shifts,
  currentDate,
  onDayClick,
  leaveBlocks,
  transferBlocks,
  windowDisplayActivities,
  onWindowDisplayClick,
  stores,
}: MonthlyCalendarProps) {
  const { t } = useTranslation();
  const { isMobile, isTablet } = useBreakpoint();
  const MAX_VISIBLE_AVATARS = 3;
  const MAX_VISIBLE_DETAIL_ROWS = 4;
  const [hoveredActivityKey, setHoveredActivityKey] = React.useState<string | null>(null);
  const [hoveredSummaryTag, setHoveredSummaryTag] = React.useState<string | null>(null);

  const storeFallbackLabel = t('common.store', 'Store');
  const companyFallbackLabel = t('common.company', 'Company');
  const noStoreLabel = t('employees.noStore', 'No store');

  const storeNamesById = new Map<number, string>();
  const companyNamesByStoreId = new Map<number, string>();
  for (const store of stores ?? []) {
    storeNamesById.set(store.id, store.name);
    if (store.companyName) companyNamesByStoreId.set(store.id, store.companyName);
  }

  const resolveStoreName = (storeId: number | null | undefined, preferredName?: string | null): string => {
    if (preferredName && preferredName.trim()) return preferredName.trim();
    if (storeId != null) {
      const known = storeNamesById.get(storeId);
      if (known) return known;
      return `${storeFallbackLabel} #${storeId}`;
    }
    return noStoreLabel;
  };

  const resolveCompanyName = (
    storeId: number | null | undefined,
    preferredName?: string | null,
    companyId?: number | null,
  ): string => {
    if (preferredName && preferredName.trim()) return preferredName.trim();
    if (storeId != null) {
      const known = companyNamesByStoreId.get(storeId);
      if (known) return known;
    }
    if (companyId != null) return `${companyFallbackLabel} #${companyId}`;
    return companyFallbackLabel;
  };

  const DAY_LABELS = [
    t('shifts.dayMon', 'Lun'),
    t('shifts.dayTue', 'Mar'),
    t('shifts.dayWed', 'Mer'),
    t('shifts.dayThu', 'Gio'),
    t('shifts.dayFri', 'Ven'),
    t('shifts.daySat', 'Sab'),
    t('shifts.daySun', 'Dom'),
  ];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const windowDisplayByDate = new Map<string, WindowDisplayActivity[]>();
  for (const item of windowDisplayActivities ?? []) {
    const rows = windowDisplayByDate.get(item.date) ?? [];
    rows.push(item);
    windowDisplayByDate.set(item.date, rows);
  }

  // Build monthly aggregates per date.
  const shiftCountMap = new Map<string, number>();
  const storesByDate = new Map<string, Set<number>>();
  const employeesByDate = new Map<string, Set<number>>();
  const offDayUsersByDate = new Map<string, Set<number>>();
  const offDayDetailsByDate = new Map<string, MonthlyOffDayEntry[]>();
  const scheduledUsersByDate = new Map<string, Map<number, HoverPersonInfo>>();

  for (const shift of shifts) {
    const dateKey = shift.date.split('T')[0];
    storeNamesById.set(shift.storeId, shift.storeName);

    if (shift.isOffDay) {
      addUserToDateSet(offDayUsersByDate, dateKey, shift.userId);
      const offDayRows = offDayDetailsByDate.get(dateKey) ?? [];
      const dedupKey = `${shift.userId}-${shift.storeId}`;
      if (!offDayRows.some((row) => row.key === dedupKey)) {
        offDayRows.push({
          key: dedupKey,
          user: {
            id: shift.userId,
            fullName: userDisplayName(shift.userName, shift.userSurname, `${t('shifts.employee', 'Employee')} ${shift.userId}`),
            avatarFilename: shift.userAvatarFilename ?? null,
          },
          storeName: resolveStoreName(shift.storeId, shift.storeName),
          companyName: resolveCompanyName(shift.storeId, null, shift.companyId),
        });
      }
      offDayDetailsByDate.set(dateKey, offDayRows);
      continue;
    }

    if (shift.status !== 'cancelled') {
      shiftCountMap.set(dateKey, (shiftCountMap.get(dateKey) ?? 0) + 1);
      addUserToDateSet(employeesByDate, dateKey, shift.userId);
      const stores = storesByDate.get(dateKey) ?? new Set<number>();
      stores.add(shift.storeId);
      storesByDate.set(dateKey, stores);

      const users = scheduledUsersByDate.get(dateKey) ?? new Map<number, HoverPersonInfo>();
      const existingUser = users.get(shift.userId);
      const fullName = userDisplayName(shift.userName, shift.userSurname, `${t('shifts.employee', 'Employee')} ${shift.userId}`);
      if (existingUser) {
        if (!existingUser.avatarFilename && shift.userAvatarFilename) {
          existingUser.avatarFilename = shift.userAvatarFilename;
          users.set(shift.userId, existingUser);
        }
      } else {
        users.set(shift.userId, {
          id: shift.userId,
          fullName,
          avatarFilename: shift.userAvatarFilename ?? null,
        });
      }
      scheduledUsersByDate.set(dateKey, users);
    }
  }

  // Build approved leave user maps: date → distinct users on approved vacation/sick.
  const approvedVacationUsersByDate = new Map<string, Set<number>>();
  const approvedSickUsersByDate = new Map<string, Set<number>>();
  const approvedVacationDetailsByDate = new Map<string, MonthlyLeaveEntry[]>();
  const approvedSickDetailsByDate = new Map<string, MonthlyLeaveEntry[]>();

  if (leaveBlocks) {
    for (const lb of leaveBlocks) {
      const normalizedStatus = String(lb.status ?? '').toLowerCase().replace(/\s+/g, '_');
      const isApproved = normalizedStatus === 'hr_approved' || normalizedStatus === 'approved';
      if (!isApproved) continue;

      if (lb.storeId != null && lb.storeName) storeNamesById.set(lb.storeId, lb.storeName);
      if (lb.storeId != null && lb.companyName) companyNamesByStoreId.set(lb.storeId, lb.companyName);

      const leaveEntry: MonthlyLeaveEntry = {
        id: lb.id,
        user: {
          id: lb.userId,
          fullName: userDisplayName(lb.userName, lb.userSurname, `${t('shifts.employee', 'Employee')} ${lb.userId}`),
          avatarFilename: lb.userAvatarFilename ?? null,
        },
        leaveType: lb.leaveType,
        startDate: lb.startDate,
        endDate: lb.endDate,
        status: lb.status,
        storeName: resolveStoreName(lb.storeId, lb.storeName),
        companyName: resolveCompanyName(lb.storeId, lb.companyName, lb.companyId),
      };

      const start = new Date(lb.startDate + 'T12:00:00');
      const end = new Date(lb.endDate + 'T12:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = formatDate(d);
        if (lb.leaveType === 'vacation') {
          addUserToDateSet(approvedVacationUsersByDate, key, lb.userId);
          const vacationRows = approvedVacationDetailsByDate.get(key) ?? [];
          if (!vacationRows.some((row) => row.id === leaveEntry.id)) {
            vacationRows.push(leaveEntry);
          }
          approvedVacationDetailsByDate.set(key, vacationRows);
        } else {
          addUserToDateSet(approvedSickUsersByDate, key, lb.userId);
          const sickRows = approvedSickDetailsByDate.get(key) ?? [];
          if (!sickRows.some((row) => row.id === leaveEntry.id)) {
            sickRows.push(leaveEntry);
          }
          approvedSickDetailsByDate.set(key, sickRows);
        }
      }
    }
  }

  interface TransferDayCounts {
    active: number;
    completed: number;
    cancelled: number;
  }

  const transferMap = new Map<string, TransferDayCounts>();
  const transferDetailsByDate = new Map<string, MonthlyTransferEntry[]>();

  if (transferBlocks) {
    for (const tb of transferBlocks) {
      if (tb.originStoreName) storeNamesById.set(tb.originStoreId, tb.originStoreName);
      if (tb.targetStoreName) storeNamesById.set(tb.targetStoreId, tb.targetStoreName);
      if (tb.companyName) companyNamesByStoreId.set(tb.targetStoreId, tb.companyName);

      const transferEntry: MonthlyTransferEntry = {
        id: tb.id,
        user: {
          id: tb.userId,
          fullName: userDisplayName(tb.userName, tb.userSurname, `${t('shifts.employee', 'Employee')} ${tb.userId}`),
          avatarFilename: tb.userAvatarFilename ?? null,
        },
        companyName: resolveCompanyName(tb.targetStoreId, tb.companyName, tb.companyId),
        originStoreName: resolveStoreName(tb.originStoreId, tb.originStoreName),
        targetStoreName: resolveStoreName(tb.targetStoreId, tb.targetStoreName),
        startDate: tb.startDate,
        endDate: tb.endDate,
        status: tb.status,
        notes: tb.notes ?? null,
      };

      const start = new Date(tb.startDate + 'T12:00:00');
      const end = new Date(tb.endDate + 'T12:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = formatDate(d);
        const existing = transferMap.get(key) ?? { active: 0, completed: 0, cancelled: 0 };
        if (tb.status === 'completed') existing.completed += 1;
        else if (tb.status === 'cancelled') existing.cancelled += 1;
        else existing.active += 1;
        transferMap.set(key, existing);

        const transferRows = transferDetailsByDate.get(key) ?? [];
        if (!transferRows.some((row) => row.id === transferEntry.id)) {
          transferRows.push(transferEntry);
        }
        transferDetailsByDate.set(key, transferRows);
      }
    }
  }

  // First day of month (0=Sun … 6=Sat), convert to Mon-based (0=Mon … 6=Sun)
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = (firstDay === 0 ? 6 : firstDay - 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // On mobile/tablet, don't include empty cells - just show actual dates
  const cells: (Date | null)[] = (isMobile || isTablet)
    ? Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
    : [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
      ];
  
  // Pad to complete last row only on desktop
  if (!isMobile && !isTablet) {
    while (cells.length % 7 !== 0) cells.push(null);
  }

  const today = formatDate(new Date());

  const formatLeaveStatus = (status: string): string => {
    const normalized = String(status ?? '').toLowerCase().replace(/\s+/g, '_');
    return t(`leave.status_${normalized}`, status || t('leave.status_pending', 'Pending'));
  };

  const formatTransferStatus = (status: string): string => {
    const normalized = String(status ?? '').toLowerCase();
    if (normalized === 'completed') return t('common.completed', 'Completed');
    if (normalized === 'cancelled') return t('common.cancelled', 'Cancelled');
    return t('common.active', 'Active');
  };

  const summaryHoverCardStyle: React.CSSProperties = {
    position: 'absolute',
    minWidth: 180,
    maxWidth: 240,
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.44)',
    background: '#ffffff',
    boxShadow: '0 14px 36px rgba(15,23,42,0.22)',
    padding: '8px 9px',
    zIndex: 900,
  };

  const renderAvatar = (person: HoverPersonInfo): React.ReactNode => {
    const avatarUrl = getAvatarUrl(person.avatarFilename);
    const initials = initialsFromName(person.fullName);
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={person.fullName}
          style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(148,163,184,0.45)' }}
        />
      );
    }

    return (
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e3a5f, #3a7bd5)',
          color: '#fff',
          fontSize: '0.52rem',
          fontWeight: 800,
          border: '1px solid rgba(148,163,184,0.45)',
        }}
      >
        {initials}
      </span>
    );
  };

  return (
    <div style={{ padding: 16, overflowX: (isMobile || isTablet) ? 'visible' : 'auto' }}>
      <div style={{ minWidth: (isMobile || isTablet) ? 'auto' : 1200 }}>
        {/* Day headers - hide on mobile and tablet */}
        {!isMobile && !isTablet && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 8 }}>
            {DAY_LABELS.map((label) => (
              <div key={label} style={{
                textAlign: 'center', fontWeight: 600,
                fontFamily: 'var(--font-display)', color: 'var(--primary)',
                padding: '4px 0', fontSize: '0.85rem',
              }}>
                {label}
              </div>
            ))}
          </div>
        )}

      {/* Day cells */}
      <div style={{ 
        display: (isMobile || isTablet) ? 'grid' : 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(7, minmax(0, 1fr))',
        gap: (isMobile || isTablet) ? 12 : 4 
      }}>
        {cells.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} style={{ minHeight: 104 }} />;
          }
          const dateStr = formatDate(date);
          const shiftCount = shiftCountMap.get(dateStr) ?? 0;
          const storeCount = storesByDate.get(dateStr)?.size ?? 0;
          const employeeCount = employeesByDate.get(dateStr)?.size ?? 0;
          const offDayUserCount = offDayUsersByDate.get(dateStr)?.size ?? 0;
          const vacationApprovedUsers = approvedVacationUsersByDate.get(dateStr)?.size ?? 0;
          const sickApprovedUsers = approvedSickUsersByDate.get(dateStr)?.size ?? 0;
          const usersForDay = Array.from(scheduledUsersByDate.get(dateStr)?.values() ?? []);
          const visibleUsers = usersForDay.slice(0, MAX_VISIBLE_AVATARS);
          const transferCounts = transferMap.get(dateStr) ?? { active: 0, completed: 0, cancelled: 0 };
          const transferCount = transferCounts.active + transferCounts.completed + transferCounts.cancelled;
          const isToday = dateStr === today;
          const dayActivities = windowDisplayByDate.get(dateStr) ?? [];
          const transferDetailsForDate = transferDetailsByDate.get(dateStr) ?? [];
          const vacationDetailsForDate = approvedVacationDetailsByDate.get(dateStr) ?? [];
          const sickDetailsForDate = approvedSickDetailsByDate.get(dateStr) ?? [];
          const offDayDetailsForDate = offDayDetailsByDate.get(dateStr) ?? [];
          const hasTransfer = transferCount > 0;
          const hasStoreShiftSummary = storeCount > 0 || shiftCount > 0;
          const hasSummaryTags = hasTransfer || vacationApprovedUsers > 0 || sickApprovedUsers > 0 || offDayUserCount > 0;
          const transferTagKey = `transfer-${dateStr}`;
          const vacationTagKey = `vacation-${dateStr}`;
          const sickTagKey = `sick-${dateStr}`;
          const offDayTagKey = `offday-${dateStr}`;

          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              style={{
                position: 'relative',
                minWidth: 0,
                minHeight: 92,
                borderRadius: 6,
                border: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                padding: 6,
                cursor: 'pointer',
                background: isToday ? 'rgba(201, 151, 58, 0.06)' : 'var(--surface)',
                transition: 'background 0.15s',
                boxShadow: (shiftCount > 0 || vacationApprovedUsers > 0 || sickApprovedUsers > 0 || offDayUserCount > 0 || hasTransfer)
                  ? 'var(--shadow-xs)'
                  : undefined,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isToday ? 'rgba(201, 151, 58, 0.06)' : 'var(--surface)';
                setHoveredActivityKey(null);
                setHoveredSummaryTag(null);
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: (isMobile || isTablet) ? 'space-between' : 'space-between',
                gap: 6,
                marginBottom: 6,
              }}>
                {(isMobile || isTablet) ? (
                  /* Mobile/Tablet: Date on left, Day name in center, Activities on right */
                  <>
                    {/* Date on left */}
                    <div style={{
                      fontWeight: isToday ? 700 : 600,
                      color: isToday ? 'var(--accent)' : 'var(--text)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      lineHeight: 1,
                      minWidth: 40,
                    }}>
                      {isToday ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--accent)', color: '#fff', fontWeight: 700,
                          boxShadow: '0 0 0 3px rgba(201,151,58,0.16)',
                        }}>
                          {date.getDate()}
                        </span>
                      ) : date.getDate()}
                    </div>

                    {/* Day name in center */}
                    <div style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      fontFamily: 'var(--font-display)',
                    }}>
                      {DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                    </div>

                    {/* Activities on right */}
                    {dayActivities.length > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {dayActivities.slice(0, 3).map((item) => {
                      const visual = activityVisual(item);
                      const activityLabel = getActivityTypeLabel(t, item.activityType, item.customActivityName);
                      const hoursLabel = item.durationHours != null ? `${item.durationHours}h` : null;
                      const activityKey = `${dateStr}-${item.id}`;
                      const isHovered = hoveredActivityKey === activityKey;
                      const storeName = resolveStoreName(item.storeId, item.storeName);
                      const posterName = userDisplayName(
                        item.flaggedByName,
                        item.flaggedBySurname,
                        item.flaggedBy ? `${t('shifts.employee', 'Employee')} #${item.flaggedBy}` : t('common.not_available', 'Not available'),
                      );
                      return (
                        <div
                          key={item.id}
                          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
                          onMouseEnter={() => setHoveredActivityKey(activityKey)}
                          onMouseLeave={() => setHoveredActivityKey((current) => (current === activityKey ? null : current))}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWindowDisplayClick?.(dateStr, item);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 6,
                              border: 'none',
                              background: 'transparent',
                              color: visual.color,
                              padding: '0 1px',
                              fontSize: '0.95rem',
                              fontWeight: 800,
                              lineHeight: 1,
                              cursor: onWindowDisplayClick ? 'pointer' : 'default',
                            }}
                          >
                            {visual.icon}
                          </button>

                          {isHovered && (
                            <div 
                              style={{
                                position: 'absolute',
                                top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 2px)',
                                bottom: idx >= cells.length - 7 ? 'calc(100% + 2px)' : 'auto',
                                right: 0,
                                minWidth: 160,
                                maxWidth: 220,
                                borderRadius: 8,
                                border: `1px solid ${visual.border}`,
                                borderLeft: `3px solid ${visual.accentBorder}`,
                                background: solidColor(visual.background, '#f8fafc'),
                                boxShadow: 'var(--shadow-lg)',
                                padding: '0px 2px 4px 8px',
                                zIndex: 80,
                                pointerEvents: 'none',
                              }}
                            >
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                lineHeight: 1.2,
                                color: visual.color,
                              }}>
                                <span style={{ fontSize: '0.92rem', lineHeight: 1 }}>{visual.icon}</span>
                                <span>{activityLabel}</span>
                              </div>
                              {hoursLabel && (
                                <div style={{ marginTop: 4, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                                  {t('shifts.activityDuration', 'Duration')}: {hoursLabel}
                                </div>
                              )}
                              <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                {t('common.store', 'Store')}: {storeName}
                              </div>
                              <div style={{ marginTop: 2, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                {t('shifts.activityPostedBy', 'Posted by')}: {posterName}
                              </div>
                              {item.notes && (
                                <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                                  {item.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {dayActivities.length > 3 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onWindowDisplayClick?.(dateStr);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: 999,
                          border: '1px solid rgba(71,85,105,0.28)',
                          background: 'rgba(226,232,240,0.9)',
                          color: '#334155',
                          padding: '1px 6px',
                          fontSize: '0.56rem',
                          fontWeight: 900,
                          lineHeight: 1.2,
                          cursor: onWindowDisplayClick ? 'pointer' : 'default',
                        }}
                      >
                        +{dayActivities.length - 3}
                      </button>
                    )}
                  </div>
                )}
                  </>
                ) : (
                  /* Desktop: Date on left, activities on right */
                  <>
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

                    {dayActivities.length > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {dayActivities.slice(0, 3).map((item) => {
                          const visual = activityVisual(item);
                          const activityLabel = getActivityTypeLabel(t, item.activityType, item.customActivityName);
                          const hoursLabel = item.durationHours != null ? `${item.durationHours}h` : null;
                          const activityKey = `${dateStr}-${item.id}`;
                          const isHovered = hoveredActivityKey === activityKey;
                          const storeName = resolveStoreName(item.storeId, item.storeName);
                          const posterName = userDisplayName(
                            item.flaggedByName,
                            item.flaggedBySurname,
                            item.flaggedBy ? `${t('shifts.employee', 'Employee')} #${item.flaggedBy}` : t('common.not_available', 'Not available'),
                          );
                          return (
                            <div
                              key={item.id}
                              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
                              onMouseEnter={() => setHoveredActivityKey(activityKey)}
                              onMouseLeave={() => setHoveredActivityKey((current) => (current === activityKey ? null : current))}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onWindowDisplayClick?.(dateStr, item);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'transparent',
                                  color: visual.color,
                                  padding: '0 1px',
                                  fontSize: '0.95rem',
                                  fontWeight: 800,
                                  lineHeight: 1,
                                  cursor: onWindowDisplayClick ? 'pointer' : 'default',
                                }}
                              >
                                {visual.icon}
                              </button>

                              {isHovered && (
                                <div 
                                  style={{
                                    position: 'absolute',
                                    top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 2px)',
                                    bottom: idx >= cells.length - 7 ? 'calc(100% + 2px)' : 'auto',
                                    right: 0,
                                    minWidth: 170,
                                    maxWidth: 220,
                                    borderRadius: 8,
                                    border: `1px solid ${visual.border}`,
                                    borderLeft: `3px solid ${visual.accentBorder}`,
                                    background: solidColor(visual.background, '#f8fafc'),
                                    boxShadow: 'var(--shadow-lg)',
                                    padding: '7px 8px',
                                    zIndex: 80,
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    color: visual.color,
                                  }}>
                                    <span style={{ fontSize: '0.92rem', lineHeight: 1 }}>{visual.icon}</span>
                                    <span>{activityLabel}</span>
                                  </div>
                                  {hoursLabel && (
                                    <div style={{ marginTop: 4, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                                      {t('shifts.activityDuration', 'Duration')}: {hoursLabel}
                                    </div>
                                  )}
                                  <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                    {t('common.store', 'Store')}: {storeName}
                                  </div>
                                  <div style={{ marginTop: 2, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                    {t('shifts.activityPostedBy', 'Posted by')}: {posterName}
                                  </div>
                                  {item.notes && (
                                    <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                                      {item.notes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {dayActivities.length > 3 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWindowDisplayClick?.(dateStr);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: 999,
                              border: '1px solid rgba(71,85,105,0.28)',
                              background: 'rgba(226,232,240,0.9)',
                              color: '#334155',
                              padding: '1px 6px',
                              fontSize: '0.56rem',
                              fontWeight: 900,
                              lineHeight: 1.2,
                              cursor: onWindowDisplayClick ? 'pointer' : 'default',
                            }}
                          >
                            +{dayActivities.length - 3}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {hasStoreShiftSummary && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  borderRadius: 5,
                  border: '1px solid rgba(58,123,213,0.34)',
                  borderLeft: '3px solid #1e4a7a',
                  background: 'linear-gradient(135deg, rgba(30,74,122,0.14), rgba(13,33,55,0.08))',
                  padding: '3px 6px',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    borderRadius: 4,
                    color: '#12345a',
                    padding: '0 2px',
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    lineHeight: 1.2,
                  }} title={t('shifts.monthlyStores', 'Stores')}>
                    <StoreIcon size={10} strokeWidth={2.4} />
                    {t('shifts.monthlyStores', 'Stores')} {storeCount}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    borderRadius: 4,
                    border: '1px solid rgba(58,123,213,0.55)',
                    background: 'linear-gradient(135deg, #1E4A7A, #0D2137)',
                    color: '#f8fbff',
                    padding: '2px 7px',
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    lineHeight: 1.2,
                  }}
                    title={t('shifts.shiftCountPlural', 'Shifts')}
                  >
                    <Clock3 size={10} strokeWidth={2.4} />
                    {t('shifts.shiftCountPlural', 'Shifts')} {shiftCount}
                  </span>
                </div>
              )}

              {employeeCount > 0 && (
                <div style={{ marginTop: 5, minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.63rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.2,
                    textTransform: 'uppercase',
                    letterSpacing: 0.2,
                  }}>
                    <Users size={10} strokeWidth={2.4} />
                    {t('shifts.monthlyEmployees', 'Employees')}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: 999,
                      border: '1px solid rgba(100,116,139,0.34)',
                      background: 'rgba(248,250,252,0.94)',
                      color: '#334155',
                      padding: '1px 6px',
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      lineHeight: 1.2,
                    }}>
                      {employeeCount}
                    </span>
                  </span>

                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                    {visibleUsers.map((user, index) => {
                      const avatarUrl = getAvatarUrl(user.avatarFilename);
                      const initials = initialsFromName(user.fullName);
                      return (
                        <div
                          key={`${user.fullName}-${index}`}
                          title={user.fullName}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            marginLeft: index === 0 ? 0 : -8,
                            border: '1.5px solid #fff',
                            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.56rem',
                            fontWeight: 800,
                            boxShadow: '0 1px 2px rgba(15,23,42,0.16)',
                            zIndex: 20 - index,
                          }}
                        >
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={user.fullName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : initials}
                        </div>
                      );
                    })}

                    {employeeCount > MAX_VISIBLE_AVATARS && (
                      <span
                        title={t('shifts.monthlyEmployeesOverflow', 'More employees')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: visibleUsers.length > 0 ? -8 : 0,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: '1.5px solid #fff',
                          background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(51,65,85,0.76))',
                          color: '#e2e8f0',
                          fontSize: '0.54rem',
                          fontWeight: 900,
                          lineHeight: 1,
                          boxShadow: '0 1px 2px rgba(15,23,42,0.16)',
                          zIndex: 8,
                        }}
                      >
                        +{employeeCount - MAX_VISIBLE_AVATARS}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {hasSummaryTags && (
                <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {hasTransfer && (
                    <div
                      style={{ position: 'relative', display: 'inline-flex' }}
                      onMouseEnter={() => setHoveredSummaryTag(transferTagKey)}
                      onMouseLeave={() => setHoveredSummaryTag((current) => (current === transferTagKey ? null : current))}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        borderRadius: 6,
                        border: '1px solid rgba(30,64,175,0.28)',
                        borderLeft: '3px solid #1e40af',
                        background: 'rgba(239,246,255,0.92)',
                        color: '#1e40af',
                        padding: '1px 6px',
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        lineHeight: 1.2,
                      }}>
                        <ArrowLeftRight size={9} strokeWidth={2.5} />
                        {t('shifts.monthlyTransfers', 'Transfers')} {transferCount}
                      </span>

                      {hoveredSummaryTag === transferTagKey && (
                        <div style={{
                          ...summaryHoverCardStyle,
                          position: 'absolute',
                          top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 2px)',
                          bottom: idx >= cells.length - 7 ? 'calc(100% + 2px)' : 'auto',
                          right: (idx % 7 > 3) ? 0 : 'auto',
                          left: (idx % 7 > 3) ? 'auto' : 0,
                          pointerEvents: 'none',
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1e40af', fontSize: '0.64rem', fontWeight: 900, marginBottom: 6 }}>
                            <ArrowLeftRight size={11} strokeWidth={2.5} />
                            <span>{t('shifts.monthlyTransfers', 'Transfers')} {transferDetailsForDate.length}</span>
                          </div>
                          {transferDetailsForDate.slice(0, MAX_VISIBLE_DETAIL_ROWS).map((transfer, index) => (
                            <div key={transfer.id} style={{ paddingTop: index === 0 ? 0 : 6, marginTop: index === 0 ? 0 : 6, borderTop: index === 0 ? 'none' : '1px solid rgba(148,163,184,0.28)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {renderAvatar(transfer.user)}
                                <span style={{ fontSize: '0.61rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{transfer.user.fullName}</span>
                              </div>
                              <div style={{ marginTop: 3, fontSize: '0.57rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                {`${transfer.originStoreName} -> ${transfer.targetStoreName}`}
                              </div>
                              <div style={{ marginTop: 2, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                {transfer.companyName} • {formatDateRange(transfer.startDate, transfer.endDate)}
                              </div>
                              <div style={{ marginTop: 3, display: 'inline-flex', borderRadius: 999, border: '1px solid rgba(30,64,175,0.3)', background: 'rgba(219,234,254,0.75)', color: '#1e40af', fontSize: '0.52rem', fontWeight: 800, padding: '1px 6px' }}>
                                {formatTransferStatus(transfer.status)}
                              </div>
                              {transfer.notes && (
                                <div style={{ marginTop: 3, fontSize: '0.54rem', color: 'var(--text-secondary)', lineHeight: 1.25, wordBreak: 'break-word' }}>{transfer.notes}</div>
                              )}
                            </div>
                          ))}
                          {transferDetailsForDate.length > MAX_VISIBLE_DETAIL_ROWS && (
                            <div style={{ marginTop: 6, fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)' }}>+{transferDetailsForDate.length - MAX_VISIBLE_DETAIL_ROWS} {t('common.more', 'more')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {vacationApprovedUsers > 0 && (
                    <div
                      style={{ position: 'relative', display: 'inline-flex' }}
                      onMouseEnter={() => setHoveredSummaryTag(vacationTagKey)}
                      onMouseLeave={() => setHoveredSummaryTag((current) => (current === vacationTagKey ? null : current))}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        borderRadius: 6,
                        border: '1px solid rgba(37,99,235,0.22)',
                        borderLeft: '3px solid #2563eb',
                        background: 'rgba(219,234,254,0.76)',
                        color: '#1e40af',
                        padding: '1px 6px',
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        lineHeight: 1.2,
                      }}>
                        <Palmtree size={9} strokeWidth={2.4} />
                        {t('leave.type_vacation', 'Vacation')} {vacationApprovedUsers}
                      </span>

                      {hoveredSummaryTag === vacationTagKey && (
                        <div style={{
                          ...summaryHoverCardStyle,
                          position: 'absolute',
                          top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 2px)',
                          bottom: idx >= cells.length - 7 ? 'calc(100% + 2px)' : 'auto',
                          right: (idx % 7 > 3) ? 0 : 'auto',
                          left: (idx % 7 > 3) ? 'auto' : 0,
                          pointerEvents: 'none',
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1e40af', fontSize: '0.64rem', fontWeight: 900, marginBottom: 6 }}>
                            <Palmtree size={11} strokeWidth={2.4} />
                            <span>{t('leave.type_vacation', 'Vacation')} {vacationDetailsForDate.length}</span>
                          </div>
                          {vacationDetailsForDate.slice(0, MAX_VISIBLE_DETAIL_ROWS).map((leaveRow, index) => (
                            <div key={leaveRow.id} style={{ paddingTop: index === 0 ? 0 : 6, marginTop: index === 0 ? 0 : 6, borderTop: index === 0 ? 'none' : '1px solid rgba(148,163,184,0.28)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {renderAvatar(leaveRow.user)}
                                <span style={{ fontSize: '0.61rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{leaveRow.user.fullName}</span>
                              </div>
                              <div style={{ marginTop: 3, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>{leaveRow.storeName} • {leaveRow.companyName}</div>
                              <div style={{ marginTop: 2, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>{formatDateRange(leaveRow.startDate, leaveRow.endDate)}</div>
                              <div style={{ marginTop: 3, display: 'inline-flex', borderRadius: 999, border: '1px solid rgba(37,99,235,0.3)', background: 'rgba(219,234,254,0.7)', color: '#1e40af', fontSize: '0.52rem', fontWeight: 800, padding: '1px 6px' }}>{formatLeaveStatus(leaveRow.status)}</div>
                            </div>
                          ))}
                          {vacationDetailsForDate.length > MAX_VISIBLE_DETAIL_ROWS && (
                            <div style={{ marginTop: 6, fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)' }}>+{vacationDetailsForDate.length - MAX_VISIBLE_DETAIL_ROWS} {t('common.more', 'more')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {sickApprovedUsers > 0 && (
                    <div
                      style={{ position: 'relative', display: 'inline-flex' }}
                      onMouseEnter={() => setHoveredSummaryTag(sickTagKey)}
                      onMouseLeave={() => setHoveredSummaryTag((current) => (current === sickTagKey ? null : current))}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        borderRadius: 6,
                        border: '1px solid rgba(217,119,6,0.22)',
                        borderLeft: '3px solid #d97706',
                        background: 'rgba(254,243,199,0.78)',
                        color: '#92400e',
                        padding: '1px 6px',
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        lineHeight: 1.2,
                      }}>
                        <Thermometer size={9} strokeWidth={2.4} />
                        {t('leave.type_sick', 'Leave')} {sickApprovedUsers}
                      </span>

                      {hoveredSummaryTag === sickTagKey && (
                        <div style={{
                          ...summaryHoverCardStyle,
                          position: 'absolute',
                          top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 2px)',
                          bottom: idx >= cells.length - 7 ? 'calc(100% + 2px)' : 'auto',
                          right: (idx % 7 > 3) ? 0 : 'auto',
                          left: (idx % 7 > 3) ? 'auto' : 0,
                          pointerEvents: 'none',
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#92400e', fontSize: '0.64rem', fontWeight: 900, marginBottom: 6 }}>
                            <Thermometer size={11} strokeWidth={2.4} />
                            <span>{t('leave.type_sick', 'Leave')} {sickDetailsForDate.length}</span>
                          </div>
                          {sickDetailsForDate.slice(0, MAX_VISIBLE_DETAIL_ROWS).map((leaveRow, index) => (
                            <div key={leaveRow.id} style={{ paddingTop: index === 0 ? 0 : 6, marginTop: index === 0 ? 0 : 6, borderTop: index === 0 ? 'none' : '1px solid rgba(148,163,184,0.28)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {renderAvatar(leaveRow.user)}
                                <span style={{ fontSize: '0.61rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{leaveRow.user.fullName}</span>
                              </div>
                              <div style={{ marginTop: 3, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>{leaveRow.storeName} • {leaveRow.companyName}</div>
                              <div style={{ marginTop: 2, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>{formatDateRange(leaveRow.startDate, leaveRow.endDate)}</div>
                              <div style={{ marginTop: 3, display: 'inline-flex', borderRadius: 999, border: '1px solid rgba(217,119,6,0.28)', background: 'rgba(254,243,199,0.7)', color: '#92400e', fontSize: '0.52rem', fontWeight: 800, padding: '1px 6px' }}>{formatLeaveStatus(leaveRow.status)}</div>
                            </div>
                          ))}
                          {sickDetailsForDate.length > MAX_VISIBLE_DETAIL_ROWS && (
                            <div style={{ marginTop: 6, fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)' }}>+{sickDetailsForDate.length - MAX_VISIBLE_DETAIL_ROWS} {t('common.more', 'more')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {offDayUserCount > 0 && (
                    <div
                      style={{ position: 'relative', display: 'inline-flex' }}
                      onMouseEnter={() => setHoveredSummaryTag(offDayTagKey)}
                      onMouseLeave={() => setHoveredSummaryTag((current) => (current === offDayTagKey ? null : current))}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        borderRadius: 6,
                        border: '1px solid rgba(100,116,139,0.24)',
                        borderLeft: '3px solid #64748b',
                        background: 'rgba(241,245,249,0.92)',
                        color: '#475569',
                        padding: '1px 6px',
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        lineHeight: 1.2,
                      }}>
                        <Moon size={9} strokeWidth={2.4} />
                        {t('shifts.form.offDay', 'Off day')} {offDayUserCount}
                      </span>

                      {hoveredSummaryTag === offDayTagKey && (
                        <div style={{
                          ...summaryHoverCardStyle,
                          position: 'absolute',
                          top: idx >= cells.length - 7 ? 'auto' : 'calc(100% + 2px)',
                          bottom: idx >= cells.length - 7 ? 'calc(100% + 2px)' : 'auto',
                          right: (idx % 7 > 3) ? 0 : 'auto',
                          left: (idx % 7 > 3) ? 'auto' : 0,
                          pointerEvents: 'none',
                        }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#475569', fontSize: '0.64rem', fontWeight: 900, marginBottom: 6 }}>
                            <Moon size={11} strokeWidth={2.4} />
                            <span>{t('shifts.form.offDay', 'Off day')} {offDayDetailsForDate.length}</span>
                          </div>
                          {offDayDetailsForDate.slice(0, MAX_VISIBLE_DETAIL_ROWS).map((offDayRow, index) => (
                            <div key={offDayRow.key} style={{ paddingTop: index === 0 ? 0 : 6, marginTop: index === 0 ? 0 : 6, borderTop: index === 0 ? 'none' : '1px solid rgba(148,163,184,0.28)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {renderAvatar(offDayRow.user)}
                                <span style={{ fontSize: '0.61rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{offDayRow.user.fullName}</span>
                              </div>
                              <div style={{ marginTop: 3, fontSize: '0.56rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>{offDayRow.storeName} • {offDayRow.companyName}</div>
                            </div>
                          ))}
                          {offDayDetailsForDate.length > MAX_VISIBLE_DETAIL_ROWS && (
                            <div style={{ marginTop: 6, fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)' }}>+{offDayDetailsForDate.length - MAX_VISIBLE_DETAIL_ROWS} {t('common.more', 'more')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
