import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation, useTranslation as useI18n } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { translateApiError } from '../../utils/apiErrors';
import fusaroLogoUrl from '../../assets/fusaro-logo-2.png';

/* ─── self-contained language pill — zero CSS-var dependency ─── */
function LangPill() {
  const { i18n } = useI18n();
  const current = i18n.language === 'en' ? 'en' : 'it';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '999px', padding: '3px' }}>
      {(['it', 'en'] as const).map(lang => {
        const active = current === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => i18n.changeLanguage(lang)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '3px 10px', borderRadius: '999px', border: 'none',
              cursor: 'pointer', outline: 'none',
              background: active ? '#FFFFFF' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
              fontSize: '11px', fontWeight: active ? 700 : 400,
              color: active ? '#111827' : '#9CA3AF',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {lang === 'it'
              ? <svg width="16" height="12" viewBox="0 0 18 13" fill="none" style={{ borderRadius: 2 }}><rect width="6" height="13" fill="#009246" /><rect x="6" width="6" height="13" fill="#FFF" /><rect x="12" width="6" height="13" fill="#CE2B37" /></svg>
              : <svg width="16" height="12" viewBox="0 0 18 13" fill="none" style={{ borderRadius: 2 }}><rect width="18" height="13" fill="#012169" /><path d="M0 0L18 13M18 0L0 13" stroke="white" strokeWidth="2.5" /><path d="M0 0L18 13M18 0L0 13" stroke="#C8102E" strokeWidth="1.5" /><path d="M9 0V13M0 6.5H18" stroke="white" strokeWidth="3.5" /><path d="M9 0V13M0 6.5H18" stroke="#C8102E" strokeWidth="2" /></svg>
            }
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

/* ─── tiny local primitives with no CSS-var dependency ─── */

function Field({
  label, type = 'text', value, onChange, placeholder, disabled, required, autoComplete, testId,
}: {
  label: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; disabled?: boolean; required?: boolean; autoComplete?: string;
  testId?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type}
        data-testid={testId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '11px 14px',
          fontSize: '14px', color: '#111827',
          background: '#FFFFFF',
          border: `1.5px solid ${focused ? '#C9973A' : '#D1D5DB'}`,
          borderRadius: '8px',
          outline: 'none',
          boxShadow: focused ? '0 0 0 3px rgba(201,151,58,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          fontFamily: 'var(--font-body)',
        }}
      />
    </div>
  );
}

function PasswordField({
  label, value, onChange, placeholder, disabled, testId,
}: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; disabled?: boolean;
  testId?: string;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          data-testid={testId}
          value={value}
          onChange={onChange}
          placeholder={placeholder ?? '••••••••'}
          disabled={disabled}
          required
          autoComplete="current-password"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '11px 44px 11px 14px',
            fontSize: '14px', color: '#111827',
            background: '#FFFFFF',
            border: `1.5px solid ${focused ? '#C9973A' : '#D1D5DB'}`,
            borderRadius: '8px',
            outline: 'none',
            boxShadow: focused ? '0 0 0 3px rgba(201,151,58,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            fontFamily: 'var(--font-body)',
          }}
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9CA3AF', padding: '2px', display: 'flex', alignItems: 'center',
          }}
        >
          {show
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          }
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */

