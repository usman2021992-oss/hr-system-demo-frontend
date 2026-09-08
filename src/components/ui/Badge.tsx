import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary' | 'accent';
  size?: 'sm' | 'md';
  dot?: boolean;
  children?: React.ReactNode;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, { bg: string; color: string; border: string; dot: string }> = {
  success: { bg: 'var(--success-bg)',  color: 'var(--success)',  border: 'var(--success-border)',  dot: '#16A34A' },
  warning: { bg: 'var(--warning-bg)',  color: 'var(--warning)',  border: 'var(--warning-border)',  dot: '#B45309' },
  danger:  { bg: 'var(--danger-bg)',   color: 'var(--danger)',   border: 'var(--danger-border)',   dot: '#DC2626' },
  info:    { bg: 'var(--info-bg)',     color: 'var(--info)',     border: 'var(--info-border)',     dot: '#0284C7' },
  neutral: { bg: 'var(--background)',  color: 'var(--text-muted)', border: 'var(--border)',        dot: '#9CA3AF' },
  primary: { bg: 'rgba(13,33,55,0.07)', color: 'var(--primary)', border: 'rgba(13,33,55,0.12)',   dot: '#0D2137' },
  accent:  { bg: 'rgba(201,151,58,0.10)', color: 'var(--accent)', border: 'rgba(201,151,58,0.20)', dot: '#C9973A' },
};

const sizeStyles: Record<NonNullable<BadgeProps['size']>, React.CSSProperties> = {
  sm: { fontSize: '10px', padding: '2px 7px' },
  md: { fontSize: '11px', padding: '3px 9px' },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  dot = false,
  children,
}) => {
  const v = variantStyles[variant];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: dot ? '5px' : '0',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      letterSpacing: '0.035em',
      textTransform: 'uppercase',
      borderRadius: '999px',
      border: `1px solid ${v.border}`,
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      background: v.bg,
      color: v.color,
      ...sizeStyles[size],
    }}>
      {dot && (
        <span style={{
          width: 5, height: 5,
          borderRadius: '50%',
          background: v.dot,
          flexShrink: 0,
          display: 'inline-block',
        }}/>
      )}
      {children}
    </span>
  );
};

export default Badge;
