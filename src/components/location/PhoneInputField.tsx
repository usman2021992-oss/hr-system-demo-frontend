import React from 'react';
import PhoneInput, { Country, Value } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import './location.css';

interface PhoneInputFieldProps {
  value: string;
  onChange: (phone: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  defaultCountry?: string | null;
}

export function PhoneInputField({
  value,
  onChange,
  label = 'Phone',
  placeholder = 'Enter phone number',
  disabled = false,
  error,
  defaultCountry,
}: PhoneInputFieldProps) {
  const normalizedDefaultCountry: Country | undefined =
    defaultCountry && /^[A-Za-z]{2}$/.test(defaultCountry)
      ? (defaultCountry.toUpperCase() as Country)
      : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {label && (
        <label style={{ marginBottom: 5, fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}

      <PhoneInput
        defaultCountry={normalizedDefaultCountry}
        international={!normalizedDefaultCountry}
        value={(value || undefined) as Value}
        onChange={(next) => onChange((next ?? '') as string)}
        placeholder={placeholder}
        disabled={disabled}
        className={`location-phone-input${error ? ' has-error' : ''}`}
      />

      {error ? (
        <span style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)' }}>{error}</span>
      ) : null}
    </div>
  );
}
