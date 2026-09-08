import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface CareersFooterProps {
  companyName?: string;
  companyEmail?: string;
  companySlug?: string;
}

export default function CareersFooter({ companyName, companyEmail, companySlug }: CareersFooterProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'it';
  // Show the company only when we actually know it. Falling back to a specific
  // tenant's name would misattribute another client's careers page; the footer
  // already carries the platform name ("Powered by Veylo HR") on its own.
  const displayCompany = companySlug && companyName ? companyName : null;

  return (
    <footer style={{
      background: 'var(--surface-warm)',
      borderTop: '1px solid var(--border)',
      padding: '24px 40px',
      marginTop: '48px',
      fontFamily: 'var(--font-body)',
      fontSize: '13px',
      color: 'var(--text-secondary)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }} className="flex-col-mobile">
        <div>
          <span>&copy; 2026{displayCompany ? ` ${displayCompany}` : ''}. Powered by </span>
          <a href="https://veylohr.com" style={{ color: 'var(--primary)', fontWeight: 600 }}>Veylo HR</a>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <Link 
            to={companySlug ? `/careers/${companySlug}/privacy` : '/privacy'} 
            style={{ color: 'var(--text-secondary)', transition: 'color 0.2s', textDecoration: 'none' }} 
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'} 
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            {lang === 'it' ? 'Informativa Privacy' : 'Privacy Policy'}
          </Link>
          <Link 
            to={companySlug ? `/careers/${companySlug}/terms` : '/terms'} 
            style={{ color: 'var(--text-secondary)', transition: 'color 0.2s', textDecoration: 'none' }} 
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'} 
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            {lang === 'it' ? 'Termini di Servizio' : 'Terms of Service'}
          </Link>
          <Link 
            to={companySlug ? `/careers/${companySlug}/cookie-policy` : '/cookie-policy'} 
            style={{ color: 'var(--text-secondary)', transition: 'color 0.2s', textDecoration: 'none' }} 
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'} 
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Cookie Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
