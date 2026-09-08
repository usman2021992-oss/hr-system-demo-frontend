import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function CookieConsentBanner() {
  const [show, setShow] = useState(false);
  const { companySlug } = useParams<{ companySlug?: string }>();

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent_given');
    if (!consent) {
      setShow(true);
    }
  }, []);

  const handleChoice = (choice: 'accepted' | 'rejected') => {
    localStorage.setItem('cookie_consent_given', choice);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(13, 33, 55, 0.45)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '20px',
      animation: 'fadeIn 0.25s ease'
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '24px 32px',
        maxWidth: '800px',
        width: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
        animation: 'fadeSlideUp 0.3s ease'
      }} className="flex-col-mobile">
        <div style={{ flex: 1 }}>
          <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
            Questo sito utilizza cookie per migliorare l'esperienza utente. Continuando a navigare, accetti l'uso dei cookie.{' '}
            <a 
              href={companySlug ? `/careers/${companySlug}/cookie-policy` : "/cookie-policy"} 
              style={{ color: 'var(--accent)', textDecoration: 'underline', fontWeight: 600 }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Leggi la Cookie Policy
            </a>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
          <button 
            onClick={() => handleChoice('rejected')}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Rifiuto
          </button>
          <button 
            onClick={() => handleChoice('accepted')}
            style={{
              padding: '10px 24px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'background 0.15s, transform 0.1s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Accetto
          </button>
        </div>
      </div>
    </div>
  );
}
