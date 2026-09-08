import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  accent?: string; // left border accent color
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  interactive?: boolean;
  onClick?: () => void;
}

const paddingMap: Record<NonNullable<CardProps['padding']>, string> = {
  none: '0px',
  sm: '14px',
  md: '20px',
  lg: '28px',
};

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  actions,
  padding = 'md',
  accent,
  className,
  children,
  style,
  interactive = false,
  onClick,
}) => {
  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
    padding: paddingMap[padding],
    border: '1px solid var(--border)',
    borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--border)',
    ...style,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: subtitle ? 'flex-start' : 'center',
    justifyContent: 'space-between',
    marginBottom: (title || subtitle || actions) ? '16px' : '0',
    gap: '8px',
  };

  return (
    <div
      style={cardStyle}
      className={`${interactive ? 'card-lift' : ''} ${className ?? ''}`}
      onClick={onClick}
    >
      {(title || subtitle || actions) && (
        <div style={headerStyle}>
          {(title || subtitle) && (
            <div>
              {title && (
                <h3 style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}>{title}</h3>
              )}
              {subtitle && (
                <p style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  margin: '2px 0 0',
                  fontWeight: 400,
                }}>{subtitle}</p>
              )}
            </div>
          )}
          {actions && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
