import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { recordCheckin, EventType } from '../../api/attendance';
import { getDeviceFingerprint } from '../../utils/deviceFingerprint';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { useToast } from '../../context/ToastContext';
import client from '../../api/client';
import { persistDailyAttendanceState } from '../../utils/indexedDB';
import { getStore } from '../../api/stores';

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

// ── Event definitions ────────────────────────────────────────────────────────
const EVENTS: { type: EventType; labelKey: string; bg: string; shadow: string }[] = [
  { type: 'checkin',     labelKey: 'scan.checkin',    bg: '#16a34a', shadow: 'rgba(22,163,74,0.40)' },
  { type: 'break_start', labelKey: 'scan.breakStart', bg: '#d97706', shadow: 'rgba(217,119,6,0.40)' },
  { type: 'break_end',   labelKey: 'scan.breakEnd',   bg: '#2563eb', shadow: 'rgba(37,99,235,0.40)' },
  { type: 'checkout',    labelKey: 'scan.checkout',   bg: '#dc2626', shadow: 'rgba(220,38,38,0.40)' },
];

type Stage = 'ready' | 'loading' | 'success' | 'error';

interface DailyState {
  hasShift: boolean;
  hasLeave: boolean;
  shiftStoreId?: number;
  shiftStoreName?: string;
  state: {
    checkedIn: boolean;
    checkedInTime?: string | null;
    breakStarted: boolean;
    breakStartedTime?: string | null;
    breakEnded: boolean;
    breakEndedTime?: string | null;
    checkedOut: boolean;
    checkedOutTime?: string | null;
  };
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Helper ──────────────────────────────────────────────────────────────────
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Derive which buttons should be enabled based on today's attendance state.
 */
function resolveAllowedActions(daily: DailyState): Set<EventType> {
  const allowed = new Set<EventType>();
  if (!daily.hasShift || daily.hasLeave) return allowed; // no shift or on leave → nothing

  const { checkedIn, breakStarted, breakEnded, checkedOut } = daily.state;

  if (checkedOut) return allowed; // already checked out → nothing

  if (!checkedIn) {
    allowed.add('checkin');
    return allowed;
  }

  // Checked in
  if (breakStarted && !breakEnded) {
    // On break → only break_end allowed
    allowed.add('break_end');
    return allowed;
  }

  // Not on break (either never started or break ended)
  if (!breakStarted || breakEnded) {
    if (!breakStarted) allowed.add('break_start'); // can still start break if not done
    allowed.add('checkout');
  }

  return allowed;
}

function getErrorTheme(code: string | null) {
  if (!code) return { bg: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.45)', color: '#fca5a5', icon: '⚠️' };
  
  const c = code.toUpperCase();
  if (c === 'NO_ACTIVE_SHIFT' || c === 'SHIFT_STORE_MISMATCH' || c === 'ON_HOLIDAY' || c === 'SHIFT_NOT_FOUND') {
    return {
      bg: 'rgba(59, 130, 246, 0.12)',
      border: '1px solid rgba(59, 130, 246, 0.45)',
      color: '#93c5fd',
      icon: '📅'
    };
  }
  if (c === 'SHIFT_TOO_EARLY' || c === 'SHIFT_TOO_EARLY_PARAMS') {
    return {
      bg: 'rgba(245, 158, 11, 0.12)',
      border: '1px solid rgba(245, 158, 11, 0.45)',
      color: '#fcd34d',
      icon: '⏰'
    };
  }
  // Default to Red for module disabled and other errors
  return {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.45)',
    color: '#fca5a5',
    icon: c.startsWith('MODULE_') || c === 'ROLE_NOT_ELIGIBLE' ? '🔒' : '⚠️'
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ScanPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [stage, setStage]           = useState<Stage>('ready');
  const [tappedType, setTappedType] = useState<EventType | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [clock, setClock]           = useState(() => new Date());
  const fingerprintRef = useRef<string | null>(null);
  const deviceMetadataRef = useRef<Record<string, any> | null>(null);

  // ── Daily state machine ──────────────────────────────────────────────────
  const [dailyState, setDailyState] = useState<DailyState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);

  const { enqueue, isOnline, getTodayOfflineState } = useOfflineSync();

  const token = params.get('token') ?? '';
  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';

