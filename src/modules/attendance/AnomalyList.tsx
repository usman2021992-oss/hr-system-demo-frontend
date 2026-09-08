import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import client, { getAvatarUrl } from '../../api/client';
import { useBreakpoint } from '../../hooks/useBreakpoint';

interface Anomaly {
  shiftId: number;
  userId: number;
  userName: string;
  userSurname: string;
  userAvatarFilename?: string | null;
  storeName: string;
  date: string;
  anomalyType: 'late_arrival' | 'no_show' | 'long_break' | 'early_exit' | 'overtime' | 'missing_checkout' | 'missing_break' | 'on_leave';
  severity: 'low' | 'medium' | 'high' | 'info';
  details: string;
  detailsKey?: string;
  detailsParams?: Record<string, string | number>;
  checkinSource: 'qr' | 'manual' | 'sync' | null;
}

interface Props {
  dateFrom: string;
  dateTo: string;
  companyId?: number;
  storeId?: number;
  userId?: number;
  search?: string;
  compact?: boolean;
}

// ── SVG Icons ──────────────────────────────────────────────────────────────
const IconClock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconUserX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>
  </svg>
);
const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
  </svg>
);
const IconLogOut = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconOvertime = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 10"/>
  </svg>
);
const IconCheckCircle = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IconAlertTriangle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const IconStore = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IconCalendar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const ANOMALY_META: Record<string, { Icon: () => JSX.Element; color: string; bg: string; border: string }> = {
  late_arrival: { Icon: IconClock,   color: '#b45309', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.20)' },
  no_show:      { Icon: IconUserX,   color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.20)' },
  long_break:   { Icon: IconPause,   color: '#7c3aed', bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.20)' },
  early_exit:   { Icon: IconLogOut,  color: '#0369a1', bg: 'rgba(3,105,161,0.08)',   border: 'rgba(3,105,161,0.20)' },
  overtime:     { Icon: IconOvertime, color: '#c2410c', bg: 'rgba(194,65,12,0.08)',  border: 'rgba(194,65,12,0.20)' },
  missing_checkout: { Icon: IconLogOut, color: '#be123c', bg: 'rgba(190,18,60,0.08)', border: 'rgba(190,18,60,0.20)' },
  missing_break: { Icon: IconPause, color: '#b45309', bg: 'rgba(180,83,9,0.08)', border: 'rgba(180,83,9,0.20)' },
  // Not an incident: the slot is empty because the leave was approved. Shown so
  // the manager can see why, in a neutral colour that reads as context.
  on_leave:     { Icon: IconUserX,   color: '#0369a1', bg: 'rgba(3,105,161,0.08)',   border: 'rgba(3,105,161,0.20)' },
};

const SOURCE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  qr:     { label: 'QR',     color: '#15803d', bg: 'rgba(21,128,61,0.08)',   border: 'rgba(21,128,61,0.25)' },
  manual: { label: 'MANUAL', color: '#0369a1', bg: 'rgba(3,105,161,0.08)',   border: 'rgba(3,105,161,0.25)' },
  sync:   { label: 'SYNC',   color: '#92400e', bg: 'rgba(217,119,6,0.12)',   border: 'rgba(217,119,6,0.45)' },
};

const SEVERITY_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  low:    { color: '#15803d', bg: 'rgba(21,128,61,0.08)',   border: 'rgba(21,128,61,0.20)',   dot: '#22c55e' },
  medium: { color: '#b45309', bg: 'rgba(180,83,9,0.08)',    border: 'rgba(180,83,9,0.20)',    dot: '#f59e0b' },
  high:   { color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.20)',   dot: '#ef4444' },
  info:   { color: '#0369a1', bg: 'rgba(3,105,161,0.08)',   border: 'rgba(3,105,161,0.20)',   dot: '#38bdf8' },
};

