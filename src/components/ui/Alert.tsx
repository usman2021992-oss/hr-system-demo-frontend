import React from 'react';

interface AlertProps {
  variant: 'success' | 'warning' | 'danger' | 'info';
  title?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

const IconCheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
);
const IconWarning = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IconX = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M15 9l-6 6M9 9l6 6"/>
  </svg>
);
const IconInfo = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const variantMap: Record<
  NonNullable<AlertProps['variant']>,
  { bg: string; color: string; border: string; icon: React.ReactNode }
> = {
  success: { bg: 'var(--success-bg)',  color: 'var(--success)',  border: 'var(--success-border)',  icon: <IconCheck /> },
  warning: { bg: 'var(--warning-bg)',  color: 'var(--warning)',  border: 'var(--warning-border)',  icon: <IconWarning /> },
  danger:  { bg: 'var(--danger-bg)',   color: 'var(--danger)',   border: 'var(--danger-border)',   icon: <IconX /> },
  info:    { bg: 'var(--info-bg)',     color: 'var(--info)',     border: 'var(--info-border)',     icon: <IconInfo /> },
};

export const Alert: React.FC<AlertProps> = ({ variant, title, children, onClose }) => {
  const v = variantMap[variant];

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 14px',
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderLeft: `3px solid ${v.color}`,
        borderRadius: 'var(--radius)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span style={{ color: v.color, flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: '1px' }}>
        {v.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontSize: '13px', fontWeight: 600, color: v.color, marginBottom: children ? '3px' : '0' }}>
            {title}
          </div>
        )}
        {children && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {children}
          </div>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Chiudi avviso"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: v.color, padding: '0', flexShrink: 0,
            fontSize: '18px', lineHeight: 1, opacity: 0.65,
            display: 'flex', alignItems: 'center',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.65'; }}
        >×</button>
      )}
    </div>
  );
};

export default Alert;
