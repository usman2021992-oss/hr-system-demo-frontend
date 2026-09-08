/**
 * Validation-engine scenarios for the employee import wizard.
 *
 * These assert the behaviour the client asked for: an Italian file from a
 * third-party HR system must import cleanly, rough data must degrade into
 * reported skips and warnings rather than silent corruption, and an import must
 * never be able to create an administrator.
 */
import { describe, it, expect } from 'vitest';
import {
  validateRows,
  buildInitialMapping,
  ParsedRow,
  ValidationContext,
  REQUIRED_FIELD_KEYS,
  FIELD_CATALOG,
} from '../bulkImportUtils';
import { Company, Store, Employee } from '../../../types';

const companies = [{ id: 1, name: 'FUSARO UOMO' }, { id: 2, name: 'FEDER FASHION' }] as Company[];
const stores = [
  { id: 10, name: 'Milano', companyId: 1 },
  { id: 11, name: 'Roma', companyId: 1 },
  { id: 20, name: 'Napoli', companyId: 2 },
] as Store[];
const supervisors = [{ id: 5, name: 'Luca', surname: 'Bianchi', email: 'luca@x.it', role: 'hr' }] as Employee[];

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    companies,
    stores,
    supervisors,
    existingEmails: new Set<string>(),
    storeHeadcount: new Map<number, number>(),
    storeCapacity: new Map<number, number>(),
    ...over,
  };
}

/** Builds rows from the client's real Italian header names. */
function rowsFrom(records: Array<Record<string, unknown>>): ParsedRow[] {
  return records.map((data, i) => ({ rowIndex: i + 2, data }));
}

const GOOD = {
  'Nome (completo)': 'Mario',
  'Cognome (completo)': 'Rossi',
  'E-mail': 'mario.rossi@azienda.it',
  'Email personale': 'mario@gmail.com',
  'Ruolo': 'Dipendente',
  'Azienda': 'FUSARO UOMO',
  'Luogo di lavoro': 'Milano',
};

function validateOne(data: Record<string, unknown>, c = ctx()) {
  const rows = rowsFrom([data]);
  const mapping = buildInitialMapping(Object.keys(data));
  return validateRows(rows, mapping, c)[0];
}

describe('import: the client\'s Italian file', () => {
  it('accepts headers with brackets and hyphens', () => {
    const mapping = buildInitialMapping(Object.keys(GOOD));
    expect(mapping['Nome (completo)']).toBe('name');
    expect(mapping['Cognome (completo)']).toBe('surname');
    expect(mapping['E-mail']).toBe('email');
    expect(mapping['Luogo di lavoro']).toBe('storeName');
  });

  it('imports a clean Italian row with no errors', () => {
    const v = validateOne(GOOD);
    expect(v.errors).toEqual([]);
    expect(v.payload).not.toBeNull();
    expect(v.payload!.role).toBe('employee');
    expect(v.payload!.companyId).toBe(1);
    expect(v.payload!.storeId).toBe(10);
  });

  it('maps Stato to status, never to province', () => {
    const v = validateOne({ ...GOOD, Stato: 'Attivo' });
    expect(v.payload!.status).toBe('active');
    expect(v.payload!.state).toBeNull();
  });

  it('keeps Stato civile separate from Stato', () => {
    const v = validateOne({ ...GOOD, Stato: 'Attivo', 'Stato civile': 'Coniugato' });
    expect(v.payload!.status).toBe('active');
    expect(v.payload!.maritalStatus).toBe('Coniugato');
  });

  it('translates Italian values into English database tokens', () => {
    const v = validateOne({ ...GOOD, Genere: 'Maschio', 'Orario di lavoro': 'Tempo Pieno' });
    expect(v.payload!.gender).toBe('M');
    expect(v.payload!.workingType).toBe('full_time');
  });

  it('round-trips the platform\'s own export wording', () => {
    const v = validateOne({ ...GOOD, 'Orario di lavoro': 'Part-time' });
    expect(v.payload!.workingType).toBe('part_time');
  });
});

describe('import: blocking errors', () => {
  it('refuses to create an administrator', () => {
    const v = validateOne({ ...GOOD, Ruolo: 'Amministratore' });
    expect(v.payload).toBeNull();
    expect(v.errors.map((e) => e.code)).toContain('ADMIN_NOT_ALLOWED');
  });

  it('refuses the English spelling of admin too', () => {
    const v = validateOne({ ...GOOD, Ruolo: 'admin' });
    expect(v.errors.map((e) => e.code)).toContain('ADMIN_NOT_ALLOWED');
  });

  it('blocks an employee whose email already exists', () => {
    const v = validateOne(GOOD, ctx({ existingEmails: new Set(['mario.rossi@azienda.it']) }));
    expect(v.payload).toBeNull();
    expect(v.errors.map((e) => e.code)).toContain('ALREADY_EXISTS');
  });

  it('blocks the second of two identical emails but keeps the first', () => {
    const data = [GOOD, { ...GOOD, 'Nome (completo)': 'Marco' }];
    const rows = rowsFrom(data);
    const mapping = buildInitialMapping(Object.keys(GOOD));
    const res = validateRows(rows, mapping, ctx());
    expect(res[0].errors).toEqual([]);
    expect(res[1].errors.map((e) => e.code)).toContain('DUPLICATE_IN_FILE');
    expect(res[1].errors.find((e) => e.code === 'DUPLICATE_IN_FILE')!.detail).toBe('2');
  });

  it('blocks an unknown company', () => {
    const v = validateOne({ ...GOOD, Azienda: 'AZIENDA INESISTENTE' });
    expect(v.errors.map((e) => e.code)).toContain('COMPANY_NOT_FOUND');
  });

  it('blocks an unknown store', () => {
    const v = validateOne({ ...GOOD, 'Luogo di lavoro': 'Torino' });
    expect(v.errors.map((e) => e.code)).toContain('STORE_NOT_FOUND');
  });

  it('blocks a store that belongs to another company', () => {
    const v = validateOne({ ...GOOD, 'Luogo di lavoro': 'Napoli' });
    expect(v.errors.map((e) => e.code)).toContain('STORE_WRONG_COMPANY');
  });

  it('reports every missing required field, not just the first', () => {
    const v = validateOne({ 'Nome (completo)': 'Mario' });
    const missing = v.errors.filter((e) => e.code === 'REQUIRED_MISSING').map((e) => e.field);
    expect(missing).toEqual(expect.arrayContaining(REQUIRED_FIELD_KEYS.filter((k) => k !== 'name')));
  });

  it('blocks an invalid email address', () => {
    const v = validateOne({ ...GOOD, 'E-mail': 'not-an-email' });
    expect(v.errors.map((e) => e.code)).toContain('INVALID_EMAIL');
  });

  it('blocks an unparseable date', () => {
    const v = validateOne({ ...GOOD, 'Data di assunzione': 'domani' });
    expect(v.errors.map((e) => e.code)).toContain('INVALID_DATE');
  });
});

