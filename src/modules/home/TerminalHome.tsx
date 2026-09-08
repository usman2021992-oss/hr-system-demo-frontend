import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { getDeviceStatus } from '../../api/device';
import { getDeviceFingerprint } from '../../utils/deviceFingerprint';
import { getBrowserTimeZone, getStoreTimezoneTag, resolveStoreTimezone, viewerDiffersFromStore } from '../../utils/timezone';

interface TerminalStore {
  id: number;
  name: string;
  code: string;
  /** The clock this store's clock-in window is enforced on. */
  timezone?: string | null;
}

export interface TerminalHomeData {
  store: TerminalStore;
}

interface TerminalHomeProps {
  data: TerminalHomeData;
}

export const TerminalHome: React.FC<TerminalHomeProps> = ({ data }) => {
  const { store } = data;
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [deviceStatus, setDeviceStatus] = useState<{
    loading: boolean;
    isBlocked: boolean;
    error: string | null;
  }>({ loading: true, isBlocked: false, error: null });

  useEffect(() => {
    let active = true;
    const checkDevice = async () => {
      if (user?.isSuperAdmin) {
        setDeviceStatus({ loading: false, isBlocked: false, error: null });
        return;
      }
      try {
        const fpResult = await getDeviceFingerprint();
        const status = await getDeviceStatus(fpResult.fingerprint);
        if (active) {
          if (status.requiresDeviceRegistration) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            navigate(`/device/register?next=${next}`, { replace: true });
          } else if (status.isDeviceRegistered && !status.isDeviceMatched) {
            setDeviceStatus({ loading: false, isBlocked: true, error: null });
          } else {
            setDeviceStatus({ loading: false, isBlocked: false, error: null });
          }
        }
      } catch (err) {
        console.error('Error during terminal device check:', err);
        if (active) {
          setDeviceStatus({ loading: false, isBlocked: false, error: 'Device check failed' });
        }
      }
    };
    void checkDevice();
    return () => { active = false; };
  }, [user, navigate]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const locale = i18n.language === 'en' ? 'en-GB' : 'it-IT';

  // This clock sits directly above a Start Check-In button, and the window that
  // button opens is enforced on the STORE's clock. Rendering the tablet's own
  // clock here is how an employee ends up staring at 10:04 while being told they
  // are too early — so the store's zone drives it, and the tablet's is only
  // mentioned when the two disagree.
  const storeTimezone = resolveStoreTimezone(store.timezone);
  const viewerOffClock = viewerDiffersFromStore(store.timezone);

  const timeString = currentTime.toLocaleTimeString(locale, {
    timeZone: storeTimezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString(locale, {
    timeZone: storeTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Seconds included so it ticks like the main clock above it rather than
  // looking like a stale label.
  const viewerTimeString = currentTime.toLocaleTimeString(locale, {
    timeZone: getBrowserTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--background)',
    fontFamily: 'var(--font-body)',
    gap: '24px',
    padding: '24px',
  };

  const greetingStyle: React.CSSProperties = {
    fontSize: '20px',
    color: 'var(--text-muted)',
    fontWeight: 400,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  };

  const storeNameStyle: React.CSSProperties = {
    fontSize: '40px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
    lineHeight: 1.2,
    fontFamily: 'var(--font-display)',
  };

  const timeStyle: React.CSSProperties = {
    fontSize: '64px',
    fontWeight: 700,
    color: 'var(--primary)',
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
    fontFamily: 'var(--font-display)',
  };

  const dateStyle: React.CSSProperties = {
    fontSize: '16px',
    color: 'var(--text-muted)',
    textTransform: 'capitalize',
  };

  const dividerStyle: React.CSSProperties = {
    width: '80px',
    height: '3px',
    background: 'var(--primary)',
    borderRadius: '2px',
    opacity: 0.4,
  };

  if (deviceStatus.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--background)' }}>
        <Spinner size="lg" color="var(--accent)" />
      </div>
    );
  }

  if (deviceStatus.isBlocked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32, textAlign: 'center', gap: 20,
        background: 'linear-gradient(135deg, #0D2137 0%, #1A3B5C 100%)',
        color: '#fff',
        fontFamily: 'var(--font-body)'
      }}>
        <div style={{ fontSize: 64 }}>🔒</div>
        <div style={{
          fontSize: 24, fontWeight: 800,
          color: '#ffffff', fontFamily: 'var(--font-display)',
        }}>
          {t('deviceReset.terminalBlockedTitle', 'Terminal Non Autorizzato')}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', maxWidth: 450, lineHeight: 1.5 }}>
          {t('deviceReset.terminalBlockedDesc', 'Questo dispositivo non è autorizzato per questo punto vendita. L\'accesso al terminale è consentito solo dal dispositivo originariamente registrato.')}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, maxWidth: 450, lineHeight: 1.5 }}>
          {t('deviceReset.terminalBlockedSelfRecoverHint', 'Se questo è il dispositivo corretto del punto vendita, puoi riassociarlo confermando le credenziali del terminale.')}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Recovery without waiting for an HR reset: the terminal re-confirms
              its own credentials and re-binds to the device in front of it. */}
          <button
            onClick={() => navigate('/terminal')}
            style={{
              padding: '11px 28px', borderRadius: 10,
              background: '#fff', border: '1px solid #fff',
              color: '#0D2137', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700
            }}
          >
            {t('deviceReset.reRegisterButton', 'Riassocia dispositivo')}
          </button>
          <button
            onClick={logout}
            style={{
              padding: '11px 28px', borderRadius: 10,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600
            }}
          >
            {t('nav.logout')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* The clock this screen runs on — top-left, mirroring logout. Named in
          full: two shops an hour apart are easier to tell apart by
          'Europe/Rome' than by 'UTC+02:00' alone. */}
      <div
        title={storeTimezone}
        style={{
          position: 'absolute', top: '16px', left: '20px',
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          padding: '6px 12px', background: 'var(--surface-elevated)',
          fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{storeTimezone}</span>
        <span style={{ opacity: 0.75 }}>{getStoreTimezoneTag(store.timezone, currentTime)}</span>
      </div>

      {/* Logout — top-right corner */}
      <button
        onClick={logout}
        title={t('nav.logout')}
        style={{
          position: 'absolute', top: '16px', right: '20px',
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 12px',
          fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)',
          cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = '#DC2626';
          (e.currentTarget as HTMLElement).style.color = '#DC2626';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        {t('nav.logout')}
      </button>

      <div style={greetingStyle}>{t('home.terminal.welcome')}</div>
      <div style={storeNameStyle}>{store.name}</div>
      <div style={dividerStyle} />
      <div style={timeStyle}>{timeString}</div>
      <div style={dateStyle}>{dateString}</div>
      {/* The device's own clock, echoed small beneath the store clock and only
          when the two disagree — a second clock, not a warning. The store clock
          governs; this one exists to explain the gap. */}
      {viewerOffClock && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            opacity: 0.75,
          }}>
            {t('terminal.deviceTime', 'This device')} · {getStoreTimezoneTag(getBrowserTimeZone(), currentTime)}
          </div>
          <div style={{
            fontSize: 'clamp(20px, 4vw, 30px)',
            fontWeight: 800,
            letterSpacing: '0.02em',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-display)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {viewerTimeString}
          </div>
        </div>
      )}
      <Button variant="primary" size="lg" onClick={() => navigate('/terminale')}>
        {t('home.terminal.startCheckin')}
      </Button>
    </div>
  );
};

export default TerminalHome;
