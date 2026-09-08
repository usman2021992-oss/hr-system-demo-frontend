import React, { useEffect, useState, useMemo } from 'react';
import ReactCountryFlag from 'react-country-flag';
import CustomSelect, { SelectOption } from '../ui/CustomSelect';
import { getCountries, CountryOption } from '../../api/location';

interface CountrySelectProps {
  value: string | null;
  onChange: (countryCode: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  isClearable?: boolean;
  highlightSelected?: boolean;
}

export function CountrySelect({
  value,
  onChange,
  label = 'Country',
  placeholder = 'Select country...',
  disabled = false,
  error,
  isClearable = true,
  highlightSelected = false,
}: CountrySelectProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getCountries()
      .then((data) => {
        if (!mounted) return;
        setCountries(data);
      })
      .catch((err) => {
        console.error('Failed to load countries:', err);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const options = useMemo<SelectOption[]>(() => {
    return countries
      .map((country) => ({
        value: country.value,
        label: country.label,
        render: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ReactCountryFlag countryCode={country.value} svg style={{ width: '1em', height: '1em', borderRadius: 2 }} />
            <span>{country.label}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>+{country.phonecode}</span>
          </span>
        )
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [countries]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <CustomSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={loading ? 'Loading countries...' : placeholder}
        disabled={disabled || loading}
        error={error}
        isClearable={isClearable}
        highlightSelected={highlightSelected}
      />
    </div>
  );
}
