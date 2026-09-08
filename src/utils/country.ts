export function getCountryDisplayName(countryCode?: string | null): string | null {
  const normalized = (countryCode ?? '').trim().toUpperCase();
  if (!normalized) return null;
  const lang = localStorage.getItem('hr_lang') || 'it';
  try {
    const formatter = new Intl.DisplayNames([lang], { type: 'region' });
    return formatter.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}
