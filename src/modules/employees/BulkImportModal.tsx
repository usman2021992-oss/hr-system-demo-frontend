import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Upload, X, FileSpreadsheet, CheckCircle2, AlertTriangle, AlertCircle, Info,
  Download, BookOpen, Save, ArrowRight, ArrowLeft, Building2, Store as StoreIcon,
  Mail, Calendar, User, Hash, ShieldAlert, Copy, Maximize2, ChevronDown, Check, Ban, Wand2,
} from 'lucide-react';
import { getCompanies } from '../../api/companies';
import { getStores } from '../../api/stores';
import {
  getEmployees, getImportTemplates, saveImportTemplate, getImportPrecheck,
  bulkImportEmployees, ImportTemplate, ImportPrecheck,
} from '../../api/employees';
import { Company, Store, Employee } from '../../types';
import {
  parseExcelFile, ParsedRow,
  FIELD_CATALOG, REQUIRED_FIELD_KEYS, fieldLabel,
  buildInitialMapping, validateRows, RowValidation, RowIssue, IssueCode,
  ValidationContext, downloadSampleEmployeesExcel, analyzeColumns, ColumnInfo,
} from './bulkImportUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4;

/* ── Shared visual tokens ─────────────────────────────────────────────────── */

const OK = { fg: '#15803D', bg: 'rgba(21,128,61,0.10)', border: 'rgba(21,128,61,0.30)' };
const WARN = { fg: '#B45309', bg: 'rgba(245,158,11,0.11)', border: 'rgba(245,158,11,0.38)' };
const ERR = { fg: '#B91C1C', bg: 'rgba(220,38,38,0.09)', border: 'rgba(220,38,38,0.32)' };
const INFO = { fg: 'var(--primary)', bg: 'rgba(13,33,55,0.045)', border: 'var(--border)' };

/** One icon per issue kind, so a problem is recognisable before it is read. */
const ISSUE_ICON: Record<IssueCode, typeof AlertCircle> = {
  REQUIRED_MISSING: AlertCircle,
  INVALID_EMAIL: Mail,
  DUPLICATE_IN_FILE: Copy,
  ALREADY_EXISTS: User,
  COMPANY_NOT_FOUND: Building2,
  STORE_NOT_FOUND: StoreIcon,
  STORE_WRONG_COMPANY: Building2,
  INVALID_ROLE: ShieldAlert,
  ADMIN_NOT_ALLOWED: Ban,
  INVALID_DATE: Calendar,
  INVALID_NUMBER: Hash,
  STORE_OVER_CAPACITY: StoreIcon,
  SUPERVISOR_NOT_FOUND: User,
  VALUE_NOT_RECOGNISED: AlertTriangle,
};

