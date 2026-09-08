import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  id,
  style,
  className,
  ...rest
}) => {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {label && (
        <label htmlFor={inputId} style={{
          display: 'block',
          marginBottom: '5px',
          fontSize: '12.5px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          letterSpacing: '0.01em',
        }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`field-input ${className ?? ''}`}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          fontSize: '13.5px',
          color: 'var(--text-primary)',
          background: 'var(--surface)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxSizing: 'border-box',
          ...style,
        }}
        {...rest}
      />
      {error && (
        <span style={{ marginTop: '4px', fontSize: '12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {error}
        </span>
      )}
      {!error && hint && (
        <span style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}
    </div>
  );
};

export default Input;
