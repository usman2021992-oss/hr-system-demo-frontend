import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { listAttendanceEvents, AttendanceEvent, EventType, AttendanceListParams } from '../../api/attendance';
import { listShifts, Shift } from '../../api/shifts';
import { getEmployees } from '../../api/employees';
import { getStores } from '../../api/stores';
import { getCompanies } from '../../api/companies';
import { getLeaveRequests, LeaveRequest } from '../../api/leave';
import * as XLSX from 'xlsx';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import client, { getAvatarUrl } from '../../api/client';
import { formatLocalDate } from '../../utils/date';
import { DatePicker } from '../../components/ui/DatePicker';
import { TimePicker } from '../../components/ui/TimePicker';
import { WeekPicker } from '../../components/ui/WeekPicker';
import CustomSelect from '../../components/ui/CustomSelect';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { User, MapPin, Calendar, ClipboardList, Clock, Scale, Settings, Eye, ChevronDown, Check, BarChart2, PieChart, Sliders, Building } from 'lucide-react';

export interface SummaryRow {
  key: string;
  userId: number;
  userName: string;
  userSurname: string;
  userAvatarFilename?: string | null;
  userRole?: string;
  storeId?: number | null;
  storeName: string;
  periodLabel: string;
  dateKey: string;
  shifts: Shift[];
  events: AttendanceEvent[];
  scheduledMinutes: number;        // gross scheduled work (all due, non-cancelled shifts)
  workedMinutes: number;
  varianceMinutes: number;         // workedMinutes − effectiveScheduledMinutes
  vacationMinutes: number;
  sickMinutes: number;
  leaveMinutes: number;            // short-leave / permessi
  neutralizedMinutes: number;      // scheduled time excused by approved leave (removed from the deficit)
  effectiveScheduledMinutes: number; // scheduledMinutes − neutralizedMinutes (basis of the variance)
  absentMinutes: number;           // scheduled time on past days with no clock-in and no leave (stays in the deficit)
  leaveApprovedAfter: boolean;     // person worked, then leave was approved after the fact → leave ignored
  breakDeductedMinutes: number;
  scheduledBreakMinutes: number;
  actualBreakMinutes: number;
  breakRecorded: boolean;
  breakNotCompleted: boolean;
  status: 'leave' | 'absent' | 'pending' | 'in_progress' | 'worked' | 'cancelled' | 'day_off';
}

function formatHoursStr(mins: number): string {
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Per-shift scheduled work in minutes (span − break). Ignores status so the value
// can also label cancelled shifts; the summary calc excludes cancelled separately.
function shiftDurationMinutes(s: Shift): number {
  if (!s.startTime || !s.endTime || s.isOffDay) return 0;
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  let dur = (eh * 60 + em) - (sh * 60 + sm);
  if (dur < 0) dur += 24 * 60;
  let bMins = 0;
  if (s.breakMinutes) {
    bMins = s.breakMinutes;
  } else if (s.breakStart && s.breakEnd) {
    const [bsh, bsm] = s.breakStart.split(':').map(Number);
    const [beh, bem] = s.breakEnd.split(':').map(Number);
    bMins = (beh * 60 + bem) - (bsh * 60 + bsm);
    if (bMins < 0) bMins += 24 * 60;
  }
  return Math.max(0, dur - bMins);
}

// Compact "8:00 H" style label for a shift's scheduled work duration.
function formatShiftDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${String(m).padStart(2, '0')} H`;
}

function getAvatarColor(name: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export type VarianceKind = 'leave' | 'absent' | 'pending' | 'in_progress' | 'on_time' | 'overtime' | 'undertime' | 'cancelled' | 'day_off';

// Single source of truth for how a row's variance is shown. The precomputed
// row.status already resolves leave / absent / pending / in-progress; here we only
// apply the over/under-time tolerance for the "worked" case.
//   - Summary UI  → applyTolerance = true  (small +/- shown as "On time")
//   - Analytics   → applyTolerance = false (real minutes, so rows reconcile with totals)
function varianceDisplay(
  row: Pick<SummaryRow, 'status' | 'varianceMinutes'>,
  t: any,
  opts?: { applyTolerance?: boolean; overtimeLimit?: number; undertimeLimit?: number },
): { kind: VarianceKind; text: string; color: string; bg: string; border: string; icon: string } {
  const applyTolerance = opts?.applyTolerance ?? false;
  const otLim = applyTolerance ? (opts?.overtimeLimit ?? 5) : 0;
  const utLim = applyTolerance ? (opts?.undertimeLimit ?? 15) : 0;

  switch (row.status) {
    case 'cancelled':
      return { kind: 'cancelled', text: t('attendance.statusCancelled', 'Annullato'), color: '#9ca3af', bg: 'rgba(156,163,175,0.10)', border: 'rgba(156,163,175,0.30)', icon: '✕' };
    case 'day_off':
      return { kind: 'day_off', text: t('attendance.statusDayOff', 'Giorno Libero'), color: '#0891b2', bg: 'rgba(8,145,178,0.10)', border: 'rgba(8,145,178,0.25)', icon: '🏖️' };
    case 'leave':
      return { kind: 'leave', text: t('attendance.statusOnLeave', 'Congedo'), color: '#c9973a', bg: 'rgba(201,151,58,0.10)', border: 'rgba(201,151,58,0.25)', icon: '🌴' };
    case 'pending':
      return { kind: 'pending', text: t('attendance.statusPending', 'In attesa'), color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', icon: '⏳' };
    case 'in_progress':
      return { kind: 'in_progress', text: t('attendance.statusInCourse', 'In corso'), color: '#16a34a', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.25)', icon: '🟢' };
    case 'absent':
      return { kind: 'absent', text: t('attendance.statusAbsent', 'Assente'), color: '#dc2626', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.25)', icon: '⚠' };
    default: break;
  }
  const mins = row.varianceMinutes;
  if (mins > otLim) {
    return { kind: 'overtime', text: `+${formatHoursStr(mins)}`, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.25)', icon: '▲' };
  }
  if (mins < -utLim) {
    return { kind: 'undertime', text: `-${formatHoursStr(mins)}`, color: '#dc2626', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.25)', icon: '▼' };
  }
  return { kind: 'on_time', text: t('attendance.onTimeShort', 'In orario'), color: '#2563eb', bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.20)', icon: '✓' };
}

const SHIFT_STATUS_META: Record<string, {
  bg: string; color: string; border: string; dot: string; icon: string;
  labelKey: string; defaultLabel: string;
}> = {
  scheduled: {
    bg: 'linear-gradient(135deg, #1E4A7A 0%, #0D2137 100%)',
    color: '#ffffff',
    border: 'rgba(58,123,213,0.5)',
    dot: '#5fa3e0',
    icon: '🕐',
    labelKey: 'shifts.status.scheduled',
    defaultLabel: 'Pianificato',
  },
  confirmed: {
    bg: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
    color: '#ffffff',
    border: 'rgba(22,163,74,0.5)',
    dot: '#4ade80',
    icon: '✓',
    labelKey: 'shifts.status.confirmed',
    defaultLabel: 'Confermato',
  },
  cancelled: {
    bg: 'rgba(0,0,0,0.05)',
    color: '#9ca3af',
    border: 'rgba(229,231,235,0.8)',
    dot: '#d1d5db',
    icon: '✕',
    labelKey: 'shifts.status.cancelled',
    defaultLabel: 'Annullato',
  },
};

// Convert ISO week 'YYYY-WNN' → { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } (Mon–Sun)
function isoWeekToDateRange(isoWeek: string): { from: string; to: string } | null {
  const m = isoWeek.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4Day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${dd}`;
  };
  return { from: fmt(monday), to: fmt(sunday) };
}

const EVENT_META: Record<string, { color: string; bg: string; dot: string; icon: string }> = {
  checkin:     { color: '#16a34a', bg: 'rgba(22,163,74,0.10)',   dot: '#22c55e', icon: '→' },
  checkout:    { color: '#dc2626', bg: 'rgba(220,38,38,0.10)',   dot: '#ef4444', icon: '←' },
  break_start: { color: '#b45309', bg: 'rgba(180,83,9,0.10)',    dot: '#f59e0b', icon: '⏸' },
  break_end:   { color: '#1d4ed8', bg: 'rgba(29,78,216,0.10)',   dot: '#3b82f6', icon: '▶' },
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  qr:     { label: 'QR',   color: '#7c3aed' },
  manual: { label: 'MAN',  color: '#0369a1' },
  sync:   { label: 'SYNC', color: '#065f46' },
};

const EVENT_TYPE_LABEL_KEYS: Record<string, string> = {
  checkin:     'attendance.checkin',
  checkout:    'attendance.checkout',
  break_start: 'attendance.breakStart',
  break_end:   'attendance.breakEnd',
};

