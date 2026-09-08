import React from 'react';
import { useTranslation } from 'react-i18next';
import { updateUserLocale } from '../../api/notifications';
import { useAuth } from '../../context/AuthContext';

interface LanguageSwitcherProps {
  /** 'pill' = compact flag+code for header, 'full' = full label for sidebar */
  variant?: 'pill' | 'full';
}

const FLAG_IT = () => (
  <svg width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 2, flexShrink: 0 }}>
    <rect width="6" height="13" fill="#009246"/>
    <rect x="6" width="6" height="13" fill="#FFFFFF"/>
    <rect x="12" width="6" height="13" fill="#CE2B37"/>
  </svg>
);

const FLAG_EN = () => (
  <svg width="18" height="13" viewBox="0 0 18 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ borderRadius: 2, flexShrink: 0 }}>
    <rect width="18" height="13" fill="#012169"/>
    <path d="M0 0L18 13M18 0L0 13" stroke="white" strokeWidth="2.5"/>
    <path d="M0 0L18 13M18 0L0 13" stroke="#C8102E" strokeWidth="1.5"/>
    <path d="M9 0V13M0 6.5H18" stroke="white" strokeWidth="3.5"/>
    <path d="M9 0V13M0 6.5H18" stroke="#C8102E" strokeWidth="2"/>
  </svg>
);

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ variant = 'pill' }) => {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const current = i18n.language?.startsWith('en') ? 'en' : 'it';

  const toggle = () => {
    const next = current === 'it' ? 'en' : 'it';
    i18n.changeLanguage(next);
    localStorage.setItem('hr_lang', next);
    if (user) {
      updateUserLocale(next).catch(() => undefined);
    }
  };

  if (variant === 'pill') {
    // Compact header version: shows both options, current is highlighted
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        padding: '3px',
      }}>
        {(['it', 'en'] as const).map((lang) => {
          const isActive = current === lang;
          return (
            <button
              key={lang}
              onClick={() => {
                i18n.changeLanguage(lang);
                localStorage.setItem('hr_lang', lang);
                if (user) {
                  updateUserLocale(lang).catch(() => undefined);
                }
              }}
              title={lang === 'it' ? 'Italiano' : 'English'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                background: isActive ? 'var(--surface)' : 'transparent',
                boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: isActive ? 700 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {lang === 'it' ? <FLAG_IT /> : <FLAG_EN />}
              {lang.toUpperCase()}
            </button>
          );
        })}
      </div>
    );
  }

  // Full sidebar version: shows flag + current language label, clicking toggles
  const nextLang = current === 'it' ? 'en' : 'it';
  const nextLabel = nextLang === 'en' ? 'English' : 'Italiano';

  return (
    <button
      onClick={toggle}
      title={`Switch to ${nextLabel}`}
      className="sidebar-item"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 10px',
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--sidebar-text)',
        fontSize: '13px',
        fontWeight: 400,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
      }}
    >
      {current === 'it' ? <FLAG_IT /> : <FLAG_EN />}
      <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {current === 'it' ? 'Italiano' : 'English'}
      </span>
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}>
        → {nextLabel}
      </span>
    </button>
  );
};

export default LanguageSwitcher;
