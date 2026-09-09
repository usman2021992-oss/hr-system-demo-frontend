// ---------------------------------------------------------------------------
// Candidate rejection reasons (frontend mirror of backend utils/rejectionReasons)
//
// Stored in the existing candidates.rejection_reason TEXT column as a bare code,
// or "other:<note>" when the user picks "other". No schema change was needed.
//
// Rows written before this change still hold free text ("non idoneo",
// "Non e' idoneo", "NON IDONEA" …). parseRejectionReason maps those onto the
// same codes when displaying them, so old and new candidates read — and count —
// the same way without rewriting anything on the live server.
// ---------------------------------------------------------------------------

export const REJECTION_REASON_CODES = [
  'not_suitable',
  'insufficient_experience',
  'salary_expectations',
  'not_available',
  'other',
] as const;

export type RejectionReasonCode = typeof REJECTION_REASON_CODES[number];

/** i18n keys, defined in locales/en.ts and locales/it.ts under `ats`. */
export const REJECTION_REASON_LABEL_KEYS: Record<RejectionReasonCode, string> = {
  not_suitable: 'ats.rejectionReason_not_suitable',
  insufficient_experience: 'ats.rejectionReason_insufficient_experience',
  salary_expectations: 'ats.rejectionReason_salary_expectations',
  not_available: 'ats.rejectionReason_not_available',
  other: 'ats.rejectionReason_other',
};

export const REJECTION_REASON_FALLBACKS: Record<RejectionReasonCode, string> = {
  not_suitable: 'Not suitable for the role',
  insufficient_experience: 'Insufficient experience',
  salary_expectations: 'Salary expectations',
  not_available: 'Not available',
  other: 'Other',
};

const OTHER_PREFIX = 'other:';

export interface ParsedRejectionReason {
  code: RejectionReasonCode | null;
  note: string | null;
  legacy: boolean;
}

export function isRejectionReasonCode(value: unknown): value is RejectionReasonCode {
  return typeof value === 'string' && (REJECTION_REASON_CODES as readonly string[]).includes(value);
}

export function serializeRejectionReason(code: RejectionReasonCode, note?: string | null): string {
  const trimmed = (note ?? '').trim();
  return code === 'other' && trimmed ? `${OTHER_PREFIX}${trimmed}` : code;
}

const LEGACY_REASON_MAP: Record<string, RejectionReasonCode> = {
  'non idoneo': 'not_suitable',
  'non idonea': 'not_suitable',
  'non e idoneo': 'not_suitable',
  'non e idonea': 'not_suitable',
  'non adatto': 'not_suitable',
  'non adatta': 'not_suitable',
  'profilo non idoneo': 'not_suitable',
  'not suitable': 'not_suitable',
  'esperienza insufficiente': 'insufficient_experience',
  'poca esperienza': 'insufficient_experience',
  'esperienza non sufficiente': 'insufficient_experience',
  'insufficient experience': 'insufficient_experience',
  'aspettative economiche': 'salary_expectations',
  'aspettative salariali': 'salary_expectations',
  'ral troppo alta': 'salary_expectations',
  'salary expectations': 'salary_expectations',
  'non disponibile': 'not_available',
  'non piu disponibile': 'not_available',
  indisponibile: 'not_available',
  'not available': 'not_available',
};

function normaliseKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseRejectionReason(raw: string | null | undefined): ParsedRejectionReason {
  if (!raw || !raw.trim()) return { code: null, note: null, legacy: false };
  const value = raw.trim();

  if (value.startsWith(OTHER_PREFIX)) {
    const note = value.slice(OTHER_PREFIX.length).trim();
    return { code: 'other', note: note || null, legacy: false };
  }
  if (isRejectionReasonCode(value)) {
    return { code: value, note: null, legacy: false };
  }
  const mapped = LEGACY_REASON_MAP[normaliseKey(value)] ?? null;
  if (mapped) return { code: mapped, note: value, legacy: true };

  return { code: null, note: value, legacy: true };
}
