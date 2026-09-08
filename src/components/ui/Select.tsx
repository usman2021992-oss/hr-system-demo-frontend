import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  hint,
  id,
  children,
  style,
  className,
  ...rest
}) => {
  const selectId = id ?? (label ? `select-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {label && (
        <label htmlFor={selectId} style={{
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
      <select
        id={selectId}
        className={`field-select ${className ?? ''}`}
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
          appearance: 'auto',
          cursor: 'pointer',
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <span style={{ marginTop: '4px', fontSize: '12px', color: 'var(--danger)' }}>
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

export default Select;