  // ── QR Token countdown and store resolution ──────────────────────────────
  const [tokenTimeLeft, setTokenTimeLeft] = useState<number>(0);
  const [scannedStoreName, setScannedStoreName] = useState<string | null>(null);
  const [scannedStoreError, setScannedStoreError] = useState<boolean>(false);

  useEffect(() => {
    if (!token) return;

    // Save token to localStorage for attendance module bypass use
    localStorage.setItem('scanned_qr_token', token);
    localStorage.setItem('scanned_qr_token_time', Date.now().toString());

    const parsed = parseQrToken(token);
    if (!parsed) {
      setStage('error');
      setLastErrorCode('INVALID_QR_TOKEN');
      setErrorMsg(t('scan.invalidQrCode'));
      return;
    }

    // Load store name
    getStore(parsed.storeId)
      .then((s) => {
        setScannedStoreName(s.name);
      })
      .catch(() => {
        setScannedStoreName(`${t('common.store')} #${parsed.storeId}`);
      });

    // Countdown interval
    const intervalId = setInterval(() => {
      const expTime = parsed.exp * 1000;
      const timeLeft = Math.max(0, Math.floor((expTime - Date.now()) / 1000));
      setTokenTimeLeft(timeLeft);

      if (timeLeft <= 0) {
        clearInterval(intervalId);
        setStage('error');
        setLastErrorCode('INVALID_QR_TOKEN');
        setErrorMsg(t('errors.INVALID_QR_TOKEN', 'QR code invalid or expired. Please scan again.'));
      }
    }, 1000);

    // Initial check
    const expTime = parsed.exp * 1000;
    const initialTimeLeft = Math.max(0, Math.floor((expTime - Date.now()) / 1000));
    setTokenTimeLeft(initialTimeLeft);
    if (initialTimeLeft <= 0) {
      setStage('error');
      setLastErrorCode('INVALID_QR_TOKEN');
      setErrorMsg(t('errors.INVALID_QR_TOKEN', 'QR code invalid or expired. Please scan again.'));
    }

    return () => clearInterval(intervalId);
  }, [token, t]);

