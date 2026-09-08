import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useAuth } from '../../context/AuthContext';
import { generateQrToken, QrTokenResponse } from '../../api/attendance';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { type OfflineAttendanceEvent } from '../../utils/indexedDB';
import { getStore } from '../../api/stores';
import { Store } from '../../types';
import { getDeviceStatus, registerDevice, reRegisterDevice } from '../../api/device';
import { getDeviceFingerprint } from '../../utils/deviceFingerprint';
import { useToast } from '../../context/ToastContext';
import { translateApiError } from '../../utils/apiErrors';
import { Spinner } from '../../components/ui';
import { Monitor, RefreshCw, ShieldCheck, AlertOctagon, RefreshCcw, LogIn, LogOut, Coffee, Play, Clock } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { getBrowserTimeZone, getStoreTimezoneTag, resolveStoreTimezone, viewerDiffersFromStore } from '../../utils/timezone';

const REFRESH_AT_SECONDS = 15;

type OfflineEventType = OfflineAttendanceEvent['event_type'];

const OFFLINE_ACTIONS: { type: OfflineEventType; labelKey: string; bg: string; shadow: string }[] = [
  { type: 'checkin', labelKey: 'terminal.offline_checkin', bg: '#16a34a', shadow: 'rgba(22,163,74,0.35)' },
  { type: 'break_start', labelKey: 'terminal.offline_breakStart', bg: '#d97706', shadow: 'rgba(217,119,6,0.35)' },
  { type: 'break_end', labelKey: 'terminal.offline_breakEnd', bg: '#2563eb', shadow: 'rgba(37,99,235,0.35)' },
  { type: 'checkout', labelKey: 'terminal.offline_checkout', bg: '#dc2626', shadow: 'rgba(220,38,38,0.35)' },
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

function getProgressColor(secondsLeft: number, expiresIn: number): string {
  const pct = expiresIn > 0 ? (secondsLeft / expiresIn) * 100 : 0;
  if (pct > 50) return '#22c55e';
  if (pct > 25) return '#f59e0b';
  return '#ef4444';
}

/**
 * Reads the clock in a given zone rather than the tablet's own. This screen is
 * the one an employee stands in front of, and the check-in window behind it is
 * enforced on the store's clock — a tablet carried in from another country, or
 * simply set wrong, must not be able to disagree with it on screen.
 */
function formatTerminalTime(date: Date, hour12: boolean, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  let hours = Number(pick('hour'));
  const minutes = pick('minute');
  const seconds = pick('second');

  if (hour12) {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hoursStr = String(hours).padStart(2, '0');
    return `${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }
  const hoursStr = String(hours).padStart(2, '0');
  return `${hoursStr}:${minutes}:${seconds}`;
}

export default function TerminalPage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const { socket } = useSocket();
  const [recentAction, setRecentAction] = useState<{
    userId: number;
    name: string;
    surname: string;
    eventType: 'checkin' | 'checkout' | 'break_start' | 'break_end';
    timestamp: string;
  } | null>(null);

  // Subscribe to real-time checkin notifications
  useEffect(() => {
    if (!socket) return;
    
    const handleAttendanceAction = (data: any) => {
      setRecentAction(data);
    };

    socket.on('TERMINAL_ATTENDANCE_ACTION', handleAttendanceAction);
    return () => {
      socket.off('TERMINAL_ATTENDANCE_ACTION', handleAttendanceAction);
    };
  }, [socket]);

  // Clear success toast after 3 seconds
  useEffect(() => {
    if (!recentAction) return;
    const timer = setTimeout(() => {
      setRecentAction(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [recentAction]);

  const isTest = (import.meta as any).env?.MODE === 'test';

  const [deviceState, setDeviceState] = useState<{
    checking: boolean;
    isRegistered: boolean;
    isMatched: boolean;
    requiresRegistration: boolean;
    error: string | null;
  }>({
    checking: isTest ? false : true,
    isRegistered: isTest ? true : false,
    isMatched: isTest ? true : false,
    requiresRegistration: false,
    error: null
  });

  // Re-registration credentials modal state
  const [showReRegModal, setShowReRegModal] = useState(false);
  const [reRegEmail, setReRegEmail] = useState('');
  const [reRegPassword, setReRegPassword] = useState('');
  const [reRegLoading, setReRegLoading] = useState(false);
  const [reRegError, setReRegError] = useState<string | null>(null);

  const checkDevice = useCallback(async (active = true) => {
    // Admin, HR, Area Manager, and Store Manager bypass device check.
    // Only 'store_terminal' accounts are verified.
    if (!user || user.role !== 'store_terminal') {
      setDeviceState({ checking: false, isRegistered: true, isMatched: true, requiresRegistration: false, error: null });
      return;
    }
    try {
      const fpResult = await getDeviceFingerprint();
      const status = await getDeviceStatus(fpResult.fingerprint);
      if (active) {
        setDeviceState({
          checking: false,
          isRegistered: status.isDeviceRegistered,
          isMatched: !!status.isDeviceMatched,
          requiresRegistration: status.requiresDeviceRegistration,
          error: null
        });
      }
    } catch (err) {
      console.error('Error during terminal device check:', err);
      if (active) {
        setDeviceState({ checking: false, isRegistered: false, isMatched: false, requiresRegistration: true, error: 'Device check failed' });
      }
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    void checkDevice(active);
    return () => { active = false; };
  }, [checkDevice]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── QR state ──────────────────────────────────────────────────────────────
  const [qrData, setQrData] = useState<QrTokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Offline manual entry state ─────────────────────────────────────────────
  const [offlineCode, setOfflineCode] = useState('');
  const [offlineCodeErr, setOfflineCodeErr] = useState('');
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [offlineQueuedType, setOfflineQueuedType] = useState<OfflineEventType | null>(null);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [time, setTime] = useState(new Date());
  const [store, setStore] = useState<Store | null>(null);

  // ── Hour format state ──────────────────────────────────────────────────────
  const [hour12, setHour12] = useState(() => {
    return localStorage.getItem('terminal_hour12') === 'true';
  });
  useEffect(() => {
    localStorage.setItem('terminal_hour12', String(hour12));
  }, [hour12]);

  const { enqueue, queueLength, isOnline, isSyncing } = useOfflineSync();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storeIdRef = useRef<number | null>(user?.storeId ?? null);
  // Wall-clock references used to compute accurate elapsed time
  // regardless of browser tab throttling.
  const countdownStartRef = useRef<number>(0);
  const countdownTotalRef = useRef<number>(0);

  useEffect(() => { storeIdRef.current = user?.storeId ?? null; }, [user?.storeId]);
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (user?.storeId) getStore(user.storeId).then(setStore).catch(() => { });
  }, [user?.storeId]);

  // ── QR generation ──────────────────────────────────────────────────────────
  const generate = useCallback(async (storeId: number, isAutoRefresh = false) => {
    isAutoRefresh ? setIsRefreshing(true) : setLoading(true);
    setError('');
    try {
      const data = await generateQrToken(storeId);
      setQrData(data);
      setSecondsLeft(data.expiresIn);
      // Record wall-clock start for tab-throttling-safe countdown
      countdownStartRef.current = Date.now();
      countdownTotalRef.current = data.expiresIn;
    } catch {
      setError(t('terminal.qr_error'));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    // Generate QR Code only if device status is checked, registered, and matched
    if (!deviceState.checking && !deviceState.requiresRegistration && deviceState.isMatched && user?.storeId) {
      generate(user.storeId);
    }
  }, [deviceState.checking, deviceState.requiresRegistration, deviceState.isMatched, user?.storeId, generate]);

  useEffect(() => {
    if (!qrData || deviceState.requiresRegistration || !deviceState.isMatched) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      // Compute remaining time from wall-clock to survive tab throttling
      const elapsed = Math.floor((Date.now() - countdownStartRef.current) / 1000);
      const next = Math.max(0, countdownTotalRef.current - elapsed);
      setSecondsLeft(next);
      if (next <= REFRESH_AT_SECONDS) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        const sid = storeIdRef.current;
        if (sid) generate(sid, true);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrData, deviceState.requiresRegistration, deviceState.isMatched]);

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      const fp = await getDeviceFingerprint();
      await registerDevice({ fingerprint: fp.fingerprint, metadata: fp.metadata });
      showToast(t('deviceRegistration.success'), 'success');
      setDeviceState({
        checking: false,
        isRegistered: true,
        isMatched: true,
        requiresRegistration: false,
        error: null
      });
    } catch (err) {
      showToast(translateApiError(err, t) ?? t('deviceRegistration.errorGeneric'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reRegEmail || !reRegPassword) {
      setReRegError(t('terminals.fieldRequired'));
      return;
    }
    setReRegLoading(true);
    setReRegError(null);
    try {
      const fp = await getDeviceFingerprint();
      await reRegisterDevice({
        email: reRegEmail,
        password: reRegPassword,
        fingerprint: fp.fingerprint,
        metadata: fp.metadata
      });
      showToast(t('deviceRegistration.success'), 'success');
      setShowReRegModal(false);
      setReRegEmail('');
      setReRegPassword('');
      setDeviceState({
        checking: false,
        isRegistered: true,
        isMatched: true,
        requiresRegistration: false,
        error: null
      });
    } catch (err) {
      setReRegError(translateApiError(err, t) ?? t('deviceRegistration.errorGeneric'));
    } finally {
      setReRegLoading(false);
    }
  };

  // ── Offline manual entry handler ───────────────────────────────────────────
  function handleOfflineAction(eventType: OfflineEventType) {
    const code = offlineCode.trim();
    if (!code) {
      setOfflineCodeErr(t('terminal.offline_codeRequired'));
      return;
    }
    setOfflineCodeErr('');
    enqueue({
      event_type: eventType,
      unique_id: code,
      event_time: new Date().toISOString(),
    });
    setOfflineQueued(true);
    setOfflineQueuedType(eventType);
    setOfflineCode('');
    // Reset confirmation after 2.5s
    setTimeout(() => {
      setOfflineQueued(false);
      setOfflineQueuedType(null);
    }, 2500);
  }

  // ── Derived display values ─────────────────────────────────────────────────
  if (deviceState.checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--background)' }}>
        <Spinner size="lg" color="var(--accent)" />
      </div>
    );
  }

  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';
  const storeTimezone = resolveStoreTimezone(store?.timezone);
  const viewerOffClock = viewerDiffersFromStore(store?.timezone);
  const timeStr = formatTerminalTime(time, hour12, storeTimezone);
  const dateStr = time.toLocaleDateString(locale, { timeZone: storeTimezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const expiresIn = qrData?.expiresIn ?? 60;
  const progress = qrData ? Math.max(0, (secondsLeft / expiresIn) * 100) : 0;
  const progressColor = getProgressColor(secondsLeft, expiresIn);
  const isExpiringSoon = secondsLeft <= REFRESH_AT_SECONDS && secondsLeft > 0;
  const storeName = store?.name ?? (user?.storeId ? `${t('common.store')} #${user.storeId}` : null);
  const storeCode = store?.code ?? (user?.storeId ? `ID-${user.storeId}` : null);

  const showLockedOverlay = deviceState.requiresRegistration || !deviceState.isMatched;

  return (
    <div style={{
      height: '100dvh',
      background: 'linear-gradient(160deg, #0a1a2e 0%, var(--primary) 60%, #0f2540 100%)',
      display: 'flex',
      flexDirection: 'column',
      color: '#fff',
      fontFamily: 'var(--font-body)',
      overflow: 'hidden',
    }}>

      {/* ── Main Header overlay with back to dashboard / logout ───────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px clamp(20px, 5vw, 60px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.8 }}>
            Terminal
          </span>
          {/* The clock everything on this screen is measured against. Named in
              full, not just as an offset — two shops an hour apart are far easier
              to tell apart by 'Europe/Rome' than by 'UTC+02:00'. */}
          <span
            title={storeTimezone}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.14)',
              padding: '2px 8px',
              borderRadius: 4,
              letterSpacing: 0.4,
              color: 'rgba(255,255,255,0.78)',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            <Clock size={12} />
            <span style={{ fontWeight: 700 }}>{storeTimezone}</span>
            <span style={{ opacity: 0.7 }}>{getStoreTimezoneTag(store?.timezone, time)}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Time Format Toggle */}
          <button
            onClick={() => setHour12(prev => !prev)}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              fontWeight: 800, fontSize: 11.5,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: 'var(--font-display)',
              letterSpacing: 0.5,
              transition: 'all 0.15s'
            }}
          >
            🕒 {hour12 ? '12H' : '24H'}
          </button>

          {user?.role !== 'store_terminal' ? (
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                fontWeight: 600, fontSize: 11.5
              }}
            >
              {t('nav.dashboard')}
            </button>
          ) : (
            <button
              onClick={logout}
              style={{
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171', padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                fontWeight: 600, fontSize: 11.5
              }}
            >
              {t('nav.logout')}
            </button>
          )}
        </div>
      </div>

      {/* ── Main body split: Left (Information / Binding) and Right (QR) ───────────────── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: windowWidth > 900 ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 4vh, 40px) clamp(20px, 5vw, 60px)',
        gap: 'clamp(30px, 6vw, 100px)',
      }}>
        {/* Left Section: Information Panel */}
        <div style={{
          flex: 1.2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(20px, 5vh, 48px)',
          textAlign: 'center',
          height: '100%',
        }}>
          {/* Row 1: Store Info */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {storeCode && (
                <div style={{
                  background: 'rgba(201,151,58,0.14)',
                  border: '1px solid rgba(201,151,58,0.5)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#fcd34d',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-display)',
                  marginBottom: 12,
                }}>
                  {storeCode}
                </div>
              )}
              <div style={{
                fontSize: 'clamp(32px, 4vh, 32px)',
                fontWeight: 800,
                fontFamily: 'var(--font-display)',
                color: 'rgba(255,255,255,0.95)',
                letterSpacing: -0.5,
              }}>
                {storeName ?? t('terminal.title')}
              </div>
            </div>
          </div>

          {/* Device binding left-side blocks */}
          {deviceState.requiresRegistration ? (
            /* Left block: unregistered state setup instructions */
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 420,
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(16px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Monitor size={22} color="#fcd34d" />
                <span style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                  {t('deviceRegistration.terminalTitle')}
                </span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                {t('deviceRegistration.terminalSubtitle')}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative', paddingLeft: 8 }}>
                {/* Timeline vertical connector line */}
                <div style={{
                  position: 'absolute',
                  left: 19,
                  top: 10,
                  bottom: 10,
                  width: 2,
                  background: 'linear-gradient(to bottom, rgba(201,151,58,0.6) 0%, rgba(201,151,58,0.15) 100%)',
                  zIndex: 0
                }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#C9973A',
                    color: '#0A1929',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 0 12px rgba(201,151,58,0.4)'
                  }}>1</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Initialize Browser</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>Ensure your browser fingerprint is ready to be authorized.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#C9973A',
                    color: '#0A1929',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 0 12px rgba(201,151,58,0.4)'
                  }}>2</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Request Registration</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>Click the register button below to start the pairing process.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#C9973A',
                    color: '#0A1929',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 0 12px rgba(201,151,58,0.4)'
                  }}>3</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Secure Authorization</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>The terminal binds to this device, activating the dynamic QR code.</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleRegister}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#C9973A',
                  color: '#0A1929',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'var(--font-display)',
                  boxShadow: '0 4px 14px rgba(201,151,58,0.35)',
                  transition: 'all 0.2s ease',
                  marginTop: 4
                }}
              >
                <Monitor size={16} />
                {t('deviceRegistration.terminalButton')}
              </button>
            </div>

          ) : (deviceState.isRegistered && !deviceState.isMatched) ? (
            /* Left block: mismatched blocked state with re-registration button */
            <div style={{
              background: 'rgba(239,68,68,0.03)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 24,
              padding: 28,
              maxWidth: 420,
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(16px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertOctagon size={22} color="#f87171" />
                <span style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--font-display)', color: '#f87171' }}>
                  {t('deviceReset.terminalBlockedTitle')}
                </span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                {t('deviceReset.terminalBlockedDesc')}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative', paddingLeft: 8 }}>
                {/* Timeline vertical connector line */}
                <div style={{
                  position: 'absolute',
                  left: 19,
                  top: 10,
                  bottom: 10,
                  width: 2,
                  background: 'linear-gradient(to bottom, rgba(239,68,68,0.6) 0%, rgba(239,68,68,0.15) 100%)',
                  zIndex: 0
                }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 0 12px rgba(239,68,68,0.4)'
                  }}>1</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Trigger Re-registration</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>Click the re-register button below to unlock credentials entry.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 0 12px rgba(239,68,68,0.4)'
                  }}>2</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Submit Credentials</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>Authenticate using your store terminal login details.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative', zIndex: 1 }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    boxShadow: '0 0 12px rgba(239,68,68,0.4)'
                  }}>3</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Verify & Bind</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>The old device binding is cleared, and this browser is securely authorized.</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowReRegModal(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 12,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#f87171',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'var(--font-display)',
                  boxShadow: '0 4px 14px rgba(239,68,68,0.15)',
                  transition: 'all 0.2s ease',
                  marginTop: 4
                }}
              >
                <RefreshCcw size={16} />
                {t('deviceReset.reRegisterButton', 'Re-register Terminal')}
              </button>
            </div>

          ) : (
            /* Standard matched state: clock date time */
            <>
              {/* Row 2: Current Time */}
              <div style={{
                fontSize: 'clamp(4.5rem, 18vh, 12rem)',
                fontWeight: 900,
                letterSpacing: '-0.06em',
                fontFamily: 'var(--font-display)',
                lineHeight: 0.85,
                textShadow: '0 8px 40px rgba(0,0,0,0.5)',
                color: '#fff',
              }}>
                {timeStr}
              </div>

              {/* Row 3: Current Date */}
              <div style={{
                fontSize: 'clamp(16px, 3.2vh, 26px)',
                fontWeight: 600,
                opacity: 0.5,
                textTransform: 'capitalize',
                letterSpacing: 1.5,
                fontFamily: 'var(--font-body)',
              }}>
                {dateStr}
              </div>

              {/* The tablet's own clock, echoed small beneath the store clock and
                  only when the two disagree. Same typeface as the big readout so it
                  reads as a second clock rather than a warning — the store clock is
                  the one that governs; this one just explains the difference. */}
              {viewerOffClock && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 10 }}>
                  <div style={{
                    fontSize: 'clamp(9px, 1.4vh, 11px)',
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.38)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {t('terminal.deviceTime', 'This device')} · {getStoreTimezoneTag(getBrowserTimeZone(), time)}
                  </div>
                  <div style={{
                    fontSize: 'clamp(18px, 2.6vh, 26px)',
                    fontWeight: 800,
                    letterSpacing: 1,
                    color: 'rgba(255,255,255,0.5)',
                    fontFamily: 'var(--font-display)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatTerminalTime(time, hour12, getBrowserTimeZone())}
                  </div>
                </div>
              )}

              {/* Authorized checkmark/badge under date */}
              {deviceState.isRegistered && deviceState.isMatched && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(34,197,94,0.18)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  borderRadius: '20px',
                  padding: '4px 12px',
                  fontSize: '12.5px',
                  color: '#86efac',
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                  marginTop: 4,
                }}>
                  <ShieldCheck size={14} />
                  {t('deviceReset.authorized', 'Authorized Terminal')}
                </div>
              )}

              {recentAction && (
                <div
                  className="pop-in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 16,
                    padding: '10px 16px',
                    marginTop: 16,
                    maxWidth: 360,
                    width: '100%',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {/* User Avatar */}
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'rgba(201, 151, 58, 0.2)',
                    border: '1.5px solid rgba(201, 151, 58, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                    color: '#C9973A',
                    flexShrink: 0,
                  }}>
                    {`${recentAction.name?.[0] ?? ''}${recentAction.surname?.[0] ?? ''}`.toUpperCase()}
                  </div>
                  
                  {/* User Details & Action */}
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {recentAction.name} {recentAction.surname}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        {t('terminal.recorded', 'Recorded:')}
                      </span>
                      <span style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: EVENT_COLORS[recentAction.eventType] || '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {(() => {
                          const Icon = EVENT_ICONS[recentAction.eventType] || Clock;
                          const label = t(
                            recentAction.eventType === 'checkin' ? 'scan.checkin'
                            : recentAction.eventType === 'break_start' ? 'scan.breakStart'
                            : recentAction.eventType === 'break_end' ? 'scan.breakEnd'
                            : 'scan.checkout'
                          );
                          return (
                            <>
                              <Icon size={12} />
                              <span>{label}</span>
                            </>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Section: QR code */}
        <div style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
          {!user?.storeId ? (
            /* No store assigned */
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding: '48px 32px',
              textAlign: 'center',
              maxWidth: 420,
              width: '100%',
              border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
              <div style={{ fontSize: 16, opacity: 0.7, lineHeight: 1.5 }}>
                {t('terminal.qr_no_store')}
              </div>
            </div>

          ) : !isOnline ? (
            /* ── Offline manual entry panel ─────────────────────────────────── */
            <div style={{
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 24,
              padding: 'clamp(16px, 4vh, 32px) clamp(16px, 4vw, 24px)',
              width: '100%',
              maxWidth: 440,
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(220,38,38,0.35)',
              borderTop: '3px solid #ef4444',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'clamp(10px, 3vh, 20px)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#fca5a5',
                  marginBottom: 6,
                }}>
                  {t('terminal.offline_title')}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5, maxWidth: 340 }}>
                  {t('terminal.offline_subtitle')}
                </div>
              </div>

              {/* Success flash */}
              {offlineQueued && offlineQueuedType && (
                <div style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.35)',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#86efac',
                }}>
                  ✓ {t('terminal.offline_queued')}
                </div>
              )}

              {/* Employee code input */}
              {!offlineQueued && (
                <>
                  <div style={{ width: '100%' }}>
                    <label style={{
                      display: 'block',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      opacity: 0.6,
                      marginBottom: 8,
                    }}>
                      {t('terminal.uniqueIdLabel')}
                    </label>
                    <input
                      type="text"
                      value={offlineCode}
                      onChange={(e) => {
                        setOfflineCode(e.target.value);
                        if (offlineCodeErr) setOfflineCodeErr('');
                      }}
                      placeholder={t('terminal.uniqueIdPlaceholder')}
                      autoComplete="off"
                      autoCapitalize="characters"
                      style={{
                        width: '100%',
                        padding: '13px 16px',
                        borderRadius: 12,
                        border: `1.5px solid ${offlineCodeErr ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 1,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,151,58,0.7)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = offlineCodeErr ? '#ef4444' : 'rgba(255,255,255,0.2)'; }}
                    />
                    {offlineCodeErr && (
                      <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 5 }}>
                        {offlineCodeErr}
                      </div>
                    )}
                  </div>

                  {/* 4 action buttons */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    width: '100%',
                  }}>
                    {OFFLINE_ACTIONS.map(({ type, labelKey, bg, shadow }) => (
                      <button
                        key={type}
                        onClick={() => handleOfflineAction(type)}
                        style={{
                          padding: 'clamp(14px, 3.5vh, 22px) 8px',
                          borderRadius: 16,
                          border: 'none',
                          background: bg,
                          color: '#fff',
                          fontWeight: 900,
                          fontSize: 13,
                          cursor: 'pointer',
                          boxShadow: `0 6px 20px ${shadow}`,
                          letterSpacing: 0.8,
                          fontFamily: 'var(--font-display)',
                          textTransform: 'uppercase',
                          transition: 'transform 0.1s ease, opacity 0.15s',
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Status info subtle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                color: '#fca5a5',
                opacity: 0.7,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                {t('terminal.offline_mode')}
              </div>
            </div>

          ) : (
            /* ── QR code panel (online) ──────────────────────────────────────── */
            <div style={{
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 32,
              padding: 'clamp(20px, 4vh, 32px)',
              width: '100%',
              maxWidth: 'clamp(320px, 75vh, 440px)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderTop: `4px solid ${isExpiringSoon ? '#ef4444' : 'var(--accent)'}`,
              transition: 'border-top-color 0.4s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'clamp(12px, 2.5vh, 24px)',
              boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
              position: 'relative'
            }}>

              {/* Instruction */}
              <div style={{
                fontSize: 'clamp(10px, 1.8vh, 12px)',
                fontWeight: 800,
                letterSpacing: 2,
                textTransform: 'uppercase',
                opacity: 0.4,
                textAlign: 'center',
              }}>
                {t('terminal.qr_instruction')}
              </div>

              {/* QR code — Balanced size */}
              <div style={{
                width: '100%',
                aspectRatio: '1',
                padding: 'clamp(12px, 2.5vh, 24px)',
                background: '#ffffff',
                borderRadius: 24,
                boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
                lineHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                {/* Low opacity container for QR Code when not registered/matched */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: showLockedOverlay ? 0.12 : isRefreshing ? 0.25 : 1,
                  transition: 'opacity 0.3s ease'
                }}>
                  {loading && !qrData ? (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(90deg, #f0f4f8 25%, #e8eef5 50%, #f0f4f8 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s infinite',
                      borderRadius: 12,
                    }}>
                      <span style={{ color: '#94a3b8', fontSize: 13, fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
                        {t('terminal.qr_generating')}
                      </span>
                    </div>
                  ) : error && !qrData ? (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 14,
                      padding: '0 16px',
                      boxSizing: 'border-box',
                    }}>
                      <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
                        {error}
                      </div>
                      <button
                        onClick={() => user?.storeId && generate(user.storeId)}
                        style={{
                          padding: '9px 20px',
                          borderRadius: 8,
                          border: '1px solid rgba(201,151,58,0.5)',
                          background: 'rgba(201,151,58,0.12)',
                          color: '#92400e',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {t('terminal.qr_retry')}
                      </button>
                    </div>
                  ) : qrData ? (
                    <QRCode
                      value={`${window.location.origin}/presenze/scan?token=${encodeURIComponent(qrData.token)}`}
                      style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '100%' }}
                      size={512}
                      viewBox="0 0 256 256"
                      fgColor="#0D2137"
                      bgColor="#ffffff"
                      level="L"
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>QR not ready</span>
                    </div>
                  )}
                </div>

                {/* Locked overlay text (as sibling with full opacity!) */}
                {showLockedOverlay && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.93)',
                    borderRadius: 24,
                    color: '#0f172a',
                    fontWeight: 800,
                    fontSize: '15px',
                    fontFamily: 'var(--font-display)',
                    textAlign: 'center',
                    padding: '24px',
                    gap: 12,
                    zIndex: 10,
                  }}>
                    <div style={{
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)'
                    }}>
                      🔒
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 900, color: '#1e293b' }}>
                      Authorization Required
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b', maxWidth: 220, lineHeight: 1.4 }}>
                      Please register or re-register the terminal to view the QR Code
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar + countdown (Only shown if matched & registered) */}
              {qrData && !showLockedOverlay && (
                <div style={{ width: '100%' }}>
                  <div style={{
                    height: 6,
                    background: 'rgba(255,255,255,0.10)',
                    borderRadius: 99,
                    overflow: 'hidden',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: progressColor,
                      borderRadius: 99,
                      transition: 'width 1s linear, background 0.4s ease',
                      boxShadow: `0 0 10px ${progressColor}80`,
                    }} />
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 'clamp(11px, 2vh, 14px)',
                  }}>
                    <span style={{ opacity: 0.4, fontWeight: 700, letterSpacing: 0.5 }}>
                      {isRefreshing ? '···' : `${secondsLeft}s`}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isSyncing ? '#3b82f6' : queueLength > 0 ? '#f59e0b' : '#22c55e',
                      }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: isSyncing ? '#93c5fd' : queueLength > 0 ? '#fcd34d' : '#86efac' }}>
                        {isSyncing
                          ? t('terminal.events_syncing', { count: queueLength })
                          : queueLength > 0
                            ? t('terminal.events_pending', { count: queueLength })
                            : 'ONLINE'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Re-registration credentials modal ───────────────────────────────── */}
      {showReRegModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10, 26, 46, 0.85)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <form
            onSubmit={handleReRegisterSubmit}
            style={{
              width: '100%',
              maxWidth: 400,
              background: '#0D2137',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              color: '#fff',
              fontFamily: 'var(--font-body)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--font-display)' }}>
                {t('deviceReset.confirmTitle')}
              </span>
              <button
                type="button"
                onClick={() => { setShowReRegModal(false); setReRegError(null); }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            </div>

            {reRegError && (
              <div style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12.5,
                color: '#fca5a5'
              }}>
                {reRegError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.6 }}>
                {t('terminals.emailLabel')}
              </label>
              <input
                type="email"
                required
                value={reRegEmail}
                onChange={(e) => setReRegEmail(e.target.value)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.6 }}>
                {t('terminals.passwordLabel')}
              </label>
              <input
                type="password"
                required
                value={reRegPassword}
                onChange={(e) => setReRegPassword(e.target.value)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => { setShowReRegModal(false); setReRegError(null); }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)'
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={reRegLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#C9973A',
                  color: '#0A1929',
                  fontWeight: 800,
                  cursor: reRegLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-display)'
                }}
              >
                {reRegLoading ? '...' : t('common.confirm')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
