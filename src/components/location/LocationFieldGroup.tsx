import React, { useCallback, useRef } from 'react';
import { Input } from '../ui/Input';
import { CountrySelect } from './CountrySelect';
import { StateSelect } from './StateSelect';
import { CitySelect } from './CitySelect';
import { PhoneInputField } from './PhoneInputField';

export interface LocationFieldValue {
  country: string;
  state: string;
  city: string;
  address: string;
  postalCode: string;
  phone: string;
}

type LocationFieldKey = keyof LocationFieldValue;

interface LocationFieldGroupProps {
  value: Partial<LocationFieldValue>;
  onChange: (next: LocationFieldValue) => void;
  includeAddress?: boolean;
  includePostalCode?: boolean;
  includePhone?: boolean;
  disabled?: boolean;
  errors?: Partial<Record<LocationFieldKey, string>>;
  labels?: Partial<Record<LocationFieldKey, string>>;
}

const EMPTY_VALUE: LocationFieldValue = {
  country: '',
  state: '',
  city: '',
  address: '',
  postalCode: '',
  phone: '',
};

export function LocationFieldGroup({
  value,
  onChange,
  includeAddress = true,
  includePostalCode = true,
  includePhone = false,
  disabled = false,
  errors,
  labels,
}: LocationFieldGroupProps) {
  const current = { ...EMPTY_VALUE, ...value };

  // Use refs to make handlers completely stable and prevent rendering loops
  const currentRef = useRef(current);
  currentRef.current = current;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleCountryChange = useCallback((countryCode: string | null) => {
    onChangeRef.current({
      ...currentRef.current,
      country: countryCode ?? '',
      state: '',
      city: '',
    });
  }, []);

  const handleStateChange = useCallback((stateCode: string | null) => {
    onChangeRef.current({
      ...currentRef.current,
      state: stateCode ?? '',
      city: '',
    });
  }, []);

  const handleCityChange = useCallback((cityName: string | null) => {
    onChangeRef.current({
      ...currentRef.current,
      city: cityName ?? '',
    });
  }, []);

  const handleAddressChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChangeRef.current({
      ...currentRef.current,
      address: event.target.value,
    });
  }, []);

  const handlePostalCodeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChangeRef.current({
      ...currentRef.current,
      postalCode: event.target.value,
    });
  }, []);

  const handlePhoneChange = useCallback((phone: string) => {
    onChangeRef.current({
      ...currentRef.current,
      phone,
    });
  }, []);

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
      <CountrySelect
        value={current.country || null}
        onChange={handleCountryChange}
        label={labels?.country ?? 'Country'}
        disabled={disabled}
        error={errors?.country}
      />

      <StateSelect
        countryCode={current.country || null}
        value={current.state || null}
        onChange={handleStateChange}
        label={labels?.state ?? 'State / Region'}
        disabled={disabled}
        error={errors?.state}
      />

      <CitySelect
        countryCode={current.country || null}
        stateCode={current.state || null}
        value={current.city || null}
        onChange={handleCityChange}
        label={labels?.city ?? 'City'}
        disabled={disabled}
        error={errors?.city}
      />

      {includeAddress ? (
        <Input
          label={labels?.address ?? 'Address'}
          value={current.address}
          onChange={handleAddressChange}
          disabled={disabled}
          error={errors?.address}
        />
      ) : null}

      {includePostalCode ? (
        <Input
          label={labels?.postalCode ?? 'Postal Code'}
          value={current.postalCode}
          onChange={handlePostalCodeChange}
          disabled={disabled}
          error={errors?.postalCode}
        />
      ) : null}

      {includePhone ? (
        <PhoneInputField
          label={labels?.phone ?? 'Phone'}
          value={current.phone}
          onChange={handlePhoneChange}
          disabled={disabled}
          error={errors?.phone}
          defaultCountry={current.country || null}
        />
      ) : null}
    </div>
  );
}
