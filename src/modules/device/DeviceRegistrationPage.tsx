import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Monitor, Key, Eye, EyeOff, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { registerDevice, checkDeviceRegistrationApi, CheckDeviceRegistrationResponse } from '../../api/device';
import { getDeviceFingerprint } from '../../utils/deviceFingerprint';
import { translateApiError } from '../../utils/apiErrors';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/** Returns a safe in-app path from `?next=` or null (blocks open redirects). */
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
    return decoded;
  } catch {
    return null;
  }
}

export default function DeviceRegistrationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshUser, logout } = useAuth();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for check device registration
  const [showLookupForm, setShowLookupForm] = useState(false);
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lookupSubmitting, setLookupSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<CheckDeviceRegistrationResponse | null>(null);

  const requiresRegistration = (user?.role === 'employee' || user?.role === 'store_terminal' || user?.role === 'store_manager' || user?.role === 'hr' || user?.role === 'area_manager') && user?.requiresDeviceRegistration === true;

  useEffect(() => {
    // If the device is already registered, avoid showing the registration screen.
    if (!user) return;
    if (user.role !== 'employee' && user.role !== 'store_terminal' && user.role !== 'store_manager' && user.role !== 'hr' && user.role !== 'area_manager') {
      navigate('/', { replace: true });
      return;
    }
    if (!requiresRegistration) {
      const dest = safeNextPath(searchParams.get('next')) ?? '/';
      navigate(dest, { replace: true });
    }
  }, [user, requiresRegistration, navigate, searchParams]);

  const handleRegister = async () => {
    if (!user || (user.role !== 'employee' && user.role !== 'store_terminal' && user.role !== 'store_manager' && user.role !== 'hr' && user.role !== 'area_manager')) return;
    setSubmitting(true);
    setError(null);
    try {
      const fp = await getDeviceFingerprint();
      await registerDevice({ fingerprint: fp.fingerprint, metadata: fp.metadata });
      await refreshUser();
      
      showToast(t('deviceRegistration.success'), 'success');
      
      const dest = safeNextPath(searchParams.get('next')) ?? '/';
      // Short delay to let the user see the success toast before redirecting
      setTimeout(() => {
        navigate(dest, { replace: true });
      }, 1500);
    } catch (err: unknown) {
      setError(translateApiError(err, t) ?? t('deviceRegistration.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerEmail.trim() || !managerPassword) return;
    setLookupSubmitting(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const fp = await getDeviceFingerprint();
      const res = await checkDeviceRegistrationApi({
        email: managerEmail.trim(),
        password: managerPassword,
        fingerprint: fp.fingerprint,
      });
      setLookupResult(res);
    } catch (err: unknown) {
      setLookupError(translateApiError(err, t) ?? t('deviceRegistration.errorGeneric'));
    } finally {
      setLookupSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const isTerminal = user.role === 'store_terminal';

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 12 : 24,
        background: 'linear-gradient(160deg, #0D2137 0%, #1A3B5C 100%)',
        color: '#fff',
      }}
    >
      {/* Logout must be reachable here too. This screen is a dead end when the
          wrong account is signed in — without it the only way out was clearing
          browser data. The terminal screen has always offered it; this one did not. */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <LanguageSwitcher variant="pill" />
        <button
          type="button"
          onClick={logout}
          title={t('nav.logout')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            color: '#fff',
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(220,38,38,0.9)';
            e.currentTarget.style.borderColor = 'rgba(220,38,38,0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
        >
          <LogOut size={14} />
          {t('nav.logout')}
        </button>
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: isMobile ? 16 : 24,
          boxShadow: '0 16px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 8 : 12 }}>
          <div style={{ fontSize: isMobile ? 32 : 44, lineHeight: 1 }}>{isTerminal ? '🖥️' : '🔐'}</div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 800 }}>
              {isTerminal ? t('deviceRegistration.terminalTitle') : t('deviceRegistration.title')}
            </div>
            <div style={{ opacity: 0.75, fontSize: isMobile ? 12 : 14, marginTop: 4 }}>
              {isTerminal ? t('deviceRegistration.terminalSubtitle') : t('deviceRegistration.subtitle')}
            </div>
          </div>
        </div>

        <div style={{ marginTop: isMobile ? 12 : 16, background: 'rgba(0,0,0,0.15)', borderRadius: 16, padding: isMobile ? 12 : 16 }}>
          <div style={{ fontSize: isMobile ? 12.5 : 14, lineHeight: 1.6, opacity: 0.92 }}>
            {isTerminal ? t('deviceRegistration.terminalBody') : t('deviceRegistration.body')}
          </div>

          {isTerminal && (
            <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: isMobile ? '11.5px' : '13px', color: '#C9973A', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('deviceRegistration.terminalHowTo')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: isMobile ? '11.5px' : '13px', opacity: 0.85 }}>
                <div>{t('deviceRegistration.terminalHowToStep1')}</div>
                <div>{t('deviceRegistration.terminalHowToStep2')}</div>
                <div>{t('deviceRegistration.terminalHowToStep3')}</div>
                <div>{t('deviceRegistration.terminalHowToStep4')}</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 16 }}>
            <Alert variant="danger" title={t('common.error')}>
              {error}
            </Alert>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setShowLookupForm(!showLookupForm);
                  setLookupResult(null);
                  setLookupError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C9973A',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: isMobile ? 12 : 13.5,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Key size={14} />
                {t('deviceRegistration.checkButton')}
              </button>
            </div>
          </div>
        )}

        {/* Manager/HR credentials lookup form */}
        {showLookupForm && (
          <form
            onSubmit={handleLookup}
            style={{
              marginTop: 16,
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Key size={16} style={{ color: '#C9973A' }} />
              <div style={{ fontWeight: 700, fontSize: isMobile ? 13 : 14, color: '#C9973A' }}>
                {t('deviceRegistration.checkTitle')}
              </div>
            </div>
            <div style={{ fontSize: isMobile ? 11.5 : 12.5, opacity: 0.75, marginBottom: 12, lineHeight: 1.4 }}>
              {t('deviceRegistration.checkDesc')}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, display: 'block', marginBottom: 4 }}>
                {t('deviceRegistration.managerEmail')}
              </label>
              <input
                type="email"
                required
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                placeholder="email@company.com"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: 13.5,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, display: 'block', marginBottom: 4 }}>
                {t('deviceRegistration.managerPassword')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={managerPassword}
                  onChange={(e) => setManagerPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255, 255, 255, 0.6)',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={lookupSubmitting}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#C9973A',
                color: '#0A1929',
                fontWeight: 700,
                cursor: lookupSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 13.5,
              }}
            >
              {lookupSubmitting ? <Spinner size="sm" color="#0A1929" /> : t('deviceRegistration.checkSubmit')}
            </button>

            {lookupError && (
              <div style={{ marginTop: 12 }}>
                <Alert variant="danger" title={t('common.error')}>
                  {lookupError}
                </Alert>
              </div>
            )}

            {lookupResult && (
              <div style={{ marginTop: 14 }}>
                {!lookupResult.found ? (
                  <Alert variant="warning" title={t('common.warning')}>
                    {isTerminal
                      ? t('deviceRegistration.noTerminalForDevice', 'No terminal is registered on this device in this company. It is free to register.')
                      : t('deviceRegistration.noOwnerForDevice', 'No account is registered on this device in this company. It is free to register.')}
                  </Alert>
                ) : (() => {
                  const d = lookupResult.details!;
                  // A terminal is identified by its store, a person by their name.
                  const heldBy = d.isTerminal
                    ? [d.storeName, d.storeCode && `(${d.storeCode})`].filter(Boolean).join(' ')
                    : `${d.name} ${d.surname}`.trim();
                  const rows: Array<[string, string | null]> = [
                    [d.isTerminal
                      ? t('deviceRegistration.ownerTerminal', 'Terminal / Store')
                      : t('deviceRegistration.ownerName'), heldBy],
                    [t('deviceRegistration.ownerAccount', 'Account'), d.email],
                    [t('deviceRegistration.ownerRole'), t(`roles.${d.role}`, d.role)],
                    [t('deviceRegistration.ownerDate'), d.registeredAt],
                    [t('deviceRegistration.ownerDevice', 'Device'), d.deviceModel],
                    [t('deviceRegistration.ownerBrowser'), [d.browser, d.browserVersion].filter(Boolean).join(' ')],
                    [t('deviceRegistration.ownerOs'), d.os],
                    [t('deviceRegistration.ownerIp'), d.ipAddress],
                  ];
                  return (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#C9973A', marginBottom: 8 }}>
                        {d.isTerminal
                          ? t('deviceRegistration.terminalOwnerInfo', 'Terminal currently using this device')
                          : t('deviceRegistration.deviceOwnerInfo')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                        {rows.map(([label, value], i) => (
                          <div
                            key={label}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                              paddingBottom: 4,
                            }}
                          >
                            <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>{label}:</span>
                            <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>
                              {value && value.trim() ? value : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <Alert variant="info" title={t('deviceRegistration.whatNow', 'What to do next')}>
                          {t(
                            'deviceRegistration.ownerFoundHelp',
                            'To use this device here instead, ask an administrator to reset the device binding on the account above, then register again. Otherwise register this terminal on its own device.',
                          )}
                        </Alert>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </form>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 18, flexDirection: isMobile ? 'column' : 'row', width: '100%' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={handleRegister}
            style={{
              flex: '1 1 auto',
              width: '100%',
              padding: '13px 18px',
              borderRadius: 12,
              border: 'none',
              background: submitting ? '#4A6080' : '#C9973A',
              color: '#0A1929',
              fontWeight: 800,
              fontFamily: 'var(--font-display)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontSize: isMobile ? 13.5 : 14,
            }}
          >
            {submitting ? (
              <Spinner size="sm" color="#0A1929" />
            ) : (
              <>
                {isTerminal && <Monitor size={18} />}
                {isTerminal ? t('deviceRegistration.terminalButton') : t('deviceRegistration.button')}
              </>
            )}
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => navigate('/')}
            style={{
              flex: isMobile ? '1 1 auto' : '0 0 auto',
              width: isMobile ? '100%' : 'auto',
              padding: '13px 18px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? 13.5 : 14,
            }}
          >
            {t('deviceRegistration.backToDashboard')}
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: isMobile ? 11.5 : 12.5, opacity: 0.7, lineHeight: 1.5 }}>
          {t('deviceRegistration.note')}
        </div>
      </div>
    </div>
  );
}


