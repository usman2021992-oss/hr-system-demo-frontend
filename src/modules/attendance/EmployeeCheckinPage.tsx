import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useEffect, useRef, useState, useCallback } from 'react';
import { listMyAttendanceEvents, recordCheckin, type AttendanceEvent, type EventType } from '../../api/attendance';
import { Spinner } from '../../components/ui/Spinner';
import { getDeviceFingerprint } from '../../utils/deviceFingerprint';
import { formatLocalDate } from '../../utils/date';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { useToast } from '../../context/ToastContext';
import client from '../../api/client';
import { persistDailyAttendanceState } from '../../utils/indexedDB';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { recoverFromChunkLoadError } from '../../utils/chunkLoadRecovery';
import { AlertCircle, CalendarX, LogIn, LogOut, Coffee, Play, Calendar, Store, Clock } from 'lucide-react';

const STEPS = [
  { icon: '🖥️', key: 'step1' },
  { icon: '📱', key: 'step2' },
  { icon: '👆', key: 'step3' },
  { icon: '✅', key: 'step4' },
];

const EVENT_COLORS: Record<string, string> = {
  checkin:     '#16a34a',
  break_start: '#d97706',
  break_end:   '#2563eb',
  checkout:    '#dc2626',
};

const EVENT_ICONS: Record<string, React.ComponentType<any>> = {
  checkin:     LogIn,
  break_start: Coffee,
  break_end:   Play,
  checkout:    LogOut,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(iso: string | null | undefined) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

type Filter = '7' | '15' | '30';

interface DailyState {
  checkedIn: boolean;
  checkedInTime?: string | null;
  breakStarted: boolean;
  breakStartedTime?: string | null;
  breakEnded: boolean;
  breakEndedTime?: string | null;
  checkedOut: boolean;
  checkedOutTime?: string | null;
}

interface FullDailyState {
  hasShift: boolean;
  hasLeave: boolean;
  shiftStoreId?: number;
  shiftStoreName?: string;
  state: DailyState;
}

/**
 * Derive which EventType buttons are enabled given the current daily state.
 */
function resolveAllowedActions(full: FullDailyState | null): Set<EventType> {
  const allowed = new Set<EventType>();
  if (!full) return allowed;
  if (!full.hasShift || full.hasLeave) return allowed;

  const { checkedIn, breakStarted, breakEnded, checkedOut } = full.state;

  if (checkedOut) return allowed;

  if (!checkedIn) {
    allowed.add('checkin');
    return allowed;
  }

  // Checked in, on break
  if (breakStarted && !breakEnded) {
    allowed.add('break_end');
    return allowed;
  }

  // Checked in, not on break (either never started or already ended)
  if (!breakStarted) allowed.add('break_start');
  allowed.add('checkout');

  return allowed;
}



export default function EmployeeCheckinPage() {
  const { t } = useTranslation();
  const { user, permissions } = useAuth();
  const { lastSyncTime, isOnline, isSyncing, queueLength, enqueue, getTodayOfflineState } = useOfflineSync();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const [filter, setFilter] = useState<Filter>('7');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean; code?: string } | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const deviceMetadataRef = useRef<Record<string, any> | null>(null);

  // ── QR Security Token state ──────────────────────────────────────────────
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [activeQrToken, setActiveQrToken] = useState<string | null>(null);
  const [tokenTimeLeft, setTokenTimeLeft] = useState<number>(0);
  const [scannedStoreName, setScannedStoreName] = useState<string | null>(null);
  const [scannedStoreError, setScannedStoreError] = useState<boolean>(false);

  // ── JWT decoder helper ──────────────────────────────────────────────────────
  function parseQrToken(token: string): { companyId: number; storeId: number; nonce: string; exp: number } | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const parsed = JSON.parse(jsonPayload);
      return {
        companyId: parsed.companyId,
        storeId: parsed.storeId,
        nonce: parsed.nonce,
        exp: parsed.exp
      };
    } catch (e) {
      return null;
    }
  }

  // ── Countdown and status checker for QR token ────────────────────────────
  useEffect(() => {
    let cachedStoreId: number | null = null;

    const checkToken = () => {
      const savedToken = localStorage.getItem('scanned_qr_token');
      const savedTimeStr = localStorage.getItem('scanned_qr_token_time');

      if (!savedToken || !savedTimeStr) {
        setActiveQrToken(null);
        setTokenTimeLeft(0);
        setScannedStoreName(null);
        setScannedStoreError(false);
        return;
      }

      const parsed = parseQrToken(savedToken);
      if (!parsed) {
        localStorage.removeItem('scanned_qr_token');
        localStorage.removeItem('scanned_qr_token_time');
        setActiveQrToken(null);
        setTokenTimeLeft(0);
        setScannedStoreName(null);
        setScannedStoreError(false);
        return;
      }

      const expTime = parsed.exp * 1000;
      const timeLeft = Math.max(0, Math.floor((expTime - Date.now()) / 1000));

      if (timeLeft <= 0) {
        setActiveQrToken(null);
        setTokenTimeLeft(0);
        return;
      }

      setActiveQrToken(savedToken);
      setTokenTimeLeft(timeLeft);

      if (parsed.storeId !== cachedStoreId) {
        cachedStoreId = parsed.storeId;
        import('../../api/stores')
          .then(({ getStore }) => {
            getStore(parsed.storeId)
              .then((s) => {
                setScannedStoreName(s.name);
              })
              .catch(() => {
                setScannedStoreName(`${t('common.store')} #${parsed.storeId}`);
              });
          })
          .catch((error) => {
            if (!recoverFromChunkLoadError(error)) {
              setScannedStoreName(`${t('common.store')} #${parsed.storeId}`);
            }
          });
      }
    };

    checkToken();
    const intervalId = setInterval(checkToken, 1000);
    return () => clearInterval(intervalId);
  }, [user, t]);

  // ── Daily state machine ──────────────────────────────────────────────────
  const [fullDailyState, setFullDailyState] = useState<FullDailyState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);

  // Compute scannedStoreError dynamically based on fullDailyState
  useEffect(() => {
    if (!activeQrToken) {
      setScannedStoreError(false);
      return;
    }
    const parsed = parseQrToken(activeQrToken);
    if (!parsed) {
      setScannedStoreError(false);
      return;
    }

    if (fullDailyState) {
      if (fullDailyState.hasShift && fullDailyState.shiftStoreId) {
        if (fullDailyState.shiftStoreId !== parsed.storeId) {
          setScannedStoreError(true);
        } else {
          setScannedStoreError(false);
        }
      } else {
        setScannedStoreError(false);
      }
    }
  }, [activeQrToken, fullDailyState]);

  const initials = user
    ? `${user.name?.[0] ?? ''}${user.surname ? user.surname[0] : ''}`.toUpperCase()
    : '';

  // ── Load today's state ───────────────────────────────────────────────────
  const loadDailyState = useCallback(async () => {
    if (!user || !['employee', 'store_manager', 'hr', 'area_manager'].includes(user.role)) {
      setStateLoading(false);
      return;
    }
    setStateLoading(true);
    try {
      if (isOnline) {
        const res = await client.get('/attendance/daily-state');
        const data = (res.data?.data ?? res.data) as FullDailyState;
        setFullDailyState(data);
        // Persist server-confirmed state to localStorage so offline mode
        // can restore it accurately if the user loses connectivity.
        if (data && user.id) {
          persistDailyAttendanceState(user.id, {
            ...data.state,
            hasShift: data.hasShift,
            hasLeave: data.hasLeave
          });
        }
      } else {
        // Offline: derive from localStorage (server-confirmed) + IndexedDB queue
        const offlineState = await getTodayOfflineState(user.id);
        setFullDailyState({
          hasShift: offlineState.hasShift,
          hasLeave: offlineState.hasLeave,
          state: offlineState,
        });
      }
    } catch {
      setFullDailyState(null);
    } finally {
      setStateLoading(false);
    }
  }, [user, isOnline, getTodayOfflineState]);

  useEffect(() => {
    void loadDailyState();
  }, [loadDailyState, lastSyncTime]);

  const CLOCK_ACTIONS: { type: EventType; label: string; color: string }[] = [
    { type: 'checkin',     label: t('terminal.checkin'),    color: '#16a34a' },
    { type: 'break_start', label: t('terminal.breakStart'), color: '#d97706' },
    { type: 'break_end',   label: t('terminal.breakEnd'),   color: '#2563eb' },
    { type: 'checkout',    label: t('terminal.checkout'),   color: '#dc2626' },
  ];

  // ── State-machine validation ─────────────────────────────────────────────
  function validateAction(eventType: EventType): boolean {
    if (!fullDailyState) {
      showToast(t('attendance.stateLoading'), 'warning');
      return false;
    }
    if (!fullDailyState.hasShift || fullDailyState.hasLeave) {
      showToast(fullDailyState.hasLeave ? t('attendance.onLeaveToday') : t('attendance.noShiftToday'), 'error');
      return false;
    }

    const { checkedIn, breakStarted, breakEnded, checkedOut } = fullDailyState.state;

    if (checkedOut) {
      showToast(t('attendance.alreadyCheckedOut'), 'error');
      return false;
    }
    if (eventType === 'checkin' && checkedIn) {
      showToast(t('attendance.alreadyCheckedIn'), 'error');
      return false;
    }
    if (eventType === 'break_start' && !checkedIn) {
      showToast(t('attendance.checkInFirst'), 'error');
      return false;
    }
    if (eventType === 'break_start' && breakStarted) {
      showToast(t('attendance.invalidAction'), 'error');
      return false;
    }
    if (eventType === 'break_end' && !breakStarted) {
      showToast(t('attendance.breakStartFirst'), 'error');
      return false;
    }
    if (eventType === 'break_end' && breakEnded) {
      showToast(t('attendance.invalidAction'), 'error');
      return false;
    }
    if (eventType === 'checkout' && !checkedIn) {
      showToast(t('attendance.checkInFirst'), 'error');
      return false;
    }
    if (eventType === 'checkout' && breakStarted && !breakEnded) {
      showToast(t('attendance.mustEndBreakFirst'), 'error');
      return false;
    }
    return true;
  }

  async function handleAction(eventType: EventType) {
    if (actionLoading || stateLoading) return;

    // Frontend state-machine guard
    if (!validateAction(eventType)) return;

    setActionLoading(true);
    setActionMsg(null);

    try {
      if (!fingerprintRef.current) {
        const fp = await getDeviceFingerprint();
        fingerprintRef.current = fp.fingerprint;
        deviceMetadataRef.current = fp.metadata;
      }

      const eventTime = new Date().toISOString();

      if (!isOnline) {
        await enqueue({
          event_type: eventType,
          event_time: eventTime,
          unique_id: user?.uniqueId || undefined,
          user_id: user?.id,
          qr_token: activeQrToken || undefined,
          device_fingerprint: fingerprintRef.current || undefined,
        });
        // Optimistically update local daily state
        setFullDailyState((prev) => {
          if (!prev) return prev;
          const next = { ...prev, state: { ...prev.state } };
          if (eventType === 'checkin') {
            next.state.checkedIn = true;
            next.state.checkedInTime = eventTime;
          }
          if (eventType === 'break_start') {
            next.state.breakStarted = true;
            next.state.breakStartedTime = eventTime;
          }
          if (eventType === 'break_end') {
            next.state.breakEnded = true;
            next.state.breakEndedTime = eventTime;
          }
          if (eventType === 'checkout') {
            next.state.checkedOut = true;
            next.state.checkedOutTime = eventTime;
          }
          // Persist updated state so it survives page reloads
          if (user?.id) {
            persistDailyAttendanceState(user.id, {
              ...next.state,
              hasShift: next.hasShift,
              hasLeave: next.hasLeave,
            });
          }
          return next;
        });
        setActionMsg({ text: t('terminal.saved_offline'), ok: true });
      } else {
        // Online: call recordCheckin using the active QR token!
        if (!activeQrToken) {
          throw new Error(t('attendance.qrTokenMissing'));
        }
        await recordCheckin({
          qrToken: activeQrToken,
          eventType,
          deviceFingerprint: fingerprintRef.current || undefined,
          deviceMetadata: deviceMetadataRef.current || undefined,
        });
        // Update local state to reflect the recorded action
        setFullDailyState((prev) => {
          if (!prev) return prev;
          const next = { ...prev, state: { ...prev.state } };
          if (eventType === 'checkin') {
            next.state.checkedIn = true;
            next.state.checkedInTime = eventTime;
          }
          if (eventType === 'break_start') {
            next.state.breakStarted = true;
            next.state.breakStartedTime = eventTime;
          }
          if (eventType === 'break_end') {
            next.state.breakEnded = true;
            next.state.breakEndedTime = eventTime;
          }
          if (eventType === 'checkout') {
            next.state.checkedOut = true;
            next.state.checkedOutTime = eventTime;
          }
          // Persist updated state so offline mode can read it later
          if (user?.id) {
            persistDailyAttendanceState(user.id, {
              ...next.state,
              hasShift: next.hasShift,
              hasLeave: next.hasLeave,
            });
          }
          return next;
        });
        setActionMsg({ text: t('attendance.successMessage'), ok: true });
        // Increment historyVersion to trigger a real re-fetch of attendance history
        window.setTimeout(() => setHistoryVersion((v) => v + 1), 1500);
      }
    } catch (err: any) {
      const axiosErr = err as {
        response?: {
          data?: {
            error?: string;
            code?: string;
            moduleName?: string;
            shiftStart?: string;
            shiftEnd?: string;
            allowedFrom?: string;
            currentTime?: string;
            storeTimezone?: string;
          };
        };
      };
      const errCode = axiosErr?.response?.data?.code;
      const errText = axiosErr?.response?.data?.error ?? err?.message ?? t('common.error');
      
      let msg = errText;
      if (errCode === 'MODULE_DISABLED' && axiosErr?.response?.data?.moduleName) {
        const mKey = axiosErr.response.data.moduleName;
        const translatedModuleName = t(`nav.${mKey}`, mKey);
        msg = t('errors.MODULE_DISABLED_WITH_NAME', {
          defaultValue: `The module "${translatedModuleName}" is disabled for your role. Please contact the HR manager to enable it.`,
          module: translatedModuleName
        });
      } else if (errCode === 'SHIFT_TOO_EARLY' && axiosErr?.response?.data?.shiftStart) {
        // Times arrive already rendered in the store's timezone, alongside the
        // current time — the employee needs to see both to make sense of a refusal.
        const { shiftStart, allowedFrom, currentTime, storeTimezone } = axiosErr.response.data;
        msg = t('errors.SHIFT_TOO_EARLY_PARAMS', {
          defaultValue: `Your shift starts at ${shiftStart} (${storeTimezone} time) and you can clock in from ${allowedFrom}. It is now ${currentTime}.`,
          shiftStart,
          allowedFrom,
          currentTime,
          storeTimezone
        });
      } else if (errCode === 'SHIFT_ALREADY_ENDED' && axiosErr?.response?.data?.shiftStart) {
        const { shiftStart, shiftEnd, currentTime, storeTimezone } = axiosErr.response.data;
        msg = t('errors.SHIFT_ALREADY_ENDED_PARAMS', {
          defaultValue: `Your shift today (${shiftStart}-${shiftEnd}, ${storeTimezone} time) has already ended. It is now ${currentTime}. Please contact your manager.`,
          shiftStart,
          shiftEnd,
          currentTime,
          storeTimezone
        });
      } else if (errCode) {
        msg = t(`errors.${errCode}`, errText);
      }
      
      setActionMsg({ text: msg, ok: false, code: errCode || 'UNKNOWN' });
    } finally {
      setActionLoading(false);
      window.setTimeout(() => setActionMsg(null), 4000);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    const days = parseInt(filter, 10);
    const dateFrom = formatLocalDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    let alive = true;

    async function load() {
      if (permissions['presenze'] === false) {
        setLoading(false);
        return;
      }
      try {
        if (!fingerprintRef.current) {
          const fp = await getDeviceFingerprint();
          fingerprintRef.current = fp.fingerprint;
          deviceMetadataRef.current = fp.metadata;
        }
        const deviceFingerprint = fingerprintRef.current ?? undefined;
        const res = await listMyAttendanceEvents({ dateFrom, deviceFingerprint });
        if (alive) setEvents(res.events);
      } catch {
        if (alive) setError(t('checkin.noHistory'));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => { alive = false; };
  }, [filter, lastSyncTime, historyVersion, permissions['presenze']]);

  // Group events by date
  const grouped: { date: string; items: AttendanceEvent[] }[] = [];
  if (Array.isArray(events)) {
    for (const ev of events) {
      if (!ev) continue;
      const rawTime = (ev as any).eventTime ?? (ev as any).event_time;
      if (!rawTime) continue;
      
      try {
        const dObj = new Date(rawTime);
        if (isNaN(dObj.getTime())) {
          console.warn('[CheckinPage] Invalid date found for event:', ev);
          continue;
        }
        const date = formatLocalDate(dObj);
        let group = grouped.find((g) => g.date === date);
        if (!group) {
          group = { date, items: [] };
          grouped.push(group);
        }
        group.items.push(ev);
      } catch (err) {
        console.error('[CheckinPage] Crash prevented during grouping:', err);
      }
    }
  }

  const allowedActions = resolveAllowedActions(fullDailyState);

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: isMobile ? '16px 0' : '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header banner with employee identity */}
      <div
        className="pop-in"
        style={{
          background: 'linear-gradient(135deg, #0D2137 0%, #1A3B5C 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(201,151,58,0.20)',
          border: '2px solid rgba(201,151,58,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: '#C9973A',
        }}>
          {initials}
        </div>

        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18, fontWeight: 700, color: '#ffffff', marginBottom: 2,
          }}>
            {user ? `${user.name}${user.surname ? ` ${user.surname}` : ''}` : t('checkin.title')}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}>
            {stateLoading ? t('attendance.stateLoading') : t('checkin.subtitle')}
          </div>
        </div>
      </div>

      {/* Offline / sync status banner */}
      {(!isOnline || isSyncing || queueLength > 0) && (
        <div style={{
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--font-body)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: !isOnline ? 'rgba(220,38,38,0.10)' : 'rgba(37,99,235,0.10)',
          border: `1px solid ${!isOnline ? 'rgba(220,38,38,0.30)' : 'rgba(37,99,235,0.30)'}`,
          color: !isOnline ? '#dc2626' : '#2563eb',
        }}>
          <span style={{ fontSize: 16 }}>{!isOnline ? '📵' : isSyncing ? '🔄' : '⏳'}</span>
          {!isOnline
            ? t('terminal.offline_mode')
            : isSyncing
            ? t('terminal.events_syncing', { count: queueLength })
            : t('terminal.events_pending', { count: queueLength })}
        </div>
      )}

      {/* No-shift / leave warning */}
      {!stateLoading && fullDailyState && (!fullDailyState.hasShift || fullDailyState.hasLeave) && (
        <div style={{
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px', fontSize: 13, fontWeight: 600,
          fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(220,38,38,0.10)',
          border: '1px solid rgba(220,38,38,0.30)',
          color: '#dc2626',
        }}>
          <span style={{ fontSize: 16 }}>🚫</span>
          {fullDailyState.hasLeave ? t('attendance.onLeaveToday') : t('attendance.noShiftToday')}
        </div>
      )}

      {/* Already checked out info */}
      {!stateLoading && fullDailyState?.state.checkedOut && (
        <div style={{
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px', fontSize: 13, fontWeight: 600,
          fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(22,163,74,0.10)',
          border: '1px solid rgba(22,163,74,0.30)',
          color: '#16a34a',
        }}>
          <span style={{ fontSize: 16 }}>✅</span>
          {t('attendance.alreadyCheckedOut')}
        </div>
      )}

      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--accent)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '20px 24px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          fontFamily: 'var(--font-display)', marginBottom: 4,
        }}>
          {t('checkin.actionTypes')}
        </div>

        {/* QR Security Token status banner */}
        <div style={{ marginBottom: 4 }}>
          {!activeQrToken ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '16px 14px',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1.5px dashed var(--border)',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>📱</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                {t('attendance.scanQrTitle', 'Scan Store Terminal QR')}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4, maxWidth: 260 }}>
                Please scan the QR code displayed on the store terminal screen with your device camera to connect.
              </div>
            </div>
          ) : scannedStoreError ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '16px 14px',
              borderRadius: 12,
              background: 'rgba(220, 38, 38, 0.03)',
              border: '1.5px solid rgba(220, 38, 38, 0.25)',
              alignItems: 'center'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                width: '100%',
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span>{t('errors.SHIFT_STORE_MISMATCH', { store: fullDailyState?.shiftStoreName || scannedStoreName, defaultValue: `Store Mismatch` })}</span>
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85, lineHeight: 1.4 }}>
                  This terminal belongs to <strong>{scannedStoreName}</strong>. Your shift is at store <strong>{fullDailyState?.shiftStoreName || `#${fullDailyState?.shiftStoreId}`}</strong>.
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(22, 163, 74, 0.08)',
              border: '1.5px solid rgba(22, 163, 74, 0.35)',
              color: '#16a34a',
              fontSize: 13,
              fontWeight: 600
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🛡️</span>
                <span>{t('attendance.qrTokenActive')}</span>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>
                {t('attendance.connectedToStore', { store: scannedStoreName })} (expires in {tokenTimeLeft}s)
              </div>
            </div>
          )}
        </div>

        {/* Display shift flexibility info */}
        {fullDailyState?.hasShift && !fullDailyState.hasLeave && (
          <div style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            background: 'var(--surface-warm)',
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-light)',
            marginBottom: 4,
            lineHeight: 1.4
          }}>
            ℹ️ <strong>Flexibility Policy:</strong> Check-in is allowed up to 15 minutes before your scheduled shift starting time.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 10px' }}>
          {CLOCK_ACTIONS.map(({ type, label, color }) => {
            const isAllowed = allowedActions.has(type);
            const isDisabled = actionLoading || stateLoading || !isAllowed || !activeQrToken || scannedStoreError;

            const isCheckedIn = type === 'checkin' && fullDailyState?.state.checkedIn;
            const isBreakStart = type === 'break_start' && fullDailyState?.state.breakStarted;
            const isBreakEnd = type === 'break_end' && fullDailyState?.state.breakEnded;
            const isCheckedOut = type === 'checkout' && fullDailyState?.state.checkedOut;

            let recordedTime: string | null = null;
            if (isCheckedIn && fullDailyState?.state.checkedInTime) {
              recordedTime = formatTime(fullDailyState.state.checkedInTime);
            } else if (isBreakStart && fullDailyState?.state.breakStartedTime) {
              recordedTime = formatTime(fullDailyState.state.breakStartedTime);
            } else if (isBreakEnd && fullDailyState?.state.breakEndedTime) {
              recordedTime = formatTime(fullDailyState.state.breakEndedTime);
            } else if (isCheckedOut && fullDailyState?.state.checkedOutTime) {
              recordedTime = formatTime(fullDailyState.state.checkedOutTime);
            }

            const IconComponent = EVENT_ICONS[type] || Clock;

            return (
              <div key={type} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => void handleAction(type)}
                  disabled={isDisabled}
                  style={{
                    width: '100%',
                    padding: '12px 10px',
                    borderRadius: 10,
                    border: `1.5px solid ${color}55`,
                    background: `${color}15`,
                    color,
                    fontSize: 13, fontWeight: 800,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 0.5,
                    opacity: isDisabled ? 0.35 : 1,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <IconComponent size={14} style={{ color }} />
                  <span>{label}</span>
                </button>
                {recordedTime ? (
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center' }}>
                    {t('attendance.recordedAt', { time: recordedTime })}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'transparent', userSelect: 'none' }}>
                    &nbsp;
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {actionLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
            <Spinner size="sm" color="var(--accent)" />
          </div>
        )}

        {actionMsg && (() => {
          let bg = 'rgba(220,38,38,0.10)';
          let border = '1px solid rgba(220,38,38,0.30)';
          let color = '#dc2626';
          let icon = '⚠️';

          if (actionMsg.ok) {
            bg = 'rgba(22,163,74,0.10)';
            border = '1px solid rgba(22,163,74,0.30)';
            color = '#16a34a';
            icon = '✓';
          } else if (actionMsg.code) {
            const c = actionMsg.code.toUpperCase();
            if (c === 'NO_ACTIVE_SHIFT' || c === 'SHIFT_STORE_MISMATCH' || c === 'ON_HOLIDAY' || c === 'SHIFT_NOT_FOUND') {
              bg = 'rgba(59, 130, 246, 0.10)';
              border = '1px solid rgba(59, 130, 246, 0.30)';
              color = '#2563eb';
              icon = '📅';
            } else if (c === 'SHIFT_TOO_EARLY' || c === 'SHIFT_TOO_EARLY_PARAMS') {
              bg = 'rgba(245, 158, 11, 0.10)';
              border = '1px solid rgba(245, 158, 11, 0.35)';
              color = '#d97706';
              icon = '⏰';
            } else if (c.startsWith('MODULE_') || c === 'ROLE_NOT_ELIGIBLE') {
              icon = '🔒';
            }
          }

          return (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-body)',
              background: bg,
              border: border,
              color: color,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <span style={{ lineHeight: 1.4 }}>{actionMsg.text}</span>
            </div>
          );
        })()}
      </div>

      {/* Steps card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--accent)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '20px 24px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          fontFamily: 'var(--font-display)', marginBottom: 4,
        }}>
          {t('checkin.howToUse')}
        </div>

        {STEPS.map(({ icon, key }, i) => (
          <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(201,151,58,0.10)',
              border: '1.5px solid rgba(201,151,58,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>
              {icon}
            </div>
            <div>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--accent)',
                fontFamily: 'var(--font-display)', marginBottom: 2,
              }}>
                {t('checkin.stepLabel', { n: i + 1 })}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {t(`checkin.${key}`)}
              </div>
            </div>
          </div>
        ))}
      </div>



      {/* Attendance history — only shown when presenze module is enabled */}
      {permissions['presenze'] !== false && <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '20px 24px',
      }}>
        {/* Header + filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            fontFamily: 'var(--font-display)',
          }}>
            {t('checkin.myHistory')}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
            {(['7', '15', '30'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: filter === f ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  background: filter === f ? 'var(--primary)' : 'var(--surface)',
                  color: filter === f ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {t(f === '7' ? 'checkin.filterLast7' : f === '15' ? 'checkin.filterLast15' : 'checkin.filterLast30')}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <Spinner size="md" color="var(--accent)" />
          </div>
        )}

        {error && !loading && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '28px 16px',
            textAlign: 'center',
            background: 'var(--surface-warm)',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px dashed rgba(220,38,38,0.25)',
            margin: '12px 0',
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(220,38,38,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626',
              marginBottom: 10,
            }}>
              <AlertCircle size={20} />
            </div>
            <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, maxWidth: 280, lineHeight: 1.4 }}>
              {error}
            </div>
          </div>
        )}

        {!loading && !error && grouped.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '36px 16px',
            textAlign: 'center',
            background: 'var(--surface-warm)',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px dashed var(--border)',
            margin: '12px 0',
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--background)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}>
              <CalendarX size={20} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>
              {t('checkin.noHistoryTitle', 'Nessuna registrazione')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 280, lineHeight: 1.4 }}>
              {t('checkin.noHistory')}
            </div>
          </div>
        )}

        {!loading && !error && grouped.map(({ date, items }) => (
          <div key={date} style={{ marginBottom: 16 }}>
            {/* Date header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              fontFamily: 'var(--font-display)',
              marginBottom: 8,
              paddingBottom: 4,
              borderBottom: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                <span>{formatDate(date)}</span>
              </div>
              {(() => {
                const dayStoreName = items.map(ev => (ev as any).store_name ?? ev.storeName).find(Boolean);
                if (!dayStoreName) return null;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    <Store size={12} style={{ color: 'var(--text-muted)' }} />
                    <span>{dayStoreName}</span>
                  </div>
                );
              })()}
            </div>

            {/* Events for this day */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((ev) => {
                const rawTime = (ev as any).event_time ?? ev.eventTime;
                const rawType = (ev as any).event_type ?? ev.eventType;
                const color = EVENT_COLORS[rawType] ?? '#6b7280';
                const labelKey = rawType === 'checkin' ? 'scan.checkin'
                  : rawType === 'break_start' ? 'scan.breakStart'
                  : rawType === 'break_end' ? 'scan.breakEnd'
                  : 'scan.checkout';
                const IconComponent = EVENT_ICONS[rawType] || Clock;
                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: `${color}0d`,
                    border: `1px solid ${color}28`,
                  }}>
                    <IconComponent size={14} style={{ color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-display)',
                      }}>
                        {t(labelKey)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>
                      {formatTime(rawTime)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}