export default function AttendanceLogsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { lastSyncTime } = useOfflineSync();
  const { isMobile, isTablet } = useBreakpoint();

  const canEdit   = user?.role === 'admin' || user?.role === 'hr';
  const canDelete = user?.role === 'admin' || user?.role === 'hr';

  const [events, setEvents]       = useState<AttendanceEvent[]>([]);
  const [shiftsList, setShiftsList] = useState<Shift[]>([]);
  const [leaveRequestsList, setLeaveRequestsList] = useState<LeaveRequest[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [compact, setCompact]     = useState(false);

  // ── View Mode & Summary States ──────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const initialViewMode = (viewParam === 'logs' || viewParam === 'summary' || viewParam === 'analytics') ? viewParam : 'logs';

  const [viewMode, setViewMode]           = useState<'logs' | 'summary' | 'analytics'>(initialViewMode);

  useEffect(() => {
    const currentParam = searchParams.get('view');
    if (currentParam !== viewMode) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('view', viewMode);
        return next;
      }, { replace: true });
    }
  }, [viewMode, searchParams, setSearchParams]);

  const [summaryPeriod, setSummaryPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  // Shift-status filter pills for the summary view (null = all statuses shown)
  const [summaryStatusFilter, setSummaryStatusFilter] = useState<'scheduled' | 'confirmed' | 'cancelled' | null>(null);
  const [summaryDrawerItem, setSummaryDrawerItem] = useState<SummaryRow | null>(null);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef<HTMLDivElement | null>(null);

  // ── Variance Tolerance Limits (Item 2) ─────────────────────────────────────
  const [overtimeLimit, setOvertimeLimit]   = useState<number>(() => {
    const saved = localStorage.getItem('att_overtime_limit');
    return saved ? parseInt(saved, 10) : 5;
  });
  const [undertimeLimit, setUndertimeLimit] = useState<number>(() => {
    const saved = localStorage.getItem('att_undertime_limit');
    return saved ? parseInt(saved, 10) : 15;
  });
  const [showToleranceModal, setShowToleranceModal] = useState(false);
  const [tempOvertimeLimit, setTempOvertimeLimit]   = useState(5);
  const [tempUndertimeLimit, setTempUndertimeLimit] = useState(15);

  useEffect(() => {
    if (!isViewDropdownOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!viewDropdownRef.current?.contains(event.target as Node)) {
        setIsViewDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isViewDropdownOpen]);

  // ── Search Debounce ────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Force Logs View Mode for Non-Admin/Non-HR Roles ───────────────────────
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'hr') {
      setViewMode('logs');
    }
  }, [user]);

  // ── Edit modal state ───────────────────────────────────────────────────────
  const [editingEvent, setEditingEvent]         = useState<AttendanceEvent | null>(null);
  const [editType, setEditType]                 = useState('');
  const [editDate, setEditDate]                 = useState('');   // YYYY-MM-DD
  const [editTimeOnly, setEditTimeOnly]         = useState('');   // HH:mm
  const [editNotes, setEditNotes]               = useState('');
  const [editSaving, setEditSaving]             = useState(false);
  const [editError, setEditError]               = useState<string | null>(null);

  // ── Delete confirmation state ──────────────────────────────────────────────
  const [deletingEvent, setDeletingEvent]       = useState<AttendanceEvent | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ── Create manual entry state ──────────────────────────────────────────────
  const [createOpen, setCreateOpen]         = useState(false);
  const [createUserId, setCreateUserId]     = useState('');
  const [createStoreId, setCreateStoreId]   = useState('');
  const [createType, setCreateType]         = useState('checkin');
  const [createDate, setCreateDate]         = useState('');
  const [createTimeOnly, setCreateTimeOnly] = useState('');
  const [createNotes, setCreateNotes]       = useState('');
  const [createSaving, setCreateSaving]     = useState(false);
  const [createError, setCreateError]       = useState<string | null>(null);
  const [createSuccess, setCreateSuccess]   = useState(false);
  const [empList, setEmpList]               = useState<Array<{
    id: number;
    name: string;
    surname: string;
    role?: string;
    storeId?: number | null;
    storeName?: string;
    avatarFilename?: string | null;
  }>>([]);
  const [storeList, setStoreList]           = useState<Array<{ id: number; name: string; companyName?: string }>>([]);
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);
  const [createEmployeeSearch, setCreateEmployeeSearch] = useState('');
  const createEmployeePickerRef = useRef<HTMLDivElement | null>(null);

  const selectedCreateEmployee = useMemo(
    () => empList.find((emp) => String(emp.id) === createUserId),
    [empList, createUserId],
  );

  const selectedCreateEmployeeAvatarUrl = getAvatarUrl(selectedCreateEmployee?.avatarFilename);
  const selectedCreateEmployeeInitials = `${selectedCreateEmployee?.name?.[0] ?? ''}${selectedCreateEmployee?.surname?.[0] ?? ''}`.toUpperCase() || 'U';
  const selectedCreateEmployeeFullName = selectedCreateEmployee
    ? `${selectedCreateEmployee.name} ${selectedCreateEmployee.surname}`
    : t('attendance.selectEmployee');

  const filteredCreateEmployees = useMemo(() => {
    const q = createEmployeeSearch.trim().toLowerCase();
    if (!q) return empList;
    return empList.filter((emp) => {
      const full = `${emp.name} ${emp.surname}`.toLowerCase();
      const role = t(`roles.${emp.role ?? 'employee'}`, emp.role ?? 'employee').toLowerCase();
      const store = (emp.storeName ?? '').toLowerCase();
      return full.includes(q) || role.includes(q) || store.includes(q);
    });
  }, [createEmployeeSearch, empList, t]);

  function openCreateModal() {
    setCreateOpen(true);
    setCreateUserId('');
    setCreateStoreId('');
    setCreateType('checkin');
    setCreateDate(formatLocalDate(new Date()));
    setCreateTimeOnly('');
    setCreateNotes('');
    setCreateError(null);
    setCreateSuccess(false);
    setCreateEmployeeOpen(false);
    setCreateEmployeeSearch('');
    // Load dropdowns if not yet loaded
    if (empList.length === 0) {
      getEmployees({ limit: 200, status: 'active' }).then((res) =>
        setEmpList(res.employees.map((e) => ({
          id: e.id,
          name: e.name,
          surname: e.surname,
          role: e.role,
          storeId: e.storeId ?? null,
          storeName: e.storeName,
          avatarFilename: e.avatarFilename ?? null,
        })))
      ).catch(() => {});
    }
    if (storeList.length === 0) {
      getStores().then((stores) =>
        setStoreList(stores.map((s) => ({ id: s.id, name: s.name, companyName: s.companyName })))
      ).catch(() => {});
    }
  }

  useEffect(() => {
    if (!createOpen || !createEmployeeOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!createEmployeePickerRef.current?.contains(event.target as Node)) {
        setCreateEmployeeOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [createOpen, createEmployeeOpen]);

  async function handleCreateSave() {
    if (!createUserId || !createStoreId || !createTimeOnly) {
      setCreateError(t('common.required'));
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await client.post('/attendance', {
        user_id:    parseInt(createUserId, 10),
        store_id:   parseInt(createStoreId, 10),
        event_type: createType,
        event_time: new Date(`${createDate}T${createTimeOnly}`).toISOString(),
        notes:      createNotes || undefined,
      });
      setCreateSuccess(true);
      await fetchEvents();
      setTimeout(() => {
        setCreateOpen(false);
        setCreateSuccess(false);
        setCreateEmployeeOpen(false);
        setCreateEmployeeSearch('');
      }, 1200);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setCreateError(axiosErr?.response?.data?.error ?? t('common.error'));
    } finally {
      setCreateSaving(false);
    }
  }

  function openEditModal(ev: AttendanceEvent) {
    setEditingEvent(ev);
    setEditType(ev.eventType);
    const d = new Date(ev.eventTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setEditTimeOnly(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setEditNotes(ev.notes ?? '');
    setEditError(null);
  }

  function closeEditModal() {
    setEditingEvent(null);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editingEvent) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await client.put(`/attendance/${editingEvent.id}`, {
        event_type: editType,
        event_time: new Date(`${editDate}T${editTimeOnly}`).toISOString(),
        notes: editNotes,
      });
      closeEditModal();
      await fetchEvents();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setEditError(axiosErr?.response?.data?.error ?? t('common.error'));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingEvent) return;
    setDeleteConfirming(true);
    try {
      await client.delete(`/attendance/${deletingEvent.id}`);
      setDeletingEvent(null);
      await fetchEvents();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error ?? t('common.error'));
      setDeletingEvent(null);
    } finally {
      setDeleteConfirming(false);
    }
  }

  const today       = formatLocalDate(new Date());
  // Default look-back window. Kept wide (30 days) so the most recent attendance
  // activity is always visible on load without touching filters — the events
  // endpoint is capped at 500 most-recent rows, so a wider window is cheap.
  const defaultFromDate = new Date();
  defaultFromDate.setDate(defaultFromDate.getDate() - 30);
  const defaultFrom = formatLocalDate(defaultFromDate);

  const [dateFrom, setDateFrom]   = useState(defaultFrom);
  const [dateTo, setDateTo]       = useState(today);
  const [eventType, setEventType] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStoreId, setFilterStoreId] = useState<string>('');
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterEmployees, setFilterEmployees] = useState<Array<{ id: number; name: string; surname: string; storeId: number | null; avatarFilename?: string | null; role?: string }>>([]);
  const [filterStores, setFilterStores] = useState<Array<{ id: number; name: string; companyName?: string; groupName?: string | null; companyLogoFilename?: string | null; logoFilename?: string | null; employeeCount?: number }>>([]);

  // Analytics Filter States (Request 3)
  const [analyticsCompany, setAnalyticsCompany]   = useState<string>('');
  const [analyticsStoreId, setAnalyticsStoreId]   = useState<string>('');
  const [analyticsUserId, setAnalyticsUserId]     = useState<string>('');
  const [analyticsDateFrom, setAnalyticsDateFrom] = useState<string>(defaultFrom);
  const [analyticsDateTo, setAnalyticsDateTo]     = useState<string>(today);

  const [breakSettings, setBreakSettings] = useState<{ enforcementEnabled: boolean; toleranceMinutes: number }>({ enforcementEnabled: false, toleranceMinutes: 10 });
  const [showBreakSettingsModal, setShowBreakSettingsModal] = useState(false);

  useEffect(() => {
    client.get('/companies/break-settings').then(res => {
      if (res.data?.data) {
        setBreakSettings({
          enforcementEnabled: res.data.data.breakEnforcementEnabled ?? false,
          toleranceMinutes: res.data.data.breakToleranceMinutes ?? 10,
        });
      }
    }).catch(() => {});
  }, []);

  // ── Rich CustomSelect Option Memoizers for Analytics (Request 1 & 3) ───────
  const companyOptions = useMemo(() => {
    const companiesMap = new Map<string, { logoUrl?: string | null; groupName?: string | null }>();
    filterStores.forEach(s => {
      if (s.companyName && !companiesMap.has(s.companyName)) {
        companiesMap.set(s.companyName, {
          logoUrl: getAvatarUrl(s.companyLogoFilename),
          groupName: s.groupName,
        });
      }
    });
    return [
      { value: '', label: t('shifts.allCompanies', 'All Companies') },
      ...Array.from(companiesMap.entries()).map(([compName, info]) => ({
        value: compName,
        label: compName,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
            {info.logoUrl ? (
              <img src={info.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'rgba(13,33,55,0.08)',
                color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                border: '1px solid rgba(13,33,55,0.15)',
              }}>
                <Building size={15} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{compName}</span>
              {info.groupName && <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{info.groupName}</span>}
            </div>
          </div>
        )
      }))
    ];
  }, [filterStores, t]);

  const storeOptions = useMemo(() => {
    const storesList = analyticsCompany
      ? filterStores.filter(s => s.companyName === analyticsCompany)
      : filterStores;
    return [
      { value: '', label: t('attendance.allStores', 'Tutti i Negozi') },
      ...storesList.map(s => {
        const storeLogoUrl = getAvatarUrl(s.logoFilename);
        return {
          value: String(s.id),
          label: s.name,
          render: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 10, padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {storeLogoUrl ? (
                  <img src={storeLogoUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,151,58,0.14)',
                    color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    border: '1px solid rgba(201,151,58,0.25)',
                  }}>
                    <MapPin size={15} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  {s.companyName && <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.companyName}</span>}
                </div>
              </div>
              {s.employeeCount !== undefined && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
                  background: 'var(--background)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  👥 {s.employeeCount}
                </span>
              )}
            </div>
          )
        };
      })
    ];
  }, [analyticsCompany, filterStores, t]);

  const analyticsEmployeeOptions = useMemo(() => {
    let empList = filterEmployees;
    if (analyticsStoreId) {
      const sId = parseInt(analyticsStoreId, 10);
      empList = empList.filter(e => e.storeId === sId);
    } else if (analyticsCompany) {
      const storeIdsInCompany = new Set(filterStores.filter(s => s.companyName === analyticsCompany).map(s => s.id));
      empList = empList.filter(e => e.storeId && storeIdsInCompany.has(e.storeId));
    }
    return [
      { value: '', label: t('attendance.allEmployees', 'Tutti i Dipendenti') },
      ...empList.map(e => {
        const fullName = `${e.name} ${e.surname}`.trim();
        const avatarUrl = getAvatarUrl(e.avatarFilename);
        const initials = `${e.name?.[0] ?? ''}${e.surname?.[0] ?? ''}`.toUpperCase();
        return {
          value: String(e.id),
          label: fullName,
          render: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 10, padding: '2px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,151,58,0.18)',
                    color: 'var(--accent)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    border: '1px solid rgba(201,151,58,0.3)',
                  }}>
                    {initials}
                  </div>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fullName}
                </span>
              </div>
              {e.role && (
                <span style={{
                  fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
                  padding: '2px 7px', borderRadius: 4, background: 'rgba(13,33,55,0.08)', color: 'var(--primary)',
                  border: '1px solid rgba(13,33,55,0.15)', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {t(`roles.${e.role}`, e.role)}
                </span>
              )}
            </div>
          )
        };
      })
    ];
  }, [analyticsStoreId, analyticsCompany, filterEmployees, filterStores, t]);

  // Filter Modal & Temp States
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [companyList, setCompanyList] = useState<Array<{ id: number; name: string }>>([]);
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [tempCompanyId, setTempCompanyId] = useState('');
  const [tempStoreId, setTempStoreId] = useState('');
  const [tempUserId, setTempUserId] = useState('');
  const [tempDateFrom, setTempDateFrom] = useState('');
  const [tempDateTo, setTempDateTo] = useState('');

  useEffect(() => {
    getCompanies().then(setCompanyList).catch(() => {});
  }, []);

  // Summary display limit (100 per page)
  const [summaryDisplayLimit, setSummaryDisplayLimit] = useState(100);

  const openFilterModal = () => {
    setTempCompanyId(filterCompanyId);
    setTempStoreId(filterStoreId);
    setTempUserId(filterUserId);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setFilterCompanyId(tempCompanyId);
    if (tempCompanyId) {
      const selectedComp = companyList.find(c => String(c.id) === tempCompanyId);
      if (selectedComp) setAnalyticsCompany(selectedComp.name);
    } else {
      setAnalyticsCompany('');
    }
    setFilterStoreId(tempStoreId);
    setFilterUserId(tempUserId);
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
    setShowFilterModal(false);
  };

  const activeFilterTags = useMemo(() => {
    const tags = [];
    if (filterStoreId) {
      const storeObj = filterStores.find(s => String(s.id) === filterStoreId);
      tags.push({
        key: 'store',
        label: t('common.store', 'Negozio'),
        value: storeObj ? storeObj.name : filterStoreId,
      });
    }
    if (filterUserId) {
      const empObj = filterEmployees.find(e => String(e.id) === filterUserId);
      tags.push({
        key: 'employee',
        label: t('employees.colName', 'Dipendente'),
        value: empObj ? `${empObj.name} ${empObj.surname}` : filterUserId,
      });
    }
    if (dateFrom !== defaultFrom || dateTo !== today) {
      tags.push({
        key: 'date',
        label: t('common.date', 'Periodo'),
        value: `${dateFrom} → ${dateTo}`,
      });
    }
    if (eventType) {
      const labelKey = EVENT_TYPE_LABEL_KEYS[eventType] ?? 'attendance.checkin';
      tags.push({
        key: 'eventType',
        label: t('attendance.eventType', 'Tipo Evento'),
        value: t(labelKey),
      });
    }
    return tags;
  }, [filterStoreId, filterUserId, dateFrom, dateTo, eventType, filterStores, filterEmployees, defaultFrom, today, t]);

  const hasActiveFilters = activeFilterTags.length > 0;

  const removeFilter = (key: string) => {
    if (key === 'store') {
      setFilterStoreId('');
    } else if (key === 'employee') {
      setFilterUserId('');
    } else if (key === 'date') {
      setDateFrom(defaultFrom);
      setDateTo(today);
    } else if (key === 'eventType') {
      setEventType('');
    }
  };

  const resetAllFilters = () => {
    setFilterStoreId('');
    setFilterUserId('');
    setDateFrom(defaultFrom);
    setDateTo(today);
    setEventType('');
    setSearchInput('');
  };

  const filteredEmployeesForSelect = useMemo(() => {
    if (!tempStoreId) return filterEmployees;
    const sId = parseInt(tempStoreId, 10);
    return filterEmployees.filter(e => e.storeId === sId);
  }, [tempStoreId, filterEmployees]);

  const loadFilterEmployees = useCallback(async (storeId?: number) => {
    try {
      const res = await getEmployees({ limit: 500, status: 'active', ...(storeId ? { storeId } : {}) });
      setFilterEmployees(
        res.employees.map((e) => ({
          id: e.id,
          name: e.name,
          surname: e.surname,
          storeId: e.storeId ?? null,
          avatarFilename: e.avatarFilename,
          role: e.role,
        })),
      );
    } catch {
      setFilterEmployees([]);
    }
  }, []);

  useEffect(() => {
    getStores()
      .then((stores) => {
        const mapped = stores.map((s) => ({
          id: s.id,
          name: s.name,
          companyName: s.companyName,
          groupName: s.groupName,
          companyLogoFilename: s.companyLogoFilename,
          logoFilename: s.logoFilename,
          employeeCount: s.employeeCount,
        }));
        setFilterStores(mapped);
        if (mapped.length > 0) {
          const userStore = user?.storeId ? mapped.find(s => s.id === user?.storeId) : null;
          if (userStore) {
            setAnalyticsCompany(userStore.companyName ?? mapped[0].companyName ?? '');
            setAnalyticsStoreId(String(userStore.id));
          } else {
            if (mapped[0].companyName) setAnalyticsCompany(mapped[0].companyName);
            setAnalyticsStoreId(String(mapped[0].id));
          }
        }
      })
      .catch(() => setFilterStores([]));
    void loadFilterEmployees();
  }, [loadFilterEmployees, user?.storeId]);

  // Logs load a small page at a time (fast) + "Load more"; the summary/analytics
  // views pull a complete scoped dataset so their aggregates are exact.
  const LOGS_PAGE_SIZE = 100;
  const SUMMARY_FETCH_LIMIT = 20000;

  // Active scope resolves to the summary/logs filters, or the analytics panel's
  // own filters when the analytics view is open.
  const buildActiveParams = useCallback((): AttendanceListParams => {
    const storeId = viewMode === 'analytics' ? analyticsStoreId : filterStoreId;
    const userId  = viewMode === 'analytics' ? analyticsUserId : filterUserId;
    const params: AttendanceListParams = {
      dateFrom: viewMode === 'analytics' ? analyticsDateFrom : dateFrom,
      dateTo:   viewMode === 'analytics' ? analyticsDateTo : dateTo,
    };
    if (filterCompanyId) {
      params.companyId = parseInt(filterCompanyId, 10);
      (params as any).company_id = parseInt(filterCompanyId, 10);
    }
    if (viewMode === 'logs' && eventType) params.eventType = eventType as EventType;
    if (viewMode === 'logs' && filterSearch.trim()) params.search = filterSearch.trim();
    if (storeId) params.storeId = parseInt(storeId, 10);
    if (userId) params.userId = parseInt(userId, 10);
    return params;
  }, [viewMode, dateFrom, dateTo, eventType, filterSearch, filterStoreId, filterUserId, filterCompanyId, analyticsDateFrom, analyticsDateTo, analyticsStoreId, analyticsUserId]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildActiveParams();
      if (viewMode === 'logs') {
        // Raw event log — first page only; more rows via loadMoreLogs().
        const res = await listAttendanceEvents({ ...params, limit: LOGS_PAGE_SIZE, offset: 0 });
        setEvents(res.events);
        setTotal(res.total);
      } else {
        // Summary / analytics need ALL event types (to pair check-in/out) across the
        // full period, plus shifts and approved leave — never a filtered subset.
        const [res, shiftsRes, leaveRes] = await Promise.all([
          listAttendanceEvents({ ...params, eventType: undefined, search: undefined, limit: SUMMARY_FETCH_LIMIT, offset: 0 }),
          listShifts({ store_id: params.storeId, user_id: params.userId }).catch(() => ({ shifts: [] })),
          getLeaveRequests({ dateFrom: params.dateFrom, dateTo: params.dateTo, userId: params.userId, storeId: params.storeId }).catch(() => ({ requests: [], total: 0 })),
        ]);
        setEvents(res.events);
        setTotal(res.total);
        setShiftsList(shiftsRes.shifts || []);
        setLeaveRequestsList(leaveRes.requests || []);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error ?? t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [viewMode, buildActiveParams, lastSyncTime, t]);

  const loadMoreLogs = useCallback(async () => {
    setLoadingMore(true);
    try {
      const params = buildActiveParams();
      const res = await listAttendanceEvents({ ...params, limit: LOGS_PAGE_SIZE, offset: events.length });
      setEvents(prev => [...prev, ...res.events]);
      setTotal(res.total);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error ?? t('common.error'));
    } finally {
      setLoadingMore(false);
    }
  }, [buildActiveParams, events.length, t]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { setSummaryDisplayLimit(100); }, [viewMode, dateFrom, dateTo, filterStoreId, filterUserId]);

  const summaryRows = useMemo<SummaryRow[]>(() => {
    const getGroupInfo = (dateStr: string): { dateKey: string; periodLabel: string } => {
      if (!dateStr) return { dateKey: 'unknown', periodLabel: '-' };
      const parts = dateStr.split('T')[0].split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      if (summaryPeriod === 'weekly') {
        const tmp = new Date(dt.valueOf());
        const dayNr = (dt.getDay() + 6) % 7;
        tmp.setDate(tmp.getDate() - dayNr + 3);
        const firstThursday = tmp.valueOf();
        tmp.setMonth(0, 1);
        if (tmp.getDay() !== 4) {
          tmp.setMonth(0, 1 + ((4 - tmp.getDay() + 7) % 7));
        }
        const weekNum = 1 + Math.round((firstThursday - tmp.valueOf()) / 604800000);
        const weekKey = `${y}-W${String(weekNum).padStart(2, '0')}`;
        return { dateKey: weekKey, periodLabel: `Settimana ${weekNum}, ${y}` };
      } else if (summaryPeriod === 'monthly') {
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const monthName = dt.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'it-IT', { month: 'long', year: 'numeric' });
        return { dateKey: monthKey, periodLabel: monthName.charAt(0).toUpperCase() + monthName.slice(1) };
      }
      const formatted = dt.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return { dateKey: dateStr.split('T')[0], periodLabel: formatted };
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const activeFrom = viewMode === 'analytics' ? analyticsDateFrom : dateFrom;
    const activeTo   = viewMode === 'analytics' ? analyticsDateTo : dateTo;
    // A day is in scope when it sits inside the selected range and is not in the
    // future (future shifts exist in the data but must not count as worked/missing).
    const inRange = (dayStr: string) =>
      (!activeFrom || dayStr >= activeFrom) && (!activeTo || dayStr <= activeTo) && dayStr <= todayStr;

    const map = new Map<string, SummaryRow>();
    const shiftsByDay = new Map<string, Shift[]>();          // `${userId}:${dayStr}`
    const eventsByDay = new Map<string, AttendanceEvent[]>();
    type LeaveDay = { type: 'vacation' | 'sick' | 'permission'; windowMins: number | null; approvedAt: number | null };
    const leaveByDay = new Map<string, LeaveDay>();
    const userDays = new Set<string>();                      // `${userId}:${dayStr}`

    const ensureRow = (
      userId: number, dayStr: string,
      meta: { userName?: string; userSurname?: string; userAvatarFilename?: string | null; storeId?: number | null; storeName?: string | null },
    ): SummaryRow => {
      const { dateKey, periodLabel } = getGroupInfo(dayStr);
      const key = `${userId}:${dateKey}`;
      let row = map.get(key);
      if (!row) {
        row = {
          key, userId,
          userName: meta.userName || 'Dipendente', userSurname: meta.userSurname || '',
          userAvatarFilename: meta.userAvatarFilename ?? null,
          storeId: meta.storeId, storeName: meta.storeName || 'Store',
          periodLabel, dateKey, shifts: [], events: [],
          scheduledMinutes: 0, workedMinutes: 0, varianceMinutes: 0,
          vacationMinutes: 0, sickMinutes: 0, leaveMinutes: 0,
          neutralizedMinutes: 0, effectiveScheduledMinutes: 0, absentMinutes: 0,
          leaveApprovedAfter: false,
          breakDeductedMinutes: 0, scheduledBreakMinutes: 0, actualBreakMinutes: 0,
          breakRecorded: false, breakNotCompleted: false,
          status: 'worked',
        };
        map.set(key, row);
      } else if (!row.userAvatarFilename && meta.userAvatarFilename) {
        row.userAvatarFilename = meta.userAvatarFilename;
      }
      return row;
    };

    for (const s of shiftsList) {
      const dayStr = s.date.split('T')[0];
      if (!inRange(dayStr)) continue;
      const row = ensureRow(s.userId, dayStr, { userName: s.userName, userSurname: s.userSurname, userAvatarFilename: s.userAvatarFilename, storeId: s.storeId, storeName: s.storeName });
      row.shifts.push(s);
      const dkey = `${s.userId}:${dayStr}`;
      (shiftsByDay.get(dkey) ?? shiftsByDay.set(dkey, []).get(dkey)!).push(s);
      userDays.add(dkey);
    }

    for (const ev of events) {
      const dayStr = ev.eventTime.split('T')[0];
      if (!inRange(dayStr)) continue;
      const row = ensureRow(ev.userId, dayStr, { userName: ev.userName, userSurname: ev.userSurname, storeId: ev.storeId, storeName: ev.storeName });
      row.events.push(ev);
      const dkey = `${ev.userId}:${dayStr}`;
      (eventsByDay.get(dkey) ?? eventsByDay.set(dkey, []).get(dkey)!).push(ev);
      userDays.add(dkey);
    }

    const activeLeaves = leaveRequestsList.filter(
      r => r.status === 'approved' || r.status === 'HR approved' || r.status === 'admin approved' || r.status === 'admin_approved',
    );
    for (const lr of activeLeaves) {
      const type: LeaveDay['type'] = lr.leaveType === 'sick'
        ? 'sick'
        : (lr.leaveDurationType === 'short_leave' ? 'permission' : 'vacation');
      const approvedAt = lr.latestActionAt ? new Date(lr.latestActionAt).getTime()
        : (lr.updatedAt ? new Date(lr.updatedAt).getTime() : null);
      let windowMins: number | null = null;
      if (lr.leaveDurationType === 'short_leave' && lr.shortStartTime && lr.shortEndTime) {
        const [sh, sm] = lr.shortStartTime.split(':').map(Number);
        const [eh, em] = lr.shortEndTime.split(':').map(Number);
        windowMins = (eh * 60 + em) - (sh * 60 + sm);
        if (windowMins < 0) windowMins += 24 * 60;
      }
      const start = new Date(lr.startDate);
      const end = new Date(lr.endDate);
      for (let curr = new Date(start); curr <= end; curr.setDate(curr.getDate() + 1)) {
        const dayStr = curr.toISOString().split('T')[0];
        if (!inRange(dayStr)) continue;
        ensureRow(lr.userId, dayStr, { userName: lr.userName, userSurname: lr.userSurname, userAvatarFilename: lr.userAvatarFilename, storeId: lr.storeId, storeName: lr.storeName });
        leaveByDay.set(`${lr.userId}:${dayStr}`, { type, windowMins, approvedAt });
        userDays.add(`${lr.userId}:${dayStr}`);
      }
    }

    const computeDayWorked = (evs: AttendanceEvent[], dayShifts: Shift[]): {
      worked: number;
      breakDeducted: number;
      scheduledBreak: number;
      actualBreak: number;
      breakRecorded: boolean;
      breakNotCompleted: boolean;
    } => {
      const checkins = evs.filter(e => e.eventType === 'checkin').sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
      const checkouts = evs.filter(e => e.eventType === 'checkout').sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
      const breakStarts = evs.filter(e => e.eventType === 'break_start').sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
      const breakEnds = evs.filter(e => e.eventType === 'break_end').sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());
      
      if (checkins.length === 0 || checkouts.length === 0) {
        return { worked: 0, breakDeducted: 0, scheduledBreak: 0, actualBreak: 0, breakRecorded: false, breakNotCompleted: false };
      }

      const spanMins = Math.max(0, Math.round((new Date(checkouts[0].eventTime).getTime() - new Date(checkins[0].eventTime).getTime()) / 60000));

      let scheduledBreak = 0;
      for (const s of dayShifts) {
        if (s.breakMinutes) {
          scheduledBreak += s.breakMinutes;
        } else if (s.breakStart && s.breakEnd) {
          const [bsh, bsm] = s.breakStart.split(':').map(Number);
          const [beh, bem] = s.breakEnd.split(':').map(Number);
          let bMins = (beh * 60 + bem) - (bsh * 60 + bsm);
          if (bMins < 0) bMins += 24 * 60;
          scheduledBreak += bMins;
        }
      }

      const breakRecorded = breakStarts.length > 0 && breakEnds.length > 0;
      let actualBreak = 0;
      if (breakRecorded) {
        actualBreak = Math.max(0, Math.round((new Date(breakEnds[0].eventTime).getTime() - new Date(breakStarts[0].eventTime).getTime()) / 60000));
      }

      let breakDeducted = 0;
      let breakNotCompleted = false;

      if (scheduledBreak === 0) {
        breakDeducted = actualBreak;
      } else if (breakRecorded) {
        if (breakSettings.enforcementEnabled && actualBreak < (scheduledBreak - breakSettings.toleranceMinutes)) {
          breakDeducted = Math.max(actualBreak, scheduledBreak);
          breakNotCompleted = true;
        } else {
          breakDeducted = actualBreak;
        }
      } else {
        // Break NOT recorded -> always deduct scheduled break time
        breakDeducted = scheduledBreak;
      }

      const worked = Math.max(0, spanMins - breakDeducted);
      return { worked, breakDeducted, scheduledBreak, actualBreak, breakRecorded, breakNotCompleted };
    };

    // ── Per user-day pass: apply leave/absent rules, then fold into period rows ──
    for (const dkey of userDays) {
      const sep = dkey.indexOf(':');
      const userId = parseInt(dkey.slice(0, sep), 10);
      const dayStr = dkey.slice(sep + 1);
      const { dateKey } = getGroupInfo(dayStr);
      const row = map.get(`${userId}:${dateKey}`);
      if (!row) continue;

      const dayShifts = (shiftsByDay.get(dkey) ?? []).filter(s => s.status !== 'cancelled');
      const dayScheduled = dayShifts.reduce((sum, s) => sum + shiftDurationMinutes(s), 0);
      const dayEvents = eventsByDay.get(dkey) ?? [];
      const hasEvents = dayEvents.length > 0;
      const workedRes = hasEvents ? computeDayWorked(dayEvents, dayShifts) : { worked: 0, breakDeducted: 0, scheduledBreak: 0, actualBreak: 0, breakRecorded: false, breakNotCompleted: false };
      const worked = workedRes.worked;
      row.breakDeductedMinutes += workedRes.breakDeducted;
      row.scheduledBreakMinutes += workedRes.scheduledBreak;
      row.actualBreakMinutes += workedRes.actualBreak;
      if (workedRes.breakRecorded) row.breakRecorded = true;
      if (workedRes.breakNotCompleted) row.breakNotCompleted = true;
      const leave = leaveByDay.get(dkey);
      const isPast = dayStr < todayStr;

      row.scheduledMinutes += dayScheduled;
      row.workedMinutes += worked;

      let neutralize = 0;
      if (leave) {
        const displayMins = leave.windowMins != null ? leave.windowMins : (dayScheduled > 0 ? dayScheduled : 8 * 60);
        if (leave.type === 'vacation') row.vacationMinutes += displayMins;
        else if (leave.type === 'sick') row.sickMinutes += displayMins;
        else row.leaveMinutes += displayMins;

        if (!hasEvents) {
          // Approved before → the person could not clock in → excuse the scheduled time.
          neutralize = leave.windowMins != null ? Math.min(leave.windowMins, dayScheduled) : dayScheduled;
          row.neutralizedMinutes += neutralize;
        } else {
          // The person worked that day → leave was recorded/approved after the fact:
          // it must NOT change the numbers. Flag it so the UI can say so (in red).
          row.leaveApprovedAfter = true;
        }
      }

      // Absent = a past scheduled day with no clock-in and no covering leave.
      // Stays in the deficit (client's rule), only surfaced with an "Absent" label.
      const remainingScheduled = dayScheduled - neutralize;
      if (isPast && remainingScheduled > 0 && !hasEvents) {
        row.absentMinutes += remainingScheduled;
      }
    }

    const result = Array.from(map.values());
    for (const row of result) {
      row.effectiveScheduledMinutes = Math.max(0, row.scheduledMinutes - row.neutralizedMinutes);
      row.varianceMinutes = row.workedMinutes - row.effectiveScheduledMinutes;

      // Row status — daily rows resolve to clean per-day states (incl. today's
      // pending/in-progress); weekly/monthly rows collapse to leave/absent/worked.
      if (summaryPeriod === 'daily' && row.dateKey === todayStr) {
        const hasCheckin = row.events.some(e => e.eventType === 'checkin');
        const hasCheckout = row.events.some(e => e.eventType === 'checkout');
        if (hasCheckin && !hasCheckout) { row.status = 'in_progress'; continue; }
        if (!hasCheckin && row.scheduledMinutes > 0) { row.status = 'pending'; continue; }
      }
      if (row.workedMinutes === 0 && row.effectiveScheduledMinutes === 0 && (row.neutralizedMinutes > 0 || row.vacationMinutes > 0 || row.sickMinutes > 0 || row.leaveMinutes > 0)) row.status = 'leave';
      // Nothing due, nothing worked, no leave — but the period's shift(s) were cancelled.
      // Without this the row would fall through to 'worked' with a 0 variance → "On time".
      // Distinguish planned day-off from regular cancellation via isOffDay flag.
      else if (row.workedMinutes === 0 && row.effectiveScheduledMinutes === 0 && row.neutralizedMinutes === 0
               && row.shifts.length > 0 && row.shifts.every(s => s.status === 'cancelled')) {
        row.status = row.shifts.some((s: any) => s.isOffDay) ? 'day_off' : 'cancelled';
      }
      else if (row.workedMinutes === 0 && row.effectiveScheduledMinutes > 0) row.status = 'absent';
      else row.status = 'worked';
    }

    result.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    let filtered = result;
    if (viewMode === 'summary' && summaryStatusFilter) {
      filtered = filtered.filter(r => r.shifts.some(s => s.status === summaryStatusFilter));
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      filtered = filtered.filter(r => `${r.userName} ${r.userSurname}`.toLowerCase().includes(q) || r.storeName.toLowerCase().includes(q));
    }
    return filtered;
  }, [events, shiftsList, leaveRequestsList, summaryPeriod, filterSearch, i18n.language, viewMode, dateFrom, dateTo, analyticsDateFrom, analyticsDateTo, summaryStatusFilter]);

  const displayedEvents = useMemo(() => {
    if (!filterCompanyId) return events;
    const targetCid = parseInt(filterCompanyId, 10);
    const targetCompName = companyList.find(c => String(c.id) === filterCompanyId)?.name;
    return events.filter((ev: any) => {
      if (ev.companyId === targetCid || ev.company_id === targetCid) return true;
      if (targetCompName && ev.companyName === targetCompName) return true;
      if (ev.storeId) {
        const storeObj = filterStores.find(s => s.id === ev.storeId);
        if (storeObj && (String((storeObj as any).companyId) === filterCompanyId || storeObj.companyName === targetCompName)) return true;
      }
      return false;
    });
  }, [events, filterCompanyId, companyList, filterStores]);

  const displayedSummaryRows = useMemo(() => {
    if (!filterCompanyId) return summaryRows;
    const targetCid = parseInt(filterCompanyId, 10);
    const targetCompName = companyList.find(c => String(c.id) === filterCompanyId)?.name;
    return summaryRows.filter((r: any) => {
      if (r.companyId === targetCid || r.company_id === targetCid) return true;
      if (targetCompName && r.companyName === targetCompName) return true;
      if (r.storeId) {
        const storeObj = filterStores.find(s => s.id === r.storeId);
        if (storeObj && (String((storeObj as any).companyId) === filterCompanyId || storeObj.companyName === targetCompName)) return true;
      }
      return false;
    });
  }, [summaryRows, filterCompanyId, companyList, filterStores]);

  const analyticsData = useMemo(() => {
    let list = displayedSummaryRows;
    if (analyticsCompany) {
      const storeIdsInCompany = new Set(filterStores.filter(s => s.companyName === analyticsCompany).map(s => s.id));
      list = list.filter(r => r.storeId && storeIdsInCompany.has(r.storeId));
    }
    if (analyticsStoreId) {
      const sId = parseInt(analyticsStoreId, 10);
      list = list.filter(r => r.storeId === sId);
    }
    if (analyticsUserId) {
      const uId = parseInt(analyticsUserId, 10);
      list = list.filter(r => r.userId === uId);
    }
    if (analyticsDateFrom && analyticsDateTo) {
      list = list.filter(r => r.dateKey >= analyticsDateFrom && r.dateKey <= analyticsDateTo);
    }

    let sumScheduled = 0;      // gross scheduled (all due shifts)
    let sumEffective = 0;      // scheduled after leave is excused
    let sumWorked = 0;
    let sumOvertime = 0;
    let sumUndertime = 0;
    let sumLeave = 0;
    let sumAbsent = 0;
    let shiftCount = 0;
    const employeeIds = new Set<number>();

    list.forEach(r => {
      sumScheduled += r.scheduledMinutes;
      sumEffective += r.effectiveScheduledMinutes;
      sumWorked += r.workedMinutes;
      sumLeave += r.neutralizedMinutes;
      sumAbsent += r.absentMinutes;
      shiftCount += r.shifts.length;
      employeeIds.add(r.userId);
      if (r.status === 'pending' || r.status === 'in_progress' || r.status === 'cancelled' || r.status === 'day_off') return;
      if (r.varianceMinutes > 0) sumOvertime += r.varianceMinutes;
      else if (r.varianceMinutes < 0) sumUndertime += Math.abs(r.varianceMinutes);
    });

    return {
      rows: list,
      sumScheduled,
      sumEffective,
      sumWorked,
      sumOvertime,
      sumUndertime,
      sumLeave,
      sumAbsent,
      shiftCount,
      employeeCount: employeeIds.size,
      netBalance: sumOvertime - sumUndertime,   // overall balance (overtime − missing)
      netDiff: sumWorked - sumEffective,
      completionRate: sumEffective > 0 ? Math.round((sumWorked / sumEffective) * 100) : (sumWorked > 0 ? 100 : 0),
    };
  }, [displayedSummaryRows, analyticsCompany, analyticsStoreId, analyticsUserId, analyticsDateFrom, analyticsDateTo, filterStores]);

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      let headers: string[] = [];
      let dataRows: any[][] = [];
      let fileName = '';

      if (viewMode === 'logs') {
        headers = [
          t('common.date', 'Data'),
          t('common.time', 'Ora'),
          t('employees.colSurname', 'Cognome'),
          t('employees.colName', 'Nome'),
          t('common.store', 'Negozio'),
          t('attendance.eventType', 'Tipo Evento'),
          t('attendance.colOrigin', 'Origine'),
          t('attendance.colNotes', 'Note'),
        ];
        
        dataRows = events.map((e) => {
          const { date, time } = formatDateTime(e.eventTime);
          return [
            date,
            time,
            e.userSurname ?? '',
            e.userName ?? '',
            e.storeName ?? '',
            t(`attendance.${e.eventType}`, e.eventType),
            e.source ?? '',
            e.notes ?? '',
          ];
        });
        
        fileName = `presenze-logs-${dateFrom}-${dateTo}.${format}`;
      } else {
        headers = [
          t('employees.colSurname', 'Cognome'),
          t('employees.colName', 'Nome'),
          t('common.store', 'Negozio'),
          t('common.period', 'Periodo'),
          t('attendance.colScheduled', 'Ore Programmate'),
          t('attendance.colWorked', 'Ore Lavorate'),
          t('attendance.colVariance', 'Scostamento'),
          t('attendance.scheduledBreak', 'Pausa Programmata'),
          t('attendance.breakStatus', 'Stato Pausa'),
          t('leave.type_vacation', 'Ferie'),
          t('leave.type_sick', 'Malattia'),
          t('leave.duration_short_leave', 'Permessi')
        ];
        
        const rowsToExport = viewMode === 'analytics' ? analyticsData.rows : summaryRows;
        
        dataRows = rowsToExport.map((r) => [
          r.userSurname ?? '',
          r.userName ?? '',
          r.storeName ?? '',
          r.periodLabel ?? '',
          formatHoursStr(r.scheduledMinutes),
          formatHoursStr(r.workedMinutes),
          r.varianceMinutes > 0 ? `+${formatHoursStr(r.varianceMinutes)}` : (r.varianceMinutes < 0 ? `-${formatHoursStr(r.varianceMinutes)}` : '0h'),
          r.scheduledBreakMinutes > 0 ? formatHoursStr(r.scheduledBreakMinutes) : '—',
          r.scheduledBreakMinutes > 0
            ? (r.breakRecorded
              ? (r.breakNotCompleted
                ? t('attendance.breakNotCompleted', 'Non completata')
                : t('attendance.recorded', 'Registrata'))
              : t('attendance.noBreakRecorded', 'Non registrata'))
            : '—',
          formatHoursStr(r.vacationMinutes ?? 0),
          formatHoursStr(r.sickMinutes ?? 0),
          formatHoursStr(r.leaveMinutes ?? 0),
        ]);
        
        const activeDateFrom = viewMode === 'analytics' ? analyticsDateFrom : dateFrom;
        const activeDateTo = viewMode === 'analytics' ? analyticsDateTo : dateTo;
        fileName = `presenze-riepilogo-${activeDateFrom}-${activeDateTo}.${format}`;
      }

      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      
      // Auto-width adjustment for columns
      const cols = headers.map((h, i) => {
        let maxLen = h.length;
        for (const r of dataRows) {
          const val = String(r[i] ?? '');
          if (val.length > maxLen) {
            maxLen = val.length;
          }
        }
        return { wch: maxLen + 3 };
      });
      ws['!cols'] = cols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Presenze');

      if (format === 'xlsx') {
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      setError(t('attendance.exportError', 'Errore durante l\'esportazione dei dati.'));
    }
  }

  function formatDateTime(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
    return {
      date: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    };
  }

  const typeCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
    return acc;
  }, {});

  const eventTypeOptions: { value: string; labelKey: string }[] = [
    { value: '', labelKey: 'common.all' },
    { value: 'checkin',     labelKey: 'attendance.checkin' },
    { value: 'checkout',    labelKey: 'attendance.checkout' },
    { value: 'break_start', labelKey: 'attendance.breakStart' },
    { value: 'break_end',   labelKey: 'attendance.breakEnd' },
  ];

  const heroPad = isMobile ? '20px 16px 0' : isTablet ? '24px 20px 0' : '28px 32px 0';
  const contentPad = isMobile ? '12px 0 40px' : isTablet ? '16px 0 60px' : '20px 0 80px';
  const filterPad = isMobile ? '10px 12px' : '10px 16px';

  return (
    <div style={{ padding: 0, minHeight: '100%' }}>
      <style>{`
        @keyframes rowIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .att-row { animation: rowIn 0.22s ease both; }
        .att-stat-card:hover {
          background: rgba(201,151,58,0.10) !important;
          transform: translateY(-1px);
        }
        .att-type-btn:hover {
          border-color: var(--accent) !important;
          color: var(--accent) !important;
        }
        .att-card:hover { background: var(--surface-warm) !important; }
      `}</style>

      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div style={{ 
        background: 'var(--primary)', 
        padding: heroPad,
        borderRadius: 'var(--radius-lg)',
        marginBottom: 20
      }}>

        {/* Title row */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'flex-start',
          justifyContent: 'space-between',
          gap: isMobile ? 14 : 0,
          marginBottom: 24,
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '2.5px',
              color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 8,
            }}>
              {t('attendance.moduleLabel')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)',
              fontSize: isMobile ? '1.4rem' : '1.75rem',
              fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.5, lineHeight: 1.2,
            }}>
              {viewMode === 'logs'
                ? t('attendance.logTitle')
                : viewMode === 'summary'
                ? t('attendance.viewSummary', 'Riepilogo Ore Lavorate')
                : t('attendance.viewAnalytics', 'Analisi Grafica & Confronto')
              }
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.45)', minHeight: 20 }}>
              {!loading && (
                <>
                  {viewMode === 'logs' ? (
                    <>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{total}</span>
                      {' '}{t('attendance.logsHeroDesc', 'timbrature trovate')}
                      {total > events.length && (
                        <span> · {t('attendance.showing')} {events.length}</span>
                      )}
                    </>
                  ) : viewMode === 'summary' ? (
                    <>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{summaryRows.slice(0, 500).length}</span>
                      {' '}{t('attendance.summaryHeroDesc', 'riepiloghi dipendenti trovati')}
                    </>
                  ) : (
                    <>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{analyticsData.rows.length}</span>
                      {' '}{t('attendance.analyticsHeroDesc', 'dipendenti analizzati')}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Header right: New Entry + Export buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            {/* New manual entry — admin/hr only */}
            {canEdit && (
              <button
                onClick={openCreateModal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: isMobile ? '7px 12px' : '8px 14px',
                  borderRadius: 8,
                  background: 'rgba(13,33,55,0.75)', border: '1px solid rgba(255,255,255,0.18)',
                  color: '#fff', fontWeight: 700,
                  fontSize: isMobile ? 11 : 12,
                  cursor: 'pointer', transition: 'background 0.15s', letterSpacing: 0.3,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,33,55,0.95)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(13,33,55,0.75)'; }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                {t('attendance.newEntry')}
              </button>
            )}
            {/* Export buttons */}
            {(['csv', 'xlsx'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleExport(fmt)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: isMobile ? '7px 12px' : '8px 14px',
                  borderRadius: 8,
                  background: 'rgba(201,151,58,0.18)', border: '1px solid rgba(201,151,58,0.35)',
                  color: 'var(--accent)', fontWeight: 700,
                  fontSize: isMobile ? 11 : 12,
                  cursor: 'pointer', transition: 'background 0.15s', letterSpacing: 0.3,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,151,58,0.28)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,151,58,0.18)'; }}
              >
                <span style={{ fontSize: 13 }}>↓</span>
                {fmt === 'csv' ? t('attendance.exportCsv') : t('attendance.exportExcel')}
              </button>
            ))}
          </div>
        </div>

        {/* Stat tiles — only shown in logs view */}
        {viewMode === 'logs' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: isMobile ? 12 : 16,
            paddingBottom: 24,
          }}>
            {(['checkin', 'checkout', 'break_start', 'break_end'] as const).map((type) => {
              const meta   = EVENT_META[type];
              const count  = typeCounts[type] ?? 0;
              const active = eventType === type;
              return (
                <button
                  key={type}
                  className="att-stat-card"
                  onClick={() => setEventType(active ? '' : type)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: isMobile ? 10 : 14,
                    padding: isMobile ? '12px 14px' : '16px 20px',
                    background: active ? 'rgba(201,151,58,0.15)' : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${active ? 'rgba(201,151,58,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    borderBottom: `4px solid ${active ? 'var(--accent)' : meta.dot}`,
                    borderRadius: 14,
                    cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    textAlign: 'left', outline: 'none',
                    boxShadow: active ? '0 8px 24px rgba(0,0,0,0.2)' : 'none',
                  }}
                >
                  <div style={{
                    width: isMobile ? 32 : 40, height: isMobile ? 32 : 40,
                    borderRadius: 10,
                    background: active ? 'var(--accent)' : meta.dot,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isMobile ? 14 : 18, flexShrink: 0,
                    color: '#fff',
                    boxShadow: `0 4px 12px ${meta.dot}44`,
                  }}>
                    {meta.icon}
                  </div>
                  <div>
                    <div style={{
                      fontSize: isMobile ? 17 : 20, fontWeight: 800,
                      color: count > 0 ? meta.dot : 'rgba(255,255,255,0.3)',
                      fontFamily: 'var(--font-display)', lineHeight: 1,
                      opacity: loading ? 0.4 : 1,
                      transition: 'opacity 0.2s',
                    }}>
                      {count}
                    </div>
                    <div style={{
                      fontSize: isMobile ? 9 : 10,
                      color: 'rgba(255,255,255,0.45)',
                      textTransform: 'uppercase', letterSpacing: 1, marginTop: 2,
                    }}>
                      {t(EVENT_TYPE_LABEL_KEYS[type])}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Toolbar Row ─────────────────────────────────────────────────── */}
      <div style={{
        margin: '0 0 16px 0',
        padding: filterPad,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        position: 'relative',
        zIndex: 5,
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          {/* Search input (Left) */}
          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 200, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 14, top: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('employees.searchPlaceholder', { defaultValue: 'Cerca dipendente...' })}
              style={{
                width: '100%',
                height: 42,
                borderRadius: 12,
                border: '1px solid var(--border)',
                padding: '0 16px 0 42px',
                background: 'var(--background)',
                color: 'var(--text)',
                fontSize: 14,
                outline: 'none',
                transition: 'all 0.15s',
              }}
            />
          </div>

          {/* View Mode Switcher Dropdown (Right, before Filter) — admin/hr only */}
          {(user?.role === 'admin' || user?.role === 'hr') && (
            <div ref={viewDropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
                style={{
                  height: 42,
                  padding: '0 14px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  border: viewMode === 'summary' ? '1px solid rgba(201,151,58,0.5)' : '1px solid var(--border)',
                  background: viewMode === 'summary' ? 'linear-gradient(135deg, rgba(201,151,58,0.18) 0%, rgba(201,151,58,0.06) 100%)' : 'var(--background)',
                  color: viewMode === 'summary' ? 'var(--accent)' : 'var(--text)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                  boxShadow: viewMode === 'summary' ? '0 2px 10px rgba(201,151,58,0.2)' : 'none',
                }}
              >
                {viewMode === 'logs' ? <ClipboardList size={16} style={{ color: 'var(--primary)' }} /> : viewMode === 'summary' ? <BarChart2 size={16} style={{ color: 'var(--accent)' }} /> : <PieChart size={16} style={{ color: '#2563eb' }} />}
                <span>{viewMode === 'logs' ? t('attendance.viewLogs', 'Registro Log') : viewMode === 'summary' ? t('attendance.viewSummary', 'Riepilogo Ore Lavorate') : t('attendance.viewAnalytics', 'Analisi Grafica & Confronto')}</span>
                <ChevronDown size={14} style={{ transform: isViewDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }} />
              </button>

              {isViewDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 6,
                  width: 250,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
                  padding: 6,
                  zIndex: 1000,
                  animation: 'fadeIn 0.15s ease-out',
                }}>
                  {[
                    { id: 'logs', label: t('attendance.viewLogs', 'Registro Log'), icon: ClipboardList, desc: 'Timbrature grezze e marcature' },
                    { id: 'summary', label: t('attendance.viewSummary', 'Riepilogo Ore Lavorate'), icon: BarChart2, desc: 'Ore programmate vs lavorate' },
                    { id: 'analytics', label: t('attendance.viewAnalytics', 'Analisi Grafica & Confronto'), icon: PieChart, desc: 'Grafici e confronto visivo' },
                  ].map((item) => {
                    const active = viewMode === item.id;
                    const IconComp = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setViewMode(item.id as 'logs' | 'summary' | 'analytics');
                          setIsViewDropdownOpen(false);
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          background: active ? 'linear-gradient(135deg, rgba(201,151,58,0.15) 0%, rgba(201,151,58,0.05) 100%)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'background 0.15s',
                          marginBottom: 2,
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-warm)'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: active ? 'var(--accent)' : 'var(--background)',
                            color: active ? '#fff' : 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <IconComp size={16} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{item.desc}</div>
                          </div>
                        </div>
                        {active && <Check size={16} style={{ color: 'var(--accent)' }} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Filter Button */}
          <button
            onClick={openFilterModal}
            style={{
              background: hasActiveFilters
                ? 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)'
                : 'var(--surface)',
              color: hasActiveFilters ? '#fff' : 'var(--text-secondary)',
              border: hasActiveFilters ? 'none' : '1px solid var(--border)',
              borderRadius: 12,
              padding: '0 18px',
              height: 42,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
              transition: 'all 0.2s',
              boxShadow: hasActiveFilters ? '0 2px 8px rgba(139,105,20,0.24)' : 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <span>{t('employees.filters', 'Filtri')}</span>
            {activeFilterTags.length > 0 && (
              <span style={{
                background: hasActiveFilters ? '#fff' : 'var(--accent)',
                color: hasActiveFilters ? 'var(--accent)' : '#fff',
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '999px',
                marginLeft: '4px',
              }}>
                {activeFilterTags.length}
              </span>
            )}
          </button>

          {/* Compact / Expand Button */}
          <button
            onClick={() => setCompact(!compact)}
            title={compact ? t('attendance.normalView', 'Visualizzazione normale') : t('attendance.compactView', 'Visualizzazione compatta')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 16px',
              height: 42,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: compact ? 'var(--accent-light)' : 'var(--surface)',
              color: compact ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
            <span style={{ display: isMobile ? 'none' : 'inline' }}>
              {compact ? t('attendance.compact', 'Compatto') : t('attendance.normal', 'Normale')}
            </span>
          </button>
        </div>

        {/* Loading indicator desktop */}
        <div style={{
          position: 'absolute',
          right: 24,
          bottom: -24,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {loading && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite',
              }} />
              {t('common.loading')}
            </div>
          )}
        </div>
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          margin: '0 0 16px 0',
        }}>
          {activeFilterTags.map((tag) => (
            <div
              key={tag.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, rgba(139,105,20,0.08) 0%, rgba(180,135,25,0.08) 100%)',
                border: '1px solid rgba(139,105,20,0.25)',
                borderRadius: '8px',
                padding: '6px 10px 6px 12px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                {tag.label}:
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {tag.value}
              </span>
              <button
                onClick={() => removeFilter(tag.key)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  borderRadius: '4px',
                  transition: 'background 0.15s, color 0.15s',
                }}
                title={t('employees.removeFilter', 'Rimuovi filtro')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={resetAllFilters}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'border-color 0.15s, color 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>{t('employees.reset', 'Resetta')}</span>
          </button>
        </div>
      )}

      {/* Sub-toolbar pills row: Event types for logs view, Period tabs for summary view */}
      {viewMode === 'logs' ? (
        <div style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          margin: '0 0 16px 0',
          flexWrap: isMobile ? undefined : 'wrap',
          overflowX: isMobile ? 'auto' : undefined,
          width: isMobile ? '100%' : undefined,
          paddingBottom: isMobile ? 2 : 0,
        }}>
          {eventTypeOptions.map(({ value, labelKey }) => {
            const meta   = value ? EVENT_META[value] : null;
            const active = eventType === value;
            return (
              <button
                key={value}
                className="att-type-btn"
                onClick={() => setEventType(active ? '' : value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  flexShrink: 0,
                  border: `1.5px solid ${active ? (meta?.dot ?? 'var(--accent)') : 'var(--border)'}`,
                  background: active ? (meta ? meta.bg : 'var(--accent-light)') : 'transparent',
                  color: active ? (meta?.color ?? 'var(--accent)') : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  letterSpacing: 0.3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  outline: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {meta && <span style={{ fontSize: 11 }}>{meta.icon}</span>}
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      ) : viewMode === 'summary' ? (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          margin: '0 0 16px 0',
          width: '100%',
          flexWrap: 'wrap',
        }}>
          {/* Shift-status filter pills (like the event-type pills in the logs view) */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['scheduled', 'confirmed', 'cancelled'] as const).map(st => {
              const meta = SHIFT_STATUS_META[st];
              const active = summaryStatusFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setSummaryStatusFilter(active ? null : st)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, flexShrink: 0,
                    border: `1.5px solid ${active ? meta.border : 'var(--border)'}`,
                    background: active ? meta.bg : 'transparent',
                    color: active ? meta.color : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                    boxShadow: active ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 11 }}>{meta.icon}</span>
                  {t(meta.labelKey, meta.defaultLabel)}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              setTempOvertimeLimit(overtimeLimit);
              setTempUndertimeLimit(undertimeLimit);
              setShowToleranceModal(true);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
              cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
          >
            <Sliders size={15} style={{ color: 'var(--accent)' }} />
            <span>{t('attendance.toleranceSettings', 'Impostazioni Tolleranza Orari')}</span>
          </button>
        </div>
      ) : null}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div style={{ padding: contentPad, minHeight: '60vh', position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(255,255,255,0.4)', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(1px)', borderRadius: 24,
            pointerEvents: 'none',
          }}>
             <div style={{
               width: 32, height: 32, border: '3px solid var(--accent)',
               borderTopColor: 'transparent', borderRadius: '50%',
               animation: 'spin 0.8s linear infinite'
             }} />
          </div>
        )}

          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
              borderLeft: '4px solid #dc2626', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16,
              color: '#dc2626', fontSize: 13, fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          {viewMode === 'analytics' ? (
            /* ── ANALYTICS VIEW MODE (Request 3) ───────────────────────── */
            <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '320px 1fr', gap: 24, alignItems: 'start' }}>
              {/* Left Filters Panel */}
              <div style={{
                background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
                padding: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                  <PieChart size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {t('attendance.viewAnalytics', 'Analisi Grafica & Confronto')}
                  </span>
                </div>

                {/* Company Select */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Building size={13} style={{ color: 'var(--accent)' }} /> {t('attendance.analyticsSelectCompany', 'Azienda')}
                  </label>
                  <CustomSelect
                    value={analyticsCompany || null}
                    onChange={(val) => {
                      setAnalyticsCompany(val ?? '');
                      setAnalyticsStoreId('');
                      setAnalyticsUserId('');
                    }}
                    placeholder={t('attendance.analyticsSelectCompany', 'Seleziona Azienda')}
                    options={companyOptions}
                    searchable={true}
                    isClearable={true}
                    controlMinHeight={40}
                  />
                </div>

                {/* Store Select */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MapPin size={13} style={{ color: 'var(--accent)' }} /> {t('attendance.analyticsSelectStore', 'Negozio')}
                  </label>
                  <CustomSelect
                    value={analyticsStoreId || null}
                    onChange={(val) => {
                      setAnalyticsStoreId(val ?? '');
                      setAnalyticsUserId('');
                    }}
                    placeholder={t('attendance.analyticsSelectStore', 'Seleziona Negozio')}
                    options={storeOptions}
                    searchable={true}
                    isClearable={true}
                    controlMinHeight={40}
                  />
                </div>

                {/* Employee Select */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <User size={13} style={{ color: 'var(--accent)' }} /> {t('attendance.analyticsSelectEmployee', 'Dipendente')}
                  </label>
                  <CustomSelect
                    value={analyticsUserId || null}
                    onChange={(val) => {
                      const selectedId = val ?? '';
                      setAnalyticsUserId(selectedId);
                      if (selectedId) {
                        const emp = filterEmployees.find(e => String(e.id) === selectedId);
                        if (emp && emp.storeId) {
                          const store = filterStores.find(s => s.id === emp.storeId);
                          if (store) {
                            if (store.companyName) setAnalyticsCompany(store.companyName);
                            setAnalyticsStoreId(String(store.id));
                          }
                        }
                      }
                    }}
                    placeholder={t('attendance.analyticsSelectEmployee', 'Seleziona Dipendente')}
                    options={analyticsEmployeeOptions}
                    searchable={true}
                    isClearable={true}
                    controlMinHeight={40}
                  />
                </div>

                {/* Date Range */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Calendar size={13} style={{ color: 'var(--accent)' }} /> {t('common.date', 'Periodo')}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <DatePicker value={analyticsDateFrom} onChange={setAnalyticsDateFrom} placeholder="Data da" />
                    <DatePicker value={analyticsDateTo} onChange={setAnalyticsDateTo} placeholder="Data a" />
                  </div>
                </div>
              </div>

              {/* Right Charts & Metrics Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {!analyticsCompany || !analyticsStoreId ? (
                  <div style={{
                    background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)',
                    padding: '60px 32px', textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ fontSize: 44, marginBottom: 16, opacity: 0.3 }}>📊</div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {t('attendance.analyticsPrompt', 'Seleziona un\'azienda e un negozio per visualizzare l\'analisi grafica delle presenze.')}
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
                      {t('attendance.analyticsPromptSubtitle', 'Utilizza i filtri a sinistra per caricare i grafici e le statistiche di confronto.')}
                    </p>
                  </div>
                ) : (
                  <>
                {/* Header Card */}
                <div style={{
                  background: 'linear-gradient(135deg, #0d2137 0%, #1e4a7a 100%)', borderRadius: 16, padding: '20px 24px',
                  color: '#fff', boxShadow: '0 4px 16px rgba(13,33,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', color: '#fff' }}>
                      {t('attendance.analyticsTitle', 'Analisi Grafica e Confronto Presenze')}
                    </h3>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                      {t('attendance.analyticsSubtitle', 'Confronta i turni programmati rispetto alle ore effettivamente lavorate')} ({analyticsDateFrom} → {analyticsDateTo})
                    </div>
                  </div>
                  <div style={{
                    background: 'rgba(201,151,58,0.2)', border: '1px solid rgba(201,151,58,0.4)',
                    borderRadius: 12, padding: '8px 14px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--accent)' }}>
                      {t('attendance.completionRate', 'Tasso Turni')}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>
                      {analyticsData.completionRate}%
                    </div>
                  </div>
                </div>

                {/* Overall balance headline */}
                {(() => {
                  const net = analyticsData.netBalance;
                  const positive = net >= 0;
                  const col = net === 0 ? 'var(--text-primary)' : (positive ? '#16a34a' : '#dc2626');
                  const daysCount = (() => {
                    if (!analyticsDateFrom || !analyticsDateTo) return 0;
                    const d1 = new Date(analyticsDateFrom);
                    const d2 = new Date(analyticsDateTo);
                    const diffTime = Math.abs(d2.getTime() - d1.getTime());
                    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  })();
                  const netDisplay = net === 0 ? '0h' : `${positive ? '+' : '−'}${formatHoursStr(net)}`;
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                      background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
                      borderLeft: `4px solid ${col}`, padding: '14px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Scale size={15} style={{ color: col }} /> {t('attendance.overallBalance', 'Saldo Complessivo')}
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>({daysCount} {t('common.days', 'Giorni')})</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {t('attendance.overallBalanceDesc', 'Straordinari netti − Ore mancanti nette')}
                        </div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: col, fontFamily: 'var(--font-display)' }}>
                        {netDisplay}
                      </div>
                    </div>
                  );
                })()}

                {/* 4 Summary Metric Cards — each shows the population it is measured against */}
                {(() => {
                  const empCount = analyticsData.employeeCount;
                  const countByShift = !!analyticsUserId;
                  const otUtCount = countByShift ? analyticsData.shiftCount : empCount;
                  const empChip = (n: number, byShift = false) => (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {byShift ? '📋' : '👥'} {n} {byShift ? t('attendance.shiftsCount', 'turni') : t('attendance.employeesCount', 'dipendenti')}
                    </span>
                  );
                  const cardBlock = (label: React.ReactNode, value: React.ReactNode, chip: React.ReactNode) => (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                          {value}
                        </div>
                        {chip}
                      </div>
                    </div>
                  );
                  const otStr = analyticsData.sumOvertime === 0 ? '0h' : `+${formatHoursStr(analyticsData.sumOvertime)}`;
                  const utStr = analyticsData.sumUndertime === 0 ? '0h' : `−${formatHoursStr(analyticsData.sumUndertime)}`;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
                        {cardBlock(<>📋 {t('attendance.totalScheduled', 'Programmate')}</>, <span style={{ color: 'var(--primary)' }}>{formatHoursStr(analyticsData.sumScheduled)}</span>, empChip(empCount))}
                      </div>

                      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
                        {cardBlock(<>⏱ {t('attendance.totalWorked', 'Lavorate')}</>, <span style={{ color: 'var(--accent)' }}>{formatHoursStr(analyticsData.sumWorked)}</span>, empChip(empCount))}
                      </div>

                      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
                        {cardBlock(<span style={{ color: '#16a34a' }}>▲ {t('attendance.totalOvertime', 'Straordinari Netti')}</span>, <span style={{ color: '#16a34a' }}>{otStr}</span>, empChip(otUtCount, countByShift))}
                      </div>

                      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
                        {cardBlock(<span style={{ color: '#dc2626' }}>▼ {t('attendance.totalUndertime', 'Ore Mancanti Nette')}</span>, <span style={{ color: '#dc2626' }}>{utStr}</span>, empChip(otUtCount, countByShift))}
                      </div>
                    </div>
                  );
                })()}

                {/* Visual Comparative Chart Panel */}
                <div style={{
                  background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>📊 {t('attendance.chartTitle', 'Confronto Grafico Presenze per Dipendente')}</span>
                      </div>
                      <button
                        onClick={() => setShowBreakSettingsModal(true)}
                        title={t('attendance.breakPayrollTitle', 'Gestione Pause e Paghe')}
                        style={{
                          background: 'var(--surface-warm)', color: '#b45309', borderRadius: 8,
                          padding: '5px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(180,83,9,0.25)',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        }}
                      >
                        ⚙️ {t('attendance.breakPayrollTitle', 'Gestione Pause & Paghe')}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--background)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <span>ℹ️</span>
                      <span>
                        {breakSettings.enforcementEnabled
                          ? t('attendance.guideStrictActive', 'Strict Enforcement Active (Tolerance: {{tol}} min) — If recorded break is less than {{tol}} min from scheduled, full break is deducted to protect payroll costs.', { tol: breakSettings.toleranceMinutes })
                          : t('attendance.guideStandardActive', 'Standard Mode Active — Scheduled breaks are always deducted from worked hours even if not clocked.')}
                      </span>
                    </div>
                  </div>

                  {analyticsData.rows.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {t('attendance.noSummaryData', 'Nessun dato disponibile per i filtri selezionati.')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {analyticsData.rows.slice(0, 60).map((r) => {
                        const denom = r.effectiveScheduledMinutes;
                        const pctRaw = denom > 0 ? Math.round((r.workedMinutes / denom) * 100) : (r.workedMinutes > 0 ? 100 : 0);
                        const pct = Math.min(pctRaw, 100);
                        const completed = denom > 0 && pctRaw >= 100;
                        // Analytics shows the REAL variance (no tolerance) so rows reconcile with the totals.
                        const vBadge = varianceDisplay(r, t, { applyTolerance: false });
                        const barColor = r.status === 'absent'
                          ? 'linear-gradient(90deg, #dc2626 0%, #f87171 100%)'
                          : r.varianceMinutes > 0
                          ? 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)'
                          : r.varianceMinutes < 0
                          ? 'linear-gradient(90deg, #dc2626 0%, #f87171 100%)'
                          : 'linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%)';
                        const avatarUrl = getAvatarUrl(r.userAvatarFilename);
                        const initials = `${r.userName?.[0] ?? ''}${r.userSurname?.[0] ?? ''}`.toUpperCase();
                        return (
                          <div key={r.key} style={{
                            background: 'var(--background)', borderRadius: 10, padding: '9px 12px', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                          }}>
                            {/* Identity */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 190px', minWidth: 170 }}>
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,151,58,0.18)', color: 'var(--accent)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {initials}
                                </div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.userName} {r.userSurname}</span>
                                  {r.userRole && (
                                    <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4, background: 'rgba(13,33,55,0.08)', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                      {t(`roles.${r.userRole}`, r.userRole)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{r.periodLabel}</div>
                              </div>
                            </div>

                            {/* Compact progress */}
                            <div style={{ flex: '1 1 240px', minWidth: 200 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, marginBottom: 3, flexWrap: 'wrap', gap: 4 }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  {formatHoursStr(r.workedMinutes)} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>/ {formatHoursStr(denom)}</span>
                                  
                                  {r.scheduledBreakMinutes > 0 && (
                                    <span style={{ fontSize: 9, color: '#b45309', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2, background: 'rgba(180,83,9,0.08)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(180,83,9,0.15)' }}>
                                      ☕ {formatHoursStr(r.scheduledBreakMinutes)} pausa
                                      {!r.breakRecorded && <span style={{ color: '#dc2626', fontWeight: 800 }}> · {t('attendance.notRecorded', 'non registrata')}</span>}
                                    </span>
                                  )}

                                  {r.vacationMinutes > 0 && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(201,151,58,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.2)' }}>
                                      🌴 {formatHoursStr(r.vacationMinutes)} Ferie
                                    </span>
                                  )}
                                  {r.sickMinutes > 0 && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                                      🤒 {formatHoursStr(r.sickMinutes)} Malattia
                                    </span>
                                  )}
                                  {r.leaveMinutes > 0 && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                                      📄 {formatHoursStr(r.leaveMinutes)} Permesso
                                    </span>
                                  )}

                                  {r.status === 'absent' && (
                                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      ⚠️ {t('attendance.noAttendanceAction', 'Nessuna timbratura registrata')}
                                    </span>
                                  )}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 800, color: completed ? '#16a34a' : 'var(--accent)' }}>
                                  {completed && <Check size={11} />}{pct}%
                                </span>
                              </div>
                              <div style={{ height: 5, width: '100%', background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                              </div>
                            </div>

                            {/* Variance Badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '0 1 auto' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: vBadge.color, whiteSpace: 'nowrap', minWidth: 62, justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: 11 }}>{vBadge.icon}</span>{vBadge.text}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
              )}
              </div>
            </div>
          ) : (
          /* ── Mobile / Desktop Tables Block ── */
          <>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!loading && displayedEvents.length === 0 ? (
                <div style={{
                  padding: '48px 24px', textAlign: 'center',
                  background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.2 }}>⏱</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {t('common.noData')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateFrom} → {dateTo}</div>
                </div>
              ) : (
                displayedEvents.map((ev, idx) => {
                  const meta     = EVENT_META[ev.eventType] ?? EVENT_META.checkin;
                  const labelKey = EVENT_TYPE_LABEL_KEYS[ev.eventType] ?? 'attendance.checkin';
                  const srcBadge = SOURCE_BADGE[ev.source] ?? { label: ev.source.toUpperCase(), color: '#6b7280' };
                  const dt       = formatDateTime(ev.eventTime);
                  return (
                    <div
                      key={ev.id}
                      className="att-card att-row"
                      style={{
                        background: 'var(--surface)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        borderLeft: `4px solid ${meta.dot}`,
                        overflow: 'hidden',
                        transition: 'background 0.1s',
                        animationDelay: `${Math.min(idx * 18, 300)}ms`,
                      }}
                    >
                      <div style={{ padding: '11px 14px' }}>
                        {/* Row 1: name + source */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                            {ev.userName} {ev.userSurname}
                          </span>
                          <span style={{
                            padding: '2px 7px', borderRadius: 4,
                            fontSize: 9, fontWeight: 800, letterSpacing: '1px',
                            background: `${srcBadge.color}18`, color: srcBadge.color,
                            border: `1px solid ${srcBadge.color}30`,
                            fontFamily: 'monospace',
                          }}>
                            {srcBadge.label}
                          </span>
                        </div>
                        {/* Row 2: event type badge */}
                        <div style={{ marginBottom: 8 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 20,
                            fontSize: 11, fontWeight: 800, letterSpacing: '0.5px',
                            background: meta.bg, color: meta.color,
                            textTransform: 'uppercase', border: `1px solid ${meta.dot}33`,
                          }}>
                            <span>{meta.icon}</span>
                            {t(labelKey)}
                          </span>
                        </div>
                        {/* Row 3: store + date + time */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ opacity: 0.5 }}>📍</span> {ev.storeName}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {dt.date}
                          </span>
                          <span style={{
                            fontSize: 12, fontWeight: 700, color: 'var(--text)',
                            fontVariantNumeric: 'tabular-nums',
                            background: 'var(--background)', padding: '2px 8px',
                            borderRadius: 5, border: '1px solid var(--border)',
                          }}>
                            {dt.time}
                          </span>
                        </div>
                        {/* Row 4: action buttons (admin/hr only) */}
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                            <button
                              onClick={() => openEditModal(ev)}
                              style={{
                                flex: 1, padding: '6px 0', borderRadius: 6,
                                border: '1px solid rgba(13,33,55,0.25)',
                                background: 'rgba(13,33,55,0.06)',
                                color: 'var(--primary)', fontSize: 12, fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {t('common.edit')}
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => setDeletingEvent(ev)}
                                style={{
                                  flex: 1, padding: '6px 0', borderRadius: 6,
                                  border: '1px solid rgba(220,38,38,0.25)',
                                  background: 'rgba(220,38,38,0.06)',
                                  color: '#dc2626', fontSize: 12, fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {t('common.delete')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {/* Footer */}
              {!loading && events.length > 0 && (
                <div style={{ padding: '8px 4px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {events.length < total
                    ? <>{t('attendance.showing')} <strong>{events.length}</strong> / <strong>{total}</strong></>
                    : <><strong>{total}</strong> {t('attendance.found')}</>
                  }
                </div>
              )}
            </div>
          ) : (
            /* ── Desktop / tablet: table ────────────────────────────────── */
            <div style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}>


              {!loading && events.length === 0 ? (
                <div style={{ padding: '56px 32px', textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.25 }}>⏱</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {t('common.noData')}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{dateFrom} → {dateTo}</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  {viewMode === 'logs' ? (
                    /* ── LOGS TABLE (Request 2: Separate Date and Time columns) ── */
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                      <thead>
                        <tr style={{ background: '#0d2137' }}>
                          {[
                            { text: t('employees.colName'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            )},
                            { text: t('common.store'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                              </svg>
                            )},
                            { text: t('attendance.eventType'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            )},
                            { text: t('common.date', 'Data'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                            )},
                            { text: t('common.time', 'Ora'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 16 14" />
                              </svg>
                            )},
                            { text: t('attendance.source'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                                <line x1="12" y1="18" x2="12.01" y2="18" />
                              </svg>
                            )},
                            ...(canEdit ? [{ text: t('common.actions'), icon: (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, opacity: 0.8 }}>
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                              </svg>
                            )}] : []),
                          ].map((col, i) => (
                            <th key={`${col.text}-${i}`} style={{
                              padding: compact ? '8px 12px' : (isTablet ? '12px 12px' : '14px 16px'),
                              textAlign: 'left',
                              fontSize: compact ? 9 : 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                              textTransform: 'uppercase', letterSpacing: '1.5px',
                              borderBottom: '1px solid rgba(255,255,255,0.1)',
                              ...(i === 0 ? { paddingLeft: 24 } : {}),
                            }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {col.icon}
                                <span>{col.text}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayedEvents.map((ev, idx) => {
                          const meta     = EVENT_META[ev.eventType] ?? EVENT_META.checkin;
                          const labelKey = EVENT_TYPE_LABEL_KEYS[ev.eventType] ?? 'attendance.checkin';
                          const srcBadge = SOURCE_BADGE[ev.source] ?? { label: ev.source.toUpperCase(), color: '#6b7280' };
                          const dt       = formatDateTime(ev.eventTime);
                          return (
                            <tr
                              key={ev.id}
                              className="att-row"
                              style={{
                                borderBottom: '1px solid var(--border)',
                                animationDelay: `${Math.min(idx * 18, 300)}ms`,
                                transition: 'background 0.1s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-warm)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                            >
                              <td style={{ padding: compact ? '6px 12px 6px 0' : '11px 16px 11px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                                  <div style={{
                                    width: compact ? 3 : 4, alignSelf: 'stretch', borderRadius: '0 2px 2px 0',
                                    background: meta.dot, flexShrink: 0, marginRight: compact ? 8 : 12,
                                  }} />
                                  <div style={{
                                    width: compact ? 24 : 32, height: compact ? 24 : 32, borderRadius: '50%',
                                    background: meta.bg, color: meta.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: compact ? 10 : 12, fontWeight: 800, marginRight: compact ? 8 : 12, flexShrink: 0,
                                    border: `1px solid ${meta.dot}33`,
                                  }}>
                                    {ev.userName?.charAt(0)}{ev.userSurname?.charAt(0)}
                                  </div>
                                  <div style={{ fontSize: compact ? 12 : 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                                    {(() => {
                                       const fullName = `${ev.userName} ${ev.userSurname}`;
                                       const words = fullName.trim().split(/\s+/);
                                       return words.length > 2 ? words.slice(0, 2).join(' ') + '...' : fullName;
                                    })()}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: compact ? '6px 12px' : '11px 16px', fontSize: compact ? 12 : 13, color: 'var(--text-secondary)' }}>
                                {(() => {
                                   const sName = ev.storeName || '';
                                   const words = sName.trim().split(/\s+/);
                                   return words.length > 3 ? words.slice(0, 3).join(' ') + '...' : sName;
                                })()}
                              </td>
                              <td style={{ padding: compact ? '6px 12px' : '11px 16px' }}>
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: compact ? '2px 8px' : '4px 11px', borderRadius: 20,
                                  fontSize: compact ? 10 : 11, fontWeight: 800, letterSpacing: '0.8px',
                                  background: meta.bg, color: meta.color,
                                  textTransform: 'uppercase', border: `1px solid ${meta.dot}33`,
                                }}>
                                  <span>{meta.icon}</span>
                                  {t(labelKey)}
                                </span>
                              </td>
                              {/* Date Column (Request 2) */}
                              <td style={{ padding: compact ? '6px 12px' : '11px 16px', fontSize: compact ? 12 : 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                {dt.date}
                              </td>
                              {/* Time Column (Request 2) */}
                              <td style={{ padding: compact ? '6px 12px' : '11px 16px' }}>
                                <span style={{
                                  fontSize: compact ? 11 : 13, fontWeight: 700, color: '#9b7a32',
                                  fontVariantNumeric: 'tabular-nums',
                                  background: 'rgba(155, 122, 50, 0.08)', padding: compact ? '1px 6px' : '2px 8px',
                                  borderRadius: 6, border: '1px solid rgba(155, 122, 50, 0.2)',
                                }}>
                                  {dt.time}
                                </span>
                              </td>
                              <td style={{ padding: compact ? '6px 12px' : '11px 16px' }}>
                                <span style={{
                                  display: 'inline-block', padding: compact ? '1px 6px' : '2px 8px', borderRadius: 4,
                                  fontSize: compact ? 9 : 10, fontWeight: 800, letterSpacing: '1px',
                                  background: `${srcBadge.color}18`, color: srcBadge.color,
                                  border: `1px solid ${srcBadge.color}30`,
                                  fontFamily: 'monospace',
                                }}>
                                  {srcBadge.label}
                                </span>
                              </td>
                              {canEdit && (
                                <td style={{ padding: compact ? '6px 12px' : '11px 16px', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      onClick={() => openEditModal(ev)}
                                      title={t('attendance.editEvent', 'Modifica evento')}
                                      style={{
                                        padding: compact ? '4px 6px' : '6px 8px', borderRadius: 6,
                                        border: '1px solid rgba(13,33,55,0.25)',
                                        background: 'rgba(13,33,55,0.06)',
                                        color: 'var(--primary)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.15s',
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,33,55,0.14)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(13,33,55,0.06)'; }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9"></path>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                      </svg>
                                    </button>
                                    {canDelete && (
                                      <button
                                        onClick={() => setDeletingEvent(ev)}
                                        title={t('attendance.deleteEvent', 'Elimina evento')}
                                        style={{
                                          padding: compact ? '4px 6px' : '6px 8px', borderRadius: 6,
                                          border: '1px solid rgba(220,38,38,0.25)',
                                          background: 'rgba(220,38,38,0.06)',
                                          color: '#dc2626',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.14)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(220,38,38,0.06)'; }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6"></polyline>
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                          <line x1="10" y1="11" x2="10" y2="17"></line>
                                          <line x1="14" y1="11" x2="14" y2="17"></line>
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    /* ── SUMMARY TABLE (Request 3, 4, 5) ── */
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                      <thead>
                        <tr style={{ background: '#0d2137' }}>
                          {[
                            { icon: <User size={13} style={{ color: 'var(--accent)' }} />, text: t('employees.colName', 'Dipendente') },
                            { icon: <MapPin size={13} style={{ color: 'var(--accent)' }} />, text: t('common.store', 'Negozio') },
                            { icon: <Calendar size={13} style={{ color: 'var(--accent)' }} />, text: summaryPeriod === 'daily' ? t('attendance.dateFrom', 'Data') : summaryPeriod === 'weekly' ? t('shifts.week', 'Settimana') : t('shifts.month', 'Mese') },
                            { icon: <ClipboardList size={13} style={{ color: 'var(--accent)' }} />, text: t('attendance.colShifts', 'Turni') },
                            { icon: <Clock size={13} style={{ color: 'var(--accent)' }} />, text: t('attendance.colWorkedShort', 'Ore Lav.'), width: 95 },
                            { icon: <BarChart2 size={13} style={{ color: 'var(--accent)' }} />, text: t('attendance.colProgressShort', 'Avanzamento') },
                            { icon: <Scale size={13} style={{ color: 'var(--accent)' }} />, text: t('attendance.colVarianceShort', 'Scostamento') },
                            { icon: <Settings size={13} style={{ color: 'var(--accent)' }} />, text: t('common.actions', 'Azioni'), width: 70, align: 'center' },
                          ].map((col, i) => (
                            <th key={`${col.text}-${i}`} style={{
                              padding: compact ? '8px 10px' : '12px 14px',
                              textAlign: (col.align as any) || 'left',
                              width: col.width,
                              fontSize: compact ? 9 : 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                              textTransform: 'uppercase', letterSpacing: '1px',
                              borderBottom: '1px solid rgba(255,255,255,0.1)',
                              whiteSpace: 'nowrap',
                              ...(i === 0 ? { paddingLeft: 20 } : {}),
                            }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: col.align === 'center' ? 'center' : 'flex-start' }}>
                                {col.icon}
                                <span>{col.text}</span>
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayedSummaryRows.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                              {t('attendance.noSummaryData', 'Nessun dato di riepilogo disponibile per il periodo selezionato.')}
                            </td>
                          </tr>
                        ) : (
                          displayedSummaryRows.slice(0, summaryDisplayLimit).map((row, idx) => {
                            const vBadge = varianceDisplay(row, t, { applyTolerance: true, overtimeLimit, undertimeLimit });
                            const avatarUrl = getAvatarUrl(row.userAvatarFilename);
                            const initials = `${row.userName?.[0] ?? ''}${row.userSurname?.[0] ?? ''}`.toUpperCase();
                            return (
                              <tr
                                key={row.key}
                                className="att-row"
                                style={{
                                  borderBottom: '1px solid var(--border)',
                                  animationDelay: `${Math.min(idx * 18, 300)}ms`,
                                  transition: 'background 0.1s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-warm)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                              >
                                {/* Name */}
                                <td style={{ padding: compact ? '6px 10px 6px 20px' : '10px 14px 10px 20px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 10 }}>
                                    {avatarUrl ? (
                                      <img src={avatarUrl} alt="" style={{ width: compact ? 26 : 32, height: compact ? 26 : 32, borderRadius: '50%', objectFit: 'cover' }} />
                                    ) : (
                                      <div style={{
                                        width: compact ? 26 : 32, height: compact ? 26 : 32, borderRadius: '50%',
                                        background: 'rgba(201,151,58,0.18)', color: 'var(--accent)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: compact ? 10 : 12, fontWeight: 800, border: '1px solid rgba(201,151,58,0.3)',
                                      }}>
                                        {initials}
                                      </div>
                                    )}
                                    <div>
                                      <div style={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                        {row.userName} {row.userSurname}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {/* Store */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px', fontSize: compact ? 12 : 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                  {row.storeName}
                                </td>
                                {/* Date / Period */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px', fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                  {row.periodLabel}
                                </td>
                                {/* Shifts Column — colour = status, icon kept; dot & status-word removed; per-shift worked hours shown */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px' }}>
                                  {row.shifts.length === 0 ? (
                                    <span style={{ fontSize: compact ? 11 : 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                      {t('attendance.noShiftsAssigned', 'Nessun turno')}
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 4 }}>
                                      {row.shifts.map(s => {
                                        const sMeta = SHIFT_STATUS_META[s.status] || SHIFT_STATUS_META.scheduled;
                                        const dur = shiftDurationMinutes(s);
                                        return (
                                          <span key={s.id} title={t(sMeta.labelKey, sMeta.defaultLabel)} style={{
                                            fontSize: compact ? 10 : 11, fontWeight: 700, color: sMeta.color,
                                            background: sMeta.bg, border: `1px solid ${sMeta.border}`,
                                            padding: compact ? '2px 7px' : '3px 9px', borderRadius: 6,
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                                            width: 'fit-content', whiteSpace: 'nowrap',
                                          }}>
                                            <span>{sMeta.icon} {s.startTime.slice(0,5)} - {s.endTime.slice(0,5)}</span>
                                            {!s.isOffDay && s.startTime && s.endTime && (
                                              <span style={{ opacity: 0.9, fontSize: compact ? 9 : 10, fontWeight: 700, borderLeft: '1px solid rgba(255,255,255,0.3)', paddingLeft: 6 }}>
                                                {formatShiftDuration(dur)}
                                              </span>
                                            )}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                {/* Worked Hours — "__:__" placeholder when nothing was clocked */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px', width: 95, whiteSpace: 'nowrap' }}>
                                  {row.workedMinutes === 0 ? (
                                    <span style={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, fontFamily: 'monospace' }}>
                                      __:__
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: compact ? 12 : 13, fontWeight: 800, color: 'var(--primary)',
                                      background: 'var(--background)', padding: compact ? '2px 8px' : '4px 10px',
                                      borderRadius: 8, border: '1px solid var(--border)', display: 'inline-block',
                                    }}>
                                      {formatHoursStr(row.workedMinutes)}
                                    </span>
                                  )}
                                </td>
                                {/* Avanzamento — capped at 100% + tick when complete; over-100% lives in Variance */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px', minWidth: 140 }}>
                                  {(row.status === 'leave' || row.status === 'pending' || row.status === 'cancelled' || row.status === 'day_off') ? (
                                    <span style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
                                  ) : (() => {
                                    const denom = row.effectiveScheduledMinutes;
                                    const pctRaw = denom > 0 ? Math.round((row.workedMinutes / denom) * 100) : (row.workedMinutes > 0 ? 100 : 0);
                                    const pct = Math.min(pctRaw, 100);
                                    const completed = denom > 0 && pctRaw >= 100;
                                    const barColor = row.status === 'absent'
                                      ? 'linear-gradient(90deg, #dc2626 0%, #f87171 100%)'
                                      : completed
                                      ? 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)'
                                      : 'linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%)';
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: compact ? 10 : 11 }}>
                                          <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'monospace' }}>
                                            {formatHoursStr(row.workedMinutes)} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>/ {formatHoursStr(denom)}</span>
                                          </span>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: completed ? '#16a34a' : 'var(--accent)', fontWeight: 800 }}>
                                            {completed && <Check size={compact ? 11 : 12} />}
                                            {pct}%
                                          </span>
                                        </div>
                                        <div style={{
                                          height: compact ? 4 : 5, width: '100%', background: 'var(--background)',
                                          borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)',
                                        }}>
                                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.4s ease' }} />
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </td>
                                {/* Variance — coloured text (no tag); "Absent"/"On time"/"+/-"; red note if leave was approved after the fact */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 5,
                                      fontSize: compact ? 12 : 13, fontWeight: 800, color: vBadge.color,
                                    }}>
                                      <span style={{ fontSize: compact ? 11 : 12 }}>{vBadge.icon}</span>
                                      {vBadge.text}
                                    </span>
                                    {row.leaveApprovedAfter && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626' }}>
                                        {t('attendance.leaveApprovedAfter', 'Congedo non conteggiato')}
                                      </span>
                                    )}
                                    {row.scheduledBreakMinutes > 0 && !row.breakRecorded && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309' }}>
                                        ☕ {t('attendance.noBreakRecorded', 'Pausa non registrata')}
                                      </span>
                                    )}
                                    {row.breakNotCompleted && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626' }}>
                                        ⚠ {t('attendance.breakNotCompleted', 'Pausa non completata')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {/* Actions — plain ghost icon */}
                                <td style={{ padding: compact ? '6px 10px' : '10px 14px', width: 70, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <button
                                      onClick={() => setSummaryDrawerItem(row)}
                                      title={t('attendance.viewDetailTooltip', 'Visualizza dettagli turno e timbrature')}
                                      style={{
                                        padding: 6, borderRadius: 8, border: 'none', background: 'transparent',
                                        color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--surface-warm)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                    >
                                      <Eye size={compact ? 15 : 17} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Table footer */}
              {!loading && (events.length > 0 || (viewMode === 'summary' && summaryRows.length > 0)) && (
                <div style={{
                  padding: '10px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {viewMode === 'summary' ? (
                      summaryDisplayLimit < summaryRows.length
                        ? <>{t('attendance.showing')} <strong>{Math.min(summaryDisplayLimit, summaryRows.length)}</strong> / <strong>{summaryRows.length}</strong></>
                        : <><strong>{summaryRows.length}</strong> {t('attendance.found')}</>
                    ) : (
                      events.length < total
                        ? <>{t('attendance.showing')} <strong>{events.length}</strong> / <strong>{total}</strong></>
                        : <><strong>{total}</strong> {t('attendance.found')}</>
                    )}
                  </div>
                  {viewMode === 'logs' && events.length < total && (
                    <button
                      onClick={loadMoreLogs}
                      disabled={loadingMore}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        border: '1px solid var(--border)', background: 'var(--surface)',
                        color: loadingMore ? 'var(--text-muted)' : 'var(--accent)',
                        cursor: loadingMore ? 'default' : 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!loadingMore) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      {loadingMore ? (
                        <span style={{ width: 13, height: 13, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                      {t('attendance.loadMore', 'Load more')} (+{Math.min(LOGS_PAGE_SIZE, total - events.length)})
                    </button>
                  )}
                  {viewMode === 'summary' && summaryDisplayLimit < summaryRows.length && (
                    <button
                      onClick={() => setSummaryDisplayLimit(prev => prev + 100)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        border: '1px solid var(--border)', background: 'var(--surface)',
                        color: 'var(--accent)', cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <ChevronDown size={14} />
                      {t('attendance.loadMore', 'Load more')} (+{Math.min(100, summaryRows.length - summaryDisplayLimit)})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </div>

      {/* ── Variance Tolerance Limits Modal (Item 2) ──────────────────────── */}
      {showToleranceModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '16px', backdropFilter: 'blur(3px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowToleranceModal(false); }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            width: '100%', maxWidth: 440,
            border: '1px solid var(--border)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(201,151,58,0.1) 0%, rgba(13,33,55,0.05) 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(201,151,58,0.18)',
                  color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                    {t('attendance.toleranceSettings', 'Impostazioni Tolleranza Orari')}
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t('attendance.toleranceSubtitle', 'Regola le soglie di straordinario e ritardo')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowToleranceModal(false)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--background)',
                  color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  ▲ {t('attendance.overtimeThreshold', 'Soglia Straordinario (minuti)')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={tempOvertimeLimit}
                  onChange={(e) => setTempOvertimeLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{
                    width: '100%', height: 42, padding: '0 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text)', fontSize: 14, fontWeight: 700, outline: 'none',
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {t('attendance.overtimeDesc', 'Minuti extra minimi lavorati prima di mostrare il tag verde')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic', background: 'rgba(22,163,74,0.06)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(22,163,74,0.18)', lineHeight: 1.4 }}>
                  💡 {t('attendance.overtimeLogicExplanation')}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  ▼ {t('attendance.undertimeThreshold', 'Soglia Ore Mancanti (minuti)')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={tempUndertimeLimit}
                  onChange={(e) => setTempUndertimeLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{
                    width: '100%', height: 42, padding: '0 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text)', fontSize: 14, fontWeight: 700, outline: 'none',
                  }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {t('attendance.undertimeDesc', 'Minuti mancanti minimi prima di mostrare il tag rosso')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic', background: 'rgba(220,38,38,0.06)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.18)', lineHeight: 1.4 }}>
                  💡 {t('attendance.undertimeLogicExplanation')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  onClick={() => setShowToleranceModal(false)}
                  style={{
                    padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--background)', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {t('common.cancel', 'Annulla')}
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('att_overtime_limit', String(tempOvertimeLimit));
                    localStorage.setItem('att_undertime_limit', String(tempUndertimeLimit));
                    setOvertimeLimit(tempOvertimeLimit);
                    setUndertimeLimit(tempUndertimeLimit);
                    setShowToleranceModal(false);
                  }}
                  style={{
                    padding: '10px 22px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, var(--accent) 0%, #b48719 100%)',
                    color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(201,151,58,0.3)',
                  }}
                >
                  {t('attendance.saveSettings', 'Salva Impostazioni')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Event Modal ──────────────────────────────────────────────── */}
      {editingEvent && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            width: '100%', maxWidth: 440,
            border: '1px solid var(--border)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  {t('attendance.moduleLabel')}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  {t('attendance.editEvent')}
                </h2>
              </div>
              <button
                onClick={closeEditModal}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--background)',
                  color: 'var(--text-secondary)', fontSize: 18,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              {editError && (
                <div style={{
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                  borderLeft: '4px solid #dc2626', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 16,
                  color: '#dc2626', fontSize: 13, fontWeight: 500,
                }}>
                  {editError}
                </div>
              )}

              {/* Employee info (read-only) */}
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
                  {t('employees.colName')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {editingEvent.userName} {editingEvent.userSurname}
                </div>
                {editingEvent.storeName && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {editingEvent.storeName}
                  </div>
                )}
              </div>

              {/* Event type select */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {t('attendance.eventType')}
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text)', fontSize: 14, outline: 'none',
                    appearance: 'none',
                  }}
                >
                  <option value="checkin">{t('attendance.checkin')}</option>
                  <option value="checkout">{t('attendance.checkout')}</option>
                  <option value="break_start">{t('attendance.breakStart')}</option>
                  <option value="break_end">{t('attendance.breakEnd')}</option>
                </select>
              </div>

              {/* Event date + time */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <DatePicker
                    label={t('common.date')}
                    value={editDate}
                    onChange={setEditDate}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TimePicker
                    label={t('common.time')}
                    value={editTimeOnly}
                    onChange={setEditTimeOnly}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {t('common.notes')}
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  placeholder="—"
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={closeEditModal}
                  disabled={editSaving}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 8,
                    border: 'none', background: 'var(--primary)',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: editSaving ? 'not-allowed' : 'pointer',
                    opacity: editSaving ? 0.7 : 1,
                  }}
                >
                  {editSaving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Manual Entry Modal ─────────────────────────────────────── */}
      {createOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !createSaving) {
              setCreateOpen(false);
              setCreateEmployeeOpen(false);
              setCreateEmployeeSearch('');
            }
          }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            width: '100%', maxWidth: 480,
            border: '1px solid var(--border)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  {t('attendance.moduleLabel')}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  {t('attendance.createEntry')}
                </h2>
              </div>
              <button
                onClick={() => {
                  setCreateOpen(false);
                  setCreateEmployeeOpen(false);
                  setCreateEmployeeSearch('');
                }}
                disabled={createSaving}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--background)',
                  color: 'var(--text-secondary)', fontSize: 18,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              {createSuccess && (
                <div style={{
                  background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)',
                  borderLeft: '4px solid #16a34a', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 16,
                  color: '#16a34a', fontSize: 13, fontWeight: 600,
                }}>
                  {t('attendance.createEntrySuccess')}
                </div>
              )}
              {createError && (
                <div style={{
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                  borderLeft: '4px solid #dc2626', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 16,
                  color: '#dc2626', fontSize: 13, fontWeight: 500,
                }}>
                  {createError}
                </div>
              )}

              {/* Employee select */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {t('attendance.selectEmployee')} *
                </label>
                <div ref={createEmployeePickerRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setCreateEmployeeOpen((prev) => !prev)}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 8,
                      border: '1.5px solid var(--border)', background: 'var(--background)',
                      color: 'var(--text)', fontSize: 14, outline: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {selectedCreateEmployee ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: 'rgba(13,33,55,0.14)',
                          color: '#0D2137',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {selectedCreateEmployeeAvatarUrl ? (
                            <img src={selectedCreateEmployeeAvatarUrl} alt={selectedCreateEmployeeFullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : selectedCreateEmployeeInitials}
                        </span>
                        <span style={{ minWidth: 0, textAlign: 'left' }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedCreateEmployeeFullName}
                          </span>
                          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t(`roles.${selectedCreateEmployee.role ?? 'employee'}`, selectedCreateEmployee.role ?? 'employee')}
                            {selectedCreateEmployee.storeName ? ` · ${selectedCreateEmployee.storeName}` : ''}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('attendance.selectEmployee')}</span>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{createEmployeeOpen ? '▲' : '▼'}</span>
                  </button>

                  {createEmployeeOpen && (
                    <div style={{
                      position: 'absolute',
                      zIndex: 20,
                      top: 'calc(100% + 6px)',
                      left: 0,
                      right: 0,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                      maxHeight: 260,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                        <input
                          value={createEmployeeSearch}
                          onChange={(e) => setCreateEmployeeSearch(e.target.value)}
                          placeholder={t('common.search', 'Cerca...')}
                          style={{
                            width: '100%',
                            padding: '7px 9px',
                            borderRadius: 8,
                            border: '1.5px solid var(--border)',
                            background: 'var(--background)',
                            color: 'var(--text)',
                            fontSize: 12,
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div style={{ overflowY: 'auto', maxHeight: 204 }}>
                        {filteredCreateEmployees.length === 0 ? (
                          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                            {t('common.noData', 'Nessun dato')}
                          </div>
                        ) : (
                          filteredCreateEmployees.map((emp) => {
                            const fullName = `${emp.name} ${emp.surname}`.trim();
                            const avatarUrl = getAvatarUrl(emp.avatarFilename);
                            const initials = `${emp.name?.[0] ?? ''}${emp.surname?.[0] ?? ''}`.toUpperCase() || 'U';
                            const selected = String(emp.id) === createUserId;
                            return (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  const uid = String(emp.id);
                                  setCreateUserId(uid);
                                  if (emp.storeId) setCreateStoreId(String(emp.storeId));
                                  else setCreateStoreId('');
                                  setCreateEmployeeOpen(false);
                                  setCreateEmployeeSearch('');
                                }}
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  borderBottom: '1px solid var(--border)',
                                  background: selected ? 'var(--surface-warm)' : 'var(--surface)',
                                  padding: '8px 10px',
                                  textAlign: 'left',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  cursor: 'pointer',
                                }}
                              >
                                <span style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  background: 'rgba(13,33,55,0.14)',
                                  color: '#0D2137',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  {avatarUrl ? (
                                    <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : initials}
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fullName}
                                  </span>
                                  <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t(`roles.${emp.role ?? 'employee'}`, emp.role ?? 'employee')}
                                    {emp.storeName ? ` · ${emp.storeName}` : ''}
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Store select — pre-filled from employee's store, still overridable */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {t('attendance.selectStore')} *
                </label>
                <select
                  value={createStoreId}
                  onChange={(e) => setCreateStoreId(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: `1.5px solid ${createStoreId ? 'var(--accent)' : 'var(--border)'}`,
                    background: createStoreId ? 'var(--accent-light)' : 'var(--background)',
                    color: 'var(--text)', fontSize: 14, outline: 'none', appearance: 'none',
                  }}
                >
                  <option value="">{t('attendance.selectStore')}</option>
                  {storeList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.companyName ? `${s.name} (${s.companyName})` : s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Event type */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {t('attendance.selectEventType')} *
                </label>
                <select
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text)', fontSize: 14, outline: 'none', appearance: 'none',
                  }}
                >
                  <option value="checkin">{t('attendance.checkin')}</option>
                  <option value="checkout">{t('attendance.checkout')}</option>
                  <option value="break_start">{t('attendance.breakStart')}</option>
                  <option value="break_end">{t('attendance.breakEnd')}</option>
                </select>
              </div>

              {/* Date + Time */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <DatePicker
                    label={`${t('common.date')} *`}
                    value={createDate}
                    onChange={setCreateDate}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TimePicker
                    label={`${t('common.time')} *`}
                    value={createTimeOnly}
                    onChange={setCreateTimeOnly}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  {t('common.notes')}
                </label>
                <textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  rows={2}
                  placeholder="—"
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateEmployeeOpen(false);
                    setCreateEmployeeSearch('');
                  }}
                  disabled={createSaving}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8,
                    border: '1.5px solid var(--border)', background: 'var(--background)',
                    color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateSave}
                  disabled={createSaving || createSuccess}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 8,
                    border: 'none', background: 'var(--primary)',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: (createSaving || createSuccess) ? 'not-allowed' : 'pointer',
                    opacity: (createSaving || createSuccess) ? 0.7 : 1,
                  }}
                >
                  {createSaving ? t('common.saving') : t('common.create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ────────────────────────────────────── */}
      {deletingEvent && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleteConfirming) setDeletingEvent(null); }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            width: '100%', maxWidth: 400,
            border: '1px solid var(--border)',
            padding: '28px 24px',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, marginBottom: 16,
            }}>
              ⚠
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {t('attendance.confirmDelete')}
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('attendance.confirmDeleteMsg')}
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 12, color: 'var(--text-muted)' }}>
              {deletingEvent.userName} {deletingEvent.userSurname} — {formatDateTime(deletingEvent.eventTime).date} {formatDateTime(deletingEvent.eventTime).time}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setDeletingEvent(null)}
                disabled={deleteConfirming}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: '1.5px solid var(--border)', background: 'var(--background)',
                  color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteConfirming}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 8,
                  border: 'none', background: '#dc2626',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: deleteConfirming ? 'not-allowed' : 'pointer',
                  opacity: deleteConfirming ? 0.7 : 1,
                }}
              >
                {deleteConfirming ? t('common.loading') : t('attendance.deleteEvent')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFilterModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(13,33,55,0.48)',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setShowFilterModal(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              width: 'min(520px, 92vw)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Accent stripe */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />

            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #8B6914 0%, #B48719 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: '17px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      fontFamily: 'var(--font-display)',
                      margin: 0,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {t('attendance.logsFilterTitle', 'Filtra presenze')}
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {t('attendance.logsFilterSubtitle', 'Affina la ricerca degli eventi')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '24px',
                  lineHeight: 1,
                  padding: '4px 8px',
                }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Company filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('common.company', 'Company')}
                </label>
                <CustomSelect
                  value={tempCompanyId || null}
                  onChange={(val) => {
                    setTempCompanyId(val ?? '');
                    setTempStoreId('');
                    setTempUserId('');
                  }}
                  options={[
                    { value: '', label: t('shifts.allCompanies', 'All Companies') },
                    ...companyList.map(c => ({
                      value: String(c.id),
                      label: c.name
                    }))
                  ]}
                  placeholder={t('shifts.allCompanies', 'All Companies')}
                  searchable
                />
              </div>

              {/* Store filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('common.store', 'Negozio')}
                </label>
                <CustomSelect
                  value={tempStoreId || null}
                  onChange={(val) => {
                    setTempStoreId(val ?? '');
                    setTempUserId('');
                  }}
                  options={[
                    { value: '', label: t('common.all', 'Tutti') + ' ' + t('common.store').toLowerCase() },
                    ...(tempCompanyId
                      ? filterStores.filter(s => String((s as any).companyId) === tempCompanyId || s.companyName === companyList.find(c => String(c.id) === tempCompanyId)?.name)
                      : filterStores
                    ).map(s => ({
                      value: String(s.id),
                      label: s.companyName ? `${s.name} (${s.companyName})` : s.name
                    }))
                  ]}
                  placeholder={t('common.all', 'Tutti') + ' ' + t('common.store').toLowerCase()}
                  searchable
                />
              </div>

              {/* Employee filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('employees.colName', 'Dipendente')}
                </label>
                <CustomSelect
                  value={tempUserId || null}
                  onChange={(val) => setTempUserId(val ?? '')}
                  options={[
                    { value: '', label: t('common.all', 'Tutti') + ' ' + t('employees.colName').toLowerCase() },
                    ...filteredEmployeesForSelect.map(e => ({
                      value: String(e.id),
                      label: `${e.name} ${e.surname}`
                    }))
                  ]}
                  placeholder={t('common.all', 'Tutti') + ' ' + t('employees.colName').toLowerCase()}
                  searchable
                />
              </div>

              {/* Date pickers (row) */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    {t('attendance.dateFrom', 'Dal')}
                  </label>
                  <DatePicker
                    value={tempDateFrom}
                    onChange={setTempDateFrom}
                    disablePortal={true}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    {t('attendance.dateTo', 'Al')}
                  </label>
                  <DatePicker
                    value={tempDateTo}
                    onChange={setTempDateTo}
                    align="right"
                    disablePortal={true}
                  />
                </div>
              </div>

              {/* Week Picker */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  {t('shifts.week', 'Seleziona Settimana')}
                </label>
                <WeekPicker
                  value={''}
                  onChange={(w) => {
                    const range = isoWeekToDateRange(w);
                    if (range) {
                      setTempDateFrom(range.from);
                      setTempDateTo(range.to);
                    }
                  }}
                  placeholder={t('shifts.weekPickerHint', 'Scegli settimana...')}
                  disablePortal={true}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-warm)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => {
                  setTempCompanyId('');
                  setTempStoreId('');
                  setTempUserId('');
                  setTempDateFrom(defaultFrom);
                  setTempDateTo(today);
                }}
                style={{
                  padding: '9px 20px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-secondary)',
                  transition: 'background 0.15s',
                }}
              >
                {t('employees.resetFilters', 'Reset all')}
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowFilterModal(false)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('common.cancel', 'Annulla')}
                </button>
                <button
                  onClick={applyFilters}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(139,105,20,0.24)',
                  }}
                >
                  {t('employees.applyFilters', 'Applica filtri')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Summary Detail Sidebar Modal (Drawer) ─────────────────────── */}
      {summaryDrawerItem && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2500,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
          display: 'flex', justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease-out',
        }} onClick={() => setSummaryDrawerItem(null)}>
          <div style={{
            width: isMobile ? '100%' : 520, height: '100%',
            background: 'var(--surface)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', zIndex: 2501,
          }} onClick={(e) => e.stopPropagation()}>
            {/* Top Color Strip */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />

            {/* Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--surface-warm)',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                  {t('attendance.shiftDetailBadge', 'ANALISI & DISCREPANZE')}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginTop: 2 }}>
                  {t('attendance.shiftDetailTitle', 'Dettaglio Turno e Presenze')}
                </div>
              </div>
              <button
                onClick={() => setSummaryDrawerItem(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 24, color: 'var(--text-muted)', borderRadius: 8,
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Employee & Store Overview Card */}
              <div style={{
                background: 'var(--background)', borderRadius: 14, border: '1px solid var(--border)',
                padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                {/* Employee Field */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {getAvatarUrl(summaryDrawerItem.userAvatarFilename) ? (
                    <img src={getAvatarUrl(summaryDrawerItem.userAvatarFilename)!} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', background: 'rgba(201,151,58,0.18)',
                      color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 800, border: '1px solid rgba(201,151,58,0.3)',
                    }}>
                      {summaryDrawerItem.userName?.[0]}{summaryDrawerItem.userSurname?.[0]}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('employees.colName', 'Dipendente')}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                      {summaryDrawerItem.userName} {summaryDrawerItem.userSurname}
                    </div>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--border)' }} />

                {/* Store & Date Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {t('common.store', 'Negozio')}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📍</span> {summaryDrawerItem.storeName}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {summaryPeriod === 'daily' ? t('attendance.dateFrom', 'Data') : summaryPeriod === 'weekly' ? t('shifts.week', 'Settimana') : t('shifts.month', 'Mese')}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📅</span> {summaryDrawerItem.periodLabel}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hours KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ background: 'var(--background)', padding: 12, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('attendance.scheduledHours', 'Programmate')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                    {formatHoursStr(summaryDrawerItem.scheduledMinutes)}
                  </div>
                  {summaryDrawerItem.neutralizedMinutes > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>
                      {t('attendance.effectiveShort', 'Effettive')}: {formatHoursStr(summaryDrawerItem.effectiveScheduledMinutes)}
                    </div>
                  )}
                </div>
                <div style={{ background: 'var(--background)', padding: 12, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('attendance.workedHours', 'Lavorate')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', marginTop: 4 }}>
                    {summaryDrawerItem.workedMinutes === 0 ? '__:__' : formatHoursStr(summaryDrawerItem.workedMinutes)}
                  </div>
                </div>
                {(() => {
                  const vBadge = varianceDisplay(summaryDrawerItem, t, { applyTolerance: true, overtimeLimit, undertimeLimit });
                  return (
                    <div style={{ background: vBadge.bg, padding: 12, borderRadius: 12, border: `1px solid ${vBadge.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: vBadge.color, textTransform: 'uppercase' }}>{t('attendance.variance', 'Scostamento')}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: vBadge.color, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span>{vBadge.icon}</span>{vBadge.text}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Leave / absence breakdown + "approved after" flag */}
              {(summaryDrawerItem.vacationMinutes > 0 || summaryDrawerItem.sickMinutes > 0 || summaryDrawerItem.leaveMinutes > 0 || summaryDrawerItem.absentMinutes > 0 || summaryDrawerItem.leaveApprovedAfter) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {summaryDrawerItem.vacationMinutes > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(201,151,58,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.2)' }}>
                      🌴 {t('leave.type_vacation', 'Ferie')}: {formatHoursStr(summaryDrawerItem.vacationMinutes)}
                    </span>
                  )}
                  {summaryDrawerItem.sickMinutes > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.18)' }}>
                      🤒 {t('leave.type_sick', 'Malattia')}: {formatHoursStr(summaryDrawerItem.sickMinutes)}
                    </span>
                  )}
                  {summaryDrawerItem.leaveMinutes > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.18)' }}>
                      📄 {t('leave.duration_short_leave', 'Permessi')}: {formatHoursStr(summaryDrawerItem.leaveMinutes)}
                    </span>
                  )}
                  {summaryDrawerItem.absentMinutes > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.18)' }}>
                      ⚠ {t('attendance.statusAbsent', 'Assente')}: {formatHoursStr(summaryDrawerItem.absentMinutes)}
                    </span>
                  )}
                  {summaryDrawerItem.leaveApprovedAfter && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.18)', width: '100%' }}>
                      {t('attendance.leaveApprovedAfterFull', 'Un congedo è stato approvato dopo che il dipendente aveva già timbrato: non incide sul calcolo.')}
                    </span>
                  )}
                </div>
              )}

              {/* Section 1: Shifts Assigned */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📅</span> {t('attendance.scheduledShifts', 'Turni Programmati Assegnati')} ({summaryDrawerItem.shifts.length})
                </div>
                {summaryDrawerItem.shifts.length === 0 ? (
                  <div style={{ padding: 16, background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    {t('attendance.noShiftsAssigned', 'Nessun turno programmato in questo periodo.')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {summaryDrawerItem.shifts.map(s => {
                      const sMeta = SHIFT_STATUS_META[s.status] || SHIFT_STATUS_META.scheduled;
                      return (
                        <div key={s.id} style={{
                          padding: 14, background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)',
                          display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {s.startTime.slice(0,5)} → {s.endTime.slice(0,5)}
                              {!s.isOffDay && s.startTime && s.endTime && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(201,151,58,0.12)', padding: '1px 7px', borderRadius: 6 }}>
                                  {formatShiftDuration(shiftDurationMinutes(s))}
                                </span>
                              )}
                              {s.breakMinutes ? (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: 'rgba(180,83,9,0.1)', padding: '1px 7px', borderRadius: 6 }}>
                                  ☕ {s.breakMinutes} min
                                </span>
                              ) : null}
                            </span>
                            <span style={{
                              fontSize: 11, fontWeight: 700, color: sMeta.color, background: sMeta.bg,
                              border: `1px solid ${sMeta.border}`, padding: '2px 10px', borderRadius: 20,
                              display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            }}>
                              {t(sMeta.labelKey, sMeta.defaultLabel)}
                            </span>
                          </div>
                          {s.notes ? (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              📝 {s.notes}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Attendance Actions */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⏱</span> {t('attendance.recordedActions', 'Timbrature & Azioni Rilevate')} ({summaryDrawerItem.events.length})
                </div>
                {summaryDrawerItem.events.length === 0 ? (
                  <div style={{ padding: 16, background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    {t('attendance.noEventsRecorded', 'Nessuna timbratura registrata nel periodo.')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {summaryDrawerItem.events.map(ev => {
                      const meta = EVENT_META[ev.eventType] ?? EVENT_META.checkin;
                      const labelKey = EVENT_TYPE_LABEL_KEYS[ev.eventType] ?? 'attendance.checkin';
                      const srcBadge = SOURCE_BADGE[ev.source] ?? { label: ev.source.toUpperCase(), color: '#6b7280' };
                      const dt = formatDateTime(ev.eventTime);
                      return (
                        <div key={ev.id} style={{
                          padding: 12, background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)',
                          borderLeft: `4px solid ${meta.dot}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                              background: meta.bg, color: meta.color, border: `1px solid ${meta.dot}33`,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              <span>{meta.icon}</span>
                              {t(labelKey)}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {dt.time} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>({dt.date})</span>
                            </span>
                          </div>
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 800,
                            background: `${srcBadge.color}18`, color: srcBadge.color, border: `1px solid ${srcBadge.color}30`,
                            fontFamily: 'monospace',
                          }}>
                            {srcBadge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 3: Anomalies Breakdown */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⚠️</span> {t('attendance.tab_anomalies', 'Anomalie Rilevate')}
                </div>
                {(() => {
                  const modalAnomalies: { type: string; title: string; desc: string; color: string; bg: string }[] = [];
                  if (summaryDrawerItem.scheduledBreakMinutes > 0 && !summaryDrawerItem.breakRecorded) {
                    modalAnomalies.push({
                      type: 'missing_break',
                      title: t('attendance.info_missing_break_title', 'Pausa Obbligatoria Non Registrata'),
                      desc: t('attendance.detail_missing_break', { minutes: summaryDrawerItem.scheduledBreakMinutes }),
                      color: '#b45309', bg: 'rgba(180,83,9,0.08)',
                    });
                  } else if (summaryDrawerItem.breakNotCompleted) {
                    modalAnomalies.push({
                      type: 'break_not_completed',
                      title: t('attendance.breakNotCompleted', 'Pausa Non Completata'),
                      desc: t('attendance.breakNotCompletedDetail', { actual: summaryDrawerItem.actualBreakMinutes, scheduled: summaryDrawerItem.scheduledBreakMinutes }),
                      color: '#dc2626', bg: 'rgba(220,38,38,0.08)',
                    });
                  }
                  if (summaryDrawerItem.events.some(e => e.eventType === 'checkin') && !summaryDrawerItem.events.some(e => e.eventType === 'checkout')) {
                    modalAnomalies.push({
                      type: 'missing_checkout',
                      title: t('attendance.info_missing_checkout_title', 'Mancata Uscita'),
                      desc: t('attendance.info_missing_checkout_desc'),
                      color: '#be123c', bg: 'rgba(190,18,60,0.08)',
                    });
                  }

                  if (modalAnomalies.length === 0) {
                    return (
                      <div style={{ padding: 14, background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                        ✓ {t('attendance.no_anomalies', 'Nessuna anomalia rilevata nel periodo.')}
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {modalAnomalies.map((a, i) => (
                        <div key={i} style={{
                          padding: 12, borderRadius: 10, background: a.bg, border: `1px solid ${a.color}33`,
                          borderLeft: `4px solid ${a.color}`,
                        }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: a.color }}>{a.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{a.desc}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer (Item 5: Removed print button) */}
            <div style={{
              padding: '10px 24px', borderTop: '1px solid var(--border)',
              background: 'var(--surface-warm)', display: 'flex', justifyContent: 'flex-end', gap: 12,
            }}>
              <button
                onClick={() => setSummaryDrawerItem(null)}
                style={{
                  padding: '9px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)',
                }}
              >
                {t('common.close', 'Chiudi')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Quick Break Settings Modal */}
      {showBreakSettingsModal && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(13,33,55,0.52)', backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowBreakSettingsModal(false)}
        >
          <div
            style={{
              background: 'var(--surface)', borderRadius: 16, width: 'min(520px, 94vw)',
              padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.28)', border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>☕</span> {t('attendance.breakPayrollTitle', 'Gestione Pause e Paghe')}
              </div>
              <button
                onClick={() => setShowBreakSettingsModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, borderRadius: 10, background: 'var(--background)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong>📋 {t('attendance.standardModeTitle', 'Modalità Standard')} (Default):</strong> {t('attendance.standardModeDesc')}
              </div>

              <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-warm)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    🛡️ {t('attendance.strictEnforcementTitle', 'Applicazione Rigorosa Paghe')}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !breakSettings.enforcementEnabled;
                      setBreakSettings(p => ({ ...p, enforcementEnabled: next }));
                      try {
                        await client.patch('/companies/break-settings', { break_enforcement_enabled: next, break_tolerance_minutes: breakSettings.toleranceMinutes });
                      } catch {}
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, position: 'relative', width: 40, height: 22 }}
                  >
                    <span style={{ display: 'block', width: 40, height: 22, borderRadius: 11, background: breakSettings.enforcementEnabled ? '#15803D' : 'var(--border)', transition: 'background 0.2s' }}>
                      <span style={{ display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: breakSettings.enforcementEnabled ? 21 : 3, transition: 'left 0.2s' }} />
                    </span>
                  </button>
                </div>

                {breakSettings.enforcementEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('attendance.breakToleranceLabel', 'Tolleranza (minuti)')}:
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={breakSettings.toleranceMinutes}
                      onChange={(e) => setBreakSettings(p => ({ ...p, toleranceMinutes: parseInt(e.target.value, 10) || 0 }))}
                      onBlur={async () => {
                        try {
                          await client.patch('/companies/break-settings', { break_enforcement_enabled: breakSettings.enforcementEnabled, break_tolerance_minutes: breakSettings.toleranceMinutes });
                        } catch {}
                      }}
                      style={{ width: 65, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, fontWeight: 700, background: 'var(--surface)', color: 'var(--text)' }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBreakSettingsModal(false)}
                style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {t('common.close', 'Chiudi')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
