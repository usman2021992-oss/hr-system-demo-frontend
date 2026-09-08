import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Moon, Palmtree, Thermometer, Store } from 'lucide-react';
import { Shift } from '../../api/shifts';
import { LeaveBlock } from '../../api/leave';
import { TransferAssignment } from '../../api/transfers';
import { WindowDisplayActivity } from '../../api/windowDisplay';
import { getAvatarUrl } from '../../api/client';
import { getActivityIcon, getActivityPalette, getActivityTypeLabel } from './storeActivityCatalog';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const STATUS_META: Record<string, {
  bg: string; color: string; dot: string;
  border: string; icon: string; abbr: string;
  labelKey: string; labelFb: string; descKey: string; descFb: string;
}> = {
  scheduled: {
    bg: 'linear-gradient(135deg, #1E4A7A 0%, #0D2137 100%)',
    color: '#fff',
    dot: '#5fa3e0',
    border: '#3a7bd5',
    icon: '🕐',
    abbr: 'P',
    labelKey: 'shifts.status.scheduled',
    labelFb: 'Pianificato',
    descKey: 'shifts.status.scheduledDesc',
    descFb: 'Turno pianificato, in attesa di conferma',
  },
  confirmed: {
    bg: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
    color: '#fff',
    dot: '#4ade80',
    border: '#16a34a',
    icon: '✓',
    abbr: 'C',
    labelKey: 'shifts.status.confirmed',
    labelFb: 'Confermato',
    descKey: 'shifts.status.confirmedDesc',
    descFb: 'Turno confermato e attivo',
  },
  cancelled: {
    bg: 'rgba(0,0,0,0.05)',
    color: '#9ca3af',
    dot: '#d1d5db',
    border: '#e5e7eb',
    icon: '✕',
    abbr: 'A',
    labelKey: 'shifts.status.cancelled',
    labelFb: 'Annullato',
    descKey: 'shifts.status.cancelledDesc',
    descFb: 'Turno annullato',
  },
};

const OFF_DAY_META = {
  bg: 'rgba(241,245,249,0.92)',
  color: '#475569',
  border: 'rgba(148,163,184,0.42)',
  leftBorder: 'rgba(100,116,139,0.62)',
};

interface WeeklyCalendarProps {
  shifts: Shift[];
  weekStart: Date;
  onShiftClick: (shift: Shift) => void;
  onCellClick: (userId: number, date: string) => void;
  canEdit: boolean;
  leaveBlocks?: LeaveBlock[];
  transferBlocks?: TransferAssignment[];
  windowDisplayActivities?: WindowDisplayActivity[];
  onWindowDisplayClick?: (date: string, activity?: WindowDisplayActivity) => void;
  /** Admin / HR / Area manager: show weekly approve control per row */
  canApproveWeek?: boolean;
  onApproveWeekForUser?: (userId: number) => void;
  approvingUserId?: number | null;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  // Use local date parts — toISOString() converts to UTC and shifts the date back
  // by one day in UTC+ timezones (e.g. Italy UTC+1/+2)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmt(time: string): string {
  return time ? time.slice(0, 5) : '';
}

function todayStr(): string {
  return formatDate(new Date());
}

function transferVisualMeta(status: TransferAssignment['status']): {
  bg: string;
  border: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeColor: string;
} {
  if (status === 'completed') {
    return {
      bg: 'rgba(30,64,175,0.1)',
      border: 'rgba(30,64,175,0.28)',
      color: '#1e40af',
      badgeBg: 'rgba(239,246,255,0.95)',
      badgeBorder: 'rgba(30,64,175,0.34)',
      badgeColor: '#1e3a8a',
    };
  }
  if (status === 'cancelled') {
    return {
      bg: 'rgba(239,68,68,0.08)',
      border: 'rgba(185,28,28,0.25)',
      color: '#b91c1c',
      badgeBg: 'rgba(254,242,242,0.95)',
      badgeBorder: 'rgba(185,28,28,0.32)',
      badgeColor: '#991b1b',
    };
  }
  return {
    bg: 'rgba(13,148,136,0.1)',
    border: 'rgba(15,118,110,0.25)',
    color: '#115e59',
    badgeBg: 'rgba(240,253,250,0.95)',
    badgeBorder: 'rgba(15,118,110,0.32)',
    badgeColor: '#0f766e',
  };
}

