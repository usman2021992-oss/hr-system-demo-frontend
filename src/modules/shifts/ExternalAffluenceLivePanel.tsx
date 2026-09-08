import { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  Cog,
  Database,
  Info,
  Link2,
  Pencil,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAvatarUrl } from '../../api/client';
import {
  ExternalAffluencePreviewRow,
  ExternalAffluenceWeekResponse,
  getExternalWeekAffluence,
  getExternalAffluenceForecast,
  upsertForecastOverride,
  deleteForecastOverride,
  ForecastDay,
  ForecastSlot,
  ExternalAffluenceForecastResponse,
} from '../../api/externalAffluence';
import { listShifts, Shift } from '../../api/shifts';
import { useAuth } from '../../context/AuthContext';
import { getStoreOperatingHours } from '../../api/stores';
import { StoreOperatingHour } from '../../types';
import ExternalAffluenceLiveConfigModal from './ExternalAffluenceLiveConfigModal';

const WEEK_DAYS = [
  { key: 'monday', isoDay: 1, shortKey: 'dayMon', shortFallback: 'MON', fullKey: 'dayMonday', fullFallback: 'Monday' },
  { key: 'tuesday', isoDay: 2, shortKey: 'dayTue', shortFallback: 'TUE', fullKey: 'dayTuesday', fullFallback: 'Tuesday' },
  { key: 'wednesday', isoDay: 3, shortKey: 'dayWed', shortFallback: 'WED', fullKey: 'dayWednesday', fullFallback: 'Wednesday' },
  { key: 'thursday', isoDay: 4, shortKey: 'dayThu', shortFallback: 'THU', fullKey: 'dayThursday', fullFallback: 'Thursday' },
  { key: 'friday', isoDay: 5, shortKey: 'dayFri', shortFallback: 'FRI', fullKey: 'dayFriday', fullFallback: 'Friday' },
  { key: 'saturday', isoDay: 6, shortKey: 'daySat', shortFallback: 'SAT', fullKey: 'daySaturday', fullFallback: 'Saturday' },
  { key: 'sunday', isoDay: 7, shortKey: 'daySun', shortFallback: 'SUN', fullKey: 'daySunday', fullFallback: 'Sunday' },
] as const;

const STAFFING_SLOTS: Array<{ timeSlot: string; startMinutes: number; endMinutes: number; durationHours: number; label: string }> = [
  { timeSlot: '00:00-06:00', startMinutes: 0,      endMinutes: 6  * 60, durationHours: 6, label: 'Night' },
  { timeSlot: '06:00-12:00', startMinutes: 6 * 60, endMinutes: 12 * 60, durationHours: 6, label: 'Morning' },
  { timeSlot: '12:00-18:00', startMinutes: 12 * 60, endMinutes: 18 * 60, durationHours: 6, label: 'Afternoon' },
  { timeSlot: '18:00-24:00', startMinutes: 18 * 60, endMinutes: 24 * 60, durationHours: 6, label: 'Evening' },
];

interface Props {
  storeId: number;
  week: string;
  /** When set, pre-selects this ISO weekday key (e.g. 'monday') and hides the day-switcher */
  filterDay?: string | null;
  /** When true, hides the day-filter button bar (used in single-day view) */
  singleDayMode?: boolean;
}

interface ScheduledStaffAvatar {
  userId: number;
  name: string;
  surname: string;
  avatarUrl: string | null;
}

type ScheduledAvatarMap = Record<string, ScheduledStaffAvatar[]>;

function formatDateRange(fromDate: string | null, toDate: string | null): string {
  if (!fromDate || !toDate) return '-';
  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    return `${from.toLocaleDateString()} - ${to.toLocaleDateString()}`;
  } catch {
    return `${fromDate} - ${toDate}`;
  }
}

