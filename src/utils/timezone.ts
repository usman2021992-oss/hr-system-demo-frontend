const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/Rome',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: string) => string[];
};

const intlWithSupportedValues = Intl as IntlWithSupportedValues;

export const TIMEZONE_OPTIONS = typeof intlWithSupportedValues.supportedValuesOf === 'function'
  ? intlWithSupportedValues.supportedValuesOf('timeZone')
  : FALLBACK_TIMEZONES;

const COUNTRY_TIMEZONE_FALLBACKS: Record<string, string[]> = {
  IT: ['Europe/Rome'],
  GB: ['Europe/London'],
  IE: ['Europe/Dublin'],
  ES: ['Europe/Madrid'],
  FR: ['Europe/Paris'],
  DE: ['Europe/Berlin'],
  NL: ['Europe/Amsterdam'],
  BE: ['Europe/Brussels'],
  PT: ['Europe/Lisbon'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
  CA: ['America/Toronto', 'America/Vancouver'],
  BR: ['America/Sao_Paulo'],
  AE: ['Asia/Dubai'],
  SA: ['Asia/Riyadh'],
  IN: ['Asia/Kolkata'],
  CN: ['Asia/Shanghai'],
  JP: ['Asia/Tokyo'],
  SG: ['Asia/Singapore'],
  AU: ['Australia/Sydney', 'Australia/Perth'],
  NZ: ['Pacific/Auckland'],
};

const TIMEZONE_SET = new Set<string>(TIMEZONE_OPTIONS);

function extractOffsetFromTimeZoneName(timeZoneName: string): string | null {
  const normalized = timeZoneName.trim().toUpperCase().replace('GMT', 'UTC');
  if (normalized === 'UTC') return 'UTC+00:00';

  const match = normalized.match(/^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;

  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `UTC${match[1]}${hours}:${minutes}`;
}

function computeOffsetMinutes(timeZone: string, date: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const second = Number(parts.find((part) => part.type === 'second')?.value);

    if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
      return null;
    }

    const asUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
    return Math.round((asUtcMillis - date.getTime()) / 60000);
  } catch {
    return null;
  }
}

export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getUtcOffsetLabel(timeZone: string, atDate: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const tzPart = formatter
      .formatToParts(atDate)
      .find((part) => part.type === 'timeZoneName')?.value;

    if (tzPart) {
      const parsed = extractOffsetFromTimeZoneName(tzPart);
      if (parsed) return parsed;
    }
  } catch {
    // Fallback below.
  }

  const offsetMinutes = computeOffsetMinutes(timeZone, atDate);
  if (offsetMinutes == null) return 'UTC+00:00';

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

export function getTimezoneLocalTimeLabel(timeZone: string, atDate: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(atDate);
  } catch {
    return '--:--';
  }
}

export function getPreferredTimezoneForCountry(
  countryCode: string | null | undefined,
  fallback: string = getBrowserTimeZone(),
): string {
  const code = (countryCode ?? '').trim().toUpperCase();
  if (!code) return fallback;

  const suggestions = COUNTRY_TIMEZONE_FALLBACKS[code] ?? [];
  for (const timezone of suggestions) {
    if (TIMEZONE_SET.has(timezone)) {
      return timezone;
    }
  }

  return fallback;
}

export function getTimezoneOptionValues(extra: Array<string | null | undefined> = []): string[] {
  const values = new Set<string>(TIMEZONE_OPTIONS);
  for (const value of extra) {
    const normalized = (value ?? '').trim();
    if (normalized) values.add(normalized);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

/** Fallback used wherever a store row carries no timezone of its own. */
export const DEFAULT_STORE_TIMEZONE = 'Europe/Rome';

/** The zone a store's shifts are stored and enforced in. */
export function resolveStoreTimezone(timezone: string | null | undefined): string {
  const trimmed = (timezone ?? '').trim();
  return trimmed || DEFAULT_STORE_TIMEZONE;
}

/**
 * Compact zone tag for dropdowns and headers, e.g. "UTC+02:00".
 * The offset is what people can act on at a glance; the IANA name is long and
 * means little to a store manager, so it belongs in a tooltip.
 */
export function getStoreTimezoneTag(
  timezone: string | null | undefined,
  atDate: Date = new Date(),
): string {
  return getUtcOffsetLabel(resolveStoreTimezone(timezone), atDate);
}

/**
 * True when the viewer is not on the store's clock — the case where showing a
 * time without saying whose clock it is becomes actively misleading. This is the
 * condition that hid the Varese outage: the manager's calendar quietly rendered
 * every shift in her own zone, so it looked correct to the one person who could
 * have caught it.
 */
export function viewerDiffersFromStore(timezone: string | null | undefined): boolean {
  const store = resolveStoreTimezone(timezone);
  const viewer = getBrowserTimeZone();
  if (!viewer || viewer === store) return false;
  // Same instant on both clocks means nothing to explain, even when the IANA
  // names differ (Europe/Rome vs Europe/Berlin, say).
  return getUtcOffsetLabel(store) !== getUtcOffsetLabel(viewer);
}