function getAvatarColor(name: string): string {
  const PALETTE = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function AnomalyList({ dateFrom, dateTo, companyId, storeId, userId, search, compact: propCompact }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
  const { isMobile, isTablet } = useBreakpoint();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<Anomaly | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState<number>(100);

  useEffect(() => {
    if (propCompact !== undefined) {
      setCompact(propCompact);
    }
  }, [propCompact]);

  useEffect(() => {
    setDisplayLimit(100);
  }, [dateFrom, dateTo, storeId, userId, search, selectedTypeFilter]);

  const rangeExceeds14Days = (() => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffMs = to.getTime() - from.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > 14;
  })();

  const fetchAnomalies = useCallback(async () => {
    if (rangeExceeds14Days) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.get('/attendance/anomalies', {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          ...(companyId != null && !isNaN(companyId) ? { company_id: companyId } : {}),
          ...(storeId != null && !isNaN(storeId) ? { store_id: storeId } : {}),
          ...(userId != null && !isNaN(userId) ? { user_id: userId } : {}),
          ...(search ? { search } : {}),
        },
      });
      // axios interceptor already camelizes all keys (snake_case → camelCase)
      const raw = (res.data.data.anomalies ?? []) as any[];
      setAnomalies(raw.map((a) => ({
        shiftId:       a.shiftId,
        userId:        a.userId,
        userName:      a.userName ?? '',
        userSurname:   a.userSurname ?? '',
        storeName:     a.storeName,
        date:          a.date,
        anomalyType:   a.anomalyType,
        severity:      a.severity ?? 'low',
        details:       a.details ?? '',
        detailsKey:    a.detailsKey,
        detailsParams: a.detailsParams,
        checkinSource: a.checkinSource ?? null,
      })));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('attendance.error_load_anomalies'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, companyId, storeId, userId, search, t, rangeExceeds14Days]);

  useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);

  const pad = isMobile ? '16px' : isTablet ? '20px' : '32px';

  if (rangeExceeds14Days) {
    return (
      <div style={{ margin: isMobile ? '20px 0' : `20px ${pad}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 'var(--radius)',
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)',
          color: '#b45309', fontSize: 13,
        }}>
          <IconAlertTriangle />
          {t('attendance.date_range_limit')}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: `56px ${pad}`, textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', margin: '0 auto 14px',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.7s linear infinite',
        }} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ margin: isMobile ? '20px 0' : `20px ${pad}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 'var(--radius)',
          background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.20)',
          color: '#dc2626', fontSize: 13,
        }}>
          <IconAlertTriangle />
          {error}
        </div>
      </div>
    );
  }

  if (anomalies.length === 0) {
    return (
      <div style={{ padding: `64px ${pad}`, textAlign: 'center' }}>
        <div style={{ color: 'var(--border)', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <IconCheckCircle />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
          {t('attendance.no_anomalies')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateFrom} → {dateTo}</div>
      </div>
    );
  }

  const countByType = anomalies.reduce<Record<string, number>>((acc, a) => {
    acc[a.anomalyType] = (acc[a.anomalyType] ?? 0) + 1;
    return acc;
  }, {});

  const displayedAnomalies = selectedTypeFilter
    ? anomalies.filter((a) => a.anomalyType === selectedTypeFilter)
    : anomalies;

  const visibleAnomalies = displayedAnomalies.slice(0, displayLimit);

  return (
    <div style={{ padding: isMobile ? '16px 0 20px' : '20px 0 24px' }}>

      {/* ── Summary tiles ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        // Derived from ANOMALY_META rather than hardcoded: adding the
        // `on_leave` tile made a fixed 7-column grid wrap awkwardly.
        gridTemplateColumns: isMobile
          ? 'repeat(2, minmax(0, 1fr))'
          : `repeat(${Object.keys(ANOMALY_META).length}, minmax(0, 1fr))`,
        gap: isMobile ? 8 : 12,
        marginBottom: isMobile ? 16 : 24,
        padding: isMobile ? '0' : `0 ${pad}`,
      }}>
        {Object.entries(ANOMALY_META).map(([type, meta]) => {
          const count = countByType[type] ?? 0;
          const { Icon } = meta;
          const isSelected = selectedTypeFilter === type;
          return (
            <div
              key={type}
              onClick={() => {
                if (count === 0) return;
                setSelectedTypeFilter(isSelected ? null : type);
              }}
              style={{
                padding: isMobile ? '12px 14px' : '16px',
                borderRadius: '16px',
                background: isSelected
                  ? `linear-gradient(135deg, ${meta.bg} 0%, rgba(255,255,255,0.98) 100%)`
                  : count > 0 ? meta.bg : 'var(--surface)',
                border: isSelected
                  ? `2px solid ${meta.color}`
                  : `1px solid ${count > 0 ? meta.border : 'var(--border)'}`,
                borderTop: `4px solid ${count > 0 ? meta.color : 'var(--border)'}`,
                cursor: count > 0 ? 'pointer' : 'default',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isSelected
                  ? `0 6px 20px ${meta.color}33`
                  : count > 0
                    ? '0 2px 8px rgba(0,0,0,0.04)'
                    : 'none',
                transform: isSelected ? 'translateY(-2px)' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => {
                if (count > 0 && !isSelected) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 16px ${meta.color}22`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = count > 0 ? '0 2px 8px rgba(0,0,0,0.04)' : 'none';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 8,
                  background: count > 0 ? `${meta.color}18` : 'var(--background)',
                  color: count > 0 ? meta.color : 'var(--text-muted)',
                  border: `1px solid ${count > 0 ? `${meta.color}30` : 'var(--border)'}`,
                }}>
                  <Icon />
                </div>
                {isSelected && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 20,
                    background: meta.color, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    Filtro
                  </span>
                )}
              </div>
              <div style={{
                fontSize: isMobile ? 22 : 26, fontWeight: 800, lineHeight: 1,
                letterSpacing: '-0.03em', fontFamily: 'var(--font-display)',
                color: count > 0 ? meta.color : 'var(--text-disabled)',
                marginBottom: 4,
              }}>
                {count}
              </div>
              <div style={{
                fontSize: isMobile ? 9 : 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.8px',
                color: count > 0 ? meta.color : 'var(--text-muted)',
                wordBreak: 'break-word',
                whiteSpace: 'normal',
              }}>
                {t(`attendance.anomaly_${type}`)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile: card list ──────────────────────────────────────────────── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleAnomalies.map((a, idx) => {
            const meta    = ANOMALY_META[a.anomalyType] ?? ANOMALY_META['late_arrival'];
            const sevMeta = SEVERITY_META[a.severity]   ?? SEVERITY_META['low'];
            const { Icon } = meta;
            const initials = `${(a.userSurname || '?').charAt(0)}${(a.userName || '?').charAt(0)}`.toUpperCase();
            const avatarBg = getAvatarColor((a.userSurname || '') + (a.userName || ''));
            const dateShort = new Date(a.date + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', weekday: 'short' });
            return (
              <div key={`${a.shiftId}-${a.anomalyType}`} style={{
                background: 'var(--surface)',
                borderRadius: 10,
                border: `1px solid var(--border)`,
                borderLeft: `4px solid ${meta.color}`,
                padding: '13px 14px',
              }}>
                {/* Row 1: avatar + name + date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: a.userAvatarFilename ? 'transparent' : avatarBg, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
                    overflow: 'hidden',
                  }}>
                    {a.userAvatarFilename ? (
                      <img src={getAvatarUrl(a.userAvatarFilename) ?? ''} alt={`${a.userName} ${a.userSurname}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                      {a.userName} {a.userSurname}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {a.storeName} · {dateShort}
                    </div>
                  </div>
                  {/* Severity chip */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 20, flexShrink: 0,
                    fontSize: 10, fontWeight: 700,
                    background: sevMeta.bg, color: sevMeta.color,
                    border: `1px solid ${sevMeta.border}`,
                    textTransform: 'uppercase', letterSpacing: '0.4px',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: sevMeta.dot, flexShrink: 0 }} />
                    {t(`attendance.severity_${a.severity}`)}
                  </span>
                </div>
                {/* Row 2: anomaly badge + origin badge */}
                <div style={{ marginBottom: a.details ? 8 : 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.4px',
                    background: meta.bg, color: meta.color,
                    border: `1px solid ${meta.border}`,
                    textTransform: 'uppercase',
                  }}>
                    <Icon />
                    {t(`attendance.anomaly_${a.anomalyType}`)}
                  </span>
                  {a.checkinSource && (() => {
                    const sm = SOURCE_META[a.checkinSource] ?? { label: '?', color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.25)' };
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '3px 8px', borderRadius: 4,
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                        background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`,
                        ...(a.checkinSource === 'sync' ? { outline: `2px solid ${sm.border}`, outlineOffset: '1px' } : {}),
                      }}>
                        {sm.label}
                      </span>
                    );
                  })()}
                </div>
                {/* Row 3: details */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  {(a.detailsKey || a.details) && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1, paddingRight: 8 }}>
                      {a.detailsKey ? t(a.detailsKey, a.detailsParams) : a.details}
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedAnomaly(a)}
                    title={t('attendance.view_details', 'Vedi dettagli e formula')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-warm)',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <IconEye />
                  </button>
                </div>
              </div>
            );
          })}
          {/* Mobile Footer with pagination */}
          <div style={{
            padding: '12px 16px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 10, gap: 10,
          }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {displayLimit < displayedAnomalies.length ? (
                <>{t('attendance.showing')} <strong>{visibleAnomalies.length}</strong> / <strong>{displayedAnomalies.length}</strong></>
              ) : (
                <><strong>{displayedAnomalies.length}</strong> {t('attendance.found')}</>
              )}
            </div>
            {displayLimit < displayedAnomalies.length && (
              <button
                onClick={() => setDisplayLimit((prev) => prev + 100)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: '1px solid var(--border)', background: 'var(--background)',
                  color: 'var(--accent)', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <IconChevronDown />
                {t('attendance.loadMore', 'Load more')} (+{Math.min(100, displayedAnomalies.length - displayLimit)})
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── Desktop / tablet: table ──────────────────────────────────────── */
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          margin: `0 ${pad}`,
        }}>
          {propCompact === undefined && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border-light)',
              background: 'var(--surface-warm)',
              gap: 8,
            }}>
              <button
                onClick={() => setCompact(!compact)}
                title={compact ? t('attendance.normalView', 'Visualizzazione normale') : t('attendance.compactView', 'Visualizzazione compatta')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: compact ? 'var(--accent-light)' : 'var(--surface)',
                  color: compact ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span>{compact ? t('attendance.compact', 'Compatto') : t('attendance.normal', 'Normale')}</span>
              </button>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: '#0d2137' }}>
                  {[
                    { label: t('shifts.employee'),        icon: <IconUser /> },
                    { label: t('common.store'),            icon: <IconStore /> },
                    { label: t('common.date'),             icon: <IconCalendar /> },
                    { label: t('attendance.col_anomaly'),  icon: <IconAlertTriangle /> },
                    { label: t('attendance.col_severity'), icon: null },
                    { label: t('attendance.col_origin', 'Origin'),   icon: null },
                    { label: t('attendance.col_details'),  icon: null },
                    { label: t('common.actions', 'Azione'),  icon: null },
                  ].map(({ label, icon }, i) => (
                    <th key={label} style={{
                      padding: compact ? '8px 16px' : '12px 16px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                      textTransform: 'uppercase', letterSpacing: '1.2px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      ...(i === 0 ? { paddingLeft: 24 } : {}),
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {icon && <span style={{ opacity: 0.8 }}>{icon}</span>}
                        {label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleAnomalies.map((a, idx) => {
                  const meta    = ANOMALY_META[a.anomalyType] ?? ANOMALY_META['late_arrival'];
                  const sevMeta = SEVERITY_META[a.severity]   ?? SEVERITY_META['low'];
                  const { Icon } = meta;
                  const initials = `${(a.userSurname || '?').charAt(0)}${(a.userName || '?').charAt(0)}`.toUpperCase();
                  const avatarBg = getAvatarColor((a.userSurname || '') + (a.userName || ''));
                  return (
                    <tr
                      key={`${a.shiftId}-${a.anomalyType}`}
                      style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-warm)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                    >
                      <td style={{ padding: compact ? '6px 16px 6px 24px' : '11px 16px 11px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <div style={{
                            width: compact ? 24 : 30, height: compact ? 24 : 30, borderRadius: '50%',
                            background: a.userAvatarFilename ? 'transparent' : avatarBg, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: compact ? 9 : 10, fontWeight: 700, flexShrink: 0,
                            fontFamily: 'var(--font-display)', overflow: 'hidden',
                          }}>
                            {a.userAvatarFilename ? (
                              <img src={getAvatarUrl(a.userAvatarFilename) ?? ''} alt={`${a.userName} ${a.userSurname}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : initials}
                          </div>
                          <div>
                            <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                              {a.userName} {a.userSurname}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px', fontSize: compact ? 12 : 13, color: 'var(--text-secondary)' }}>
                        {a.storeName}
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px' }}>
                        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                          {new Date(a.date + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short' })}
                        </div>
                        <div style={{ fontSize: compact ? 10 : 11, color: 'var(--text-muted)' }}>
                          {new Date(a.date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short' })}
                        </div>
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: compact ? '2px 8px' : '5px 10px', borderRadius: 'var(--radius-sm)',
                          fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: '0.4px',
                          background: meta.bg, color: meta.color,
                          border: `1px solid ${meta.border}`,
                          textTransform: 'uppercase',
                        }}>
                          <Icon />
                          {t(`attendance.anomaly_${a.anomalyType}`)}
                        </span>
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: compact ? '2px 8px' : '4px 10px', borderRadius: 20,
                          fontSize: compact ? 10 : 11, fontWeight: 700,
                          background: sevMeta.bg, color: sevMeta.color,
                          border: `1px solid ${sevMeta.border}`,
                          textTransform: 'uppercase', letterSpacing: '0.4px',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sevMeta.dot, flexShrink: 0 }} />
                          {t(`attendance.severity_${a.severity}`)}
                        </span>
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px' }}>
                        {a.checkinSource ? (() => {
                          const sm = SOURCE_META[a.checkinSource] ?? { label: '?', color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.25)' };
                          return (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: compact ? '1px 6px' : '3px 8px', borderRadius: 4,
                              fontSize: compact ? 9 : 10, fontWeight: 800, letterSpacing: '0.8px',
                              textTransform: 'uppercase',
                              background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`,
                              ...(a.checkinSource === 'sync' ? { outline: `2px solid ${sm.border}`, outlineOffset: '1px' } : {}),
                            }}>
                              {sm.label}
                            </span>
                          );
                        })() : (
                          <span style={{ fontSize: compact ? 10 : 11, color: 'var(--text-disabled)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px', fontSize: compact ? 11 : 12, color: 'var(--text-muted)', maxWidth: 260, lineHeight: 1.5 }}>
                        {a.detailsKey ? t(a.detailsKey, a.detailsParams) : a.details}
                      </td>
                      <td style={{ padding: compact ? '6px 16px' : '11px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedAnomaly(a)}
                          title={t('attendance.view_details', 'Vedi dettagli e formula')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          }}
                        >
                          <IconEye />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, color: 'var(--text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconAlertTriangle />
              <span style={{ color: 'var(--text-secondary)' }}>
                {displayLimit < displayedAnomalies.length ? (
                  <>{t('attendance.showing')} <strong>{visibleAnomalies.length}</strong> / <strong>{displayedAnomalies.length}</strong></>
                ) : (
                  <><strong>{displayedAnomalies.length}</strong> {t('attendance.found')}</>
                )}
              </span>
            </div>

            {displayLimit < displayedAnomalies.length && (
              <button
                onClick={() => setDisplayLimit((prev) => prev + 100)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--accent)', cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <IconChevronDown />
                {t('attendance.loadMore', 'Load more')} (+{Math.min(100, displayedAnomalies.length - displayLimit)})
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Inspection Detail Modal ────────────────────────────────────────── */}
      {selectedAnomaly && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(13,33,55,0.52)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setSelectedAnomaly(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              width: 'min(560px, 94vw)',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header stripe */}
            <div style={{
              height: 4,
              background: ANOMALY_META[selectedAnomaly.anomalyType]?.color || 'var(--accent)',
            }} />

            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-warm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: ANOMALY_META[selectedAnomaly.anomalyType]?.bg || 'rgba(0,0,0,0.05)',
                  color: ANOMALY_META[selectedAnomaly.anomalyType]?.color || 'var(--text)',
                }}>
                  {(() => {
                    const meta = ANOMALY_META[selectedAnomaly.anomalyType];
                    const Icon = meta ? meta.Icon : IconClock;
                    return <Icon />;
                  })()}
                </span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                    {t('attendance.anomaly_details_modal_title', 'Dettaglio e Formula di Calcolo')}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {selectedAnomaly.userName} {selectedAnomaly.userSurname} · {selectedAnomaly.storeName}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedAnomaly(null)}
                style={{
                  border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                }}
              >
                <IconX />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              
              {/* Employee Summary Card */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                background: 'var(--background)',
                border: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {t('common.date', 'Data')} & {t('common.store', 'Negozio')}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
                    {new Date(selectedAnomaly.date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    ...ANOMALY_META[selectedAnomaly.anomalyType],
                  }}>
                    {t(`attendance.anomaly_${selectedAnomaly.anomalyType}`)}
                  </span>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    ...SEVERITY_META[selectedAnomaly.severity],
                  }}>
                    {t(`attendance.severity_${selectedAnomaly.severity}`)}
                  </span>
                </div>
              </div>

              {/* Main Description */}
              <div style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: ANOMALY_META[selectedAnomaly.anomalyType]?.bg || 'rgba(0,0,0,0.04)',
                border: `1px solid ${ANOMALY_META[selectedAnomaly.anomalyType]?.border || 'var(--border)'}`,
                fontSize: 13,
                fontWeight: 600,
                color: ANOMALY_META[selectedAnomaly.anomalyType]?.color || 'var(--text)',
                lineHeight: 1.5,
              }}>
                ℹ️ {selectedAnomaly.detailsKey ? t(selectedAnomaly.detailsKey, selectedAnomaly.detailsParams) : selectedAnomaly.details}
              </div>

              {/* Calculation Formula Breakdown Box */}
              <div style={{
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px',
                  background: 'var(--surface-warm)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--text)',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}>
                  🧮 {t('attendance.calculation_formula', 'Formula di Calcolo')}
                </div>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {selectedAnomaly.anomalyType === 'early_exit' && (
                    <>
                      <div>• <strong>{t('attendance.scheduled_shift', 'Turno Pianificato')} (Fine):</strong> {selectedAnomaly.detailsParams?.shift || '—'}</div>
                      <div>• <strong>{t('attendance.actual_attendance', 'Presenza Effettiva')} (Uscita):</strong> {selectedAnomaly.detailsParams?.exit || '—'}</div>
                      <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', color: '#1e293b', fontWeight: 700 }}>
                        Scostamento = Fine Turno - Orario Uscita = {selectedAnomaly.detailsParams?.minutes || 0} minuti
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'late_arrival' && (
                    <>
                      <div>• <strong>{t('attendance.scheduled_shift', 'Turno Pianificato')} (Inizio):</strong> {selectedAnomaly.detailsParams?.shift || '—'}</div>
                      <div>• <strong>{t('attendance.actual_attendance', 'Presenza Effettiva')} (Entrata):</strong> {selectedAnomaly.detailsParams?.entry || '—'}</div>
                      <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', color: '#1e293b', fontWeight: 700 }}>
                        Scostamento = Orario Entrata - Inizio Turno = {selectedAnomaly.detailsParams?.minutes || 0} minuti
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'no_show' && (
                    <>
                      <div>• <strong>{t('attendance.scheduled_shift', 'Turno Pianificato')}:</strong> {selectedAnomaly.detailsParams?.start} – {selectedAnomaly.detailsParams?.end}</div>
                      <div style={{ background: '#fef2f2', padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', color: '#dc2626', fontWeight: 700 }}>
                        Nessun Check-in registrato dopo 10 minuti dall'inizio del turno.
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'on_leave' && (
                    <>
                      <div>• <strong>{t('attendance.scheduled_shift', 'Turno Pianificato')}:</strong> {selectedAnomaly.detailsParams?.start} – {selectedAnomaly.detailsParams?.end}</div>
                      <div style={{ background: '#eff6ff', padding: '8px 12px', borderRadius: 8, border: '1px solid #bfdbfe', color: '#0369a1', fontWeight: 700 }}>
                        {t('attendance.on_leave_explainer', 'Assenza giustificata da un permesso approvato. Non conteggiata come assenza ingiustificata né nel tasso di assenza.')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('attendance.on_leave_shift_hint', 'Il turno risulta ancora attivo: valuta di annullarlo per liberare la copertura del negozio.')}
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'missing_checkout' && (
                    <>
                      <div>• <strong>{t('attendance.scheduled_shift', 'Turno Pianificato')} (Fine):</strong> {selectedAnomaly.detailsParams?.shift_end || '—'}</div>
                      <div>• <strong>{t('attendance.actual_attendance', 'Presenza Effettiva')} (Entrata):</strong> {selectedAnomaly.detailsParams?.checkin || '—'}</div>
                      <div style={{ background: '#fef2f2', padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', color: '#dc2626', fontWeight: 700 }}>
                        Mancato Check-out registrato oltre 30 minuti dal termine previsto del turno.
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'overtime' && (
                    <>
                      <div>• <strong>{t('attendance.scheduled_shift', 'Turno Pianificato')} (Fine):</strong> {selectedAnomaly.detailsParams?.scheduled || '—'}</div>
                      <div>• <strong>{t('attendance.actual_attendance', 'Presenza Effettiva')} (Uscita):</strong> {selectedAnomaly.detailsParams?.actual || '—'}</div>
                      <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: 8, border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 700 }}>
                        Straordinario = Orario Uscita - Fine Turno = {selectedAnomaly.detailsParams?.minutes || 0} minuti
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'long_break' && (
                    <>
                      <div>• <strong>Pausa Effettiva:</strong> {selectedAnomaly.detailsParams?.minutes || 0} minuti</div>
                      <div style={{ background: '#faf5ff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e9d5ff', color: '#7c3aed', fontWeight: 700 }}>
                        Pausa prolungata di oltre 5 minuti rispetto al limite concordato.
                      </div>
                    </>
                  )}
                  {selectedAnomaly.anomalyType === 'missing_break' && (
                    <>
                      <div>• <strong>Pausa Obbligatoria Programmata:</strong> {selectedAnomaly.detailsParams?.minutes || 60} minuti</div>
                      <div style={{ background: '#fffbeb', padding: '8px 12px', borderRadius: 8, border: '1px solid #fde68a', color: '#b45309', fontWeight: 700 }}>
                        Pausa non registrata. Il tempo di pausa programmato è stato dedotto automaticamente dalle ore lavorate.
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Timezone & Rules Note */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                fontSize: 11.5,
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                🌐 {t('attendance.info_timezone_desc', 'Tutti gli orari sono normalizzati al fuso orario del negozio (es. Europe/Rome).')}
              </div>

            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-warm)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setSelectedAnomaly(null)}
                style={{
                  padding: '8px 22px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
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
