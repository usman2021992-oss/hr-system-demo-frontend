import apiClient from './client';

export interface CountryOption {
  value: string;
  label: string;
  phonecode: string;
}

export interface StateOption {
  value: string;
  label: string;
}

export interface CityOption {
  value: string;
  label: string;
}

export async function getCountries(): Promise<CountryOption[]> {
  const { data } = await apiClient.get<CountryOption[]>('/location/countries');
  return data;
}

export async function getStates(countryCode: string): Promise<StateOption[]> {
  const { data } = await apiClient.get<StateOption[]>('/location/states', {
    params: { countryCode },
  });
  return data;
}

export async function getCities(countryCode: string, stateCode?: string | null): Promise<CityOption[]> {
  const { data } = await apiClient.get<CityOption[]>('/location/cities', {
    params: { countryCode, stateCode: stateCode || undefined },
  });
  return data;
}