function hoursForShiftTotal(shift: Shift): number {
  if (shift.status === 'cancelled') return 0;
  const v = shift.shiftHours;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export default function WeeklyCalendar({
  shifts,
  weekStart,
  onShiftClick,
  onCellClick,
  canEdit,
  leaveBlocks,
  transferBlocks,
  windowDisplayActivities,
  onWindowDisplayClick,
  canApproveWeek = false,
  onApproveWeekForUser,
  approvingUserId = null,
}: WeeklyCalendarProps) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useBreakpoint();
  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
  const DAY_LABELS = [
    t('shifts.dayMon', 'Mon'),
    t('shifts.dayTue', 'Tue'),
    t('shifts.dayWed', 'Wed'),
    t('shifts.dayThu', 'Thu'),
    t('shifts.dayFri', 'Fri'),
    t('shifts.daySat', 'Sat'),
    t('shifts.daySun', 'Sun'),
  ];
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredActivityKey, setHoveredActivityKey] = useState<string | null>(null);
  const [hoveredLeaveKey, setHoveredLeaveKey] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => {
    const sidebarWidth = window.innerWidth < 1024 ? 64 : 252;
    return window.innerWidth - sidebarWidth - 48;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Close legend when clicking outside
  useEffect(() => {
    if (!legendOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-legend-container]')) {
        setLegendOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [legendOpen]);

  const hoverCardStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 2px)',
    right: 0,
    minWidth: 176,
    maxWidth: 228,
    borderRadius: 8,
    border: '1px solid rgba(148,163,184,0.44)',
    background: '#ffffff',
    boxShadow: '0 14px 36px rgba(15,23,42,0.22)',
    padding: '7px 8px',
    zIndex: 80,
  };
  const windowDisplayMap = new Map<string, WindowDisplayActivity[]>();
  for (const item of windowDisplayActivities ?? []) {
    const dateItems = windowDisplayMap.get(item.date) ?? [];
    dateItems.push(item);
    windowDisplayMap.set(item.date, dateItems);
  }

  function getLeaveForUserDate(userId: number, dateStr: string): LeaveBlock | null {
    if (!leaveBlocks) return null;
    return leaveBlocks.find((lb) =>
      lb.userId === userId && dateStr >= lb.startDate && dateStr <= lb.endDate
    ) ?? null;
  }

  function getTransferForUserDate(userId: number, dateStr: string): TransferAssignment | null {
    if (!transferBlocks) return null;
    const priority: Record<TransferAssignment['status'], number> = {
      active: 0,
      completed: 1,
      cancelled: 2,
    };
    return transferBlocks
      .filter((tb) => tb.userId === userId && dateStr >= tb.startDate && dateStr <= tb.endDate)
      .sort((a, b) => {
        if (priority[a.status] !== priority[b.status]) {
          return priority[a.status] - priority[b.status];
        }
        return b.id - a.id;
      })[0] ?? null;
  }

  // Build 7 day columns
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekStartStr = formatDate(weekStart);
  const weekEndStr = formatDate(addDays(weekStart, 6));

  // Group shifts by user then by date
  const userMap = new Map<number, {
    name: string;
    surname: string;
    avatarFilename: string | null;
    shifts: Map<string, Shift[]>;
    storeNames: Set<string>;
  }>();
  for (const shift of shifts) {
    if (!userMap.has(shift.userId)) {
      userMap.set(shift.userId, {
        name: shift.userName,
        surname: shift.userSurname,
        avatarFilename: shift.userAvatarFilename ?? null,
        shifts: new Map(),
        storeNames: new Set(),
      });
    }
    const entry = userMap.get(shift.userId)!;
    if (!entry.avatarFilename && shift.userAvatarFilename) {
      entry.avatarFilename = shift.userAvatarFilename;
    }
    // Normalize date: API may return full ISO string or just 'YYYY-MM-DD'
    const dateKey = shift.date.split('T')[0];
    const existing = entry.shifts.get(dateKey) ?? [];
    entry.shifts.set(dateKey, [...existing, shift]);
    if (shift.storeName) {
      entry.storeNames.add(shift.storeName);
    }
  }

  // Ensure transfer-only users are visible even when they have no shifts in this week.
  if (transferBlocks) {
    for (const tb of transferBlocks) {
      if (tb.startDate > weekEndStr || tb.endDate < weekStartStr) continue;
      if (!userMap.has(tb.userId)) {
        userMap.set(tb.userId, {
          name: tb.userName,
          surname: tb.userSurname,
          avatarFilename: tb.userAvatarFilename ?? null,
          shifts: new Map(),
          storeNames: new Set(),
        });
      }
      const entry = userMap.get(tb.userId)!;
      if (tb.originStoreName) {
        entry.storeNames.add(tb.originStoreName);
      }
    }
  }

  const users = Array.from(userMap.entries()).sort((a, b) =>
    a[1].surname.localeCompare(b[1].surname)
  );

  // Employee column keeps a bounded width so long names ellipsize instead of
  // stealing space from the day columns. It still breathes when the sidebar
  // collapses (containerWidth grows), revealing a few more characters.
  const employeeColWidth = Math.max(150, Math.min(300, Math.round(containerWidth * 0.16)));
  const employeeColInnerWidth = employeeColWidth - 24; // td horizontal padding

  function weeklyTotalsForUser(userId: number, userShifts: Map<string, Shift[]>): { hours: number; hasScheduled: boolean } {
    let hours = 0;
    let hasScheduled = false;
    for (const day of days) {
      const dateStr = formatDate(day);
      for (const sh of userShifts.get(dateStr) ?? []) {
        hours += hoursForShiftTotal(sh);
        if (sh.status === 'scheduled') hasScheduled = true;
      }
    }
    return { hours, hasScheduled };
  }

  return (
    <div ref={containerRef} style={{ overflowX: 'auto', display: 'flex', flexDirection: 'column' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
      }}>
        <thead>
          <tr style={{ background: 'var(--primary)', color: '#fff' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', width: employeeColWidth, minWidth: employeeColWidth, maxWidth: employeeColWidth }}>
              {t('shifts.employee', 'Dipendente')}
            </th>
            {days.map((day, i) => {
              const dayStr = formatDate(day);
              const isToday = dayStr === todayStr();
              return (
                <th key={i} style={{
                  padding: '10px 8px', textAlign: 'center', minWidth: 110,
                  background: isToday ? 'rgba(201,151,58,0.15)' : undefined,
                  borderBottom: isToday ? '2px solid var(--accent)' : undefined,
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {DAY_LABELS[i]}
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                    {day.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
                  </div>
                </th>
              );
            })}
            <th style={{ padding: '10px 8px', textAlign: 'center', minWidth: 100, background: 'var(--primary)', color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.8rem' }}>
                {t('shifts.weeklyHoursCol', 'Tot. h')}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('shifts.noShiftsThisWeek', 'Nessun turno questa settimana')}
              </td>
            </tr>
          ) : (
            users.map(([userId, userData], rowIdx) => {
              const { hours: weekHours, hasScheduled } = weeklyTotalsForUser(userId, userData.shifts);
              const rowStoreNames = Array.from(userData.storeNames);
              return (
              <tr
                key={userId}
                style={{ background: hoveredRow === rowIdx ? 'var(--surface-warm)' : rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--background)', transition: 'background 0.12s' }}
                onMouseEnter={() => setHoveredRow(rowIdx)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ padding: '8px 12px', fontWeight: 500, borderRight: '1px solid var(--border)', width: employeeColWidth, minWidth: employeeColWidth, maxWidth: employeeColWidth, overflow: 'hidden' }}>
                  {(() => {
                    const rowTransfers = (transferBlocks ?? [])
                      .filter((tb) => tb.userId === userId && tb.startDate <= weekEndStr && tb.endDate >= weekStartStr)
                      .sort((a, b) => b.id - a.id);
                    const homeStoreName = rowTransfers[0]?.originStoreName ?? rowStoreNames[0] ?? null;
                    const transferTargets = Array.from(new Map(
                      rowTransfers.map((tb) => [`${tb.targetStoreName}-${tb.status}`, tb]),
                    ).values());
                    const fullName = `${userData.name} ${userData.surname}`.trim();
                    const initials = `${userData.name?.[0] ?? ''}${userData.surname?.[0] ?? ''}`.toUpperCase() || 'U';
                    const avatarUrl = getAvatarUrl(userData.avatarFilename);
                    const identityRows = transferTargets.length > 0
                      ? [
                          {
                            id: 'home',
                            storeName: homeStoreName ?? t('transfers.table.origin', 'Origine'),
                            isTransfer: false,
                            status: undefined as TransferAssignment['status'] | undefined,
                          },
                          ...transferTargets.map((tb) => ({
                            id: `${tb.id}-${tb.status}`,
                            storeName: tb.targetStoreName,
                            isTransfer: true,
                            status: tb.status,
                          })),
                        ]
                      : [
                          {
                            id: 'home',
                            storeName: homeStoreName,
                            isTransfer: false,
                            status: undefined as TransferAssignment['status'] | undefined,
                          },
                        ];

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: employeeColInnerWidth, maxWidth: employeeColInnerWidth, minWidth: 0 }}>
                        {identityRows.map((row) => {
                          const vm = row.isTransfer ? transferVisualMeta(row.status ?? 'active') : null;
                          return (
                            <div key={row.id} style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              gap: 8,
                              padding: '4px 0',
                            }}>
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                background: 'linear-gradient(135deg,var(--primary),var(--accent))',
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : initials}
                              </div>
                              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fullName}>
                                  {fullName}
                                </div>
                                {row.storeName && (
                                  <span style={{
                                    marginTop: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 7px',
                                    borderRadius: 999,
                                    background: row.isTransfer ? vm?.bg : 'rgba(13,33,55,0.08)',
                                    border: row.isTransfer ? `1px solid ${vm?.border}` : '1px solid rgba(13,33,55,0.16)',
                                    color: row.isTransfer ? vm?.color : 'var(--text-secondary)',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    lineHeight: 1.2,
                                    width: '100%',
                                    minWidth: 0,
                                  }}>
                                    <Store size={10} style={{ flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }} title={row.storeName}>{row.storeName}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </td>
                {days.map((day, colIdx) => {
                  const dateStr = formatDate(day);
                  const dayShifts = userData.shifts.get(dateStr) ?? [];
                  const hasOffDay = dayShifts.some((shift) => shift.isOffDay);
                  const hasVisibleShift = dayShifts.some((shift) => shift.isOffDay || shift.status !== 'cancelled');
                  const isToday = dateStr === todayStr();
                  const leave = getLeaveForUserDate(userId, dateStr);
                  const transfer = getTransferForUserDate(userId, dateStr);
                  const activityStoreIds = new Set<number>(dayShifts.map((shift) => shift.storeId));
                  if (transfer) {
                    activityStoreIds.add(transfer.originStoreId);
                    activityStoreIds.add(transfer.targetStoreId);
                  }
                  const dayActivities = (windowDisplayMap.get(dateStr) ?? [])
                    .filter((item) => activityStoreIds.has(item.storeId));
                  const transferVm = transferVisualMeta(transfer?.status ?? 'active');
                  const lvVacation = leave?.leaveType === 'vacation';
                  const statusLower = String(leave?.status || '').toLowerCase();
                  const lvApproved = statusLower.includes('approved');
                  const lvPending = leave ? !lvApproved : false;
                  const leaveHoverKey = `${userId}-${dateStr}-leave`;
                  const isLeaveHovered = hoveredLeaveKey === leaveHoverKey;
                  const transferTargetStoreId = transfer?.targetStoreId ?? null;
                  const transferLaneShifts = transferTargetStoreId == null
                    ? []
                    : dayShifts.filter((shift) => shift.storeId === transferTargetStoreId || shift.assignmentId != null);
                  const originLaneShifts = transferTargetStoreId == null
                    ? dayShifts
                    : dayShifts.filter((shift) => !(shift.storeId === transferTargetStoreId || shift.assignmentId != null));
                  const showDualLane = transferTargetStoreId != null;

                  const renderShiftBadge = (shift: Shift) => {
                    if (shift.isOffDay) {
                      const hasMeaningfulWindow = fmt(shift.startTime) !== '00:00' || fmt(shift.endTime) !== '00:01';
                      return (
                        <div
                          key={shift.id}
                          onClick={(e) => { e.stopPropagation(); onShiftClick(shift); }}
                          title={t('shifts.form.offDay', 'Off day')}
                          style={{
                            background: OFF_DAY_META.bg,
                            color: OFF_DAY_META.color,
                            borderRadius: 6,
                            padding: '4px 7px 4px 6px',
                            marginBottom: 3,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            borderTop: `1px solid ${OFF_DAY_META.border}`,
                            borderRight: `1px solid ${OFF_DAY_META.border}`,
                            borderBottom: `1px solid ${OFF_DAY_META.border}`,
                            borderLeft: `3px solid ${OFF_DAY_META.leftBorder}`,
                            transition: 'filter 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.05)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ''; }}
                        >
                          <span style={{
                            width: 15,
                            height: 15,
                            borderRadius: 4,
                            background: 'rgba(100,116,139,0.16)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Moon size={10} strokeWidth={2.5} />
                          </span>
                          <span style={{ lineHeight: 1.25, overflow: 'hidden' }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t('shifts.form.offDay', 'Off day')}
                            </span>
                            {hasMeaningfulWindow && (
                              <span style={{
                                display: 'block',
                                fontSize: '0.62rem',
                                color: '#64748b',
                                textDecoration: 'line-through',
                              }}>
                                {t('shifts.status.cancelled', 'Cancelled')} · {fmt(shift.startTime)}–{fmt(shift.endTime)}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    }

                    const meta = STATUS_META[shift.status] ?? STATUS_META.scheduled;
                    return (
                      <div
                        key={shift.id}
                        onClick={(e) => { e.stopPropagation(); onShiftClick(shift); }}
                        title={`${t(meta.labelKey, meta.labelFb)} — ${t(meta.descKey, meta.descFb)}`}
                        style={{
                          background: meta.bg,
                          color: meta.color,
                          borderRadius: 6,
                          padding: '3px 6px 3px 5px',
                          marginBottom: 3,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: shift.status !== 'cancelled' ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                          border: `1px solid ${meta.border}`,
                          textDecoration: shift.status === 'cancelled' ? 'line-through' : 'none',
                          transition: 'filter 0.15s, opacity 0.15s',
                          display: 'flex', alignItems: 'center', gap: 4,
                          opacity: shift.status === 'cancelled' ? 0.6 : 1,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ''; }}
                      >
                        <span style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          background: 'rgba(255,255,255,0.18)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.6rem', fontWeight: 800, lineHeight: 1,
                          color: shift.status === 'cancelled' ? '#9ca3af' : 'rgba(255,255,255,0.9)',
                        }}>
                          {meta.abbr}
                        </span>
                        <span style={{ lineHeight: 1.3 }}>
                          <span style={{ display: 'block' }}>
                            {fmt(shift.startTime)}–{fmt(shift.endTime)}
                            {shift.shiftHours && (
                              <span style={{ marginLeft: 3, opacity: 0.75, fontSize: '0.65rem' }}>({shift.shiftHours}h)</span>
                            )}
                          </span>
                          {shift.isSplit && shift.splitStart2 && shift.splitEnd2 && (
                            <span style={{
                              display: 'block', fontSize: '0.62rem', opacity: 0.82,
                              borderTop: '1px dashed rgba(255,255,255,0.35)',
                              marginTop: 2, paddingTop: 2,
                            }}>
                              ÷ {fmt(shift.splitStart2)}–{fmt(shift.splitEnd2)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  };

                  return (
                    <td
                      key={colIdx}
                      title={canEdit && !hasVisibleShift
                        && !leave
                        && dayActivities.length === 0
                        ? t('shifts.addShiftTooltip', '+ Aggiungi turno')
                        : undefined}
                      style={{
                        padding: 4,
                        verticalAlign: 'top',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        cursor: canEdit ? 'pointer' : 'default',
                        minHeight: 60,
                        position: 'relative',
                        background: leave
                          ? (lvVacation ? 'rgba(219,234,254,0.13)' : 'rgba(255,237,213,0.13)')
                          : hasOffDay
                            ? 'rgba(226,232,240,0.22)'
                          : (isToday ? 'rgba(201,151,58,0.04)' : undefined),
                      }}
                      onClick={() => canEdit && !hasVisibleShift && onCellClick(userId, dateStr)}
                    >
                      {dayActivities.map((activity) => {
                        const iconText = getActivityIcon(activity.activityType, activity.activityIcon);
                        const activityLabel = getActivityTypeLabel(t, activity.activityType, activity.customActivityName);
                        const hoursLabel = activity.durationHours != null ? `${activity.durationHours}h` : null;
                        const palette = getActivityPalette(activity.activityType);
                        const activityHoverKey = `${userId}-${dateStr}-${activity.id}`;
                        const isActivityHovered = hoveredActivityKey === activityHoverKey;
                        const activityStoreName = activity.storeName || t('common.store', 'Store');

                        const isWide = containerWidth >= 1150;
                        const maxChars = isWide ? 22 : 12;
                        const displayLabel = activityLabel.length > maxChars ? activityLabel.slice(0, maxChars) + '..' : activityLabel;

                        return (
                          <div
                            key={`activity-${activity.id}`}
                            style={{ position: 'relative' }}
                            onMouseEnter={() => setHoveredActivityKey(activityHoverKey)}
                            onMouseLeave={() => setHoveredActivityKey((current) => (current === activityHoverKey ? null : current))}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onWindowDisplayClick?.(dateStr, activity);
                              }}
                              style={{
                                marginBottom: 4,
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                borderRadius: 5,
                                border: `1px solid ${palette.border}`,
                                borderLeft: `3px solid ${palette.accentBorder}`,
                                background: palette.background,
                                color: palette.color,
                                padding: '4px 6px 4px 5px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                lineHeight: 1.2,
                                cursor: onWindowDisplayClick ? 'pointer' : 'default',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                                <span style={{
                                  display: 'inline-flex',
                                  color: palette.color,
                                  fontSize: '0.94rem',
                                  fontWeight: 800,
                                  lineHeight: 1,
                                  flexShrink: 0,
                                }}>
                                  {iconText}
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                  {displayLabel}
                                </span>
                              </span>
                              {hoursLabel && (
                                <span style={{
                                  fontSize: '0.63rem',
                                  opacity: 0.88,
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                }}>
                                  {hoursLabel}
                                </span>
                              )}
                            </button>

                            {isActivityHovered && (
                              <div style={{ ...hoverCardStyle, border: `1px solid ${palette.border}`, borderLeft: `3px solid ${palette.accentBorder}` }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, lineHeight: 1.2, color: palette.color }}>
                                  <span style={{ fontSize: '0.92rem', lineHeight: 1 }}>{iconText}</span>
                                  <span>{activityLabel}</span>
                                </div>
                                {hoursLabel && (
                                  <div style={{ marginTop: 4, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                                    {t('shifts.activityDuration', 'Duration')}: {hoursLabel}
                                  </div>
                                )}
                                <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                  {t('common.store', 'Store')}: {activityStoreName}
                                </div>
                                {activity.notes && (
                                  <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                                    {activity.notes}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {showDualLane ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{
                            border: '1px dashed rgba(13,33,55,0.2)',
                            borderRadius: 5,
                            padding: '3px 4px 1px',
                            background: 'rgba(13,33,55,0.03)',
                          }}>
                            {originLaneShifts.length === 0 ? (
                              <div style={{ fontSize: 10, color: 'var(--text-disabled)', padding: '2px 2px 3px' }}>—</div>
                            ) : (
                              originLaneShifts.map(renderShiftBadge)
                            )}
                          </div>

                          <div style={{
                            border: `1px solid ${transferVm.border}`,
                            borderRadius: 5,
                            padding: '3px 4px 1px',
                            background: transferVm.bg,
                          }}>
                            <div style={{
                              borderRadius: 5,
                              border: `1px solid ${transferVm.badgeBorder}`,
                              background: transferVm.badgeBg,
                              color: transferVm.badgeColor,
                              padding: '3px 6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              maxWidth: '100%',
                              fontSize: 9,
                              fontWeight: 800,
                              lineHeight: 1.2,
                              textTransform: 'uppercase',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginBottom: 4,
                            }}>
                              <ArrowLeftRight size={10} strokeWidth={2.4} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, maxWidth: 68 }} title={transfer?.targetStoreName ?? ''}>
                                {transfer?.targetStoreName ?? t('transfers.table.target', 'Destinazione')}
                              </span>
                              <span>{t(`transfers.status.${transfer?.status ?? 'active'}`, transfer?.status ?? 'active')}</span>
                            </div>

                            {transferLaneShifts.length === 0 ? (
                              <div style={{ fontSize: 10, color: 'var(--text-disabled)', padding: '2px 2px 3px' }}>—</div>
                            ) : (
                              transferLaneShifts.map(renderShiftBadge)
                            )}
                          </div>
                        </div>
                      ) : (
                        dayShifts.map(renderShiftBadge)
                      )}

                      {/* Leave event block — Google-Calendar-style, sits below shifts */}
                      {leave && (
                        <div
                          style={{ position: 'relative', marginTop: dayShifts.length > 0 ? 3 : 0 }}
                          onMouseEnter={() => setHoveredLeaveKey(leaveHoverKey)}
                          onMouseLeave={() => setHoveredLeaveKey((current) => (current === leaveHoverKey ? null : current))}
                        >
                          <div style={{
                            borderRadius: 4,
                            padding: '4px 7px 4px 8px',
                            background: lvVacation ? 'rgba(219,234,254,0.8)' : 'rgba(255,237,213,0.8)',
                            borderLeft: `3px solid ${lvVacation
                              ? (lvPending ? 'rgba(37,99,235,0.45)' : '#2563eb')
                              : (lvPending ? 'rgba(234,88,12,0.45)' : '#ea580c')}`,
                            borderTop: `1px ${lvPending ? 'dashed' : 'solid'} ${lvVacation ? 'rgba(37,99,235,0.18)' : 'rgba(234,88,12,0.18)'}`,
                            borderRight: `1px ${lvPending ? 'dashed' : 'solid'} ${lvVacation ? 'rgba(37,99,235,0.18)' : 'rgba(234,88,12,0.18)'}`,
                            borderBottom: `1px ${lvPending ? 'dashed' : 'solid'} ${lvVacation ? 'rgba(37,99,235,0.18)' : 'rgba(234,88,12,0.18)'}`,
                            display: 'flex', alignItems: 'center', gap: 4,
                            opacity: lvPending ? 0.72 : 1,
                            minHeight: 22,
                          }}>
                            <span style={{ lineHeight: 1, flexShrink: 0, display: 'flex' }}>
                              {lvVacation ? <Palmtree size={11} strokeWidth={2.5} /> : <Thermometer size={11} strokeWidth={2.5} />}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, lineHeight: 1.2,
                              color: lvVacation ? '#1e40af' : '#9a3412',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                            }}>
                              {lvVacation ? t('leave.type_vacation') : t('leave.type_sick')}
                            </span>
                            <span style={{
                              fontSize: 8.5, fontWeight: 700, flexShrink: 0,
                              color: lvVacation ? '#1e40af' : '#9a3412',
                              background: 'rgba(255,255,255,0.7)',
                              padding: '1px 4px', borderRadius: 3, lineHeight: 1.4,
                            }}>
                              {lvApproved ? t('leave.approved_short', 'Appr.') : t('leave.pending_short', 'pend.')}
                            </span>
                          </div>

                          {isLeaveHovered && (
                            <div style={hoverCardStyle}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, lineHeight: 1.2, color: lvVacation ? '#1e40af' : '#92400e' }}>
                                {lvVacation ? <Palmtree size={11} strokeWidth={2.4} /> : <Thermometer size={11} strokeWidth={2.4} />}
                                <span>{lvVacation ? t('leave.type_vacation') : t('leave.type_sick')}</span>
                              </div>
                              <div style={{ marginTop: 4, fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                                {leave.startDate === leave.endDate ? leave.startDate : `${leave.startDate} -> ${leave.endDate}`}
                              </div>
                              <div style={{ marginTop: 3, display: 'inline-flex', borderRadius: 999, border: `1px solid ${lvVacation ? 'rgba(37,99,235,0.28)' : 'rgba(217,119,6,0.28)'}`, background: lvVacation ? 'rgba(219,234,254,0.7)' : 'rgba(254,243,199,0.7)', color: lvVacation ? '#1e40af' : '#92400e', fontSize: '0.52rem', fontWeight: 800, padding: '1px 6px' }}>
                                {t(`leave.status_${String(leave.status).toLowerCase().replace(/\s+/g, '_')}`, leave.status)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </td>
                  );
                })}
                <td style={{
                  padding: '8px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  background: 'rgba(13,33,55,0.03)',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
                    {weekHours.toFixed(1)}h
                  </div>
                  {canApproveWeek && hasScheduled && onApproveWeekForUser && (
                    <button
                      type="button"
                      disabled={approvingUserId === userId}
                      onClick={() => onApproveWeekForUser(userId)}
                      style={{
                        marginTop: 6,
                        padding: '4px 8px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        borderRadius: 6,
                        border: '1px solid var(--accent)',
                        background: 'rgba(201,151,58,0.12)',
                        color: 'var(--accent)',
                        cursor: approvingUserId === userId ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {approvingUserId === userId ? '…' : t('shifts.approveWeek', 'Approva sett.')}
                    </button>
                  )}
                </td>
              </tr>
            );
            })
          )}
        </tbody>
      </table>

      {/* Legend */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface-warm)',
      }}>
        {isMobile ? (
          /* Mobile: Legend icon with click modal */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ position: 'relative', display: 'inline-flex' }} data-legend-container>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLegendOpen(!legendOpen);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: '1.5px solid var(--border)',
                  background: legendOpen ? 'var(--primary)' : 'var(--surface)',
                  color: legendOpen ? '#fff' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                {t('shifts.legend', 'Legend')}
              </button>

              {legendOpen && (
                <div style={{
                  position: 'fixed',
                  bottom: '80px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  minWidth: 280,
                  maxWidth: 'calc(100vw - 40px)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                  padding: '12px',
                  zIndex: 1000,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                    {t('shifts.legend', 'Legend')}
                  </div>
                  
                  {/* Status legends */}
                  {Object.entries(STATUS_META).map(([status, meta]) => (
                    <div key={status} style={{ marginBottom: 8 }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px 3px 5px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                        background: meta.bg, color: meta.color,
                        border: `1px solid ${meta.border}`,
                        boxShadow: status !== 'cancelled' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                        textDecoration: status === 'cancelled' ? 'line-through' : 'none',
                        opacity: status === 'cancelled' ? 0.7 : 1,
                        marginBottom: 4,
                      }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          background: 'rgba(255,255,255,0.18)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.6rem', fontWeight: 800,
                          color: status === 'cancelled' ? '#9ca3af' : 'rgba(255,255,255,0.9)',
                        }}>
                          {meta.abbr}
                        </span>
                        {t(meta.labelKey, meta.labelFb)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, paddingLeft: 4 }}>
                        {t(meta.descKey, meta.descFb)}
                      </div>
                    </div>
                  ))}

                  {/* Off day legend */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                      background: OFF_DAY_META.bg, color: OFF_DAY_META.color,
                      borderTop: `1px solid ${OFF_DAY_META.border}`,
                      borderRight: `1px solid ${OFF_DAY_META.border}`,
                      borderBottom: `1px solid ${OFF_DAY_META.border}`,
                      borderLeft: `3px solid ${OFF_DAY_META.leftBorder}`,
                      marginBottom: 4,
                    }}>
                      <Moon size={11} strokeWidth={2.4} />
                      {t('shifts.form.offDay', 'Off day')}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, paddingLeft: 4 }}>
                      {t('shifts.offDayLegend', 'Date marked as non-working day')}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {canEdit && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('shifts.clickToAdd', 'Click to add')}
              </span>
            )}
          </div>
        ) : (
          /* Desktop: Full legend display */
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
              letterSpacing: 0.6, textTransform: 'uppercase', marginRight: 4, flexShrink: 0,
            }}>
              {t('shifts.legend', 'Legenda')}:
            </span>
            {Object.entries(STATUS_META).map(([status, meta]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px 3px 5px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                  background: meta.bg, color: meta.color,
                  border: `1px solid ${meta.border}`,
                  boxShadow: status !== 'cancelled' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  textDecoration: status === 'cancelled' ? 'line-through' : 'none',
                  opacity: status === 'cancelled' ? 0.7 : 1,
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                    background: 'rgba(255,255,255,0.18)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 800,
                    color: status === 'cancelled' ? '#9ca3af' : 'rgba(255,255,255,0.9)',
                  }}>
                    {meta.abbr}
                  </span>
                  {t(meta.labelKey, meta.labelFb)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {t(meta.descKey, meta.descFb)}
                </span>
                <span style={{ color: 'var(--border)', fontSize: 14, lineHeight: 1 }}>·</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                background: OFF_DAY_META.bg, color: OFF_DAY_META.color,
                borderTop: `1px solid ${OFF_DAY_META.border}`,
                borderRight: `1px solid ${OFF_DAY_META.border}`,
                borderBottom: `1px solid ${OFF_DAY_META.border}`,
                borderLeft: `3px solid ${OFF_DAY_META.leftBorder}`,
              }}>
                <Moon size={11} strokeWidth={2.4} />
                {t('shifts.form.offDay', 'Off day')}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {t('shifts.offDayLegend', 'Date marked as non-working day')}
              </span>
              <span style={{ color: 'var(--border)', fontSize: 14, lineHeight: 1 }}>·</span>
            </div>
            {canEdit && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {t('shifts.clickEmptyCell', 'Clicca su una cella vuota per aggiungere un turno')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
