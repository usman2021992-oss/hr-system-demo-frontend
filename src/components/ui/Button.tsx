import React from 'react';
import { Spinner } from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'accent' | 'link';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  border: '1px solid transparent',
  cursor: 'pointer',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  letterSpacing: '0.01em',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
  sm: { padding: '5px 12px', fontSize: '12px', borderRadius: 'var(--radius-sm)', gap: '5px' },
  md: { padding: '8px 18px', fontSize: '13.5px', borderRadius: 'var(--radius)' },
  lg: { padding: '11px 26px', fontSize: '15px', borderRadius: 'var(--radius)', gap: '8px' },
};

const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  primary: {
    background: 'var(--primary)',
    color: '#fff',
    borderColor: 'var(--primary)',
    boxShadow: '0 1px 3px rgba(13,33,55,0.15)',
  },
  accent: {
    background: 'var(--accent)',
    color: '#0D2137',
    borderColor: 'var(--accent)',
    fontWeight: 600,
    boxShadow: '0 1px 3px rgba(201,151,58,0.20)',
  },
  secondary: {
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border)',
    boxShadow: 'var(--shadow-xs)',
  },
  danger: {
    background: 'var(--danger)',
    color: '#fff',
    borderColor: 'var(--danger)',
    boxShadow: '0 1px 3px rgba(220,38,38,0.15)',
  },
  success: {
    background: 'var(--success)',
    color: '#fff',
    borderColor: 'var(--success)',
    boxShadow: '0 1px 3px rgba(21,128,61,0.15)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    borderColor: 'transparent',
  },
  link: {
    background: 'transparent',
    color: 'var(--accent)',
    borderColor: 'transparent',
    padding: '0',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
};

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn btn-primary',
  accent: 'btn btn-accent',
  secondary: 'btn btn-secondary',
  danger: 'btn btn-danger',
  success: 'btn btn-success',
  ghost: 'btn btn-ghost',
  link: '',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  className,
  ...rest
}) => {
  const isDisabled = disabled || loading;

  const combinedStyle: React.CSSProperties = {
    ...baseStyle,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...(fullWidth ? { width: '100%' } : {}),
    ...(isDisabled ? { opacity: 0.55, cursor: 'not-allowed', pointerEvents: 'none' } : {}),
    ...style,
  };

  return (
    <button
      disabled={isDisabled}
      style={combinedStyle}
      className={`${variantClass[variant]} ${className ?? ''}`}
      {...rest}
    >
      {loading && <Spinner size={size === 'lg' ? 'md' : 'sm'} color="currentColor" />}
      {children}
    </button>
  );
};

export default Button;