describe('import: warnings never block', () => {
  it('still imports when the store is over capacity', () => {
    const c = ctx({
      storeCapacity: new Map([[10, 1]]),
      storeHeadcount: new Map([[10, 1]]),
    });
    const v = validateOne(GOOD, c);
    expect(v.payload).not.toBeNull();
    expect(v.errors).toEqual([]);
    expect(v.warnings.map((w) => w.code)).toContain('STORE_OVER_CAPACITY');
  });

  it('counts the whole batch against capacity, not each row alone', () => {
    const c = ctx({ storeCapacity: new Map([[10, 2]]), storeHeadcount: new Map([[10, 0]]) });
    const data = [
      GOOD,
      { ...GOOD, 'E-mail': 'b@x.it' },
      { ...GOOD, 'E-mail': 'c@x.it' },
    ];
    const res = validateRows(rowsFrom(data), buildInitialMapping(Object.keys(GOOD)), c);
    expect(res[0].warnings).toEqual([]);
    expect(res[1].warnings).toEqual([]);
    expect(res[2].warnings.map((w) => w.code)).toContain('STORE_OVER_CAPACITY');
    expect(res[2].payload).not.toBeNull();
  });

  it('drops an unrecognised optional value with a warning instead of failing', () => {
    const v = validateOne({ ...GOOD, Genere: 'Sconosciuto' });
    expect(v.errors).toEqual([]);
    expect(v.payload!.gender).toBeNull();
    expect(v.warnings.map((w) => w.code)).toContain('VALUE_NOT_RECOGNISED');
  });

  it('warns when a supervisor name cannot be resolved', () => {
    const v = validateOne({ ...GOOD, Responsabile: 'Nessuno Esistente' });
    expect(v.errors).toEqual([]);
    expect(v.payload!.supervisorId).toBeNull();
    expect(v.warnings.map((w) => w.code)).toContain('SUPERVISOR_NOT_FOUND');
  });

  it('resolves a supervisor that does exist', () => {
    const v = validateOne({ ...GOOD, Responsabile: 'Luca Bianchi' });
    expect(v.payload!.supervisorId).toBe(5);
    expect(v.warnings).toEqual([]);
  });
});

describe('import: mapping control', () => {
  it('lets the operator remap a column the matcher guessed wrong', () => {
    const data = { ...GOOD, Stato: 'Lombardia' };
    const rows = rowsFrom([data]);
    const mapping = buildInitialMapping(Object.keys(data));
    // Operator overrides: this file's "Stato" really is the province.
    mapping['Stato'] = 'state';
    const v = validateRows(rows, mapping, ctx())[0];
    expect(v.payload!.state).toBe('Lombardia');
    expect(v.payload!.status).toBe('active');
  });

  it('ignores a column mapped to empty', () => {
    const data = { ...GOOD, Note: 'qualcosa' };
    const mapping = buildInitialMapping(Object.keys(data));
    mapping['Note'] = '';
    const v = validateRows(rowsFrom([data]), mapping, ctx())[0];
    expect(v.errors).toEqual([]);
  });

  it('does not let two columns claim the same field automatically', () => {
    const mapping = buildInitialMapping(['Nome', 'Nome (completo)']);
    const targets = Object.values(mapping).filter(Boolean);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('blocks every row when a required column is unmapped', () => {
    const mapping = buildInitialMapping(Object.keys(GOOD));
    mapping['E-mail'] = '';
    const v = validateRows(rowsFrom([GOOD]), mapping, ctx())[0];
    expect(v.errors.some((e) => e.code === 'REQUIRED_MISSING' && e.field === 'email')).toBe(true);
  });
});

describe('import: field catalogue integrity', () => {
  it('exposes exactly the seven required fields', () => {
    expect(REQUIRED_FIELD_KEYS.sort()).toEqual(
      ['companyName', 'email', 'name', 'personalEmail', 'role', 'storeName', 'surname'].sort(),
    );
  });

  it('has a unique key per field', () => {
    const keys = FIELD_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every field a label in both languages', () => {
    for (const f of FIELD_CATALOG) {
      expect(f.labelIt.length).toBeGreaterThan(0);
      expect(f.labelEn.length).toBeGreaterThan(0);
    }
  });
});
