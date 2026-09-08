/**
 * Currencies a company can be billed in.
 *
 * Deliberately a short, curated list rather than every ISO 4217 code or an npm
 * package: only these are worth offering, the payment providers must accept
 * whatever is chosen, and the backend keeps a matching list. A free-text
 * currency box is what let "Pakistani Rupee" reach the billing tables and
 * break checkout, so every place a currency is chosen uses this list.
 *
 * Each entry carries the ISO country code its flag is drawn from. Emoji flags
 * were tried first and do not work: Windows has no glyphs for regional
 * indicator pairs and prints the two letters instead, so the picker showed
 * "EU" and "GB" rather than flags.
 */
export interface CurrencyOption {
  /** ISO 4217 code — the value stored and sent to the payment provider. */
  code: string;
  /** English name, shown beside the code. */
  name: string;
  symbol: string;
  /** ISO 3166 code used to pick the flag artwork. */
  country: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'EUR', name: 'Euro',              symbol: '€',  country: 'EU' },
  { code: 'GBP', name: 'British Pound',     symbol: '£',  country: 'GB' },
  { code: 'USD', name: 'US Dollar',         symbol: '$',  country: 'US' },
  { code: 'CHF', name: 'Swiss Franc',       symbol: 'Fr', country: 'CH' },
  { code: 'SEK', name: 'Swedish Krona',     symbol: 'kr', country: 'SE' },
  { code: 'NOK', name: 'Norwegian Krone',   symbol: 'kr', country: 'NO' },
  { code: 'DKK', name: 'Danish Krone',      symbol: 'kr', country: 'DK' },
  { code: 'PLN', name: 'Polish Złoty',      symbol: 'zł', country: 'PL' },
  { code: 'CZK', name: 'Czech Koruna',      symbol: 'Kč', country: 'CZ' },
  { code: 'RON', name: 'Romanian Leu',      symbol: 'lei', country: 'RO' },
  { code: 'HUF', name: 'Hungarian Forint',  symbol: 'Ft', country: 'HU' },
  { code: 'CAD', name: 'Canadian Dollar',   symbol: '$',  country: 'CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$',  country: 'AU' },
  { code: 'AED', name: 'UAE Dirham',        symbol: 'د.إ', country: 'AE' },
  { code: 'SAR', name: 'Saudi Riyal',       symbol: '﷼',  country: 'SA' },
  { code: 'PKR', name: 'Pakistani Rupee',   symbol: '₨',  country: 'PK' },
  { code: 'INR', name: 'Indian Rupee',      symbol: '₹',  country: 'IN' },
  { code: 'TRY', name: 'Turkish Lira',      symbol: '₺',  country: 'TR' },
  { code: 'JPY', name: 'Japanese Yen',      symbol: '¥',  country: 'JP' },
];

export const DEFAULT_CURRENCY = 'EUR';

export function findCurrency(code: string | null | undefined): CurrencyOption | undefined {
  if (!code) return undefined;
  const wanted = code.trim().toUpperCase();
  return CURRENCIES.find((c) => c.code === wanted);
}

/** "GBP — British Pound (£)", for contexts that can only take text. */
export function currencyLabel(c: CurrencyOption): string {
  return `${c.code} — ${c.name} (${c.symbol})`;
}

/** The symbol for a stored currency, falling back to the code itself. */
export function currencySymbol(code: string | null | undefined): string {
  return findCurrency(normaliseCurrency(code))?.symbol ?? normaliseCurrency(code);
}

/**
 * Formats an amount in the company's own currency.
 * Used everywhere billing shows money, so a company billed in PKR never sees
 * a euro sign against its figures.
 */
export function formatMoney(amount: number, code: string | null | undefined): string {
  return `${currencySymbol(code)}${amount.toFixed(2)}`;
}

/**
 * Normalises a stored value to a code from this list.
 *
 * Existing records may hold a display name typed before the field became a
 * list, so those are recognised rather than silently reset.
 */
export function normaliseCurrency(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_CURRENCY;

  const byCode = findCurrency(raw);
  if (byCode) return byCode.code;

  const lower = raw.toLowerCase();
  const byName = CURRENCIES.find(
    (c) => c.name.toLowerCase() === lower || c.symbol === raw
  );
  if (byName) return byName.code;

  // "EUR (€)" and similar.
  const match = raw.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];
  for (const m of match) {
    const hit = findCurrency(m);
    if (hit) return hit.code;
  }

  return DEFAULT_CURRENCY;
}
