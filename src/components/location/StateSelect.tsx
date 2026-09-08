import React, { useEffect, useState, useMemo, useRef } from 'react';
import CustomSelect, { SelectOption } from '../ui/CustomSelect';
import { getStates, StateOption } from '../../api/location';

interface StateSelectProps {
  countryCode: string | null;
  value: string | null;
  onChange: (stateCode: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  isClearable?: boolean;
  highlightSelected?: boolean;
}

export function StateSelect({
  countryCode,
  value,
  onChange,
  label = 'State / Region',
  placeholder = 'Select state...',
  disabled = false,
  error,
  isClearable = true,
  highlightSelected = false,
}: StateSelectProps) {
  const [states, setStates] = useState<StateOption[]>([]);
  const [loading, setLoading] = useState(Boolean(countryCode));

  // Load states from backend API when countryCode changes
  useEffect(() => {
    if (!countryCode) {
      setStates([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    getStates(countryCode)
      .then((data) => {
        if (!mounted) return;
        setStates(data);
      })
      .catch((err) => {
        console.error('Failed to load states:', err);
        if (mounted) setStates([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [countryCode]);

  const options = useMemo<SelectOption[]>(() => {
    return states
      .map((state) => ({ value: state.label, label: state.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [states]);

  // Prevent parent onChange updates from triggering the effect loop
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Options use the state NAME as their value, but a saved value can be a state
  // CODE (e.g. the Italian province code "MB", stored by the ATS job form).
  // Resolve a code to its name for DISPLAY only — without rewriting the parent's
  // value. Emitting onChange here previously fired the parent's "state changed"
  // handler on mount, which wiped the already-entered città. See CitySelect too.
  const displayValue = useMemo(() => {
    if (!value) return null;
    if (options.some((option) => option.value === value)) return value; // already a name
    const matched = states.find((s) => s.value === value); // value is a code
    return matched ? matched.label : value;
  }, [value, options, states]);

  useEffect(() => {
    if (!value) return;
    if (loading) return; // Wait until options are loaded before validating

    // Valid as a name, or resolvable as a code → keep it (display handles the code).
    if (options.some((option) => option.value === value)) return;
    if (states.some((s) => s.value === value)) return;

    // Neither a known name nor a known code → genuinely invalid, clear it.
    onChangeRef.current(null);
  }, [value, options, states, loading]);

  const isDisabled = disabled || !countryCode || options.length === 0 || loading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <CustomSelect
        options={options}
        value={displayValue}
        onChange={onChange}
        placeholder={
          loading
            ? 'Loading states...'
            : countryCode
            ? placeholder
            : 'Select country first'
        }
        disabled={isDisabled}
        error={error}
        isClearable={isClearable}
        highlightSelected={highlightSelected}
      />
    </div>
  );
}