  // Compute store mismatch dynamically when dailyState is loaded
  useEffect(() => {
    if (!token) return;
    const parsed = parseQrToken(token);
    if (!parsed) return;

    if (dailyState) {
      if (dailyState.hasShift && dailyState.shiftStoreId) {
        if (dailyState.shiftStoreId !== parsed.storeId) {
          setScannedStoreError(true);
        } else {
          setScannedStoreError(false);
        }
      } else {
        setScannedStoreError(false);
      }
    }
  }, [token, dailyState]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user || !['employee', 'store_manager', 'hr', 'area_manager'].includes(user.role)) return;
    if (!token) return;
    if (user.requiresDeviceRegistration === true) {
      const next = encodeURIComponent('/presenze/scan' + (token ? `?token=${token}` : ''));
      navigate(`/device/register?next=${next}`, { replace: true });
    }
  }, [user, token, navigate]);

  // ── Load today's attendance state ────────────────────────────────────────
  const loadDailyState = useCallback(async () => {
    if (!user || !['employee', 'store_manager', 'hr', 'area_manager'].includes(user.role)) {
      setStateLoading(false);
      return;
    }
    setStateLoading(true);
    try {
      if (isOnline) {
        const res = await client.get('/attendance/daily-state');
        const data = (res.data?.data ?? res.data) as DailyState;
        setDailyState(data);
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
        setDailyState({
          hasShift: offlineState.hasShift,
          hasLeave: offlineState.hasLeave,
          state: offlineState,
        });
      }
    } catch {
      // On error, fall back to a permissive state that lets checkin proceed
      // Backend enforces validation so this is safe
      setDailyState({
        hasShift: true,
        hasLeave: false,
        state: { checkedIn: false, breakStarted: false, breakEnded: false, checkedOut: false },
      });
    } finally {
      setStateLoading(false);
    }
  }, [user, isOnline, getTodayOfflineState]);

  useEffect(() => {
    void loadDailyState();
  }, [loadDailyState]);

  // ── Non-employee role guard ────────────────────────────────────────────────
  if (user && !['employee', 'store_manager', 'hr', 'area_manager'].includes(user.role)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32, textAlign: 'center', gap: 20,
        background: 'var(--background)',
      }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
        }}>
          {t('scan.employeeOnly')}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 320 }}>
          {t('scan.employeeOnlyHint')}
        </div>
        <button
          onClick={() => navigate('/')}
          className="btn btn-primary"
          style={{ padding: '11px 28px', borderRadius: 10, marginTop: 8 }}
        >
          {t('common.backToHome')}
        </button>
      </div>
    );
  }

  // ── No token in URL ────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32, textAlign: 'center', gap: 20,
        background: 'var(--background)',
      }}>
        <div style={{ fontSize: 56 }}>📷</div>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
        }}>
          {t('scan.noToken')}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 320 }}>
          {t('scan.noTokenHint')}
        </div>
        <button
          onClick={() => navigate('/')}
          className="btn btn-primary"
          data-testid="scan-back-home"
          style={{ padding: '11px 28px', borderRadius: 10, marginTop: 8 }}
        >
          {t('common.backToHome')}
        </button>
      </div>
    );
  }

  // ── Compute allowed actions from today's state ───────────────────────────
  const allowedActions = dailyState ? resolveAllowedActions(dailyState) : new Set<EventType>();

  // ── Validate action before proceeding ────────────────────────────────────
  function validateAction(eventType: EventType): boolean {
    if (!dailyState) return false;

    if (!dailyState.hasShift || dailyState.hasLeave) {
      showToast(dailyState.hasLeave ? t('attendance.onLeaveToday') : t('attendance.noShiftToday'), 'error');
      return false;
    }

    const { checkedIn, breakStarted, breakEnded, checkedOut } = dailyState.state;

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

  // ── API call or Offline Queue ─────────────────────────────────────────────
  async function handleAction(eventType: EventType) {
    if (stage === 'loading') return;
    if (stateLoading) return;

    // State-machine validation (frontend guard)
    if (!validateAction(eventType)) return;

    setTappedType(eventType);
    setStage('loading');
    setErrorMsg('');

    try {
      const eventTime = new Date().toISOString();
      const client_uuid = generateUUID();

      if (!fingerprintRef.current) {
        const fp = await getDeviceFingerprint();
        fingerprintRef.current = fp.fingerprint;
        deviceMetadataRef.current = fp.metadata;
      }

      // If offline, skip the API call and go straight to local queue
      if (!navigator.onLine) {
        throw new Error('OFFLINE_MODE');
      }

      await recordCheckin({ 
        qrToken: token, 
        eventType, 
        deviceFingerprint: fingerprintRef.current ?? undefined,
        deviceMetadata: deviceMetadataRef.current ?? undefined,
      });
      
      setStage('success');
    } catch (err: any) {
      console.error('Attendance attempt error:', err);
      
      const isNetworkError = 
        err.message === 'OFFLINE_MODE' || 
        !navigator.onLine || 
        err.code === 'ERR_NETWORK' ||
        err.message?.toLowerCase().includes('network error') ||
        err instanceof TypeError;

      if (isNetworkError) {
        // Handle offline or network failure by enqueuing
        try {
          const eventTime = new Date().toISOString();
          const client_uuid = generateUUID();

          await enqueue({
            client_uuid,
            event_type: eventType,
            event_time: eventTime,
            qr_token: token,
            user_id: user?.id,
            unique_id: user?.uniqueId || undefined,
            device_fingerprint: fingerprintRef.current || undefined,
          });

          // Optimistically update local daily state
          setDailyState((prev) => {
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
            // Persist updated state so it survives page reloads and offline transitions
            if (user?.id) {
              persistDailyAttendanceState(user.id, {
                ...next.state,
                hasShift: next.hasShift,
                hasLeave: next.hasLeave,
              });
            }
            return next;
          });

          setStage('success');
        } catch (enqueueErr) {
          console.error('Offline enqueue failed:', enqueueErr);
          setStage('error');
          setErrorMsg(t('common.error'));
        }
        return;
      }

      const axiosErr = err as {
        response?: {
          data?: {
            error?: string;
            code?: string;
            moduleName?: string;
            shiftStart?: string;
            allowedFrom?: string;
          };
        };
      };
      setStage('error');
      const errCode = axiosErr?.response?.data?.code;
      setLastErrorCode(errCode || 'UNKNOWN');
      const errText = axiosErr?.response?.data?.error ?? t('common.error');
      
      if (errCode === 'MODULE_DISABLED' && axiosErr?.response?.data?.moduleName) {
        const mKey = axiosErr.response.data.moduleName;
        const translatedModuleName = t(`nav.${mKey}`, mKey);
        setErrorMsg(t('errors.MODULE_DISABLED_WITH_NAME', {
          defaultValue: `The module "${translatedModuleName}" is disabled for your role in the selected company. Please contact the HR manager to enable it.`,
          module: translatedModuleName
        }));
      } else if (errCode === 'SHIFT_TOO_EARLY' && axiosErr?.response?.data?.shiftStart) {
        const { shiftStart, allowedFrom } = axiosErr.response.data;
        setErrorMsg(t('errors.SHIFT_TOO_EARLY_PARAMS', {
          defaultValue: `Your shift for today starts at ${shiftStart} and you can check in from ${allowedFrom}. Please try again later.`,
          shiftStart,
          allowedFrom
        }));
      } else {
        setErrorMsg(errCode ? t(`errors.${errCode}`, errText) : errText);
      }
    }
  }

  // ── Success fullscreen ─────────────────────────────────────────────────────
  if (stage === 'success' && tappedType) {
    const ev = EVENTS.find((e) => e.type === tappedType)!;
    const timeStr = clock.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: ev.bg, padding: 32, gap: 16,
        fontFamily: 'var(--font-display)',
      }}>
        <div style={{ fontSize: 88, lineHeight: 1, color: '#fff' }}>✓</div>
        <div style={{
          fontSize: 38, fontWeight: 900, color: '#fff',
          letterSpacing: -1, textAlign: 'center',
        }}>
          {t(ev.labelKey)}
        </div>
        <div style={{
          fontSize: 22, color: 'rgba(255,255,255,0.88)',
          fontWeight: 600, marginTop: 4,
        }}>
          {user?.name} {user?.surname}
        </div>
        <div style={{
          fontSize: 36, fontWeight: 800,
          color: 'rgba(255,255,255,0.92)', marginTop: 6,
          letterSpacing: -1,
        }}>
          {timeStr}
        </div>
        <button
          onClick={() => navigate('/', { replace: true })}
          data-testid="scan-back-to-actions"
          style={{
            marginTop: 28,
            padding: '14px 40px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.18)',
            border: '2px solid rgba(255,255,255,0.45)',
            color: '#fff', fontWeight: 700, fontSize: 16,
            cursor: 'pointer', fontFamily: 'var(--font-display)',
            letterSpacing: 0.3,
          }}
        >
          {t('common.backToHome')}
        </button>
      </div>
    );
  }

  // ── Main scan page ─────────────────────────────────────────────────────────
  const timeStr = clock.toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '28px 20px', gap: 28,
      background: 'linear-gradient(160deg, #0D2137 0%, #1A3B5C 100%)',
    }}>

      {/* Identity + clock */}
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <div style={{
          fontSize: 46, fontWeight: 800, letterSpacing: -2,
          fontFamily: 'var(--font-display)', lineHeight: 1,
        }}>
          {timeStr}
        </div>
        <div style={{
          fontSize: 22, fontWeight: 700, marginTop: 12,
          color: 'rgba(255,255,255,0.92)',
          fontFamily: 'var(--font-display)',
        }}>
          {user?.name} {user?.surname}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.50)', marginTop: 5 }}>
          {stateLoading
            ? t('attendance.stateLoading')
            : t('scan.chooseAction')}
        </div>
      </div>

      {/* Messages Group Container (small gap between banners) */}
      {(scannedStoreName || stage === 'error' || (!stateLoading && dailyState && !dailyState.hasShift) || (!stateLoading && dailyState?.state.checkedOut)) && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          width: '100%',
          alignItems: 'center',
        }}>
          {/* Scanned store and token expiration */}
          {scannedStoreName && tokenTimeLeft > 0 && lastErrorCode !== 'INVALID_QR_TOKEN' && (
            <div style={{
              padding: '12px 20px',
              borderRadius: 10,
              background: scannedStoreError ? 'rgba(239,68,68,0.12)' : 'rgba(22,163,74,0.12)',
              border: `1px solid ${scannedStoreError ? 'rgba(239,68,68,0.45)' : 'rgba(22,163,74,0.45)'}`,
              color: scannedStoreError ? '#fca5a5' : '#86efac',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              textAlign: 'center',
              maxWidth: 400,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>{scannedStoreError ? '⚠️' : '🛡️'}</span>
                <span>
                  {scannedStoreError 
                    ? t('errors.SHIFT_STORE_MISMATCH', { store: dailyState?.shiftStoreName || scannedStoreName, defaultValue: `You have a shift scheduled today at another store, not at this store.` })
                    : t('attendance.qrTokenActiveWithStore', { store: scannedStoreName, seconds: tokenTimeLeft })}
                </span>
              </div>
              {scannedStoreError && user && (
                <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 500, lineHeight: 1.4 }}>
                  This terminal belongs to <strong>{scannedStoreName}</strong>. Your scheduled shift is at store <strong>{dailyState?.shiftStoreName || `#${dailyState?.shiftStoreId}`}</strong>.
                </div>
              )}
            </div>
          )}

          {/* No-shift banner */}
          {!stateLoading && dailyState && (!dailyState.hasShift || dailyState.hasLeave) && (
            <div style={{
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.45)',
              color: '#fca5a5',
              fontSize: 14, fontWeight: 600,
              maxWidth: 400, width: '100%', textAlign: 'center',
            }}>
              {dailyState.hasLeave ? t('attendance.onLeaveToday') : t('attendance.noShiftToday')}
            </div>
          )}

          {/* Checkout done banner */}
          {!stateLoading && dailyState?.state.checkedOut && (
            <div style={{
              padding: '12px 20px',
              borderRadius: 10,
              background: 'rgba(22,163,74,0.15)',
              border: '1px solid rgba(22,163,74,0.45)',
              color: '#86efac',
              fontSize: 14, fontWeight: 600,
              maxWidth: 400, width: '100%', textAlign: 'center',
            }}>
              {t('attendance.alreadyCheckedOut')}
            </div>
          )}

          {/* Error banner */}
          {stage === 'error' && (() => {
            const theme = getErrorTheme(lastErrorCode);
            return (
              <div style={{
                padding: '12px 20px',
                borderRadius: 10,
                background: theme.bg,
                border: theme.border,
                color: theme.color,
                fontSize: 14, fontWeight: 600,
                maxWidth: 400, width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{theme.icon}</span>
                <span style={{ textAlign: 'left', lineHeight: 1.4 }}>{errorMsg}</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* 4 large action buttons */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 14, width: '100%', maxWidth: 400,
      }}>
        {EVENTS.map(({ type, labelKey, bg, shadow }) => {
          const isActive  = tappedType === type && stage === 'loading';
          const isDimmed  = stage === 'loading' && tappedType !== type;
          const isAllowed = allowedActions.has(type);
          const isDisabled = stage === 'loading' || stateLoading || !isAllowed || scannedStoreError;

          const isCheckedIn = type === 'checkin' && dailyState?.state.checkedIn;
          const isBreakStart = type === 'break_start' && dailyState?.state.breakStarted;
          const isBreakEnd = type === 'break_end' && dailyState?.state.breakEnded;
          const isCheckedOut = type === 'checkout' && dailyState?.state.checkedOut;

          let recordedTime: string | null = null;
          if (isCheckedIn && dailyState?.state.checkedInTime) {
            recordedTime = formatTime(dailyState.state.checkedInTime);
          } else if (isBreakStart && dailyState?.state.breakStartedTime) {
            recordedTime = formatTime(dailyState.state.breakStartedTime);
          } else if (isBreakEnd && dailyState?.state.breakEndedTime) {
            recordedTime = formatTime(dailyState.state.breakEndedTime);
          } else if (isCheckedOut && dailyState?.state.checkedOutTime) {
            recordedTime = formatTime(dailyState.state.checkedOutTime);
          }

          return (
            <button
              key={type}
              onClick={() => void handleAction(type)}
              disabled={isDisabled}
              data-testid={`scan-action-${type}`}
              style={{
                padding: '28px 12px',
                borderRadius: 20,
                border: 'none',
                background: isActive ? '#475569' : bg,
                color: '#fff',
                fontWeight: 900,
                fontSize: 15,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                boxShadow: isActive || isDimmed || !isAllowed ? 'none' : `0 8px 24px ${shadow}`,
                transition: 'transform 0.12s ease, opacity 0.15s, box-shadow 0.15s',
                transform: isActive ? 'scale(0.95)' : 'scale(1)',
                opacity: (isDimmed || !isAllowed) ? 0.35 : 1,
                letterSpacing: 0.8,
                fontFamily: 'var(--font-display)',
                lineHeight: 1.3,
                textTransform: 'uppercase' as const,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
              }}
            >
              <span>{isActive ? '...' : t(labelKey)}</span>
              {recordedTime && (
                <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85, textTransform: 'none' }}>
                  {t('attendance.recordedAt', { time: recordedTime })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
