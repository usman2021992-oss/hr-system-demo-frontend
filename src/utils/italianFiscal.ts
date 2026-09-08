// ---------------------------------------------------------------------------
// Client-side mirror of the backend Italian e-invoicing validators
// (see hr-system-demo-backend/src/utils/italianFiscal.ts).
//
// These fields are optional: companies created before they existed must keep
// saving with them blank. A value is therefore only checked once the user has
// actually typed something.
// ---------------------------------------------------------------------------

export type FiscalFieldValues = {
  vatNumber: string;
  sdiRecipientCode: string;
  pecEmail: string;
};

export type FiscalFieldErrors = {
  vatNumber?: string;
  sdiRecipientCode?: string;
  pecEmail?: string;
};

export const EMPTY_FISCAL_ERRORS: FiscalFieldErrors = {};

export function normalizePartitaIva(value: string): string {
  return value.replace(/[\s.\-]/g, '').replace(/^IT/i, '').toUpperCase();
}

export function isValidPartitaIva(value: string): boolean {
  const piva = normalizePartitaIva(value);
  if (!/^\d{11}$/.test(piva)) return false;

  let total = 0;
  for (let i = 0; i < 10; i += 1) {
    const digit = piva.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      total += digit;
    } else {
      const doubled = digit * 2;
      total += doubled > 9 ? doubled - 9 : doubled;
    }
  }

  const checkDigit = (10 - (total % 10)) % 10;
  return checkDigit === piva.charCodeAt(10) - 48;
}

export function isValidSdiCode(value: string): boolean {
  return /^[A-Z0-9]{6,7}$/.test(value.replace(/\s/g, '').toUpperCase());
}

export function isValidPecEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim().toLowerCase());
}

type Translate = (key: string, fallback: string) => string;

/**
 * Returns one entry per malformed field. An empty object means the form can be
 * submitted — including the common case where all three are left blank.
 */
export function validateFiscalFields(values: FiscalFieldValues, t: Translate): FiscalFieldErrors {
  const errors: FiscalFieldErrors = {};

  if (values.vatNumber.trim() !== '' && !isValidPartitaIva(values.vatNumber)) {
    errors.vatNumber = t('companies.vatNumberInvalid', 'Invalid VAT number (11 digits)');
  }
  if (values.sdiRecipientCode.trim() !== '' && !isValidSdiCode(values.sdiRecipientCode)) {
    errors.sdiRecipientCode = t('companies.sdiRecipientCodeInvalid', 'Invalid SDI code (6-7 characters)');
  }
  if (values.pecEmail.trim() !== '' && !isValidPecEmail(values.pecEmail)) {
    errors.pecEmail = t('companies.pecEmailInvalid', 'Invalid PEC address');
  }

  return errors;
}

export function hasFiscalErrors(errors: FiscalFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
