import React, { useEffect, useState, useMemo, useRef } from 'react';
import CustomSelect, { SelectOption } from '../ui/CustomSelect';
import { getCities, CityOption, getStates } from '../../api/location';

interface CitySelectProps {
  countryCode: string | null;
  stateCode?: string | null;
  value: string | null;
  onChange: (cityName: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  isClearable?: boolean;
  highlightSelected?: boolean;
  /**
   * When the location dataset has no cities for the selected country/province
   * (e.g. several Italian provinces such as Como return an empty city list),
   * fall back to a free-text input so the user can still enter a city name.
   * Enabled by default — it only activates when the dropdown would otherwise
   * be empty and unusable.
   */
  allowFreeText?: boolean;
}

export function CitySelect({
  countryCode,
  stateCode,
  value,
  onChange,
  label = 'City',
  placeholder = 'Select city...',
  disabled = false,
  error,
  isClearable = true,
  highlightSelected = false,
  allowFreeText = true,
}: CitySelectProps) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(Boolean(countryCode));

  // Load cities from backend API when countryCode or stateCode changes
  useEffect(() => {
    if (!countryCode) {
      setCities([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    const loadCities = async () => {
      try {
        let resolvedStateCode = stateCode;
        if (stateCode && stateCode.trim().length > 0) {
          // If stateCode looks like a state name, find its code by loading states first
          const statesList = await getStates(countryCode);
          const matchedState = statesList.find(s => 
            s.label.toLowerCase() === stateCode.toLowerCase() ||
            s.value.toLowerCase() === stateCode.toLowerCase()
          );
          if (matchedState) {
            resolvedStateCode = matchedState.value;
          }
        }

        const data = await getCities(countryCode, resolvedStateCode);
        if (!mounted) return;
        setCities(data);
      } catch (err) {
        console.error('Failed to load cities:', err);
        if (mounted) setCities([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadCities();

    return () => {
      mounted = false;
    };
  }, [countryCode, stateCode]);

  const options = useMemo<SelectOption[]>(() => {
    return cities
      .map((city) => ({ value: city.value, label: city.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cities]);

  // When a country/state is selected but the dataset returns no cities for it
  // (e.g. Italian provinces such as Monza/Como), OR when the current value is
  // not one of the dataset options, switch to a free-text input. This shows and
  // preserves the value instead of a dropdown that cannot represent it — so a
  // saved city is never silently dropped on reopen.
  const valueInOptions = !value || options.some((option) => option.value === value);
  const freeTextMode =
    allowFreeText && Boolean(countryCode) && !loading && (options.length === 0 || !valueInOptions);

  // Prevent parent onChange updates from triggering the effect loop
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track the country/province context so a city is discarded ONLY when the user
  // actively changes that context — never on the initial hydration of a saved
  // job (which previously wiped persisted cities such as "Monza" on reopen).
  const prevContextRef = useRef<string | null>(null);

  useEffect(() => {
    const context = `${countryCode ?? ''}|${stateCode ?? ''}`;
    const prevContext = prevContextRef.current;
    prevContextRef.current = context;

    if (!value) return;
    if (loading) return; // Wait until options are loaded before validating
    if (freeTextMode) return; // Free-text value (no dataset match) is always kept
    if (options.some((option) => option.value === value)) return;
    // Only clear when the country/province actually changed after mount.
    if (prevContext !== null && prevContext !== context) {
      onChangeRef.current(null);
    }
  }, [value, options, loading, freeTextMode, countryCode, stateCode]);

  const isDisabled = disabled || !countryCode || (options.length === 0 && !freeTextMode) || loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      {freeTextMode ? (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.trim() === '' ? null : e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          style={{
            width: '100%',
            minHeight: 40,
            padding: '8px 12px',
            border: error ? '1px solid var(--danger)' : '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: disabled ? 'var(--background-muted)' : '#ffffff',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <CustomSelect
          options={options}
          value={value}
          onChange={onChange}
          placeholder={
            loading
              ? 'Loading cities...'
              : countryCode
              ? placeholder
              : 'Select country first'
          }
          disabled={isDisabled}
          error={error}
          isClearable={isClearable}
          highlightSelected={highlightSelected}
        />
      )}
      {freeTextMode && error && (
        <span style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)', display: 'block' }}>{error}</span>
      )}
    </div>
  );
}