function StatCard({ value, label, tone, icon }: { value: number | string; label: string; tone: 'ok' | 'warn' | 'err' | 'plain'; icon?: React.ReactNode }) {
  const c = tone === 'ok' ? OK : tone === 'warn' ? WARN : tone === 'err' ? ERR : null;
  return (
    <div style={{ padding: '10px 13px', borderRadius: 11, background: c ? c.bg : 'var(--background)', border: `1px solid ${c ? c.border : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <span style={{ color: c ? c.fg : 'var(--text-muted)', display: 'flex' }}>{icon}</span>}
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1, color: c ? c.fg : 'var(--text-primary)' }}>{value}</div>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function Banner({ tone, icon, title, body, html }: { tone: 'ok' | 'warn' | 'err' | 'info'; icon: React.ReactNode; title: string; body?: string; html?: boolean }) {
  const c = tone === 'ok' ? OK : tone === 'warn' ? WARN : tone === 'err' ? ERR : INFO;
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 13px', borderRadius: 10, background: c.bg, border: `1px solid ${c.border}` }}>
      <span style={{ color: c.fg, flexShrink: 0, marginTop: 1, display: 'flex' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        {html
          ? <div style={{ fontSize: 12.5, fontWeight: 600, color: c.fg, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: title }} />
          : <div style={{ fontSize: 12.5, fontWeight: 700, color: c.fg, lineHeight: 1.45 }}>{title}</div>}
        {body && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{body}</div>}
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'info' | 'muted'; children: React.ReactNode }) {
  const c = tone === 'ok' ? OK : tone === 'warn' ? WARN : tone === 'err' ? ERR : tone === 'info' ? INFO
    : { fg: 'var(--text-muted)', bg: 'var(--background)', border: 'var(--border)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999,
      fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
      color: c.fg, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

/* ── Custom field dropdown ────────────────────────────────────────────────── */

/**
 * Replaces the native <select>, whose option list is drawn by the OS and cannot
 * be styled — it looked foreign next to the rest of the wizard and gave no room
 * for the required marker or the stored-value hint.
 */
function FieldSelect({ value, onChange, lang, invalid }: {
  value: string; onChange: (v: string) => void; lang: string; invalid?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = FIELD_CATALOG.find((f) => f.key === value);
  const required = FIELD_CATALOG.filter((f) => f.required);
  const optional = FIELD_CATALOG.filter((f) => !f.required);

  const row = (key: string, label: string, req: boolean) => (
    <button
      key={key || 'none'}
      onMouseDown={(e) => { e.preventDefault(); onChange(key); setOpen(false); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '7px 11px', border: 'none', cursor: 'pointer', fontSize: 12,
        background: key === value ? 'rgba(13,33,55,0.06)' : 'transparent',
        color: key ? 'var(--text-primary)' : 'var(--text-muted)',
        fontWeight: key === value ? 700 : 500,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,151,58,0.10)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = key === value ? 'rgba(13,33,55,0.06)' : 'transparent'; }}
    >
      <span style={{ width: 13, display: 'flex', flexShrink: 0, color: OK.fg }}>
        {key === value && <Check size={13} strokeWidth={3} />}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {req && <span style={{ color: ERR.fg, fontWeight: 800, fontSize: 11 }}>*</span>}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
          borderRadius: 8, border: `1px solid ${invalid ? ERR.border : open ? 'var(--accent)' : 'var(--border)'}`,
          background: 'var(--surface)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
          color: current ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: current ? 600 : 400,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? fieldLabel(current.key, lang) : t('employees.importMappingIgnore')}
        </span>
        {current?.required && <span style={{ color: ERR.fg, fontWeight: 800 }}>*</span>}
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          maxHeight: 280, overflowY: 'auto', background: 'var(--surface)', borderRadius: 10,
          border: '1px solid var(--border)', boxShadow: '0 16px 40px rgba(13,33,55,0.22)', padding: 4,
        }}>
          {row('', t('employees.importMappingIgnore'), false)}
          <div style={{ padding: '5px 11px 3px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: ERR.fg }}>
            {t('employees.importGuideColRequired')}
          </div>
          {required.map((f) => row(f.key, fieldLabel(f.key, lang), true))}
          <div style={{ padding: '7px 11px 3px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
            {t('employees.importGuideColName')}
          </div>
          {optional.map((f) => row(f.key, fieldLabel(f.key, lang), false))}
        </div>
      )}
    </div>
  );
}

/* ── Guide modal ──────────────────────────────────────────────────────────── */

/** Mock spreadsheet used to show, rather than describe, a good and a bad file. */
function MiniSheet({ cols, rows, badCells, extraCol }: {
  cols: string[]; rows: string[][]; badCells?: Array<[number, number, 'err' | 'warn']>; extraCol?: number;
}) {
  const cellTone = (r: number, c: number) => badCells?.find(([br, bc]) => br === r && bc === c)?.[2];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--surface-warm)' }}>
              {cols.map((c, i) => (
                <th key={c} style={{
                  padding: '6px 9px', fontSize: 10, fontWeight: 800, textAlign: 'left', whiteSpace: 'nowrap',
                  borderBottom: '1px solid var(--border)',
                  color: extraCol === i ? WARN.fg : 'var(--text-primary)',
                  background: extraCol === i ? WARN.bg : undefined,
                }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => {
                  const tone = cellTone(ri, ci);
                  return (
                    <td key={ci} style={{
                      padding: '5px 9px', fontSize: 10.5, whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--border-light)',
                      color: tone === 'err' ? ERR.fg : tone === 'warn' ? WARN.fg : 'var(--text-secondary)',
                      background: tone === 'err' ? ERR.bg : tone === 'warn' ? WARN.bg : extraCol === ci ? 'rgba(245,158,11,0.05)' : undefined,
                      fontWeight: tone ? 700 : 500,
                    }}>
                      {cell || <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GuideModal({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: string }) {
  const { t } = useTranslation();
  if (!open) return null;

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '7px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: 0.4, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
    position: 'sticky', top: 0, background: 'var(--surface-warm)', zIndex: 1,
  };
  const td: React.CSSProperties = {
    padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-light)', verticalAlign: 'top',
  };

  const CASES: Array<{ key: string; blocking: boolean }> = [
    { key: 'MissingCol', blocking: true },
    { key: 'WrongCompany', blocking: true },
    { key: 'Duplicate', blocking: true },
    { key: 'Admin', blocking: true },
    { key: 'ExtraCol', blocking: false },
    { key: 'Capacity', blocking: false },
    { key: 'UnknownValue', blocking: false },
  ];

  const section = (title: string) => (
    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 3, height: 14, background: 'var(--accent)', borderRadius: 2 }} />
      {title}
    </div>
  );

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,33,55,0.58)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1000px, 100%)', height: 'min(88vh, 900px)', background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(13,33,55,0.30)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <BookOpen size={18} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', flex: 1 }}>
            {t('employees.importGuideTitle')}
          </h3>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* How it works */}
          {section(t('employees.importGuideSectionHow'))}
          <Banner tone="info" icon={<Info size={15} />} title={t('employees.importGuideIntro')} />
          <Banner tone="info" icon={<Info size={15} />} title={t('employees.importGuideLangNote')} />

          {/* Visual: good vs bad file */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} color={OK.fg} />
                <span style={{ fontSize: 12, fontWeight: 800, color: OK.fg }}>{t('employees.importGuideExampleGood')}</span>
              </div>
              <MiniSheet
                cols={['Nome', 'Cognome', 'E-mail', 'Ruolo', 'Azienda', 'Luogo di lavoro']}
                rows={[
                  ['Mario', 'Rossi', 'm.rossi@a.it', 'Dipendente', 'FUSARO UOMO', 'Milano'],
                  ['Giulia', 'Bianchi', 'g.b@a.it', 'Responsabile Negozio', 'FUSARO UOMO', 'Roma'],
                ]}
              />
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('employees.importGuideExampleGoodDesc')}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} color={ERR.fg} />
                <span style={{ fontSize: 12, fontWeight: 800, color: ERR.fg }}>{t('employees.importGuideExampleBad')}</span>
              </div>
              <MiniSheet
                cols={['Nome', 'Cognome', 'E-mail', 'Ruolo', 'Azienda', 'Matricola']}
                rows={[
                  ['Marco', 'Conti', '', 'Dipendente', 'FUSARO UOMO', 'A-114'],
                  ['Elena', 'Barbieri', 'e.b@a.it', 'Amministratore', 'AZIENDA X', 'A-115'],
                ]}
                badCells={[[0, 2, 'err'], [1, 3, 'err'], [1, 4, 'err']]}
                extraCol={5}
              />
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('employees.importGuideExampleBadDesc')}</div>
            </div>
          </div>

          {/* The 4 steps */}
          {section(t('employees.importGuideSectionSteps'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} style={{ padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--background)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)' }}>{t(`employees.importStep${n}`)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: t(`employees.importGuideStep${n}Desc`) }} />
              </div>
            ))}
          </div>

          {/* Edge cases */}
          {section(t('employees.importGuideSectionCases'))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CASES.map(({ key, blocking }) => (
              <div key={key} style={{ padding: '10px 13px', borderRadius: 10, border: `1px solid ${blocking ? ERR.border : WARN.border}`, background: blocking ? ERR.bg : WARN.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: blocking ? ERR.fg : WARN.fg }}>{t(`employees.importCase${key}`)}</span>
                  <Pill tone={blocking ? 'err' : 'warn'}>
                    {blocking ? t('employees.importGuideCaseBlocking') : t('employees.importGuideCaseWarning')}
                  </Pill>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  <b style={{ color: 'var(--text-primary)' }}>{t('employees.importGuideSolution')}:</b> {t(`employees.importCase${key}Fix`)}
                </div>
              </div>
            ))}
          </div>

          {/* Field reference */}
          {section(t('employees.importGuideSectionFields'))}
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: t('employees.importGuideFieldsIntro') }} />
          <Banner tone="err" icon={<AlertCircle size={14} />} title={t('employees.importGuideRequiredLegend')} />

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ maxHeight: 340, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr>
                    <th style={th}>{t('employees.importGuideColName')} (IT)</th>
                    <th style={th}>{t('employees.importGuideColName')} (EN)</th>
                    <th style={th}>{t('employees.importGuideColRequired')}</th>
                    <th style={th}>{t('employees.importGuideColAccepts')}</th>
                    <th style={th}>{t('employees.importGuideColStored')}</th>
                    <th style={th}>{t('employees.importGuideColExample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_CATALOG.map((f) => (
                    <tr key={f.key} style={{ background: f.required ? 'rgba(220,38,38,0.035)' : undefined }}>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--text-primary)' }}>{f.labelIt}</td>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--text-primary)' }}>{f.labelEn}</td>
                      <td style={td}>
                        {f.required
                          ? <Pill tone="err">{t('employees.importGuideRequiredYes')}</Pill>
                          : <span style={{ opacity: 0.55 }}>{t('employees.importGuideRequiredNo')}</span>}
                      </td>
                      <td style={td}>{(f.accepts ?? []).join('  ·  ') || <span style={{ opacity: 0.4 }}>—</span>}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 10, color: 'var(--primary)' }}>{f.storedAs ?? '—'}</td>
                      <td style={td}>{f.example || <span style={{ opacity: 0.4 }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ padding: '11px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0, background: 'var(--surface-warm)' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t('employees.importGuideClose')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Main wizard ──────────────────────────────────────────────────────────── */

export function BulkImportModal({ open, onClose, onComplete }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'it';
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMapping, setAutoMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [precheck, setPrecheck] = useState<ImportPrecheck | null>(null);

  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1); setFile(null); setRows([]); setHeaders([]); setMapping({}); setAutoMapping({});
    setError(null); setGuideOpen(false); setEditorOpen(false); setOnlyErrors(false);
    setTemplateName(''); setTemplateMsg(null); setImporting(false); setDoneCount(null); setImportError(null);

    getCompanies().then(setCompanies).catch(() => {});
    getStores().then(setStores).catch(() => {});
    getEmployees({ limit: 500 })
      .then((r) => setSupervisors(r.employees.filter((e: Employee) => ['admin', 'hr', 'area_manager', 'store_manager'].includes(e.role))))
      .catch(() => {});
    getImportTemplates().then(setTemplates).catch(() => {});
    getImportPrecheck().then(setPrecheck).catch(() => setPrecheck({ emails: [], stores: [] }));
  }, [open]);

  const ctx: ValidationContext = useMemo(() => ({
    companies,
    stores,
    supervisors,
    existingEmails: new Set((precheck?.emails ?? []).map((e) => e.toLowerCase())),
    storeHeadcount: new Map((precheck?.stores ?? []).map((s) => [s.id, s.activeCount])),
    storeCapacity: new Map((precheck?.stores ?? []).map((s) => [s.id, s.maxStaff])),
  }), [companies, stores, supervisors, precheck]);

  const validations: RowValidation[] = useMemo(
    () => (rows.length ? validateRows(rows, mapping, ctx) : []),
    [rows, mapping, ctx],
  );

  const columns: ColumnInfo[] = useMemo(
    () => analyzeColumns(headers, mapping, autoMapping, rows),
    [headers, mapping, autoMapping, rows],
  );

  const unmappedColumns = useMemo(() => columns.filter((c) => c.status === 'unmapped'), [columns]);

  const counts = useMemo(() => {
    const errs = validations.filter((v) => v.errors.length > 0).length;
    const warns = validations.filter((v) => v.errors.length === 0 && v.warnings.length > 0).length;
    const companySet = new Set<string>();
    const storeSet = new Set<string>();
    for (const v of validations) {
      if (v.display.company) companySet.add(v.display.company.toLowerCase());
      if (v.display.store) storeSet.add(v.display.store.toLowerCase());
    }
    return {
      total: validations.length,
      valid: validations.length - errs,
      errors: errs,
      warnings: warns,
      companies: companySet.size,
      stores: storeSet.size,
    };
  }, [validations]);

  const mappedFields = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const missingRequired = useMemo(() => REQUIRED_FIELD_KEYS.filter((k) => !mappedFields.has(k)), [mappedFields]);

  /** Sample uses the tenant's own company/store so most rows validate cleanly. */
  const handleDownloadSample = useCallback(() => {
    const company = companies[0];
    const store = company ? stores.find((s) => s.companyId === company.id) : undefined;
    downloadSampleEmployeesExcel(lang, company?.name ?? '', store?.name ?? '');
  }, [companies, stores, lang]);

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      setError(t('employees.importAccepted'));
      return;
    }
    try {
      const parsed = await parseExcelFile(f);
      if (parsed.length === 0) {
        setError(t('employees.bulkImportNoData', 'No valid data rows found.'));
        return;
      }
      const hs = Object.keys(parsed[0].data);
      const auto = buildInitialMapping(hs);
      setFile(f); setRows(parsed); setHeaders(hs); setMapping(auto); setAutoMapping(auto);
      setStep(2);
    } catch {
      setError(t('employees.bulkImportNoData', 'Failed to parse file.'));
    }
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const editCell = useCallback((rowIndex: number, header: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, data: { ...r.data, [header]: value } } : r)));
  }, []);

  const issueText = useCallback((issue: RowIssue) => {
    const label = fieldLabel(issue.field, lang);
    const reason = t(`employees.importIssue${issue.code}`, { detail: issue.detail ?? '' });
    return `${label}: ${reason}`;
  }, [t, lang]);

  const handleImport = useCallback(async () => {
    const payloads = validations.filter((v) => v.payload).map((v) => v.payload!);
    if (payloads.length === 0) return;
    setImporting(true); setImportError(null);
    try {
      const res = await bulkImportEmployees(payloads);
      setDoneCount(res.createdCount);
      onComplete();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setImportError(data?.error || t('employees.importFailedBody'));
    } finally {
      setImporting(false);
    }
  }, [validations, onComplete, t]);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) return;
    try {
      const saved = await saveImportTemplate(templateName.trim(), mapping);
      setTemplates((prev) => [...prev.filter((x) => x.id !== saved.id), saved]);
      setTemplateName('');
      setTemplateMsg(t('employees.importTemplateSaved'));
      setTimeout(() => setTemplateMsg(null), 2500);
    } catch { /* surfaced by the generic error banner */ }
  }, [templateName, mapping, t]);

  const applyTemplate = useCallback((tpl: ImportTemplate) => {
    const next: Record<string, string> = {};
    for (const h of headers) next[h] = tpl.mappingJson[h] ?? '';
    setMapping(next);
    setTemplateMsg(t('employees.importTemplateApplied'));
    setTimeout(() => setTemplateMsg(null), 2500);
  }, [headers, t]);

  if (!open) return null;

  const canNext = step === 1 ? rows.length > 0 : step !== 4;
  const visibleRows = onlyErrors ? validations.filter((v) => v.errors.length > 0) : validations;
  const creatable = validations.filter((v) => v.payload);

  /* ── Step 1 ─────────────────────────────────────────────────────────── */

  const renderStep1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          background: dragOver ? 'rgba(201,151,58,0.06)' : 'var(--background)',
          borderRadius: 16, padding: '38px 26px 30px', textAlign: 'center',
          transition: 'border-color .15s, background .15s',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        }}
      >
        <div
          onClick={() => fileRef.current?.click()}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: '100%' }}
        >
          <div style={{
            width: 62, height: 62, borderRadius: '50%', marginBottom: 6,
            background: dragOver ? 'rgba(201,151,58,0.16)' : 'var(--surface)',
            border: `1px solid ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: dragOver ? 'var(--accent)' : 'var(--primary)',
          }}>
            <Upload size={26} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {t('employees.importDropzone')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('employees.importAccepted')}</div>
        </div>

        {/* Helpers live inside the drop area: they are what an operator needs
            before choosing a file, not afterwards. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 420, margin: '14px 0 10px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-disabled)' }}>
            {t('employees.importOr')}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setGuideOpen(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 1px 2px rgba(13,33,55,0.05)',
            }}
          >
            <BookOpen size={17} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{t('employees.importOpenGuide')}</span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>{t('employees.importGuideSub')}</span>
            </span>
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); handleDownloadSample(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left',
              boxShadow: '0 1px 2px rgba(13,33,55,0.05)',
            }}
          >
            <Download size={17} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{t('employees.importDownloadSample')}</span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>{t('employees.importSampleSub')}</span>
            </span>
          </button>
        </div>

        <div style={{ fontSize: 10.5, color: 'var(--text-disabled)', marginTop: 12 }}>{t('employees.importDropHint')}</div>
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

      {error && <Banner tone="err" icon={<AlertCircle size={15} />} title={error} />}
    </div>
  );

  /* ── Step 2 ─────────────────────────────────────────────────────────── */

  const renderRowTable = (maxHeight: number) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden' }}>
      <div style={{ maxHeight, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
            <tr style={{ background: 'var(--surface-warm)' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface-warm)', zIndex: 4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-primary)' }}>{t('employees.importRowNumber')}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{t('employees.importRowFileRef')}</div>
              </th>
              {columns.map((col) => (
                <th key={col.header} style={{
                  padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
                  background: col.status === 'unmapped' ? 'rgba(245,158,11,0.10)' : undefined,
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: col.status === 'unmapped' ? WARN.fg : 'var(--text-primary)' }}>
                    {col.header}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, color: col.status === 'unmapped' ? WARN.fg : 'var(--accent)' }}>
                    {col.status === 'unmapped'
                      ? <><Ban size={9} /> {t('employees.importColumnIgnored')}</>
                      : <><ArrowRight size={9} /> {fieldLabel(col.field, lang)}</>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((v, displayIdx) => {
              const row = rows.find((r) => r.rowIndex === v.rowIndex)!;
              const seqNo = validations.findIndex((x) => x.rowIndex === v.rowIndex) + 1;
              const issuesByField = new Map<string, RowIssue[]>();
              for (const i of [...v.errors, ...v.warnings]) {
                issuesByField.set(i.field, [...(issuesByField.get(i.field) ?? []), i]);
              }
              const hasError = v.errors.length > 0;
              return (
                <React.Fragment key={v.rowIndex}>
                  <tr style={{ background: hasError ? ERR.bg : displayIdx % 2 ? 'rgba(13,33,55,0.015)' : undefined }}>
                    <td style={{
                      padding: '6px 10px', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border)',
                      whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
                      background: hasError ? '#FBEAEA' : 'var(--surface)',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-primary)' }}>{seqNo}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{v.rowIndex}</div>
                    </td>
                    {columns.map((col) => {
                      const fieldIssues = col.field ? issuesByField.get(col.field) ?? [] : [];
                      const isError = fieldIssues.some((i) => v.errors.includes(i));
                      const isWarn = !isError && fieldIssues.length > 0;
                      return (
                        <td key={col.header} style={{
                          padding: 0, borderBottom: '1px solid var(--border-light)',
                          background: isError ? 'rgba(220,38,38,0.14)' : isWarn ? 'rgba(245,158,11,0.14)' : undefined,
                        }} title={fieldIssues.map(issueText).join('\n')}>
                          <input
                            value={String(row.data[col.header] ?? '')}
                            onChange={(e) => editCell(v.rowIndex, col.header, e.target.value)}
                            style={{
                              width: '100%', minWidth: 118, border: 'none', outline: 'none', background: 'transparent',
                              padding: '7px 10px', fontSize: 11.5, fontFamily: 'var(--font-body)',
                              color: col.field ? 'var(--text-primary)' : 'var(--text-disabled)',
                              fontWeight: isError ? 700 : 500,
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {(v.errors.length > 0 || v.warnings.length > 0) && (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ padding: '5px 10px 8px', borderBottom: '1px solid var(--border-light)', background: hasError ? 'rgba(220,38,38,0.045)' : 'rgba(245,158,11,0.055)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {[...v.errors.map((i) => ({ i, err: true })), ...v.warnings.map((i) => ({ i, err: false }))].map(({ i, err }, n) => {
                            const Icon = ISSUE_ICON[i.code] ?? AlertCircle;
                            const c = err ? ERR : WARN;
                            return (
                              <span key={n} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700,
                                color: c.fg, background: 'var(--surface)', border: `1px solid ${c.border}`,
                                borderRadius: 6, padding: '3px 8px',
                              }}>
                                <Icon size={11} />
                                {issueText(i)}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 9 }}>
        <StatCard value={counts.total} label={t('employees.importTotalRows')} tone="plain" />
        <StatCard value={counts.valid} label={t('employees.importValidRows')} tone="ok" icon={<CheckCircle2 size={14} />} />
        <StatCard value={counts.errors} label={t('employees.importErrorRows')} tone="err" icon={<AlertCircle size={14} />} />
        <StatCard value={counts.warnings} label={t('employees.importWarningRows')} tone="warn" icon={<AlertTriangle size={14} />} />
        <StatCard value={counts.companies} label={t('employees.importDetectedCompanies')} tone="plain" icon={<Building2 size={14} />} />
        <StatCard value={counts.stores} label={t('employees.importDetectedStores')} tone="plain" icon={<StoreIcon size={14} />} />
      </div>

      {/* Scenario-aware messaging: only the conditions that actually apply are
          shown, and everything disappears once the file is clean. */}
      {counts.errors === 0 && counts.warnings === 0 && unmappedColumns.length === 0 ? (
        <Banner tone="ok" icon={<CheckCircle2 size={15} />} title={t('employees.importBannerAllGood')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {counts.errors > 0 && (
            <Banner tone="err" icon={<AlertCircle size={15} />}
              title={t('employees.importBannerErrors', { count: counts.errors })}
              body={t('employees.importBannerFixHint')} />
          )}
          {counts.warnings > 0 && (
            <Banner tone="warn" icon={<AlertTriangle size={15} />} title={t('employees.importBannerWarnings', { count: counts.warnings })} />
          )}
          {unmappedColumns.length > 0 && (
            <Banner tone="info" icon={<Info size={15} />}
              title={t('employees.importBannerUnmapped', { count: unmappedColumns.length })}
              body={unmappedColumns.map((c) => c.header).join(' · ')} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('employees.importEditCell')}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {counts.errors > 0 && (
            <button
              onClick={() => setOnlyErrors((v) => !v)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${onlyErrors ? ERR.border : 'var(--border)'}`,
                background: onlyErrors ? ERR.bg : 'var(--surface)',
                color: onlyErrors ? ERR.fg : 'var(--text-secondary)',
              }}
            >
              {onlyErrors ? t('employees.importShowAllRows') : t('employees.importShowOnlyErrors')}
            </button>
          )}
          <button
            onClick={() => setEditorOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--primary)',
            }}
          >
            <Maximize2 size={13} /> {t('employees.importOpenEditor')}
          </button>
        </div>
      </div>

      {renderRowTable(400)}
    </div>
  );

  /* ── Step 3 ─────────────────────────────────────────────────────────── */

  const statusPill = (col: ColumnInfo) => {
    if (col.status === 'duplicate') return <Pill tone="err"><Copy size={9} /> {t('employees.importStatusDuplicate')}</Pill>;
    if (col.status === 'recognised') return <Pill tone="ok"><Check size={9} /> {t('employees.importStatusRecognised')}</Pill>;
    if (col.status === 'manual') return <Pill tone="info"><Wand2 size={9} /> {t('employees.importStatusManual')}</Pill>;
    if (col.suggestion) return <Pill tone="warn"><Wand2 size={9} /> {t('employees.importStatusSuggested')}</Pill>;
    return <Pill tone="muted"><Ban size={9} /> {t('employees.importStatusUnmapped')}</Pill>;
  };

  const renderStep3 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <Banner tone="info" icon={<Info size={15} />} title={t('employees.importMappingIntro')} />

      {missingRequired.length > 0 ? (
        <Banner tone="err" icon={<AlertCircle size={15} />} title={t('employees.importMappingMissing')}
          body={missingRequired.map((k) => fieldLabel(k, lang)).join(' · ')} />
      ) : (
        <Banner tone="ok" icon={<CheckCircle2 size={15} />} title={t('employees.importMappingAllSet')} />
      )}

      {templates.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{t('employees.importSelectTemplate')}:</span>
          {templates.map((tpl) => (
            <button key={tpl.id} onClick={() => applyTemplate(tpl)}
              style={{ padding: '5px 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-warm)', fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', cursor: 'pointer' }}>
              {tpl.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'visible' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.15fr 0.75fr 0.95fr 1.15fr', gap: 10,
          background: 'var(--surface-warm)', padding: '8px 13px', fontSize: 10,
          fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)', borderRadius: '11px 11px 0 0',
        }}>
          <div>{t('employees.importMappingYourColumn')}</div>
          <div>{t('employees.importColMapStatus')}</div>
          <div>{t('employees.importMappingSample')}</div>
          <div>{t('employees.importMappingTarget')}</div>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', overflowX: 'visible' }}>
          {columns.map((col) => {
            const def = FIELD_CATALOG.find((f) => f.key === col.field);
            return (
              <div key={col.header} style={{
                display: 'grid', gridTemplateColumns: '1.15fr 0.75fr 0.95fr 1.15fr', gap: 10, alignItems: 'center',
                padding: '9px 13px', borderBottom: '1px solid var(--border-light)',
                background: col.status === 'duplicate' ? ERR.bg : undefined,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {col.header}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                  {statusPill(col)}
                  {col.suggestion && !col.field && (
                    <button
                      onClick={() => setMapping((prev) => ({ ...prev, [col.header]: col.suggestion! }))}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 6, border: `1px solid ${WARN.border}`, background: 'var(--surface)', color: WARN.fg, fontSize: 9.5, fontWeight: 800, cursor: 'pointer' }}
                    >
                      {t('employees.importApplySuggestion')}: {fieldLabel(col.suggestion, lang)}
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {col.sample || '—'}
                </div>

                <div>
                  <FieldSelect
                    value={col.field}
                    invalid={col.status === 'duplicate'}
                    lang={lang}
                    onChange={(v) => setMapping((prev) => ({ ...prev, [col.header]: v }))}
                  />
                  {col.status === 'duplicate' && (
                    <div style={{ fontSize: 9.5, color: ERR.fg, fontWeight: 700, marginTop: 3 }}>{t('employees.importMappingDuplicate')}</div>
                  )}
                  {def?.storedAs && (
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'monospace' }}>→ {def.storedAs}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={t('employees.importTemplateName')}
          style={{ flex: '1 1 200px', padding: '8px 11px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', outline: 'none', color: 'var(--text-primary)' }} />
        <button onClick={handleSaveTemplate} disabled={!templateName.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface-warm)', fontSize: 12.5, fontWeight: 700,
            color: templateName.trim() ? 'var(--primary)' : 'var(--text-disabled)',
            cursor: templateName.trim() ? 'pointer' : 'not-allowed',
          }}>
          <Save size={14} /> {t('employees.importSaveTemplate')}
        </button>
        {templateMsg && <span style={{ fontSize: 11.5, fontWeight: 700, color: OK.fg }}>✓ {templateMsg}</span>}
      </div>
    </div>
  );

  /* ── Step 4 ─────────────────────────────────────────────────────────── */

  const renderStep4 = () => {
    const skipped = validations.filter((v) => v.errors.length > 0);
    const warned = validations.filter((v) => v.errors.length === 0 && v.warnings.length > 0);

    const groups = new Map<string, number>();
    for (const v of creatable) {
      groups.set(`${v.display.company}||${v.display.store}`, (groups.get(`${v.display.company}||${v.display.store}`) ?? 0) + 1);
    }
    const roleCounts = new Map<string, number>();
    for (const v of creatable) {
      const r = String(v.payload!.role);
      roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
    }

    if (doneCount !== null) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, padding: '46px 20px', textAlign: 'center' }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: OK.bg, border: `1px solid ${OK.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={34} color={OK.fg} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{t('employees.importDoneTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('employees.importDoneCreated', { count: doneCount })}</div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 9 }}>
          <StatCard value={creatable.length} label={t('employees.importSummaryCreate')} tone="ok" icon={<CheckCircle2 size={14} />} />
          <StatCard value={skipped.length} label={t('employees.importSummarySkip')} tone="err" icon={<Ban size={14} />} />
          <StatCard value={warned.length} label={t('employees.importSummaryWarn')} tone="warn" icon={<AlertTriangle size={14} />} />
          <StatCard value={counts.companies} label={t('employees.importDetectedCompanies')} tone="plain" icon={<Building2 size={14} />} />
        </div>

        {skipped.length === 0
          ? <Banner tone="ok" icon={<CheckCircle2 size={15} />} title={t('employees.importSummaryReady')} />
          : <Banner tone="warn" icon={<AlertTriangle size={15} />} title={t('employees.importSummaryPartial', { skip: skipped.length, ok: creatable.length })} />}

        {importError && <Banner tone="err" icon={<AlertCircle size={15} />} title={t('employees.importFailedTitle')} body={importError} />}

        {creatable.length === 0 ? (
          <Banner tone="err" icon={<AlertCircle size={15} />} title={t('employees.importSummaryNothing')} />
        ) : (
          <>
            <div style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden' }}>
              <div style={{ padding: '9px 13px', borderBottom: '1px solid var(--border)', background: 'var(--surface-warm)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)' }}>
                {t('employees.importSummaryByCompany')}
              </div>
              <div style={{ padding: 9, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {[...groups.entries()].map(([key, n]) => {
                  const [company, store] = key.split('||');
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                      <Building2 size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{company || '—'}</span>
                      <StoreIcon size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{store || '—'}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: OK.fg, background: OK.bg, border: `1px solid ${OK.border}`, borderRadius: 999, padding: '2px 10px' }}>+{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {[...roleCounts.entries()].map(([role, n]) => (
                <span key={role} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-warm)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  <User size={12} color="var(--primary)" />
                  {t(`roles.${role}`, role)}
                  <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{n}</span>
                </span>
              ))}
            </div>

            <Banner tone="info" icon={<Info size={15} />} title={t('employees.importSummaryPasswordNote')} />
          </>
        )}

        {skipped.length > 0 && (
          <div style={{ border: `1px solid ${ERR.border}`, borderRadius: 11, overflow: 'hidden' }}>
            <div style={{ padding: '9px 13px', background: ERR.bg, fontSize: 11.5, fontWeight: 800, color: ERR.fg, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Ban size={14} /> {t('employees.importSummarySkippedTitle')} · {skipped.length}
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', padding: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {skipped.map((v) => (
                <div key={v.rowIndex} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontSize: 11.5, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>{t('employees.importRowLabel')} {v.rowIndex}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{v.display.name || '—'}</span>
                  <span style={{ color: ERR.fg }}>{v.errors.map(issueText).join(' · ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {warned.length > 0 && (
          <div style={{ border: `1px solid ${WARN.border}`, borderRadius: 11, overflow: 'hidden' }}>
            <div style={{ padding: '9px 13px', background: WARN.bg, fontSize: 11.5, fontWeight: 800, color: WARN.fg, display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertTriangle size={14} /> {t('employees.importSummaryWarningsTitle')} · {warned.length}
            </div>
            <div style={{ maxHeight: 160, overflowY: 'auto', padding: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {warned.map((v) => (
                <div key={v.rowIndex} style={{ display: 'flex', gap: 9, alignItems: 'baseline', fontSize: 11.5, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0 }}>{t('employees.importRowLabel')} {v.rowIndex}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{v.display.name || '—'}</span>
                  <span style={{ color: WARN.fg }}>{v.warnings.map(issueText).join(' · ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const stepTitles = [t('employees.importStep1Title'), t('employees.importStep2Title'), t('employees.importStep3Title'), t('employees.importStep4Title')];
  const stepSubs = [t('employees.importStep1Sub'), t('employees.importStep2Sub'), t('employees.importStep3Sub'), t('employees.importStep4Sub')];
  const stepLabels = [t('employees.importStep1'), t('employees.importStep2'), t('employees.importStep3'), t('employees.importStep4')];

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,33,55,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          width: 'min(1140px, 100%)', maxHeight: '92vh', background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', boxShadow: '0 28px 70px rgba(13,33,55,0.32)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '15px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(13,33,55,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileSpreadsheet size={20} color="var(--primary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{stepTitles[step - 1]}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{stepSubs[step - 1]}</div>
              </div>
              {file && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 8, background: 'var(--surface-warm)', border: '1px solid var(--border)', maxWidth: 260 }}>
                  <FileSpreadsheet size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{rows.length}</span>
                </div>
              )}
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: 'var(--background)', borderRadius: 10, border: '1px solid var(--border)' }}>
              {[1, 2, 3, 4].map((s, idx) => {
                const active = step === s;
                const done = step > s;
                return (
                  <React.Fragment key={s}>
                    {idx > 0 && <div style={{ flex: 1, height: 2, background: done || active ? 'var(--accent)' : 'var(--border)', borderRadius: 2 }} />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800,
                        background: done ? OK.fg : active ? 'var(--accent)' : 'var(--surface)',
                        color: done || active ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${done ? OK.fg : active ? 'var(--accent)' : 'var(--border)'}`,
                      }}>
                        {done ? <Check size={12} strokeWidth={3} /> : s}
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: active ? 800 : 600, color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{stepLabels[idx]}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>

          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--surface-warm)', flexShrink: 0 }}>
            <div>
              {step > 1 && doneCount === null && (
                <button onClick={() => setStep((s) => (s - 1) as Step)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <ArrowLeft size={15} /> {t('common.back', 'Back')}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 9 }}>
              {doneCount !== null ? (
                <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: OK.fg, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.close', 'Close')}
                </button>
              ) : step < 4 ? (
                <button onClick={() => setStep((s) => (s + 1) as Step)} disabled={!canNext}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none',
                    background: canNext ? 'var(--primary)' : 'var(--border)',
                    color: canNext ? '#fff' : 'var(--text-disabled)',
                    fontSize: 13, fontWeight: 700, cursor: canNext ? 'pointer' : 'not-allowed',
                  }}>
                  {t('common.next', 'Next')} <ArrowRight size={15} />
                </button>
              ) : (
                <button onClick={handleImport} disabled={importing || creatable.length === 0}
                  style={{
                    padding: '9px 20px', borderRadius: 9, border: 'none',
                    background: importing || creatable.length === 0 ? 'var(--border)' : OK.fg,
                    color: importing || creatable.length === 0 ? 'var(--text-disabled)' : '#fff',
                    fontSize: 13, fontWeight: 700,
                    cursor: importing || creatable.length === 0 ? 'not-allowed' : 'pointer',
                  }}>
                  {importing ? t('employees.importImporting') : t('employees.importConfirmButton', { count: creatable.length })}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} lang={lang} />

      {/* Expanded editor: the same table with far more room, for files that need
          real correction work rather than a one-cell fix. */}
      {editorOpen && createPortal(
        <div onClick={() => setEditorOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,33,55,0.58)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 'min(1600px, 100%)', height: '92vh', background: 'var(--surface)', borderRadius: 16,
            border: '1px solid var(--border)', boxShadow: '0 28px 70px rgba(13,33,55,0.32)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <Maximize2 size={18} color="var(--primary)" />
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{t('employees.importEditorTitle')}</h3>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{t('employees.importEditorSub')}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatCard value={counts.valid} label={t('employees.importValidRows')} tone="ok" />
                <StatCard value={counts.errors} label={t('employees.importErrorRows')} tone="err" />
                <button onClick={() => setEditorOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={15} />
                </button>
              </div>
            </div>
            <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
              {renderRowTable(window.innerHeight * 0.92 - 150)}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>,
    document.body,
  );
}

export default BulkImportModal;
