import { describe, it, expect } from 'vitest';
import { matchHeaderToField, normalizeHeader, COLUMN_MAP } from '../modules/employees/bulkImportUtils';

/**
 * The client's complaint: "a file exported from the platform can't be
 * re-imported without losing data". These tests pin the round trip - every
 * header and every value the exporter writes must be understood by the importer.
 *
 * They also cover the real-world Italian headers from his HR system export.
 */

/** Exactly the headers exportEmployeesToExcel writes. Keep in sync with it. */
const EXPORTED_HEADERS = [
  'Nome', 'Cognome', 'Email', 'Ruolo', 'Azienda', 'Negozio', 'Supervisore',
  'Dipartimento', 'Data assunzione', 'Orario di lavoro', 'Fine contratto',
  'Tipo contratto', 'Ore settimanali', 'Email personale', 'Data nascita',
  'Nazionalità', 'Genere', 'CAP', 'IBAN', 'Primo soccorso',
];

describe('export -> import round trip', () => {
  it('every exported column header is recognised by the importer', () => {
    const unmapped = EXPORTED_HEADERS.filter(h => !matchHeaderToField(h));
    expect(unmapped).toEqual([]);
  });

  it('exported headers map to the field they came from', () => {
    expect(matchHeaderToField('Nome')).toBe('name');
    expect(matchHeaderToField('Cognome')).toBe('surname');
    expect(matchHeaderToField('Email')).toBe('email');
    expect(matchHeaderToField('Orario di lavoro')).toBe('workingType');
    expect(matchHeaderToField('Primo soccorso')).toBe('firstAidFlag');
    expect(matchHeaderToField('Ore settimanali')).toBe('weeklyHours');
  });
});

describe('headers from a third-party Italian HR export', () => {
  it('accepts parenthetical qualifiers', () => {
    expect(matchHeaderToField('Nome (completo)')).toBe('name');
    expect(matchHeaderToField('Cognome (completo)')).toBe('surname');
  });

  it('accepts hyphenated E-mail', () => {
    expect(matchHeaderToField('E-mail')).toBe('email');
    expect(matchHeaderToField('E-mail personale')).toBe('personalEmail');
  });

  it('maps the aliases the client listed as missing', () => {
    expect(matchHeaderToField('Luogo di lavoro')).toBe('storeName');
    expect(matchHeaderToField('Scadenza contratto')).toBe('contractEndDate');
    expect(matchHeaderToField('Data di risoluzione')).toBe('terminationDate');
    expect(matchHeaderToField('Primo soccorritore')).toBe('firstAidFlag');
  });

  it('treats Italian "Stato" as employment status, not province', () => {
    // Writing "Attivo" into every employee's province was silent data corruption.
    expect(matchHeaderToField('Stato')).toBe('status');
    expect(matchHeaderToField('Provincia')).toBe('state');
  });

  it('is tolerant of case, spacing and separators', () => {
    expect(matchHeaderToField('  NOME  ')).toBe('name');
    expect(matchHeaderToField('Data_di_nascita')).toBe('dateOfBirth');
    expect(matchHeaderToField('Ore.settimanali')).toBe('weeklyHours');
  });
});

describe('normalizeHeader', () => {
  it('strips parentheses, separators and case', () => {
    expect(normalizeHeader('Nome (completo)')).toBe('nome');
    expect(normalizeHeader('E-mail')).toBe('e mail');
    expect(normalizeHeader('  Data_di   nascita ')).toBe('data di nascita');
  });
});

describe('COLUMN_MAP integrity', () => {
  it('has no key that would normalise to something different', () => {
    // A key the normaliser would rewrite can never be hit by matchHeaderToField
    // via the normalised path, which is how aliases silently stop working.
    const unreachable = Object.keys(COLUMN_MAP)
      .filter(k => normalizeHeader(k) !== k && !COLUMN_MAP[normalizeHeader(k)]);
    expect(unreachable).toEqual([]);
  });
});
