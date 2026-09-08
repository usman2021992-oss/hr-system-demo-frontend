/**
 * Confirms the downloadable sample really exercises every outcome the guide
 * describes: clean rows, each blocking error, and each warning.
 */
import { describe, it, expect, vi } from 'vitest';

// XLSX.writeFile touches the filesystem; swap it for a capture so the generated
// workbook can be inspected. ESM namespaces cannot be spied, hence vi.mock.
const captureBox = vi.hoisted(() => ({ wb: null as unknown }));
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: (wb: unknown) => { captureBox.wb = wb; } };
});
import * as XLSX from 'xlsx';
import {
  downloadSampleEmployeesExcel, buildInitialMapping, validateRows,
  ParsedRow, ValidationContext, suggestFieldForHeader, analyzeColumns,
  FIELD_CATALOG, matchHeaderToField,
} from '../bulkImportUtils';
import { Company, Store, Employee } from '../../../types';

const companies = [{ id: 1, name: 'FUSARO UOMO' }] as Company[];
const stores = [{ id: 10, name: 'Milano', companyId: 1 }] as Store[];

function ctx(): ValidationContext {
  return {
    companies,
    stores,
    supervisors: [] as Employee[],
    existingEmails: new Set<string>(),
    storeHeadcount: new Map(),
    storeCapacity: new Map(),
  };
}

/** Captures the workbook the download helper would have written to disk. */
function buildSample(lang: string): ParsedRow[] {
  captureBox.wb = null;
  downloadSampleEmployeesExcel(lang, 'FUSARO UOMO', 'Milano');
  const wb = captureBox.wb as XLSX.WorkBook;
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return json.map((data, i) => ({ rowIndex: i + 2, data }));
}

describe('sample workbook', () => {
  it('produces 10 rows and a field-guide sheet', () => {
    captureBox.wb = null;
    downloadSampleEmployeesExcel('it', 'FUSARO UOMO', 'Milano');
    const captured = captureBox.wb as XLSX.WorkBook;
    expect(captured!.SheetNames).toHaveLength(2);
    const rows = XLSX.utils.sheet_to_json(captured!.Sheets[captured!.SheetNames[0]]);
    expect(rows).toHaveLength(10);
  });

  it('covers every documented outcome exactly once or more', () => {
    const rows = buildSample('it');
    const mapping = buildInitialMapping(Object.keys(rows[0].data));
    const res = validateRows(rows, mapping, ctx());

    const errorCodes = new Set(res.flatMap((r) => r.errors.map((e) => e.code)));
    const warnCodes = new Set(res.flatMap((r) => r.warnings.map((w) => w.code)));

    // Blocking scenarios the guide promises to demonstrate.
    expect(errorCodes).toContain('REQUIRED_MISSING');
    expect(errorCodes).toContain('INVALID_EMAIL');
    expect(errorCodes).toContain('ADMIN_NOT_ALLOWED');
    expect(errorCodes).toContain('INVALID_DATE');
    expect(errorCodes).toContain('STORE_NOT_FOUND');

    // Non-blocking scenario.
    expect(warnCodes).toContain('VALUE_NOT_RECOGNISED');

    // And there must still be clean rows, otherwise the sample teaches nothing
    // about success.
    const clean = res.filter((r) => r.errors.length === 0 && r.warnings.length === 0);
    expect(clean.length).toBeGreaterThanOrEqual(4);
  });

  it('leaves the Note column unmapped, demonstrating an extra column', () => {
    const rows = buildSample('it');
    const headers = Object.keys(rows[0].data);
    const mapping = buildInitialMapping(headers);
    expect(headers).toContain('Note');
    expect(mapping['Note']).toBe('');

    const cols = analyzeColumns(headers, mapping, mapping, rows);
    expect(cols.find((c) => c.header === 'Note')!.status).toBe('unmapped');
  });

  it('works in English too', () => {
    const rows = buildSample('en');
    const headers = Object.keys(rows[0].data);
    expect(headers).toContain('First name');
    expect(headers).toContain('Notes');
    const res = validateRows(rows, buildInitialMapping(headers), ctx());
    expect(res.filter((r) => r.errors.length === 0).length).toBeGreaterThanOrEqual(4);
  });
});

describe('column suggestions', () => {
  it('suggests a field for a header the alias table does not know', () => {
    expect(suggestFieldForHeader('Data assunzione dipendente')).toBe('hireDate');
    expect(suggestFieldForHeader('Personal e-mail address')).toBe('personalEmail');
  });

  it('returns null for a header with no plausible match', () => {
    expect(suggestFieldForHeader('Matricola interna XZ')).toBeNull();
    expect(suggestFieldForHeader('')).toBeNull();
  });

  it('labels a manually changed mapping as manual, not recognised', () => {
    const rows: ParsedRow[] = [{ rowIndex: 2, data: { Nome: 'Mario', Extra: 'x' } }];
    const auto = buildInitialMapping(['Nome', 'Extra']);
    const manual = { ...auto, Extra: 'department' };
    const cols = analyzeColumns(['Nome', 'Extra'], manual, auto, rows);
    expect(cols.find((c) => c.header === 'Nome')!.status).toBe('recognised');
    expect(cols.find((c) => c.header === 'Extra')!.status).toBe('manual');
  });

  it('flags two columns fighting over the same field', () => {
    const rows: ParsedRow[] = [{ rowIndex: 2, data: { A: '1', B: '2' } }];
    const mapping = { A: 'name', B: 'name' };
    const cols = analyzeColumns(['A', 'B'], mapping, {}, rows);
    expect(cols.every((c) => c.status === 'duplicate')).toBe(true);
  });
});

describe('catalogue and alias table stay in step', () => {
  /**
   * The sample file uses FIELD_CATALOG labels as its headers. If a label is not
   * also an alias, the file we ship cannot be re-imported — which is exactly
   * how the English sample silently broke.
   */
  it('every catalogue label resolves back to its own field', () => {
    const broken: string[] = [];
    for (const f of FIELD_CATALOG) {
      for (const label of [f.labelIt, f.labelEn]) {
        const got = matchHeaderToField(label);
        if (got !== f.key) broken.push(`"${label}" -> ${got ?? 'NONE'} (expected ${f.key})`);
      }
    }
    expect(broken).toEqual([]);
  });
});