function numberOrDash(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

function readApiErrorCode(err: unknown): string | null {
  const maybe = err as { response?: { data?: { code?: unknown } } };
  const code = maybe?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}

function toMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

function getIsoDayFromDate(dateValue: string): number | null {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const jsDay = parsed.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function buildScheduledAvatarMap(shifts: Shift[]): ScheduledAvatarMap {
  const bySlot = new Map<string, Map<number, ScheduledStaffAvatar>>();

  for (const shift of shifts) {
    if (shift.isOffDay || (shift.status !== 'confirmed' && shift.status !== 'scheduled')) {
      continue;
    }

    const isoDay = getIsoDayFromDate(shift.date);
    if (!isoDay) {
      continue;
    }

    const windows: Array<{ start: number; end: number }> = [];
    const start = toMinutes(shift.startTime);
    const end = toMinutes(shift.endTime);
    if (start != null && end != null && end > start) {
      windows.push({ start, end });
    }

    if (shift.isSplit) {
      const splitStart = toMinutes(shift.splitStart2);
      const splitEnd = toMinutes(shift.splitEnd2);
      if (splitStart != null && splitEnd != null && splitEnd > splitStart) {
        windows.push({ start: splitStart, end: splitEnd });
      }
    }

    if (windows.length === 0) {
      continue;
    }

    const avatar: ScheduledStaffAvatar = {
      userId: shift.userId,
      name: shift.userName,
      surname: shift.userSurname,
      avatarUrl: getAvatarUrl(shift.userAvatarFilename ?? null),
    };

    for (const slot of STAFFING_SLOTS) {
      const covered = windows.some((w) => rangesOverlap(w.start, w.end, slot.startMinutes, slot.endMinutes));
      if (!covered) {
        continue;
      }

      const key = `${isoDay}|${slot.timeSlot}`;
      if (!bySlot.has(key)) {
        bySlot.set(key, new Map<number, ScheduledStaffAvatar>());
      }
      bySlot.get(key)!.set(avatar.userId, avatar);
    }
  }

  const out: ScheduledAvatarMap = {};
  for (const [key, users] of bySlot.entries()) {
    out[key] = Array.from(users.values());
  }
  return out;
}

function buildScheduledStaffByDay(shifts: Shift[]): Record<number, ScheduledStaffAvatar[]> {
  const byDay = new Map<number, Map<number, ScheduledStaffAvatar>>();

  for (const shift of shifts) {
    if (shift.isOffDay || (shift.status !== 'confirmed' && shift.status !== 'scheduled')) {
      continue;
    }

    const isoDay = getIsoDayFromDate(shift.date);
    if (!isoDay) {
      continue;
    }

    const avatar: ScheduledStaffAvatar = {
      userId: shift.userId,
      name: shift.userName,
      surname: shift.userSurname,
      avatarUrl: getAvatarUrl(shift.userAvatarFilename ?? null),
    };

    if (!byDay.has(isoDay)) {
      byDay.set(isoDay, new Map<number, ScheduledStaffAvatar>());
    }
    byDay.get(isoDay)!.set(avatar.userId, avatar);
  }

  const out: Record<number, ScheduledStaffAvatar[]> = {};
  for (const [day, users] of byDay.entries()) {
    out[day] = Array.from(users.values());
  }
  return out;
}

function initials(name: string, surname: string): string {
  const n = name?.trim()?.charAt(0) ?? '';
  const s = surname?.trim()?.charAt(0) ?? '';
  return `${n}${s}`.toUpperCase() || '?';
}

export default function ExternalAffluenceLivePanel({ storeId, week, filterDay, singleDayMode }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const headerActionButtonStyle: CSSProperties = {
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.45)',
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
    fontWeight: 700,
  };

  const tableColumns = '1.2fr 1.1fr 1.3fr 1fr 1.1fr 0.9fr 1.2fr 1.1fr';

  const dayByIso = useMemo(() => {
    const map = new Map<number, typeof WEEK_DAYS[number]>();
    WEEK_DAYS.forEach((day) => {
      map.set(day.isoDay, day);
    });
    return map;
  }, []);

  const formatDay = useCallback((dayKey: string): string => {
    const match = WEEK_DAYS.find((day) => day.key === dayKey);
    if (!match) return dayKey;
    return t(`shifts.${match.fullKey}`, { defaultValue: match.fullFallback });
  }, [t]);

  const canConfigure = user ? user.isSuperAdmin === true : false;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrationMissing, setIntegrationMissing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(filterDay ?? null);
  const [payload, setPayload] = useState<ExternalAffluenceWeekResponse | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [hoveredInfoKey, setHoveredInfoKey] = useState<string | null>(null);
  const [scheduledBySlot, setScheduledBySlot] = useState<ScheduledAvatarMap>({});
  const [scheduledByDay, setScheduledByDay] = useState<Record<number, ScheduledStaffAvatar[]>>({});
  const [operatingHours, setOperatingHours] = useState<StoreOperatingHour[]>([]);

  useEffect(() => {
    setSelectedDay(filterDay ?? null);
  }, [filterDay]);

  const [activeTab, setActiveTab] = useState<'live' | 'forecast'>('forecast');

  // Helper date function
  const formatDateOnly = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Forecast states
  const [forecastFromDate, setForecastFromDate] = useState<string>(() => formatDateOnly(new Date()));
  const [forecastToDate, setForecastToDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 13);
    return formatDateOnly(d);
  });
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ExternalAffluenceForecastResponse | null>(null);

  // Override edit states
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  const loadForecastData = useCallback(async () => {
    setForecastLoading(true);
    setForecastError(null);
    try {
      const data = await getExternalAffluenceForecast({
        storeId,
        fromDate: forecastFromDate,
        toDate: forecastToDate,
      });
      setForecastData(data);
    } catch (err) {
      const code = readApiErrorCode(err);
      if (code === 'STORE_MAPPING_REQUIRED' || code === 'STORE_NOT_FOUND') {
        setIntegrationMissing(true);
        return;
      }
      setForecastError(t('errors.DEFAULT', 'Could not load forecast data'));
    } finally {
      setForecastLoading(false);
    }
  }, [storeId, forecastFromDate, forecastToDate, t]);

  useEffect(() => {
    if (activeTab === 'forecast') {
      void loadForecastData();
    }
  }, [activeTab, loadForecastData]);

  const handleSaveOverride = async (date: string) => {
    const val = parseInt(overrideValue, 10);
    if (isNaN(val) || val < 0) {
      alert(t('shifts.affluence_override_invalid', 'Please enter a positive integer for visitors count'));
      return;
    }

    setOverrideSaving(true);
    try {
      await upsertForecastOverride({
        storeId,
        date,
        visitorsOverride: val,
      });
      setEditingDate(null);
      setOverrideValue('');
      void loadForecastData();
    } catch {
      alert(t('errors.DEFAULT', 'Could not save override'));
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleDeleteOverride = async (date: string) => {
    if (!window.confirm(t('shifts.affluence_delete_override_confirm', 'Are you sure you want to clear this manual override?'))) {
      return;
    }
    setForecastLoading(true);
    try {
      await deleteForecastOverride({
        storeId,
        date,
      });
      void loadForecastData();
    } catch {
      alert(t('errors.DEFAULT', 'Could not delete override'));
    } finally {
      setForecastLoading(false);
    }
  };

  const loadLiveData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIntegrationMissing(false);
    try {
      const data = await getExternalWeekAffluence({ storeId, week });
      setPayload(data);

      try {
        const hours = await getStoreOperatingHours(storeId);
        setOperatingHours(hours);
      } catch {
        setOperatingHours([]);
      }

      try {
        const shiftsRes = await listShifts({ week, store_id: storeId });
        setScheduledBySlot(buildScheduledAvatarMap(shiftsRes.shifts));
        setScheduledByDay(buildScheduledStaffByDay(shiftsRes.shifts));
      } catch {
        setScheduledBySlot({});
        setScheduledByDay({});
      }
    } catch (err) {
      const code = readApiErrorCode(err);
      if (code === 'STORE_MAPPING_REQUIRED' || code === 'STORE_NOT_FOUND') {
        setPayload(null);
        setIntegrationMissing(true);
        setScheduledBySlot({});
        return;
      }
      setError(t('errors.DEFAULT'));
    } finally {
      setLoading(false);
    }
  }, [storeId, t, week]);

  useEffect(() => {
    void loadLiveData();
  }, [loadLiveData]);

  const recommendations = payload?.recommendations ?? [];

  const affluenceByDay = useMemo(() => {
    const mapped: Record<string, ExternalAffluencePreviewRow[]> = {};
    recommendations.forEach((item) => {
      const day = dayByIso.get(item.dayOfWeek);
      if (!day) return;
      const key = day.key;
      if (!mapped[key]) mapped[key] = [];
      mapped[key].push(item);
    });

    Object.values(mapped).forEach((list) => {
      list.sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
    });

    return mapped;
  }, [dayByIso, recommendations]);

  const filteredDays = useMemo(() => {
    if (selectedDay) {
      return WEEK_DAYS.filter((day) => day.key === selectedDay);
    }
    return WEEK_DAYS;
  }, [selectedDay]);

  const sourceStoreTitle = payload
    ? `${payload.externalStoreCode}${payload.externalStoreName ? ` - ${payload.externalStoreName}` : ''}`
    : '-';

  const slotWeightByTimeSlot = useMemo(() => {
    const map = new Map<string, number>();
    if (!payload?.settings?.slotWeights) {
      return map;
    }

    for (const slot of payload.settings.slotWeights) {
      map.set(slot.timeSlot, slot.weight);
    }
    return map;
  }, [payload]);

  const visitorsByIsoDay = useMemo(() => {
    const map = new Map<number, { totalVisitors: number; avgVisitors: number; days: number }>();
    if (!payload?.sourceSummary?.weekdayAverages) {
      return map;
    }

    for (const row of payload.sourceSummary.weekdayAverages) {
      const totalVisitors = Math.round(row.avgVisitors * row.days);
      map.set(row.dayOfWeek, {
        totalVisitors,
        avgVisitors: row.avgVisitors,
        days: row.days,
      });
    }

    return map;
  }, [payload]);

  const columnHelp = useMemo(() => ({
    scheduled: t('shifts.affluence_col_info_scheduled', 'This shows confirmed staff in shifts for this store and slot, including transfer assignments.'),
    estimated: t('shifts.affluence_col_info_estimated', 'This is the expected number of visitors for that slot.'),
    suggestion: t('shifts.affluence_col_info_suggestion', 'This is the recommended staff count to serve visitors smoothly in that slot.'),
    baseline: t('shifts.affluence_col_info_baseline', 'This shows Low/Medium/High tag based on estimated visitors for this slot.'),
    gap: t('shifts.affluence_col_info_gap', 'This shows how far planned staff is from the recommendation.'),
    status: t('shifts.affluence_col_info_status', 'This is the final coverage result: under, balanced, or over.'),
  }), [t]);

  function renderColumnHeader(label: string, key: keyof typeof columnHelp): JSX.Element {
    const open = hoveredInfoKey === key;
    return (
      <div
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        onMouseEnter={() => setHoveredInfoKey(key)}
        onMouseLeave={() => setHoveredInfoKey(null)}
      >
        <span>{label}</span>
        <span
          style={{
            width: 15,
            height: 15,
            borderRadius: 999,
            border: '1px solid rgba(46,86,122,0.35)',
            color: '#2e567a',
            display: 'inline-grid',
            placeItems: 'center',
            background: '#fff',
          }}
        >
          <Info size={10} />
        </span>

        {open ? (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 8,
              zIndex: 5,
              width: 240,
              fontSize: 11,
              lineHeight: 1.45,
              letterSpacing: 0,
              textTransform: 'none',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(95,62,47,0.25)',
              background: '#fff9f2',
              color: '#5f3e2f',
              boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
            }}
          >
            {columnHelp[key]}
          </div>
        ) : null}
      </div>
    );
  }

  function renderScheduledAvatars(dayIso: number, timeSlot: string, fallbackCount: number): JSX.Element {
    const key = `${dayIso}|${timeSlot}`;
    const avatars = scheduledBySlot[key] ?? [];

    if (avatars.length === 0) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 9px',
          borderRadius: 999,
          border: '1px solid #bfdbfe',
          background: '#eff6ff',
          color: '#1e3a8a',
          fontSize: 11,
          fontWeight: 700,
        }}>
          <Users size={12} />
          {fallbackCount}
        </span>
      );
    }

    const visible = avatars.slice(0, 5);
    const hiddenCount = avatars.length - visible.length;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
          {visible.map((avatar, idx) => (
            <div
              key={`${key}-${avatar.userId}`}
              title={`${avatar.name} ${avatar.surname}`.trim()}
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                marginLeft: idx === 0 ? 0 : -8,
                border: '2px solid #fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.14)',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #dbeafe, #f8f3ec)',
                color: '#2e567a',
                fontSize: 10,
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {avatar.avatarUrl ? (
                <img src={avatar.avatarUrl} alt={`${avatar.name} ${avatar.surname}`.trim()} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                initials(avatar.name, avatar.surname)
              )}
            </div>
          ))}
          {hiddenCount > 0 ? (
            <div style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, color: '#475569' }}>+{hiddenCount}</div>
          ) : null}
        </div>

        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
          {avatars.length} {t('shifts.affluence_scheduled', 'scheduled')}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(180deg, #fff 0%, #f8fbfe 100%)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: '0 10px 28px rgba(15,23,42,0.09)',
      marginTop: 18,
    }}>
      <div style={{
        background: 'var(--primary)',
        color: '#fff',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,255,255,0.16)',
          }}>
            <BarChart3 size={18} />
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 2 }}>
              {t('shifts.affluence_heading')}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.03rem' }}>
              {t('shifts.affluence_external_live_title', 'External Affluence (Live Week)')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {canConfigure ? (
            <button className="btn" style={headerActionButtonStyle} onClick={() => setShowConfig(true)}>
              <Cog size={14} style={{ marginRight: 6 }} />
              {t('shifts.affluence_config_button', 'Configure')}
            </button>
          ) : null}

          <button className="btn" style={headerActionButtonStyle} onClick={() => { void loadLiveData(); }} disabled={loading}>
            {t('common.refresh', 'Refresh')}
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'grid', gap: 12 }}>
        {/* Tab Switcher */}
        {!integrationMissing && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(13,33,55,0.05)',
            border: '1px solid rgba(13,33,55,0.08)',
            padding: 4,
            borderRadius: 12,
            width: 'fit-content',
            marginBottom: 2,
          }}>
            <button
              onClick={() => setActiveTab('live')}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === 'live' ? '#fff' : 'transparent',
                color: activeTab === 'live' ? '#2e567a' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: activeTab === 'live' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {t('shifts.affluence_tab_live', 'Current Week')}
            </button>
            <button
              onClick={() => setActiveTab('forecast')}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === 'forecast' ? '#fff' : 'transparent',
                color: activeTab === 'forecast' ? '#2e567a' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: activeTab === 'forecast' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              {t('shifts.affluence_tab_forecast', 'Forecast Planning')}
            </button>
          </div>
        )}

        <>
          {activeTab === 'live' ? (
            /* ──────────────────────────────────────────────────────────
               TAB: LIVE WEEK VIEW (Existing behavior)
               ────────────────────────────────────────────────────────── */
            <>
              {error && (
                <div style={{
                  margin: '0 0 2px',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--danger-border)',
                  background: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} />
                    {error}
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => { void loadLiveData(); }}>
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              )}

              {!integrationMissing && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  border: '1px solid #d6e4ef',
                  borderRadius: 10,
                  background: 'linear-gradient(90deg, #f9f5ef 0%, #f3f9ff 100%)',
                  padding: 10,
                }}>
                  {!singleDayMode && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button
                      className="btn btn-secondary"
                      style={{
                        padding: '6px 10px',
                        background: selectedDay === null ? '#2e567a' : '#fff',
                        color: selectedDay === null ? '#fff' : 'var(--text-secondary)',
                        borderColor: selectedDay === null ? '#2e567a' : '#d1d5db',
                      }}
                      onClick={() => setSelectedDay(null)}
                    >
                      {t('common.all', 'All')}
                    </button>
                    {WEEK_DAYS.map((day) => {
                      const active = selectedDay === day.key;
                      return (
                        <button
                          key={day.key}
                          className="btn btn-secondary"
                          style={{
                            padding: '6px 10px',
                            background: active ? '#2e567a' : '#fff',
                            color: active ? '#fff' : 'var(--text-secondary)',
                            borderColor: active ? '#2e567a' : '#d1d5db',
                            fontWeight: active ? 700 : 600,
                          }}
                          onClick={() => setSelectedDay(day.key)}
                        >
                          {t(`shifts.${day.shortKey}`, day.shortFallback)}
                        </button>
                      );
                    })}
                  </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#5f3e2f' }}>
                      {t('shifts.affluence_date_range', 'Date range')}: {formatDateRange(payload?.fromDate ?? null, payload?.toDate ?? null)}
                    </div>
                    <div style={{ opacity: 0.9 }}>
                      {t('shifts.affluence_external_store', 'External store')}: {sourceStoreTitle}
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
              ) : integrationMissing ? (
                <div style={{
                    border: '1px dashed rgba(95,62,47,0.35)',
                    borderRadius: 14,
                    background: 'linear-gradient(150deg, rgba(46,86,122,0.06), rgba(201,151,58,0.12))',
                    padding: '28px 20px',
                    textAlign: 'center',
                    display: 'grid',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        border: '1px solid rgba(13,33,55,0.15)',
                        background: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#5f3e2f',
                      }}>
                        <Building2 size={20} />
                      </div>
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        border: '1px dashed rgba(13,33,55,0.35)',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#2e567a',
                        background: 'rgba(255,255,255,0.7)',
                      }}>
                        <Link2 size={15} />
                      </div>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        border: '1px solid rgba(13,33,55,0.15)',
                        background: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#2e567a',
                      }}>
                        <Database size={20} />
                      </div>
                    </div>

                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.02rem', fontWeight: 800, color: '#5f3e2f' }}>
                      {t('shifts.affluence_not_connected_title', 'Store is not connected to any external store yet.')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 620, margin: '0 auto', lineHeight: 1.5 }}>
                      {t('shifts.affluence_not_connected_desc', 'Connect this internal store to an external database store to display live affluence data here.')}
                    </div>

                    {canConfigure && (
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-accent"
                          onClick={() => navigate('/integrazioni/database-esterno')}
                        >
                          <Database size={14} />
                          {t('shifts.affluence_connect_database_button', 'Open Database Integration')}
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                </div>
              ) : (
                <div style={{
                    border: '1px solid #d4e2ef',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: tableColumns,
                      padding: '10px 12px',
                      background: 'linear-gradient(90deg, rgba(95,62,47,0.08), rgba(46,86,122,0.08))',
                      borderBottom: '1px solid #d4e2ef',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      color: '#334155',
                      textTransform: 'uppercase',
                    }}>
                      <div>{t('shifts.affluence_day_label', 'Day')}</div>
                      <div>{t('shifts.affluence_store_hours_col', 'Store Hours')}</div>
                      <div>{renderColumnHeader(t('shifts.affluence_scheduled_staff_col', 'Scheduled staff'), 'scheduled')}</div>
                      <div>{renderColumnHeader(t('shifts.affluence_visitors_col', 'Visitors'), 'estimated')}</div>
                      <div>{renderColumnHeader(t('shifts.affluence_staff_suggestion_col', 'Staff suggestion'), 'suggestion')}</div>
                      <div style={{ borderLeft: '1px dashed #cbd5e1', paddingLeft: 10, whiteSpace: 'nowrap' }}>{renderColumnHeader(t('shifts.affluence_level_col', 'Level'), 'baseline')}</div>
                      <div>{renderColumnHeader(t('shifts.affluence_overview_col', 'Overview'), 'gap')}</div>
                      <div>{renderColumnHeader(t('common.status', 'Status'), 'status')}</div>
                    </div>

                    <div style={{ maxHeight: 430, overflowY: 'auto' }}>
                      {filteredDays.map((day, idx) => {
                        const slots = affluenceByDay[day.key] || [];
                        const dayHours = operatingHours.find((h) => h.dayOfWeek === day.isoDay - 1);
                        
                        const isClosed = !dayHours || dayHours.isClosed;
                        const openTime = dayHours?.openTime ? dayHours.openTime.slice(0, 5) : '';
                        const closeTime = dayHours?.closeTime ? dayHours.closeTime.slice(0, 5) : '';
                        const hoursLabel = isClosed ? t('shifts.dayClosed', 'Closed') : `${openTime} - ${closeTime}`;

                        // Filter active slots based on overlap with store hours
                        const activeSlots = slots.filter((slot) => {
                          if (isClosed) return false;
                          const slotTimes = STAFFING_SLOTS.find((s) => s.timeSlot === slot.timeSlot);
                          if (!slotTimes) return false;
                          const openMin = toMinutes(openTime) ?? 0;
                          const closeMin = toMinutes(closeTime) ?? 1440;
                          return rangesOverlap(slotTimes.startMinutes, slotTimes.endMinutes, openMin, closeMin);
                        });

                        const dayAvatars = scheduledByDay[day.isoDay] ?? [];
                        const scheduledCount = dayAvatars.length;

                        // Calculations for the day
                        const totalVisitors = activeSlots.reduce((sum, s) => sum + (s.estimatedVisitors || 0), 0);
                        const suggestedStaff = activeSlots.length > 0 ? Math.max(...activeSlots.map((s) => s.requiredStaff || 0)) : 0;
                        const levels = activeSlots.map((s) => s.level);
                        const dayLevel = levels.includes('high') ? 'high' : levels.includes('medium') ? 'medium' : 'low';
                        const gapValue = scheduledCount - suggestedStaff;

                        const statusLabel = gapValue === 0 ? 'balanced' : gapValue > 0 ? 'over' : 'under';
                        const statusStyle =
                          statusLabel === 'balanced'
                            ? { color: '#166534', background: '#dcfce7', border: '1px solid #86efac' }
                            : statusLabel === 'over'
                              ? { color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd' }
                              : { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' };

                        const levelStyle =
                          dayLevel === 'low'
                            ? { color: '#166534', background: '#dcfce7', border: '1px solid #86efac' }
                            : dayLevel === 'medium'
                              ? { color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d' }
                              : { color: '#7f1d1d', background: '#fee2e2', border: '1px solid #fca5a5' };

                        return (
                          <div
                            key={day.key}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: tableColumns,
                              alignItems: 'center',
                              borderBottom: '1px solid #e2e8f0',
                              background: idx % 2 === 0 ? '#fff' : '#f8fbff',
                            }}
                          >
                            {/* 1. Day Column */}
                            <div style={{ padding: '12px', fontWeight: 700, color: '#5f3e2f', display: 'grid', gap: 2 }}>
                              <div>{formatDay(day.key)}</div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>
                                {day.key === 'sunday' || day.key === 'saturday' ? '' : t('shifts.affluence_weekday', 'Weekday')}
                              </div>
                            </div>

                            {/* 2. Store Hours */}
                            <div style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: isClosed ? 'var(--danger)' : '#475569' }}>
                              {hoursLabel}
                            </div>

                            {/* 3. Scheduled Staff (Avatars) */}
                            <div style={{ padding: '12px' }}>
                              {dayAvatars.length === 0 ? (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>0 scheduled</span>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                  {dayAvatars.slice(0, 4).map((avatar) => (
                                    <div
                                      key={avatar.userId}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 999,
                                        overflow: 'hidden',
                                        border: '1.5px solid #2e567a',
                                        background: '#fff',
                                        display: 'grid',
                                        placeItems: 'center',
                                        fontSize: 10,
                                        fontWeight: 800,
                                        color: '#2e567a',
                                      }}
                                      title={`${avatar.name} ${avatar.surname}`}
                                    >
                                      {avatar.avatarUrl ? (
                                        <img src={avatar.avatarUrl} alt={avatar.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        initials(avatar.name, avatar.surname)
                                      )}
                                    </div>
                                  ))}
                                  {dayAvatars.length > 4 && (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginLeft: 2 }}>
                                      +\${dayAvatars.length - 4}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 4. Visitors */}
                            <div style={{ padding: '12px', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                              {isClosed ? '-' : Math.round(totalVisitors)}
                            </div>

                            {/* 5. Staff Suggestion */}
                            <div style={{ padding: '12px', fontSize: 14, fontWeight: 800, color: '#2e567a' }}>
                              {isClosed ? '-' : suggestedStaff}
                            </div>

                            {/* 6. Level */}
                            <div style={{ padding: '12px 10px', borderLeft: '1px dashed #cbd5e1' }}>
                              {isClosed ? (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>-</span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontWeight: 700,
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  ...levelStyle,
                                }}>
                                  {t(`shifts.level_${dayLevel}`, { defaultValue: dayLevel })}
                                </span>
                              )}
                            </div>

                            {/* 7. Overview */}
                            <div style={{ padding: '12px', fontSize: 13, fontWeight: 700, color: isClosed ? 'var(--text-muted)' : gapValue > 0 ? '#166534' : gapValue < 0 ? '#b91c1c' : '#1e40af' }}>
                              {isClosed ? '-' : gapValue > 0 ? `+${gapValue} Extra` : gapValue < 0 ? `${gapValue} Required` : 'Optimal'}
                            </div>

                            {/* 8. Status */}
                            <div style={{ padding: '12px' }}>
                              {isClosed ? (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('common.na', 'N/A')}</span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  minWidth: 80,
                                  padding: '3px 8px',
                                  borderRadius: 999,
                                  fontWeight: 700,
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  ...statusStyle,
                                }}>
                                  {t(`shifts.status_${statusLabel}`, { defaultValue: statusLabel })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                </div>
              )}
            </>
          ) : (
            /* ──────────────────────────────────────────────────────────
               TAB: FORECAST VIEW (New feature)
               ────────────────────────────────────────────────────────── */
            <>
              {forecastError && (
                <div style={{
                  margin: '0 0 2px',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--danger-border)',
                  background: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  fontSize: 13,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} />
                    {forecastError}
                  </span>
                  <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => { void loadForecastData(); }}>
                    {t('common.retry', 'Retry')}
                  </button>
                </div>
              )}

              {!integrationMissing && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  border: '1px solid #d6e4ef',
                  borderRadius: 10,
                  background: 'linear-gradient(90deg, #f9f5ef 0%, #f3f9ff 100%)',
                  padding: 10,
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('common.from', 'From')}:</span>
                      <input
                        type="date"
                        value={forecastFromDate}
                        onChange={(e) => setForecastFromDate(e.target.value)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 12,
                          fontWeight: 600,
                          background: '#fff',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('common.to', 'To')}:</span>
                      <input
                        type="date"
                        value={forecastToDate}
                        onChange={(e) => setForecastToDate(e.target.value)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 8,
                          border: '1px solid #d1d5db',
                          fontSize: 12,
                          fontWeight: 600,
                          background: '#fff',
                        }}
                      />
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, background: '#2e567a', color: '#fff', borderColor: '#2e567a' }}
                      onClick={() => { void loadForecastData(); }}
                    >
                      {t('common.apply', 'Apply')}
                    </button>
                  </div>


                </div>
              )}

              {forecastLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
              ) : integrationMissing ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{t('shifts.affluence_not_connected_title')}</div>
              ) : (
                <div style={{
                    border: '1px solid #d4e2ef',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 1.2fr 1.3fr 1.1fr 1fr',
                      padding: '10px 12px',
                      background: 'linear-gradient(90deg, rgba(95,62,47,0.08), rgba(46,86,122,0.08))',
                      borderBottom: '1px solid #d4e2ef',
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      color: '#334155',
                      textTransform: 'uppercase',
                    }}>
                      <div>{t('common.date', 'Date')}</div>
                      <div>{t('shifts.affluence_store_hours_col', 'Store Hours')}</div>
                      <div>{t('shifts.affluence_estimated_visitors_col', 'Estimated visitors')}</div>
                      <div>{t('shifts.affluence_staff_suggestion_col', 'Staff suggestion')}</div>
                      <div style={{ borderLeft: '1px dashed #cbd5e1', paddingLeft: 10, whiteSpace: 'nowrap' }}>{t('shifts.affluence_level_col', 'Level')}</div>
                    </div>

                    <div style={{ maxHeight: 430, overflowY: 'auto' }}>
                      {forecastData?.days.map((day, idx) => {
                        const slots = day.slots || [];
                        const formattedDateLabel = new Date(day.date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        });

                        const dateObj = new Date(day.date);
                        const jsDay = dateObj.getDay();
                        const isoDay = jsDay === 0 ? 7 : jsDay;
                        const dayHours = operatingHours.find((h) => h.dayOfWeek === isoDay - 1);
                        
                        const isClosed = !dayHours || dayHours.isClosed;
                        const openTime = dayHours?.openTime ? dayHours.openTime.slice(0, 5) : '';
                        const closeTime = dayHours?.closeTime ? dayHours.closeTime.slice(0, 5) : '';
                        const hoursLabel = isClosed ? t('shifts.dayClosed', 'Closed') : `${openTime} - ${closeTime}`;

                        // Filter active slots based on overlap with store hours
                        const activeSlots = slots.filter((slot) => {
                          if (isClosed) return false;
                          const slotTimes = STAFFING_SLOTS.find((s) => s.timeSlot === slot.timeSlot);
                          if (!slotTimes) return false;
                          const openMin = toMinutes(openTime) ?? 0;
                          const closeMin = toMinutes(closeTime) ?? 1440;
                          return rangesOverlap(slotTimes.startMinutes, slotTimes.endMinutes, openMin, closeMin);
                        });

                        // Calculations for the day
                        const totalVisitors = activeSlots.reduce((sum, s) => sum + (s.estimatedVisitors || 0), 0);
                        const suggestedStaff = activeSlots.length > 0 ? Math.max(...activeSlots.map((s) => s.requiredStaff || 0)) : 0;
                        const levels = activeSlots.map((s) => s.level);
                        const dayLevel = levels.includes('high') ? 'high' : levels.includes('medium') ? 'medium' : 'low';

                        const levelStyle =
                          dayLevel === 'low'
                            ? { color: '#166534', background: '#dcfce7', border: '1px solid #86efac' }
                            : dayLevel === 'medium'
                              ? { color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d' }
                              : { color: '#7f1d1d', background: '#fee2e2', border: '1px solid #fca5a5' };

                        return (
                          <div
                            key={day.date}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.4fr 1.2fr 1.3fr 1.1fr 1fr',
                              alignItems: 'center',
                              borderBottom: '1px solid #e2e8f0',
                              background: idx % 2 === 0 ? '#fff' : '#f8fbff',
                            }}
                          >
                            {/* 1. Date & Override Controls */}
                            <div
                              style={{
                                padding: '12px',
                                fontWeight: 700,
                                color: '#5f3e2f',
                                display: 'grid',
                                gap: 6,
                                borderRight: '1px solid #e2e8f0',
                              }}
                            >
                              <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Calendar size={14} style={{ color: '#2e567a' }} />
                                {formattedDateLabel}
                              </div>
                              
                              {/* Override Controls */}
                              {editingDate === day.date ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                  <input
                                    type="number"
                                    min={0}
                                    value={overrideValue}
                                    onChange={(e) => setOverrideValue(e.target.value)}
                                    placeholder="Visitors"
                                    style={{
                                      width: 75,
                                      padding: '4px 6px',
                                      fontSize: 12,
                                      borderRadius: 6,
                                      border: '1.5px solid #2e567a',
                                      fontWeight: 700,
                                    }}
                                  />
                                  <button
                                    title="Save Override"
                                    onClick={() => handleSaveOverride(day.date)}
                                    disabled={overrideSaving}
                                    style={{
                                      padding: 5,
                                      borderRadius: 6,
                                      border: 'none',
                                      background: '#10b981',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      display: 'grid',
                                      placeItems: 'center',
                                    }}
                                  >
                                    <Save size={12} />
                                  </button>
                                  <button
                                    title="Cancel"
                                    onClick={() => {
                                      setEditingDate(null);
                                      setOverrideValue('');
                                    }}
                                    style={{
                                      padding: 5,
                                      borderRadius: 6,
                                      border: 'none',
                                      background: '#ef4444',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      display: 'grid',
                                      placeItems: 'center',
                                    }}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                      {t('shifts.forecast_daily_visitors', 'Total')}: <strong>{day.effectiveDailyVisitors}</strong>
                                    </span>
                                    {day.isOverridden && (
                                      <span style={{
                                        fontSize: 9,
                                        fontWeight: 800,
                                        background: '#fef3c7',
                                        color: '#d97706',
                                        border: '1px solid #fde68a',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        textTransform: 'uppercase',
                                      }}>
                                        Custom
                                      </span>
                                    )}
                                  </div>
                                  
                                  {canConfigure && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                      <button
                                        onClick={() => {
                                          setEditingDate(day.date);
                                          setOverrideValue(String(day.effectiveDailyVisitors));
                                        }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          background: 'none',
                                          border: 'none',
                                          color: '#2e567a',
                                          fontSize: 10,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          padding: 0,
                                        }}
                                      >
                                        <Pencil size={10} />
                                        {t('common.override', 'Override')}
                                      </button>

                                      {day.isOverridden && (
                                        <button
                                          onClick={() => handleDeleteOverride(day.date)}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            background: 'none',
                                            border: 'none',
                                            color: '#ef4444',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            padding: 0,
                                          }}
                                        >
                                          <Trash2 size={10} />
                                          {t('common.clear', 'Clear')}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 2. Store Hours */}
                            <div style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: isClosed ? 'var(--danger)' : '#475569' }}>
                              {hoursLabel}
                            </div>

                            {/* 3. Estimated Visitors */}
                            <div style={{ padding: '12px', fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                              {isClosed ? '-' : Math.round(totalVisitors)}
                            </div>

                            {/* 4. Staff Suggestion */}
                            <div style={{ padding: '12px', fontSize: 14, fontWeight: 800, color: '#2e567a' }}>
                              {isClosed ? '-' : suggestedStaff}
                            </div>

                            {/* 5. Level */}
                            <div style={{ padding: '12px', borderLeft: '1px dashed #cbd5e1', paddingLeft: 10 }}>
                              {isClosed ? (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>-</span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontWeight: 700,
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  ...levelStyle,
                                }}>
                                  {t(`shifts.level_${dayLevel}`, { defaultValue: dayLevel })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                </div>
              )}
            </>
          )}
        </>
      </div>

      {showConfig ? (
        <ExternalAffluenceLiveConfigModal
          storeId={storeId}
          onClose={() => setShowConfig(false)}
          onSaved={() => { void loadLiveData(); }}
        />
      ) : null}
    </div>
  );
}