const LoginPage: React.FC = () => {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();

  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from;
  const returnTo = from ? `${from.pathname}${from.search}` : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Synchronous mutex — prevents double-submit before the first state update propagates
  const submittingRef = useRef(false);

  useEffect(() => {
    const errCode = localStorage.getItem('login_error_code');
    if (errCode) {
      setErrorMessage(t(`errors.${errCode}`));
      localStorage.removeItem('login_error_code');
    }
  }, [t]);

  useEffect(() => {
    if (!loading && user !== null) navigate(returnTo, { replace: true });
  }, [user, loading, navigate, returnTo]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await login(email, password, rememberMe);
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      setErrorMessage(translateApiError(err, t));
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const isDisabled = loading || submitting;

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A1929' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <img src={fusaroLogoUrl} alt="Fusaro Antonio 1893" style={{ width: 150, height: 48, objectFit: 'contain' }} />
          <Spinner size="md" color="#C9973A" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', fontFamily: 'var(--font-body)' }}>

      {/* ══ LEFT — brand panel ══ */}
      <div style={{
        width: '44%', flexShrink: 0,
        display: isMobile ? 'none' : 'flex', flexDirection: 'column',
        background: '#0A1929',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(201,151,58,0.2) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          opacity: 0.3,
        }} />
        {/* Arc decorations */}
        <svg viewBox="0 0 400 700" style={{ position: 'absolute', bottom: -80, right: -140, width: 560, pointerEvents: 'none', opacity: 0.06 }} fill="none">
          <circle cx="400" cy="350" r="300" stroke="#C9973A" strokeWidth="1" />
          <circle cx="400" cy="350" r="210" stroke="#C9973A" strokeWidth="1" />
          <circle cx="400" cy="350" r="120" stroke="#C9973A" strokeWidth="1" />
        </svg>
        {/* Right edge separator */}
        <div style={{ position: 'absolute', top: '8%', right: 0, width: 1, height: '84%', background: 'linear-gradient(180deg, transparent, rgba(201,151,58,0.28) 25%, rgba(201,151,58,0.28) 75%, transparent)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 52px' }}>
          {/* ── Center: Logo prominently centered ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0px' }}>
            {/* Logo — large, centered, beautiful */}
            <img
              src={fusaroLogoUrl}
              alt="Fusaro Antonio 1893"
              style={{
                width: '280px',
                height: 'auto',
                objectFit: 'contain',
                filter: 'drop-shadow(0px 8px 32px rgba(201,151,58,0.25))',
              }}
            />

            {/* Decorative gold line */}
            <div style={{ width: 48, height: 1.5, background: 'linear-gradient(90deg, transparent, #C9973A, transparent)', borderRadius: 1, marginBottom: '20px' }} />

            {/* HR System badge — centered under logo */}
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#C9973A', textTransform: 'uppercase', letterSpacing: '0.14em', border: '1px solid rgba(201,151,58,0.3)', padding: '5px 15px', borderRadius: '20px', background: 'rgba(201,151,58,0.05)', display: 'inline-block' }}>
                {t('nav.appName')}
              </span>
            </div>

            {/* Subtitle */}
            <p style={{
              fontSize: '13px',
              color: 'rgba(201,151,58,0.65)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 500,
              margin: '0 0 40px',
              textAlign: 'center',
            }}>
              {t('login.brandSubtitle')}
            </p>

            {/* Feature highlights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {([
                { path: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>, text: t('login.feature1') },
                { path: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />, text: t('login.feature2') },
                { path: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>, text: t('login.feature3') },
              ] as { path: React.ReactNode; text: string }[]).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: 28, height: 28, flexShrink: 0, background: 'rgba(201,151,58,0.08)', border: '1px solid rgba(201,151,58,0.18)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9973A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{f.path}</svg>
                  </div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '18px' }} />
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.16)', letterSpacing: '0.02em', textAlign: 'center' }}>{t('login.footer', { year: new Date().getFullYear() })}</p>
          </div>
        </div>
      </div>

      {/* ══ RIGHT — form panel ══ */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#FFFFFF', position: 'relative', display: 'flex', flexDirection: 'column' }}>

        {/* Language switcher — top right */}
        <div style={{ position: 'absolute', top: isMobile ? 10 : 24, right: isMobile ? 12 : 32, zIndex: 10 }}>
          <LangPill />
        </div>

        {/* Mobile logo header — centered at top */}
        {isMobile && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <img
              src={fusaroLogoUrl}
              alt="Fusaro Antonio 1893"
              style={{
                width: '200px',
                height: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>
        )}

        {/* Centered form */}
        <div style={{ flex: 1, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center', padding: isMobile ? '0px 20px 40px' : '60px 48px 60px' }}>
          <div style={{ width: isMobile ? '100%' : '420px', maxWidth: '100%', animation: 'fadeSlideUp 0.35s ease forwards' }}>

            {/* Editorial number */}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? '80px' : '110px', fontWeight: 800, color: 'rgba(13,33,55,0.05)', lineHeight: 1, marginBottom: isMobile ? '-20px' : '-28px', marginLeft: '-5px', userSelect: 'none', letterSpacing: '-0.06em' }}>
              01
            </div>

            {/* Heading */}
            <div style={{ marginBottom: isMobile ? '28px' : '36px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? '26px' : '32px', fontWeight: 700, color: '#0D2137', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 14px' }}>
                {t('login.title')}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: 32, height: 2, background: '#C9973A', borderRadius: 1, flexShrink: 0 }} />
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
              </div>
              <p style={{ color: '#6B7280', fontSize: '13.5px', lineHeight: 1.65, margin: 0 }}>
                {t('login.subtitle')}
              </p>
            </div>

            {/* Error */}
            {errorMessage && (
              <div style={{ marginBottom: '24px' }}>
                <Alert variant="danger" onClose={() => setErrorMessage(null)}>
                  {errorMessage}
                </Alert>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                <Field
                  label={t('login.email')}
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isDisabled}
                  required
                  autoComplete="email"
                  testId="login-email"
                />

                <PasswordField
                  label={t('login.password')}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isDisabled}
                  testId="login-password"
                />

                {/* Remember me */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isDisabled ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    disabled={isDisabled}
                    style={{ width: 16, height: 16, accentColor: '#0D2137', cursor: isDisabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '13.5px', color: '#374151', userSelect: 'none' }}>
                    {t('login.rememberMe')}
                  </span>
                </label>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isDisabled}
                  data-testid="login-submit"
                  style={{
                    width: '100%',
                    padding: '13px 24px',
                    background: isDisabled ? '#4A6080' : '#0D2137',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.01em',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '4px',
                    boxShadow: isDisabled ? 'none' : '0 4px 16px rgba(13,33,55,0.28)',
                    transition: 'background 0.15s, box-shadow 0.15s, transform 0.12s',
                  }}
                  onMouseEnter={e => { if (!isDisabled) { (e.currentTarget as HTMLButtonElement).style.background = '#1A3B5C'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isDisabled ? '#4A6080' : '#0D2137'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                >
                  {submitting && <Spinner size="sm" color="#FFFFFF" />}
                  {submitting ? t('login.submitting') : t('login.submit')}
                </button>
              </div>
            </form>

            {/* Subtle footer on form side */}
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#D1D5DB', marginTop: '36px', letterSpacing: '0.02em' }}>
              {t('login.footer', { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
