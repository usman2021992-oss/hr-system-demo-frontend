import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCheck, Clock3, FileText, Palmtree, Thermometer, Trash2, XCircle, User, Store, Shield, Calendar, Clock, Settings, Archive, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCompanies } from '../../api/companies';
import {
  getLeaveRequests,
  getPendingLeaveApprovals,
  approveLeaveRequest,
  rejectLeaveRequest,
  createLeaveOnBehalf,
  deleteLeaveRequest,
  reopenLeaveRequest,
  archiveLeaveRequest,
  downloadCertificate,
  getLeaveBalance,
  getAllLeaveBalances,
  setLeaveBalance,
  exportLeaveBalances,
  importLeaveBalances,
  downloadLeaveBalanceTemplate,
  ImportResult,
  LeaveRequest,
  LeaveStatus,
  LeaveBalance,
  LeaveType,
  LeaveDurationType,
} from '../../api/leave';
import { getEmployees } from '../../api/employees';
import { getStores } from '../../api/stores';
import { getAvatarUrl, getStoreLogoUrl } from '../../api/client';
import { listShifts, Shift } from '../../api/shifts';
import { DatePicker } from '../../components/ui/DatePicker';
import { formatLocalDate } from '../../utils/date';
import { LeaveRequestDrawer } from './LeaveRequestDrawer';
import ApprovalConfigPanel from './ApprovalConfigPanel';
import LeaveCalendar from './LeaveCalendar';
import { translateApiError } from '../../utils/apiErrors';
import { Store as StoreModel } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useToast } from '../../context/ToastContext';
import { formatEmployeeName, matchesEmployeeName } from '../../utils/employeeName';
import { leaveVisual } from './leaveStatus';
import { SelectMenu } from '../../components/ui/SelectMenu';

// ── Status badge ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:                         { bg: 'rgba(107,114,128,0.06)', color: '#6b7280' },
  'store manager approved':        { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  store_manager_approved:          { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  'store manager rejected':        { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  store_manager_rejected:          { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  'area manager approved':         { bg: 'rgba(139,92,246,0.06)',  color: '#8b5cf6' },
  area_manager_approved:           { bg: 'rgba(139,92,246,0.06)',  color: '#8b5cf6' },
  'area manager rejected':         { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  area_manager_rejected:           { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  'HR approved':                   { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  hr_approved:                     { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6' },
  'HR rejected':                   { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  hr_rejected:                     { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  approved:                        { bg: 'rgba(22,163,74,0.06)',   color: '#16a34a' },
  rejected:                        { bg: 'rgba(220,38,38,0.06)',   color: '#dc2626' },
  cancelled:                       { bg: 'rgba(0,0,0,0.04)',       color: '#6b7280' },
  admin_approved:                  { bg: 'rgba(22,163,74,0.06)',   color: '#16a34a' },
  'admin approved':                { bg: 'rgba(22,163,74,0.06)',   color: '#16a34a' },
};

/**
 * Decides what a leave request's badge should say.
 *
 * Keyed off `approvedBy` (who granted it) rather than off the status string.
 * A request that shows an approved-looking status with no approving user is
 * the exact state the inactivity job used to create, and the old badge painted
 * it solid green "APPROVED" — indistinguishable from a real approval. It now
 * reads DA VERIFICARE so those rows are visible on sight.
 */
function StatusBadge({ req }: { req: LeaveRequest }) {
  const { t } = useTranslation();
  // Shared with the calendar chip — see leaveStatus.ts. Keeping one derivation
  // is why the two views can no longer disagree about the same request.
  const visual = leaveVisual(req);

  return (
    <span
      title={visual.hintKey ? t(`leave.${visual.hintKey}`) : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
        background: visual.fill, color: visual.color,
        border: `1px solid ${visual.border}`,
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        cursor: visual.hintKey ? 'help' : undefined,
      }}
    >
      {visual.state === 'unverified' && <span aria-hidden>⚠</span>}
      {t(`leave.${visual.labelKey}`)}
    </span>
  );
}

export function isPendingWorkflowStatus(status: string): boolean {
  const norm = (status ?? '').toLowerCase().replace(/ /g, '_');
  return norm === 'pending' || norm === 'store_manager_approved' || norm === 'area_manager_approved' || norm === 'hr_approved';
}

const ROLE_META: Record<string, { bg: string; color: string; label: string }> = {
  admin:         { bg: 'rgba(239,68,68,0.06)',  color: '#ef4444', label: 'Admin' },
  hr:            { bg: 'rgba(59,130,246,0.06)',  color: '#3b82f6', label: 'HR' },
  area_manager:  { bg: 'rgba(139,92,246,0.06)', color: '#8b5cf6', label: 'Area Manager' },
  store_manager: { bg: 'rgba(16,185,129,0.06)', color: '#10b981', label: 'Store Manager' },
  employee:      { bg: 'rgba(107,114,128,0.06)', color: '#6b7280', label: 'Employee' },
};

export function RoleTag({ role }: { role?: string | null }) {
  const { t } = useTranslation();
  if (!role || role === 'admin') return <span>—</span>;
  const meta = ROLE_META[role] ?? { bg: 'rgba(107,114,128,0.06)', color: '#6b7280', label: role };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.color}30`,
      textTransform: 'uppercase', letterSpacing: '0.5px',
      whiteSpace: 'nowrap'
    }}>
      {t(`roles.${role}`, { defaultValue: meta.label })}
    </span>
  );
}

// ── Working days helper ────────────────────────────────────────────────────

function countWorkingDays(isoStart: string, isoEnd: string): number {
  const parse = (iso: string) => {
    const match = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return new Date();
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  };
  const s = parse(isoStart);
  const e = parse(isoEnd);
  let n = 0;
  const d = new Date(s);
  while (d <= e) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function parseIsoDate(iso: string): Date {
  const match = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date();
  return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = parseIsoDate(startA).getTime();
  const aEnd = parseIsoDate(endA).getTime();
  const bStart = parseIsoDate(startB).getTime();
  const bEnd = parseIsoDate(endB).getTime();
  return aStart <= bEnd && bStart <= aEnd;
}

// ── Format date range nicely ───────────────────────────────────────────────

function fmtDate(iso: string, locale: string): string {
  if (!iso) return '';
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, y, m, d] = match;
  const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  return dateObj.toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', {
    day: '2-digit', month: 'short',
  });
}

function shortLeaveHours(startTime?: string | null, endTime?: string | null): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((value) => Number.isNaN(value))) return null;
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) return null;
  return Number(((endMinutes - startMinutes) / 60).toFixed(2));
}

function fmtDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const lang = locale === 'en' ? 'en-GB' : 'it-IT';
  return date.toLocaleString(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function avatarColorFromName(name: string): string {
  if (!name) return 'linear-gradient(135deg, var(--primary), var(--accent))';
  return 'linear-gradient(135deg, var(--primary), var(--accent))';
}

function initialsForPerson(name: string | null | undefined, surname: string | null | undefined): string {
  return `${(name?.[0] ?? '').toUpperCase()}${(surname?.[0] ?? '').toUpperCase()}` || 'U';
}

function recentUniqueUsers(rows: LeaveRequest[], limit: number): LeaveRequest[] {
  const byUser = new Map<number, LeaveRequest>();
  const sorted = [...rows].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  for (const req of sorted) {
    if (!byUser.has(req.userId)) byUser.set(req.userId, req);
    if (byUser.size >= limit) break;
  }
  return Array.from(byUser.values());
}

// ── BalancesTab ────────────────────────────────────────────────────────────

interface BalancesTabProps {
  showFlash: (msg: string) => void;
}

/** Rows rendered per page. "Load more" adds another page. */
const BALANCE_PAGE_SIZE = 25;
/**
 * The server caps /employees at 100 for a single-company user and 500 for a
 * cross-company one, so asking for 200 silently returned at most 100. Ask for
 * the cross-company ceiling and show the server's own total alongside.
 */
const EMPLOYEE_FETCH_LIMIT = 500;

export function BalancesTab({ showFlash }: BalancesTabProps) {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = 2024; y <= currentYear + 2; y++) yearOptions.push(y);

  const [employees, setEmployees] = useState<Array<{ id: number; name: string; surname: string; role: string; avatarFilename?: string | null }>>([]);
  const [balances, setBalances] = useState<Record<number, LeaveBalance[]>>({});
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragover, setDragover] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<{
    userId: number;
    name: string;
    surname: string;
    vacationTotal: string;
    sickTotal: string;
    origVacation: number | undefined;
    origSick: number | undefined;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 700 as const,
    color: 'var(--text-secondary)', marginBottom: 6,
    textTransform: 'uppercase' as const, letterSpacing: '0.8px',
  };

  // Chevron drawn in, because the native select arrow varies wildly between
  // browsers and looked unfinished next to the rest of the toolbar.
  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 13px',
    borderRadius: 10,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 11px center',
    boxShadow: 'var(--shadow-xs)',
  };

  const [empError, setEmpError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  /**
   * Company scope for this tab. Without it a Super Admin's employee list mixes
   * every company they can reach, so the (previously hard-capped) rows shown
   * were an arbitrary slice across companies.
   */
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    getCompanies()
      .then((list) => setCompanyOptions(list.map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => setCompanyOptions([]));
  }, []);

  /** Server-reported total, so the UI can say how many people actually exist. */
  const [employeeTotal, setEmployeeTotal] = useState(0);
  /** How many rows are rendered. Grows via "load more" instead of a hard cut at 50. */
  const [visibleCount, setVisibleCount] = useState(BALANCE_PAGE_SIZE);

  // Load employees. The old call asked for 200 with no company filter and then
  // truncated to 50 twice — so a Super Admin with 103 people saw 50 and never
  // even requested the rest. It also silently hit the server's own cap (100 for
  // a single-company user), which is why simply deleting the slices was not
  // enough.
  useEffect(() => {
    setEmpError(null);
    const targetCompanyId = companyFilter ? parseInt(companyFilter, 10) : undefined;
    getEmployees({
      limit: EMPLOYEE_FETCH_LIMIT,
      status: 'active',
      targetCompanyId: Number.isFinite(targetCompanyId as number) ? targetCompanyId : undefined,
    })
      .then((r) => {
        setEmployees(r.employees.map((e) => ({ id: e.id, name: e.name, surname: e.surname, role: e.role, avatarFilename: e.avatarFilename ?? null })));
        setEmployeeTotal(r.total ?? r.employees.length);
      })
      .catch(() => {
        setEmpError(t('common.error'));
        setEmployees([]);
        setEmployeeTotal(0);
      });
  }, [t, companyFilter]);

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const query = searchQuery.toLowerCase();
    return employees.filter(emp => {
      // Either name order finds the person; display order stays name-first.
      return matchesEmployeeName(emp, query);
    });
  }, [employees, searchQuery]);

  // Reset paging whenever the underlying list changes.
  useEffect(() => { setVisibleCount(BALANCE_PAGE_SIZE); }, [searchQuery, companyFilter, year]);

  const visibleEmployees = useMemo(
    () => filteredEmployees.slice(0, visibleCount),
    [filteredEmployees, visibleCount],
  );

  // Balances for EVERY employee in scope, in one request rather than one call
  // per person — which is what made the 50-row cap necessary in the first place.
  const loadBalances = useCallback(async (selectedYear: number, companyId?: number) => {
    setLoading(true);
    try {
      const res = await getAllLeaveBalances({ year: selectedYear, companyId });
      setBalances(res.balances ?? {});
    } catch {
      setBalances({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const targetCompanyId = companyFilter ? parseInt(companyFilter, 10) : undefined;
    loadBalances(year, Number.isFinite(targetCompanyId as number) ? targetCompanyId : undefined);
  }, [year, companyFilter, loadBalances]);

  function openEdit(emp: { id: number; name: string; surname: string }) {
    const empBalances = balances[emp.id] ?? [];
    const vac = empBalances.find((b) => b.leaveType === 'vacation');
    const sick = empBalances.find((b) => b.leaveType === 'sick');
    setEditTarget({
      userId: emp.id,
      name: emp.name,
      surname: emp.surname,
      vacationTotal: vac ? String(vac.totalDays) : '',
      sickTotal: sick ? String(sick.totalDays) : '',
      origVacation: vac?.totalDays,
      origSick: sick?.totalDays,
    });
    setEditError(null);
  }

  async function handleExport() {
    try {
      const blob = await exportLeaveBalances(year);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saldi_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showFlash(t('common.error'));
    }
  }

  async function handleDownloadTemplate() {
    try {
      const blob = await downloadLeaveBalanceTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'saldi_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showFlash(t('common.error'));
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importLeaveBalances(importFile);
      setImportResult(result);
      if (result.imported > 0) {
        loadBalances(year, companyFilter ? parseInt(companyFilter, 10) : undefined);
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error ?? err?.message ?? t('common.error');
      setImportResult({ imported: 0, skipped: 0, failed: 0, errors: [errMsg], total: 0 });
    } finally {
      setImporting(false);
    }
  }

  function handleImportClose() {
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
    setDragover(false);
  }

  async function handleSave() {
    if (!editTarget) return;

    /**
     * An empty box means "remove this allocation"; a typed 0 means "allocated
     * zero days". They are different intentions and the old code collapsed both
     * into NaN, so emptying one field failed the whole save — including the
     * other field, which had a perfectly good value in it.
     */
    const parseField = (raw: string): number | null | 'invalid' => {
      const trimmed = (raw ?? '').trim();
      if (trimmed === '') return null;          // clear
      const n = parseFloat(trimmed);
      if (Number.isNaN(n) || n < 0) return 'invalid';
      return n;                                  // includes 0
    };

    const vacTotal = parseField(editTarget.vacationTotal);
    const sickTotal = parseField(editTarget.sickTotal);

    if (vacTotal === 'invalid' || sickTotal === 'invalid') {
      setEditError(t('leave.balance_set_error'));
      return;
    }

    setEditSaving(true);
    setEditError(null);

    const origVac = (balances[editTarget.userId] ?? []).find((b) => b.leaveType === 'vacation');
    const origSick = (balances[editTarget.userId] ?? []).find((b) => b.leaveType === 'sick');

    let newBalances: LeaveBalance[] = [...(balances[editTarget.userId] ?? [])];
    let hasError = false;

    /** A clear drops the row; anything else replaces it. */
    const applyResult = (type: LeaveType, result: LeaveBalance | { cleared: true }) => {
      if ('cleared' in result) {
        newBalances = newBalances.filter((b) => b.leaveType !== type);
        return;
      }
      const idx = newBalances.findIndex((b) => b.leaveType === type);
      if (idx >= 0) newBalances[idx] = result;
      else newBalances.push(result);
    };

    /**
     * True when the box now says something different from what is stored.
     * `null` (cleared) only counts as a change if an allocation existed — so
     * leaving an already-empty box empty sends nothing.
     */
    const changed = (next: number | null, current: LeaveBalance | undefined) =>
      next === null ? current !== undefined : current === undefined || next !== current.totalDays;

    // Each field is saved independently, so a failure on one never discards a
    // good value in the other.
    if (changed(vacTotal, origVac)) {
      try {
        applyResult('vacation', await setLeaveBalance({
          userId: editTarget.userId,
          year,
          leaveType: 'vacation',
          totalDays: vacTotal,
        }));
      } catch (err: unknown) {
        setEditError(translateApiError(err, t, t('leave.balance_set_error')) ?? t('leave.balance_set_error'));
        hasError = true;
      }
    }

    // Attempted even if vacation failed, for the same reason.
    if (changed(sickTotal, origSick)) {
      try {
        applyResult('sick', await setLeaveBalance({
          userId: editTarget.userId,
          year,
          leaveType: 'sick',
          totalDays: sickTotal,
        }));
      } catch (err: unknown) {
        if (!hasError) {
          setEditError(translateApiError(err, t, t('leave.balance_set_error')) ?? t('leave.balance_set_error'));
        }
        hasError = true;
      }
    }

    // Always update local state with whatever succeeded
    setBalances((prev) => ({ ...prev, [editTarget.userId]: newBalances }));
    setEditSaving(false);

    if (!hasError) {
      showFlash(t('leave.balance_set_success'));
      setEditTarget(null);
    }
    // If hasError, modal stays open with the error message shown
  }

  function renderBalanceCell(empId: number, type: LeaveType) {
    const empBalances = balances[empId] ?? [];
    const b = empBalances.find((x) => x.leaveType === type);
    if (!b) {
      // Deliberately understated. The consequence of a missing allocation is
      // enforced where it matters — HR/Admin cannot approve without one — so
      // the table stays quiet rather than shouting on every unconfigured row.
      // The tooltip carries the explanation for anyone who wonders.
      return (
        <span
          title={t('leave.balance_missing_hint')}
          style={{ color: 'var(--text-muted)', fontSize: 13, cursor: 'help' }}
        >
          — / — (—)
        </span>
      );
    }
    // Three states worth distinguishing:
    //   over      more approved than allocated — should not happen now, but it
    //             is what the old un-deducted approvals produce once a balance
    //             is finally set, so it must be visible
    //   exhausted nothing left; no further leave can be approved
    //   normal    days remaining
    const over = b.remainingDays < 0;
    const exhausted = !over && b.remainingDays === 0;
    const remainingColor = over ? '#dc2626' : exhausted ? '#b45309' : '#16a34a';
    return (
      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{b.usedDays}</span>
        <span style={{ color: 'var(--text-muted)' }}> / {b.totalDays}</span>
        <span
          title={
            over ? t('leave.balance_over_hint')
              : exhausted ? t('leave.balance_exhausted_hint')
                : undefined
          }
          style={{
            color: remainingColor, fontSize: 11, marginLeft: 4,
            fontWeight: (over || exhausted) ? 700 : 400,
            cursor: (over || exhausted) ? 'help' : undefined,
          }}
        >
          {(over || exhausted) && <span aria-hidden>⚠ </span>}
          ({b.remainingDays} {t('leave.balance_remaining_short').toLowerCase()})
        </span>
      </span>
    );
  }

  return (
    <div style={{ padding: isMobile ? '16px 0 20px' : '20px 32px' }}>
      {/* Year & Search & Export/Import Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>{t('leave.balance_year')}</label>
          <SelectMenu
            minWidth={110}
            ariaLabel={t('leave.balance_year')}
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
          />
        </div>

        {/* Search bar inside section at top */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ color: 'var(--text-muted)', position: 'absolute', left: 10 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('leave.search_employee_placeholder', 'Cerca dipendente...')}
            style={{
              padding: '8px 12px 8px 32px',
              borderRadius: 8,
              border: '1.5px solid #d1d5db',
              background: '#ffffff',
              color: '#111827',
              fontSize: 13,
              outline: 'none',
              width: '240px',
              transition: 'border-color 0.15s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Only worth showing when the account actually spans companies. */}
        {companyOptions.length > 1 && (
          <SelectMenu
            minWidth={200}
            ariaLabel={t('leave.filter_company', 'Azienda')}
            value={companyFilter}
            onChange={setCompanyFilter}
            options={[
              { value: '', label: t('leave.all_companies', 'Tutte le aziende') },
              ...companyOptions.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        )}

        {loading && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleExport()}
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: '1.5px solid var(--border)', background: 'var(--background)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <button
            onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}
            style={{
              padding: '8px 14px', borderRadius: 8,
              border: 'none', background: 'var(--accent)',
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
        </div>
      </div>

      {/* Employee fetch error */}
      {empError && (
        <div style={{
          padding: '12px 16px', margin: '16px 0',
          background: 'rgba(220,38,38,0.08)',
          border: '1px solid rgba(220,38,38,0.25)',
          borderLeft: '4px solid #dc2626',
          borderRadius: 8, color: '#dc2626', fontSize: 13,
        }}>
          {empError}
        </div>
      )}

      {/* Table */}
      {!loading && filteredEmployees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 32px', color: 'var(--text-secondary)' }}>
          {t('leave.balance_no_data')}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'var(--primary)' }}>
                  {[
                    t('leave.col_name', 'Nome'),
                    t('leave.col_role', 'Ruolo'),
                    t('leave.balance_vacation'),
                    t('leave.balance_sick'),
                    t('common.actions'),
                  ].map((h, i) => (
                    <th key={`${h}-${i}`} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.84)',
                      textTransform: 'uppercase', letterSpacing: '1.5px',
                      borderBottom: '1px solid rgba(255,255,255,0.22)',
                      ...(i === 0 ? { paddingLeft: 20 } : {}),
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((emp) => {
                  const avatarUrl = getAvatarUrl(emp.avatarFilename ?? null);
                  const initials = initialsForPerson(emp.name, emp.surname);
                  const fallbackColor = avatarColorFromName(`${emp.name ?? ''} ${emp.surname ?? ''}`.trim() || String(emp.id));
                  return (
                  <tr
                    key={emp.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-warm)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                  >
                    <td style={{ padding: '12px 16px 12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <span style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          border: '1px solid rgba(148,163,184,0.4)',
                          background: avatarUrl ? 'transparent' : fallbackColor,
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={formatEmployeeName(emp)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : initials}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatEmployeeName(emp)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <RoleTag role={emp.role} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {renderBalanceCell(emp.id, 'vacation')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {renderBalanceCell(emp.id, 'sick')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => openEdit(emp)}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--background)',
                          color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {t('leave.balance_edit_btn')}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Row count + load more. The list used to stop dead at 50 with no
              indication that anyone was missing. */}
          {!loading && filteredEmployees.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap', padding: '14px 20px',
              borderTop: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('leave.balance_shown_count', {
                  defaultValue: 'Mostrati {{shown}} di {{total}} dipendenti',
                  shown: visibleEmployees.length,
                  total: searchQuery.trim() ? filteredEmployees.length : (employeeTotal || filteredEmployees.length),
                })}
              </span>
              {visibleCount < filteredEmployees.length && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + BALANCE_PAGE_SIZE)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: '1.5px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  {t('leave.balance_load_more', 'Carica altri')}
                </button>
              )}
            </div>
          )}
          {!loading && employees.length === 0 && (
            <div style={{ padding: '56px 32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              {t('leave.balance_no_data')}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !editSaving) setEditTarget(null); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', width: '100%', maxWidth: 420, border: '1px solid var(--border)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  {year}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  {t('leave.balance_set_title')}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {formatEmployeeName(editTarget)}
                </p>
              </div>
              <button
                onClick={() => setEditTarget(null)}
                disabled={editSaving}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {editError && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderLeft: '4px solid #dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
                  {editError}
                </div>
              )}

              {/* Vacation */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('leave.balance_vacation')} — {t('leave.balance_total_label')}</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={editTarget.vacationTotal}
                  onChange={(e) => setEditTarget((prev) => prev ? { ...prev, vacationTotal: e.target.value } : prev)}
                  style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', cursor: 'text' }}
                  placeholder="—"
                />
              </div>

              {/* Sick */}
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>{t('leave.balance_sick')} — {t('leave.balance_total_label')}</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={editTarget.sickTotal}
                  onChange={(e) => setEditTarget((prev) => prev ? { ...prev, sickTotal: e.target.value } : prev)}
                  style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', cursor: 'text' }}
                  placeholder="—"
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setEditTarget(null)}
                  disabled={editSaving}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={editSaving}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.7 : 1 }}
                >
                  {editSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importOpen && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(13,33,55,0.55)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={handleImportClose}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
            width: '100%', maxWidth: 440, overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            border: '1px solid var(--border)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              background: 'var(--primary)', padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
               <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>
                    {t('leave.balance_import_title')}
                  </div>
               </div>
               <button onClick={handleImportClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                    onClick={handleDownloadTemplate}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '7px 14px', borderRadius: 7,
                      border: '1.5px solid var(--accent)', background: 'var(--accent-light)',
                      color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {t('leave.balance_download_template')}
                </button>
                <button
                  onClick={() => setGuideOpen((o) => !o)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 7,
                    border: '1.5px solid var(--border)', background: 'transparent',
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  {guideOpen ? t('leave.balance_import_guide_hide') : t('leave.balance_import_guide_toggle')}
                </button>
              </div>

              {/* Format guide (collapsible) */}
              {guideOpen && (
                <div style={{
                  marginBottom: 16, borderRadius: 8,
                  border: '1px solid var(--border)', overflow: 'hidden',
                  fontSize: 12,
                }}>
                  <div style={{
                    background: 'var(--primary)', color: '#fff',
                    padding: '8px 14px', fontWeight: 700, fontSize: 11,
                    letterSpacing: '1px', textTransform: 'uppercase',
                  }}>
                    {t('leave.balance_import_guide_title')}
                  </div>
                  <div className="table-scroll" style={{ borderRadius: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {[t('leave.table_column'), t('leave.table_required'), t('leave.table_format')].map((h) => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { col: t('leave.col_matricola'),       req: true, fmt: t('leave.col_matricola_fmt') },
                          { col: t('leave.col_year'),             req: true, fmt: t('leave.col_year_fmt') },
                          { col: t('leave.col_total_holidays'),   req: true, fmt: t('leave.col_days_fmt') },
                          { col: t('leave.col_total_sick'),       req: true, fmt: t('leave.col_days_fmt') },
                        ].map((row, i) => (
                          <tr key={row.col} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>{row.col}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                              {row.req
                                ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{t('leave.yes')}</span>
                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td style={{ padding: '5px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.fmt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '8px 14px', background: 'rgba(201,151,58,0.06)', borderTop: '1px solid var(--border)', fontSize: 11, color: '#b45309', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span>💡</span>
                    <span>{t('leave.balance_import_template_hint')}</span>
                  </div>
                </div>
              )}

              {!importResult && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragover(false);
                    try {
                      const f = e.dataTransfer.files[0];
                      if (f) setImportFile(f);
                    } catch {
                      // ignore empty
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragover ? 'var(--accent)' : importFile ? '#22c55e' : 'var(--border)'}`,
                    borderRadius: 10, padding: '28px 20px', textAlign: 'center',
                    background: dragover ? 'var(--accent-light)' : importFile ? 'rgba(34,197,94,0.05)' : 'var(--bg)',
                    cursor: 'pointer', transition: 'all 0.18s', marginBottom: 16,
                  }}
                >
                  <input
                    ref={fileInputRef} type="file" accept=".xlsx,.csv"
                    style={{ display: 'none' }}
                    onChange={(e) => { try { const f = e.target.files?.[0]; if (f) setImportFile(f); } catch {} }}
                  />
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{importFile ? '✓' : '📂'}</div>
                  {importFile ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#16a34a' }}>{importFile.name}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)' }}>
                        {t('leave.balance_import_drop')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {t('leave.balance_import_browse')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, opacity: 0.7 }}>
                        {t('leave.balance_import_accept')}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importResult && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    padding: '14px 16px', borderRadius: 8, marginBottom: 12,
                    background: importResult.failed > 0 || importResult.errors.length > 0
                      ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
                    border: `1px solid ${importResult.failed > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.25)'}`,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--text)' }}>
                      {t('leave.balance_import_success')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {t('leave.balance_import_result', {
                        imported: importResult.imported,
                        skipped: importResult.skipped,
                        failed: importResult.failed,
                      })}
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12, color: '#b45309' }}>
                      {importResult.errors.map((e, i) => (
                         <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleImportClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {t('common.close')}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={!importFile || importing}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)',
                    color: '#fff', fontWeight: 600, fontSize: 13, cursor: importing || !importFile ? 'not-allowed' : 'pointer', opacity: importing || !importFile ? 0.7 : 1,
                  }}
                >
                  {importing ? t('common.saving') : t('common.save')}
                </button>
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type PanelTab = 'requests' | 'balances' | 'calendar' | 'approval_config' | 'archived';

type CreateEmployeeOption = {
  id: number;
  name: string;
  surname: string;
  role: string;
  storeName?: string | null;
  avatarFilename?: string | null;
};

export default function AdminLeavePanel() {
  const { t, i18n } = useTranslation();
  const { user, permissions } = useAuth();
  const { isMobile } = useBreakpoint();
  const { showToast } = useToast();

  const isAdmin = user?.role === 'admin';
  const effectiveApproverRole = user?.role === 'admin' ? 'admin' : user?.role;
  const locale = i18n.language;

  const [panelTab, setPanelTab] = useState<PanelTab>('requests');

  const [requests, setRequests]       = useState<LeaveRequest[]>([]);
  const [stores, setStores]           = useState<StoreModel[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const [archivingId, setArchivingId] = useState<number | null>(null);

  const handleArchive = async (id: number) => {
    setArchivingId(id);
    try {
      await archiveLeaveRequest(id);
      showFlash(t('leave.archive_success', 'Richiesta archiviata con successo'));
      fetchRequests();
    } catch (err: any) {
      showToast(translateApiError(err, t, t('common.error_generic')) ?? t('common.error_generic'), 'error');
    } finally {
      setArchivingId(null);
    }
  };

  // ── Filters ────────────────────────────────────────────────────────────────
  const today       = formatLocalDate(new Date());

  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo,   setDateTo]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');
  const [companyList, setCompanyList]   = useState<Array<{ id: number; name: string }>>([]);
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [filterStoreId, setFilterStoreId] = useState('');
  const [search, setSearch]             = useState('');

  const [showFilterModal, setShowFilterModal] = useState(false);

  useEffect(() => {
    getCompanies().then(setCompanyList).catch(() => {});
  }, []);

  // Temporary filter states
  const [tempCompanyId, setTempCompanyId] = useState(filterCompanyId);
  const [tempStoreId, setTempStoreId] = useState(filterStoreId);
  const [tempStatus, setTempStatus] = useState(filterStatus);
  const [tempType, setTempType] = useState(filterType);
  const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
  const [tempDateTo, setTempDateTo] = useState(dateTo);

  const openFilterModal = () => {
    setTempCompanyId(filterCompanyId);
    setTempStoreId(filterStoreId);
    setTempStatus(filterStatus);
    setTempType(filterType);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
    setShowFilterModal(true);
  };

  const applyFilters = () => {
    setFilterCompanyId(tempCompanyId);
    setFilterStoreId(tempStoreId);
    setFilterStatus(tempStatus);
    setFilterType(tempType);
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
    setShowFilterModal(false);
  };

  const resetAllFilters = () => {
    setTempCompanyId('');
    setTempStoreId('');
    setTempStatus('');
    setTempType('');
    setTempDateFrom('');
    setTempDateTo('');
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterCompanyId) count++;
    if (filterStatus) count++;
    if (filterType) count++;
    if (filterStoreId) count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    return count;
  }, [filterCompanyId, filterStatus, filterType, filterStoreId, dateFrom, dateTo]);

  // ── Create modal ───────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen]     = useState(false);
  const [empList, setEmpList]           = useState<CreateEmployeeOption[]>([]);
  const [cUserId,  setCUserId]          = useState('');
  const [cEmployeeOpen, setCEmployeeOpen] = useState(false);
  const [cType,    setCType]            = useState('vacation');
  const [cDurationType, setCDurationType] = useState<LeaveDurationType>('full_day');
  const [cStart,   setCStart]           = useState(today);
  const [cEnd,     setCEnd]             = useState(today);
  const [cShortStartTime, setCShortStartTime] = useState('');
  const [cShortEndTime, setCShortEndTime] = useState('');
  const [cNotes,   setCNotes]           = useState('');
  const [cSaving,  setCSaving]          = useState(false);
  const [cError,   setCError]           = useState<string | null>(null);
  const [cOverlapLoading, setCOverlapLoading] = useState(false);
  const [cOverlappingLeaves, setCOverlappingLeaves] = useState<LeaveRequest[]>([]);
  const cEmployeePickerRef = useRef<HTMLDivElement | null>(null);

  const [cUserBalances, setCUserBalances] = useState<LeaveBalance[]>([]);
  const [cUserBalancesLoading, setCUserBalancesLoading] = useState(false);

  useEffect(() => {
    if (createOpen && cUserId && cStart) {
      setCUserBalancesLoading(true);
      getLeaveBalance({ userId: parseInt(cUserId, 10), year: new Date(cStart).getFullYear() })
        .then((res) => {
          setCUserBalances(res.balances || []);
        })
        .catch(() => {
          setCUserBalances([]);
        })
        .finally(() => {
          setCUserBalancesLoading(false);
        });
    } else {
      setCUserBalances([]);
    }
  }, [createOpen, cUserId, cStart]);

  const selectedEmpMatchingBalance = useMemo(() => {
    return cUserBalances.find((b) => b.leaveType === cType);
  }, [cUserBalances, cType]);

  const selectedEmpRemainingDays = useMemo(() => {
    return selectedEmpMatchingBalance ? selectedEmpMatchingBalance.remainingDays : 0;
  }, [selectedEmpMatchingBalance]);

  const selectedEmpRequestedDays = useMemo(() => {
    if (cDurationType === 'short_leave') {
      const hours = shortLeaveHours(cShortStartTime, cShortEndTime);
      if (hours != null) {
        return parseFloat((hours / 8).toFixed(2));
      }
      return 0;
    }
    return countWorkingDays(cStart, cEnd);
  }, [cDurationType, cShortStartTime, cShortEndTime, cStart, cEnd]);

  const selectedEmpExceedsBalance = useMemo(() => {
    return selectedEmpMatchingBalance && selectedEmpRequestedDays > selectedEmpRemainingDays;
  }, [selectedEmpMatchingBalance, selectedEmpRequestedDays, selectedEmpRemainingDays]);

  const selectedEmpHasNoBalance = useMemo(() => {
    return createOpen && !!cUserId && !cUserBalancesLoading && cUserBalances.length === 0;
  }, [createOpen, cUserId, cUserBalancesLoading, cUserBalances]);

  // ── Reject modal ───────────────────────────────────────────────────────────
  const [approveTarget, setApproveTarget] = useState<LeaveRequest | null>(null);
  /** Shown inside the dialog, so a refusal appears where the click happened. */
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSaving, setApproveSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  /**
   * The employee's allocation for the year of the request. An approver deciding
   * whether to grant leave needs to see what it will be deducted from — and
   * whether an allocation exists at all, since approval is refused without one.
   */
  const [targetBalances, setTargetBalances] = useState<LeaveBalance[] | null>(null);
  const [targetBalanceLoading, setTargetBalanceLoading] = useState(false);
  const [shiftsForTarget, setShiftsForTarget] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [cancelShiftsChecked, setCancelShiftsChecked] = useState(true);

  useEffect(() => {
    if (!approveTarget) {
      setShiftsForTarget([]);
      setShiftsLoading(false);
      setCancelShiftsChecked(true);
      setApproveError(null);
      setTargetBalances(null);
      return;
    }

    let active = true;
    setShiftsLoading(true);
    setShiftsForTarget([]);
    setApproveError(null);

    // The allocation is read for the year the leave STARTS in, which is the
    // year approval will deduct from.
    setTargetBalanceLoading(true);
    setTargetBalances(null);
    getLeaveBalance({
      userId: approveTarget.userId,
      year: new Date(approveTarget.startDate).getFullYear(),
    })
      .then((res) => { if (active) setTargetBalances(res.balances ?? []); })
      .catch(() => { if (active) setTargetBalances([]); })
      .finally(() => { if (active) setTargetBalanceLoading(false); });

    listShifts({
      user_id: approveTarget.userId,
      start_date: approveTarget.startDate,
      end_date: approveTarget.endDate,
    })
      .then((res) => {
        if (!active) return;
        const activeShifts = res.shifts.filter((s) => s.status !== 'cancelled');
        setShiftsForTarget(activeShifts);
      })
      .catch((err) => {
        console.error('Error fetching shifts for leave approval:', err);
      })
      .finally(() => {
        if (active) setShiftsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [approveTarget]);

  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectNotes,  setRejectNotes]  = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);
  const [rejectError,  setRejectError]  = useState<string | null>(null);

  // ── Delete confirm ─────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── My Leave drawer (admin/hr submitting their own leave) ──────────────────
  const [myLeaveOpen, setMyLeaveOpen] = useState(false);

  // ── Action feedback ────────────────────────────────────────────────────────
  const [flash, setFlash] = useState<string | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: {
        dateFrom?: string;
        dateTo?: string;
        status?: LeaveStatus;
        leaveType?: 'vacation' | 'sick';
        archived?: boolean;
        /** Cross-company filter, used by super-admin views. */
        companyId?: number;
      } = {};
      if (dateFrom)     params.dateFrom    = dateFrom;
      if (dateTo)       params.dateTo      = dateTo;
      if (filterCompanyId) {
        params.companyId = parseInt(filterCompanyId, 10);
        (params as any).company_id = parseInt(filterCompanyId, 10);
      }
      if (filterStatus && filterStatus !== 'pending' && filterStatus !== 'approved' && filterStatus !== 'rejected') {
        params.status = filterStatus as LeaveStatus;
      }
      if (filterType)   params.leaveType   = filterType as 'vacation' | 'sick';
      params.archived = panelTab === 'archived';
      const pageSize = 100;
      const [firstPage, pendingRes] = await Promise.all([
        getLeaveRequests({ ...params, page: 1, limit: pageSize }),
        panelTab !== 'archived'
          ? getPendingLeaveApprovals().catch(() => ({ requests: [] as LeaveRequest[], total: 0 }))
          : Promise.resolve({ requests: [] as LeaveRequest[], total: 0 }),
      ]);
      const totalPages = firstPage.pages ?? Math.ceil((firstPage.total ?? firstPage.requests.length) / pageSize);
      const remainingPages = totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              getLeaveRequests({ ...params, page: index + 2, limit: pageSize })
            )
          )
        : [];
      const allFetchedRequests = [
        ...firstPage.requests,
        ...remainingPages.flatMap((page) => page.requests),
      ];
      const merged = new Map<number, LeaveRequest>();
      const pendingApprovalIds = new Set(pendingRes.requests.map((req) => req.id));
      for (const req of allFetchedRequests) merged.set(req.id, req);
      for (const req of pendingRes.requests) merged.set(req.id, req);
      const matchesAppliedFilters = (req: LeaveRequest) => {
        if (filterStatus) {
          const reqNorm = req.status.toLowerCase().replace(/ /g, '_');
          if (filterStatus === 'pending') {
            if (!isPendingWorkflowStatus(req.status)) return false;
          } else if (filterStatus === 'approved') {
            const isApproved = reqNorm === 'approved' || reqNorm === 'admin_approved' || reqNorm === 'hr_approved';
            if (!isApproved) return false;
          } else if (filterStatus === 'rejected') {
            if (!reqNorm.includes('rejected')) return false;
          } else {
            const filterNorm = filterStatus.toLowerCase().replace(/ /g, '_');
            if (reqNorm !== filterNorm) return false;
          }
        }
        if (filterCompanyId) {
          const cidNum = parseInt(filterCompanyId, 10);
          const targetCompName = companyList.find(c => String(c.id) === filterCompanyId)?.name;
          const reqCid = (req as any).companyId ?? (req as any).company_id;
          if (reqCid != null && reqCid > 0) {
            if (reqCid !== cidNum) return false;
          } else if (req.companyName && targetCompName) {
            if (req.companyName !== targetCompName) return false;
          } else if (req.storeId) {
            const storeObj = stores.find((s: any) => s.id === req.storeId);
            if (storeObj) {
              if ((storeObj as any).companyId && (storeObj as any).companyId !== cidNum) return false;
              if (targetCompName && storeObj.companyName && storeObj.companyName !== targetCompName) return false;
            }
          }
        }
        if (filterStoreId && req.storeId && String(req.storeId) !== filterStoreId) return false;
        if (filterType && req.leaveType !== filterType) return false;
        if (dateFrom && req.startDate < dateFrom) return false;
        if (dateTo && req.endDate > dateTo) return false;
        return true;
      };
      const sortedRequests = Array.from(merged.values())
        .filter(matchesAppliedFilters)
        .sort((a, b) => {
          const approvalPriority = Number(pendingApprovalIds.has(b.id)) - Number(pendingApprovalIds.has(a.id));
          if (approvalPriority !== 0) return approvalPriority;
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        });
      setRequests(sortedRequests);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterStatus, filterType, filterCompanyId, filterStoreId, panelTab, companyList, stores, t]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    let active = true;
    getStores()
      .then((rows) => {
        if (active) setStores(rows);
      })
      .catch(() => {
        if (active) setStores([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cEmployeeOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!cEmployeePickerRef.current?.contains(event.target as Node)) {
        setCEmployeeOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [cEmployeeOpen]);

  useEffect(() => {
    if (cType !== 'vacation') {
      setCDurationType('full_day');
      setCShortStartTime('');
      setCShortEndTime('');
    }
  }, [cType]);

  useEffect(() => {
    if (cDurationType === 'short_leave') {
      setCEnd(cStart);
    }
  }, [cDurationType, cStart]);

  useEffect(() => {
    let active = true;
    if (!createOpen || !cUserId || !cStart || !cEnd) {
      setCOverlappingLeaves([]);
      setCOverlapLoading(false);
      return;
    }

    setCOverlapLoading(true);
    getLeaveRequests({ dateFrom: cStart, dateTo: cEnd })
      .then((res) => {
        if (!active) return;
        const userId = parseInt(cUserId, 10);
        const overlaps = res.requests.filter((req) => {
          if (req.userId !== userId) return false;
          if (req.status.includes('rejected') || req.status === 'cancelled') return false;
          return rangesOverlap(req.startDate, req.endDate, cStart, cEnd);
        });
        setCOverlappingLeaves(overlaps);
      })
      .catch(() => {
        if (!active) return;
        setCOverlappingLeaves([]);
      })
      .finally(() => {
        if (!active) return;
        setCOverlapLoading(false);
      });

    return () => {
      active = false;
    };
  }, [createOpen, cUserId, cStart, cEnd]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const pendingCount  = requests.filter((r) => isPendingWorkflowStatus(r.status)).length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const pendingVacationCount = requests.filter((r) => isPendingWorkflowStatus(r.status) && r.leaveType === 'vacation').length;
  const pendingSickCount = requests.filter((r) => isPendingWorkflowStatus(r.status) && r.leaveType === 'sick').length;
  const approvedVacationCount = requests.filter((r) => r.status === 'approved' && r.leaveType === 'vacation').length;
  const approvedSickCount = requests.filter((r) => r.status === 'approved' && r.leaveType === 'sick').length;
  const totalVacationCount = requests.filter((r) => r.leaveType === 'vacation').length;
  const totalSickCount = requests.filter((r) => r.leaveType === 'sick').length;

  const pendingPeople = useMemo(
    () => recentUniqueUsers(requests.filter((r) => isPendingWorkflowStatus(r.status)), 20),
    [requests],
  );
  const approvedPeople = useMemo(
    () => recentUniqueUsers(requests.filter((r) => r.status === 'approved'), 20),
    [requests],
  );

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const storeLookup = new Map<number, StoreModel>();
  for (const store of stores) storeLookup.set(store.id, store);

  const resolveRequestStoreMeta = (req: LeaveRequest): { storeName: string; companyName: string; storeLogoFilename: string | null } => {
    const fallbackCompany = t('common.company', 'Company');
    if (req.storeId != null) {
      const known = storeLookup.get(req.storeId);
      const storeName = known?.name ?? `${t('common.store', 'Store')} #${req.storeId}`;
      const companyName = known?.companyName ?? (req.companyId != null ? `${fallbackCompany} #${req.companyId}` : fallbackCompany);
      return {
        storeName,
        companyName,
        storeLogoFilename: known?.logoFilename ?? req.storeLogoFilename ?? null,
      };
    }
    return {
      storeName: t('employees.noStore', 'No store'),
      companyName: req.companyId != null ? `${fallbackCompany} #${req.companyId}` : fallbackCompany,
      storeLogoFilename: req.storeLogoFilename ?? null,
    };
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = requests.filter((req) => {
    const storeMeta = resolveRequestStoreMeta(req);
    const fullName = `${req.userSurname ?? ''} ${req.userName ?? ''}`.trim().toLowerCase();
    const matchesSearch = !normalizedSearch
      || fullName.includes(normalizedSearch)
      || storeMeta.storeName.toLowerCase().includes(normalizedSearch)
      || storeMeta.companyName.toLowerCase().includes(normalizedSearch);
    const matchesStore = !filterStoreId || String(req.storeId ?? '') === filterStoreId;
    return matchesSearch && matchesStore;
  });

  // ── Download certificate ────────────────────────────────────────────────────
  async function handleDownloadCertificate(req: LeaveRequest) {
    try {
      const blob = await downloadCertificate(req.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = req.medicalCertificateName ?? 'certificato-medico';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showFlash(t('leave.certificate_download_error'));
    }
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  /**
   * Returns whether it succeeded, so the caller can keep the dialog open on
   * failure. It used to close the dialog first and report the error somewhere
   * else entirely, which read as "the click did nothing".
   */
  async function handleApprove(req: LeaveRequest, cancelShifts?: boolean): Promise<boolean> {
    setApproveError(null);
    setApproveSaving(true);
    try {
      await approveLeaveRequest(req.id, undefined, cancelShifts);
      showFlash(t('leave.approved_success'));
      fetchRequests();
      return true;
    } catch (err: unknown) {
      const msg = translateApiError(err, t, t('common.error')) ?? t('common.error');
      setApproveError(msg);
      setError(msg);
      return false;
    } finally {
      setApproveSaving(false);
    }
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectNotes.trim()) { setRejectError(t('leave.reject_notes_required')); return; }
    setRejectSaving(true);
    setRejectError(null);
    try {
      await rejectLeaveRequest(rejectTarget.id, rejectNotes);
      showFlash(t('leave.rejected_success'));
      setRejectTarget(null);
      setRejectNotes('');
      fetchRequests();
    } catch (err: unknown) {
      setRejectError(translateApiError(err, t, t('common.error')) ?? t('common.error'));
    } finally {
      setRejectSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteLeaveRequest(deleteTarget.id);
      showFlash(t('leave.admin_delete_success'));
      setDeleteTarget(null);
      fetchRequests();
    } catch (err: unknown) {
      setError(translateApiError(err, t, t('common.error')) ?? t('common.error'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  function openCreate() {
    setCUserId('');
    setCType('vacation');
    setCDurationType('full_day');
    setCStart(today);
    setCEnd(today);
    setCShortStartTime('');
    setCShortEndTime('');
    setCNotes('');
    setCError(null);
    setCOverlappingLeaves([]);
    setCOverlapLoading(false);
    setCEmployeeOpen(false);
    setCreateOpen(true);
    if (empList.length === 0) {
      getEmployees({
        limit: 200,
        status: 'active',
        excludeAdmins: true,
        targetCompanyId: user?.role === 'hr' ? user.companyId : undefined
      })
        .then((r) => {
          const rows = r.employees
            .filter((e) => (user?.id ? e.id !== user.id : true))
            .map((e) => ({
              id: e.id,
              name: e.name,
              surname: e.surname,
              role: e.role,
              storeName: e.storeName,
              avatarFilename: e.avatarFilename ?? null,
            }));
          setEmpList(rows);
        })
        .catch(() => {});
    }
  }

  async function handleCreate() {
    if (!cUserId) { setCError(t('common.required')); return; }
    if (user?.id && parseInt(cUserId, 10) === user.id) { setCError(t('leave.admin_cannot_create_self')); return; }
    if (new Date(cStart) > new Date(cEnd)) { setCError(t('leave.error_date_range')); return; }

    if (cOverlappingLeaves.length > 0) {
      setCError(t('leave.error_employee_has_leave_same_day', 'This user already has leave on the same day.'));
      return;
    }

    if (cDurationType === 'short_leave') {
      if (cType !== 'vacation') {
        setCError(t('leave.error_short_vacation_only', 'Short leave is available only for vacation.'));
        return;
      }
      if (cStart !== cEnd) {
        setCError(t('leave.error_short_same_day', 'Short leave must start and end on the same day.'));
        return;
      }
      if (!cShortStartTime || !cShortEndTime) {
        setCError(t('leave.error_short_time_required', 'Start and end time are required for short leave.'));
        return;
      }
      const [startHour, startMinute] = cShortStartTime.split(':').map(Number);
      const [endHour, endMinute] = cShortEndTime.split(':').map(Number);
      if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
        setCError(t('leave.error_short_time_required', 'Start and end time are required for short leave.'));
        return;
      }
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      if (endMinutes <= startMinutes) {
        setCError(t('leave.error_short_time_range', 'End time must be after start time.'));
        return;
      }
      const shortHours = Number(((endMinutes - startMinutes) / 60).toFixed(2));
      if (shortHours >= 24) {
        setCError(t('leave.error_short_duration', 'Short leave must be less than 24 hours.'));
        return;
      }
    }

    setCSaving(true);
    setCError(null);
    try {
      await createLeaveOnBehalf({
        userId: parseInt(cUserId, 10),
        leaveType: cType as 'vacation' | 'sick',
        startDate: cStart,
        endDate: cEnd,
        leaveDurationType: cDurationType,
        shortStartTime: cDurationType === 'short_leave' ? cShortStartTime : undefined,
        shortEndTime: cDurationType === 'short_leave' ? cShortEndTime : undefined,
        notes: cNotes || undefined,
      });
      showFlash(t('leave.admin_create_success'));
      setCreateOpen(false);
      setCEmployeeOpen(false);
      fetchRequests();
    } catch (err: unknown) {
      setCError(translateApiError(err, t, t('common.error')) ?? t('common.error'));
    } finally {
      setCSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  // Chevron drawn in, because the native select arrow varies wildly between
  // browsers and looked unfinished next to the rest of the toolbar.
  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 13px',
    borderRadius: 10,
    border: '1.5px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 11px center',
    boxShadow: 'var(--shadow-xs)',
  };

  const filterControlStyle = {
    ...selectStyle,
    border: '1.5px solid #dfd2c2',
    background: '#fffdfa',
    color: '#374151',
  };

  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 700 as const,
    color: 'var(--text-secondary)', marginBottom: 6,
    textTransform: 'uppercase' as const, letterSpacing: '0.8px',
  };

  const selectedCreateEmployeeId = cUserId ? parseInt(cUserId, 10) : null;
  const selectedCreateEmployee = selectedCreateEmployeeId == null
    ? null
    : empList.find((emp) => emp.id === selectedCreateEmployeeId) ?? null;
  const selectedCreateEmployeeFullName = selectedCreateEmployee
    ? formatEmployeeName(selectedCreateEmployee)
    : '';
  const selectedCreateEmployeeRoleLabel = selectedCreateEmployee
    ? t(`roles.${selectedCreateEmployee.role}`, selectedCreateEmployee.role)
    : '';
  const selectedCreateEmployeeAvatarUrl = getAvatarUrl(selectedCreateEmployee?.avatarFilename);
  const selectedCreateEmployeeInitials = selectedCreateEmployee
    ? `${selectedCreateEmployee.name?.[0] ?? ''}${selectedCreateEmployee.surname?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U';

  return (
    <div style={{ padding: 0, minHeight: '100%' }}>

      {/* ── Header Summary ────────────────────────────────────────────────── */}
      <div style={{ padding: isMobile ? '16px 0 0' : '20px 24px 0' }}>
        <div style={{
          background: 'var(--primary)',
          border: '1px solid rgba(13,33,55,0.9)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 36px rgba(13,33,55,0.28)',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.7px', color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', marginBottom: 6 }}>
                {t('leave.page_title')}
              </div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                {t('leave.admin_title')}
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', margin: '4px 0 0' }}>
                {t('leave.admin_subtitle')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <button
                onClick={() => setMyLeaveOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.32)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {t('leave.my_leave_btn')}
              </button>
              <button
                onClick={openCreate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', borderRadius: 9,
                  background: 'var(--accent)', border: 'none',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                {t('leave.admin_new')}
              </button>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 12,
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xs)',
          padding: '14px',
        }}>
          {(() => {
            const summaryMaxAvatars = 5;
            return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            {[
              {
                key: 'pending',
                label: t('leave.admin_stat_pending'),
                value: loading ? '—' : pendingCount,
                color: '#b45309',
                bg: 'rgba(245,158,11,0.10)',
                vacation: pendingVacationCount,
                sick: pendingSickCount,
                people: pendingPeople,
              },
              {
                key: 'approved',
                label: t('leave.admin_stat_approved'),
                value: loading ? '—' : approvedCount,
                color: '#15803d',
                bg: 'rgba(22,163,74,0.10)',
                vacation: approvedVacationCount,
                sick: approvedSickCount,
                people: approvedPeople,
              },
              {
                key: 'total',
                label: t('leave.admin_stat_total'),
                value: loading ? '—' : requests.length,
                color: '#0D2137',
                bg: 'rgba(13,33,55,0.08)',
                vacation: totalVacationCount,
                sick: totalSickCount,
                people: [] as LeaveRequest[],
              },
            ].map(({ key, label, value, color, bg, vacation, sick, people }) => {
              const strips = [
                {
                  key: 'vacation',
                  count: vacation,
                  icon: <Palmtree size={10} strokeWidth={2.5} />,
                  border: '1px solid rgba(37,99,235,0.26)',
                  left: '#2563eb',
                  background: 'rgba(219,234,254,0.86)',
                  color: '#1e40af',
                  label: t('leave.type_vacation'),
                },
                {
                  key: 'sick',
                  count: sick,
                  icon: <Thermometer size={10} strokeWidth={2.5} />,
                  border: '1px solid rgba(217,119,6,0.26)',
                  left: '#d97706',
                  background: 'rgba(254,243,199,0.86)',
                  color: '#92400e',
                  label: t('leave.type_sick'),
                },
              ].filter((item) => loading || item.count > 0);
              const visiblePeople = people.slice(0, summaryMaxAvatars);
              const showOverflow = people.length > summaryMaxAvatars;

              return (
              <div key={label} style={{ background: bg, border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12, padding: '12px 14px', minHeight: 120, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 5 }}>{label}</div>
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {strips.map((strip) => (
                      <span
                        key={strip.key}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          borderRadius: 999,
                          border: strip.border,
                          borderLeft: `3px solid ${strip.left}`,
                          background: strip.background,
                          color: strip.color,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 800,
                          lineHeight: 1.2,
                        }}
                      >
                        {strip.icon}
                        {strip.label} {loading ? '—' : strip.count}
                      </span>
                    ))}
                  </div>

                  {(key === 'pending' || key === 'approved') && visiblePeople.length > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                      {visiblePeople.map((person, index) => {
                        const avatarUrl = getAvatarUrl(person.userAvatarFilename);
                        const fullName = `${person.userSurname ?? ''} ${person.userName ?? ''}`.trim();
                        const initials = initialsForPerson(person.userName, person.userSurname);
                        const fallbackColor = avatarColorFromName(fullName || String(person.userId));
                        return (
                          <span
                            key={`${person.userId}-${index}`}
                            title={fullName}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              overflow: 'hidden',
                              border: '1.5px solid #fff',
                              background: avatarUrl ? 'transparent' : fallbackColor,
                              color: '#fff',
                              fontSize: '0.58rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginLeft: index === 0 ? 0 : -8,
                              boxShadow: '0 1px 2px rgba(15,23,42,0.16)',
                              zIndex: 25 - index,
                            }}
                          >
                            {avatarUrl ? (
                              <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : initials}
                          </span>
                        );
                      })}

                      {showOverflow && (
                        <span
                          title={t('shifts.monthlyEmployeesOverflow', 'More employees')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: visiblePeople.length > 0 ? -8 : 0,
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            border: '1.5px solid #fff',
                            background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(51,65,85,0.76))',
                            color: '#e2e8f0',
                            fontSize: '0.55rem',
                            fontWeight: 900,
                            lineHeight: 1,
                            boxShadow: '0 1px 2px rgba(15,23,42,0.16)',
                            zIndex: 30,
                          }}
                        >
                          5+
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
            );
          })()}
        </div>
      </div>

      {/* ── Tabs + Filters bar ───────────────────────────────────────────── */}
      <div style={{ padding: isMobile ? '14px 0 0' : '14px 24px 0' }}>
        <div style={{
          background: '#f8f3ec',
          border: '1px solid #e3d7c8',
          borderRadius: 14,
          padding: '10px 12px 12px',
          boxShadow: '0 4px 12px rgba(15,23,42,0.06)',
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {((['requests', 'balances', 'calendar', 'approval_config', 'archived'] as PanelTab[]).filter((tab) => {
              if (tab === 'requests') return true;
              if (tab === 'balances') return permissions?.saldi || user?.isSuperAdmin;
              if (tab === 'calendar') return true;
              if (tab === 'approval_config') return user?.role === 'admin' || user?.isSuperAdmin;
              if (tab === 'archived') return user?.role === 'admin' || user?.role === 'hr' || user?.isSuperAdmin;
              return false;
            })).map((tab) => {
              const selected = panelTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setPanelTab(tab)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: `1px solid ${selected ? '#b68c56' : '#d8c7b3'}`,
                    background: selected ? '#fff8ef' : '#ffffff',
                    color: selected ? '#6b4b22' : '#6f5a41',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {tab === 'requests' ? t('leave.admin_title') : tab === 'balances' ? t('leave.balance_tab') : tab === 'calendar' ? t('leave.calendar_tab') : tab === 'approval_config' ? t('leave.approval_config_tab') : t('leave.archived_tab', 'Archiviate')}
                </button>
              );
            })}
          </div>

          {panelTab === 'requests' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              {/* Search input */}
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder={t('common.search', 'Cerca...')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: 36,
                    borderRadius: 8,
                    border: '1.5px solid #dfd2c2',
                    padding: '0 12px 0 34px',
                    background: '#fffdfa',
                    color: '#374151',
                    fontSize: 13,
                    outline: 'none',
                    transition: 'all 0.15s',
                  }}
                />
              </div>

              {/* Filter Button */}
              <button
                onClick={openFilterModal}
                style={{
                  background: activeFiltersCount > 0
                    ? 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)'
                    : '#fffdfa',
                  color: activeFiltersCount > 0 ? '#fff' : 'var(--text-secondary)',
                  border: activeFiltersCount > 0 ? 'none' : '1px solid #dfd2c2',
                  borderRadius: 8,
                  padding: '0 14px',
                  height: 36,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                  boxShadow: activeFiltersCount > 0 ? '0 2px 8px rgba(139,105,20,0.24)' : 'none',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                <span>{t('employees.filters', 'Filtri')}</span>
                {activeFiltersCount > 0 && (
                  <span style={{
                    background: activeFiltersCount > 0 ? '#fff' : 'var(--accent)',
                    color: activeFiltersCount > 0 ? 'var(--accent)' : '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '999px',
                    marginLeft: '2px',
                  }}>
                    {activeFiltersCount}
                  </span>
                )}
              </button>
              {loading && <span style={{ fontSize: 12, color: '#6f5a41' }}>{t('common.loading')}</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Requests tab ──────────────────────────────────────────────────── */}
      {(panelTab === 'requests' || panelTab === 'archived') && (
        <>
          {/* ── Table ─────────────────────────────────────────────────────── */}
          <div style={{ padding: isMobile ? '16px 0 20px' : '20px 24px 24px' }}>
            {flash && (
              <div style={{
                background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)',
                borderLeft: '4px solid #16a34a', borderRadius: 8,
                padding: '10px 16px', marginBottom: 16, color: '#16a34a', fontSize: 13, fontWeight: 600,
              }}>
                {flash}
              </div>
            )}
            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                borderLeft: '4px solid #dc2626', borderRadius: 8,
                padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              {!loading && filtered.length === 0 ? (
                <div style={{ padding: '56px 32px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('leave.no_requests')}</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead>
                      <tr style={{ background: 'var(--primary)' }}>
                        {[
                          { text: t('leave.col_employee'), icon: <User size={12} style={{ marginRight: 6 }} /> },
                          { text: t('leave.col_role', 'Role'), icon: <Shield size={12} style={{ marginRight: 6 }} /> },
                          { text: t('leave.col_store', 'Store'), icon: <Store size={12} style={{ marginRight: 6 }} /> },
                          { text: t('leave.col_period'), icon: <Calendar size={12} style={{ marginRight: 6 }} /> },
                          { text: t('leave.col_status'), icon: <CheckCheck size={12} style={{ marginRight: 6 }} /> },
                          { text: t('leave.col_action_time', 'Last action'), icon: <Clock3 size={12} style={{ marginRight: 6 }} /> },
                          { text: t('common.actions'), icon: <Settings size={12} style={{ marginRight: 6 }} /> },
                        ].map((h, i) => (
                          <th key={`${h.text}-${i}`} style={{
                            padding: '10px 16px', textAlign: 'left',
                            fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.84)',
                            textTransform: 'uppercase', letterSpacing: '1.5px',
                            borderBottom: '1px solid rgba(255,255,255,0.22)',
                            ...(i === 0 ? { paddingLeft: 20 } : {}),
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {h.icon}
                              <span>{h.text}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((req) => {
                        const days = countWorkingDays(req.startDate, req.endDate);
                        const isShortLeave = req.leaveDurationType === 'short_leave';
                        const shortHours = shortLeaveHours(req.shortStartTime, req.shortEndTime);
                        const isVacation = req.leaveType === 'vacation';
                        const typeColor = isVacation ? '#3b82f6' : '#f59e0b';
                        const storeMeta = resolveRequestStoreMeta(req);
                        const storeLogoUrl = getStoreLogoUrl(storeMeta.storeLogoFilename);
                        const storeInitial = (storeMeta.storeName?.[0] ?? 'S').toUpperCase();
                        const avatarUrl = getAvatarUrl(req.userAvatarFilename);
                        const initials = initialsForPerson(req.userName, req.userSurname);
                        const avatarFallbackColor = avatarColorFromName(`${req.userName ?? ''} ${req.userSurname ?? ''}`.trim() || String(req.userId));
                        const isHR = user?.role === 'hr';
                        let latestActionLabel = null;
                        const isSystemAuto = req.latestActionByRole === 'system' || req.escalated === true;
                        if (isSystemAuto) {
                          let roleText = 'System';
                          const norm = (req.status ?? '').toLowerCase().replace(/ /g, '_');
                          if (norm === 'store_manager_approved') roleText = t('roles.store_manager');
                          else if (norm === 'area_manager_approved') roleText = t('roles.area_manager');
                          else if (norm === 'hr_approved') roleText = t('roles.hr');
                          latestActionLabel = `Auto: ${roleText}`;
                        } else if (req.latestActionByRole) {
                          latestActionLabel = t(`roles.${req.latestActionByRole}`, { defaultValue: req.latestActionByRole });
                        }
                        const latestActionTime = req.latestActionAt
                          ? fmtDateTime(req.latestActionAt, locale)
                          : '—';
                        const canAct =
                          req.status !== 'approved' &&
                          !req.status.includes('rejected') &&
                          req.status !== 'cancelled' &&
                          !!effectiveApproverRole &&
                          (isAdmin || (isHR && req.status !== 'HR approved') || req.currentApproverRole === effectiveApproverRole);
                        return (
                          <tr
                            key={req.id}
                            style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-warm)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                          >
                            {/* Employee */}
                            <td style={{ padding: '12px 16px 12px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <span style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                  border: '1px solid rgba(148,163,184,0.4)',
                                  background: avatarUrl ? 'transparent' : avatarFallbackColor,
                                  color: '#fff',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  {avatarUrl ? (
                                    <img src={avatarUrl} alt={`${req.userSurname ?? ''} ${req.userName ?? ''}`.trim()} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : initials}
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {req.userName} {req.userSurname}
                                  </span>
                                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                    #{req.id} · {new Date(req.createdAt).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT')}
                                  </span>
                                </span>
                              </div>
                            </td>
                            {/* Role */}
                            <td style={{ padding: '12px 16px' }}>
                              <RoleTag role={req.userRole} />
                            </td>
                            {/* Store */}
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <span style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  border: '1px solid rgba(148,163,184,0.35)',
                                  background: 'rgba(13,33,55,0.12)',
                                  color: '#0D2137',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  flexShrink: 0,
                                }}>
                                  {storeLogoUrl ? (
                                    <img src={storeLogoUrl} alt={storeMeta.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : storeInitial}
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {storeMeta.storeName && storeMeta.storeName.length > 14
                                      ? `${storeMeta.storeName.substring(0, 14)}...`
                                      : storeMeta.storeName}
                                  </span>
                                  <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {storeMeta.companyName}
                                  </span>
                                </span>
                              </div>
                            </td>
                            {/* Period */}
                            <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600 }}>
                                {isShortLeave
                                  ? `${fmtDate(req.startDate, locale)} · ${req.shortStartTime ?? '--:--'}-${req.shortEndTime ?? '--:--'}`
                                  : `${fmtDate(req.startDate, locale)} → ${fmtDate(req.endDate, locale)}`}
                              </div>
                              <div style={{ marginTop: 6 }}>
                                {(() => {
                                  const isHalf = isShortLeave;
                                  let daysText = '';
                                  if (isHalf) {
                                    daysText = locale === 'en' ? 'Half Day' : 'Mezza giornata';
                                  } else if (days === 1) {
                                    daysText = locale === 'en' ? '1 Day' : '1 Giorno';
                                  } else {
                                    daysText = locale === 'en' ? `${days} Days` : `${days} Giorni`;
                                  }

                                  return (
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 6,
                                      padding: '3px 8px 3px 6px',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: isVacation ? 'rgba(219,234,254,0.45)' : 'rgba(255,237,213,0.45)',
                                      color: isVacation ? '#1e40af' : '#92400e',
                                      borderLeft: `3px solid ${isVacation ? '#2563eb' : '#ea580c'}`,
                                      borderTop: `1px solid ${isVacation ? 'rgba(37,99,235,0.18)' : 'rgba(234,88,12,0.18)'}`,
                                      borderRight: `1px solid ${isVacation ? 'rgba(37,99,235,0.18)' : 'rgba(234,88,12,0.18)'}`,
                                      borderBottom: `1px solid ${isVacation ? 'rgba(37,99,235,0.18)' : 'rgba(234,88,12,0.18)'}`,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.5px',
                                    }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {isVacation ? <Palmtree size={10} strokeWidth={2.4} /> : <Thermometer size={10} strokeWidth={2.4} />}
                                        {t(`leave.type_${req.leaveType}`)}
                                      </span>
                                      <span style={{
                                        fontSize: 9,
                                        fontWeight: 800,
                                        background: isVacation ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)',
                                        padding: '2px 6px',
                                        borderRadius: 3,
                                        marginLeft: 6,
                                        color: isVacation ? '#1d4ed8' : '#b45309',
                                        textTransform: 'none',
                                        fontVariantNumeric: 'tabular-nums',
                                      }}>
                                        {daysText}
                                      </span>
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            {/* Status */}
                            <td style={{ padding: '12px 16px' }}>
                              <StatusBadge req={req} />
                            </td>
                            {/* Last Action */}
                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                              {latestActionLabel ? (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{latestActionLabel}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{latestActionTime}</div>
                                </>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                            {/* Actions */}
                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {req.medicalCertificateName && (
                                  <button
                                    onClick={() => handleDownloadCertificate(req)}
                                    title={t('leave.certificate_btn')}
                                    aria-label={t('leave.certificate_btn')}
                                    style={{
                                      width: 28, height: 28, borderRadius: 7,
                                      border: '1px solid rgba(3,105,161,0.25)',
                                      background: 'rgba(3,105,161,0.08)',
                                      color: '#0369a1', cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    <FileText size={13} strokeWidth={2.5} />
                                  </button>
                                )}
                                {panelTab === 'requests' && (user?.role === 'admin' || user?.role === 'hr') && !isPendingWorkflowStatus(req.status) && (
                                  <button
                                    onClick={() => handleArchive(req.id)}
                                    disabled={archivingId === req.id}
                                    title={t('leave.action_archive', 'Archivia')}
                                    aria-label={t('leave.action_archive', 'Archivia')}
                                    style={{
                                      width: 28, height: 28, borderRadius: 7,
                                      border: '1px solid rgba(139,92,246,0.3)',
                                      background: 'rgba(139,92,246,0.08)',
                                      color: '#8b5cf6', cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    <Archive size={13} strokeWidth={2.4} />
                                  </button>
                                )}
                                {panelTab === 'requests' && canAct && (
                                  <>
                                    <button
                                      onClick={() => setApproveTarget(req)}
                                      title={t('leave.action_approve')}
                                      aria-label={t('leave.action_approve')}
                                      style={{
                                        width: 28, height: 28, borderRadius: 7,
                                        border: '1px solid rgba(22,163,74,0.3)',
                                        background: 'rgba(22,163,74,0.08)',
                                        color: '#16a34a', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                    >
                                      <CheckCheck size={14} strokeWidth={2.6} />
                                    </button>
                                    <button
                                      onClick={() => { setRejectTarget(req); setRejectNotes(''); setRejectError(null); }}
                                      title={t('leave.action_reject')}
                                      aria-label={t('leave.action_reject')}
                                      style={{
                                        width: 28, height: 28, borderRadius: 7,
                                        border: '1px solid rgba(220,38,38,0.3)',
                                        background: 'rgba(220,38,38,0.08)',
                                        color: '#dc2626', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      }}
                                    >
                                      <XCircle size={14} strokeWidth={2.6} />
                                    </button>
                                  </>
                                )}
                                {panelTab === 'archived' && user?.role === 'admin' && (
                                  <button
                                    onClick={() => setDeleteTarget(req)}
                                    title={t('common.delete')}
                                    aria-label={t('common.delete')}
                                    style={{
                                      width: 28, height: 28, borderRadius: 7,
                                      border: '1px solid rgba(220,38,38,0.3)',
                                      background: 'rgba(220,38,38,0.08)',
                                      color: '#dc2626', cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    <Trash2 size={13} strokeWidth={2.4} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!loading && filtered.length > 0 && (
                <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, color: 'var(--text-muted)' }}>
                  <strong>{filtered.length}</strong> {filtered.length === 1 ? t('leave.request_singular') : t('leave.request_plural')}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Balances tab ──────────────────────────────────────────────────── */}
      {panelTab === 'balances' && (
        <>
          {flash && (
            <div style={{
              margin: isMobile ? '16px 0 0' : '16px 32px 0',
              background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)',
              borderLeft: '4px solid #16a34a', borderRadius: 8,
              padding: '10px 16px', color: '#16a34a', fontSize: 13, fontWeight: 600,
            }}>
              {flash}
            </div>
          )}
          <BalancesTab showFlash={showFlash} />
        </>
      )}

      {/* ── Calendar tab ────────────────────────────────────────────────── */}
      {panelTab === 'calendar' && (
        <div style={{ padding: isMobile ? '16px 0 20px' : '20px 24px 24px' }}>
          <LeaveCalendar onDayClick={(date) => { setCStart(date); setCEnd(date); setCreateOpen(true); }} onRefresh={fetchRequests} />
        </div>
      )}

      {/* ── Approval Config tab ─────────────────────────────────────────── */}
      {panelTab === 'approval_config' && (user?.role === 'admin' || user?.isSuperAdmin) && (
        <div style={{ padding: isMobile ? '16px 0 20px' : '20px 24px 24px' }}>
          <ApprovalConfigPanel />
        </div>
      )}

      {/* ── Create Modal ──────────────────────────────────────────────────── */}
      {createOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !cSaving) {
              setCreateOpen(false);
              setCEmployeeOpen(false);
            }
          }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', width: '100%', maxWidth: 520, maxHeight: '88vh', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(201,151,58,0.1) 0%, rgba(13,33,55,0.05) 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(201,151,58,0.18)',
                  color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Palmtree size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                    {t('leave.admin_create_title')}
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t('leave.admin_subtitle')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setCreateOpen(false); setCEmployeeOpen(false); }}
                disabled={cSaving}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
              {cError && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderLeft: '4px solid #dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
                  {cError}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('leave.select_employee')} *</label>
                <div ref={cEmployeePickerRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setCEmployeeOpen((prev) => !prev)}
                    style={{ ...selectStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    {selectedCreateEmployee ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {selectedCreateEmployeeAvatarUrl ? (
                            <img src={selectedCreateEmployeeAvatarUrl} alt={selectedCreateEmployeeFullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : selectedCreateEmployeeInitials}
                        </span>
                        <span style={{ minWidth: 0, textAlign: 'left' }}>
                          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedCreateEmployeeFullName}
                          </span>
                          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedCreateEmployeeRoleLabel}
                            {selectedCreateEmployee.storeName ? ` · ${selectedCreateEmployee.storeName}` : ''}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('leave.select_employee')}</span>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>{cEmployeeOpen ? '▲' : '▼'}</span>
                  </button>

                  {cEmployeeOpen && (
                    <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 10, boxShadow: '0 16px 30px rgba(0,0,0,0.18)', maxHeight: 230, overflowY: 'auto' }}>
                      {empList.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
                      ) : (
                        empList.map((emp) => {
                          const fullName = formatEmployeeName(emp);
                          const roleLabel = t(`roles.${emp.role}`, emp.role);
                          const avatarUrl = getAvatarUrl(emp.avatarFilename);
                          const initials = `${emp.name?.[0] ?? ''}${emp.surname?.[0] ?? ''}`.toUpperCase() || 'U';
                          const selected = String(emp.id) === cUserId;
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                setCUserId(String(emp.id));
                                setCEmployeeOpen(false);
                              }}
                              style={{ width: '100%', border: 'none', borderBottom: '1px solid #e5e7eb', background: selected ? '#f8fafc' : '#ffffff', padding: '8px 10px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                            >
                              <span style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, var(--primary), var(--accent))', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : initials}
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {fullName}
                                </span>
                                <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {roleLabel}
                                  {emp.storeName ? ` · ${emp.storeName}` : ''}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedEmpHasNoBalance && (
                <div style={{
                  marginBottom: 14, padding: '10px 14px',
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: 8, color: '#b45309', fontSize: 12,
                  display: 'flex', alignItems: 'flex-start', gap: 8
                }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>⚠️</span>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 2 }}>{t('leave.balance_not_configured_title', 'Saldo Non Configurato')}</strong>
                    <span>{t('leave.admin_balance_not_configured_desc', "L'utente selezionato non ha un piano ferie/permessi configurato per quest'anno.")}</span>
                  </div>
                </div>
              )}

              {selectedEmpExceedsBalance && (
                <div style={{
                  marginBottom: 14, padding: '10px 14px',
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: 8, color: '#b45309', fontSize: 12,
                  display: 'flex', alignItems: 'flex-start', gap: 8
                }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>⚠️</span>
                  <div>
                    <strong style={{ display: 'block', marginBottom: 2 }}>{t('leave.insufficient_balance_title', 'Saldo Insufficiente')}</strong>
                    <span>
                      {t('leave.admin_insufficient_balance_desc', "La richiesta di {{requested}} giorni supera il saldo rimanente di {{remaining}} giorni dell'utente.", {
                        requested: selectedEmpRequestedDays,
                        remaining: selectedEmpRemainingDays
                      })}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{t('leave.type_label')} *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {([
                    { key: 'vacation', label: t('leave.type_vacation'), icon: <Palmtree size={13} strokeWidth={2.4} /> },
                    { key: 'sick', label: t('leave.type_sick'), icon: <Thermometer size={13} strokeWidth={2.4} /> },
                  ] as const).map((opt) => {
                    const selected = cType === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setCType(opt.key)}
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${
                            selected
                              ? (opt.key === 'vacation' ? 'var(--accent)' : 'rgba(245,158,11,0.3)')
                              : '#d1d5db'
                          }`,
                          background: selected
                            ? (opt.key === 'vacation' ? 'var(--accent-light)' : 'rgba(245,158,11,0.08)')
                            : '#ffffff',
                          color: selected
                            ? (opt.key === 'vacation' ? 'var(--accent)' : '#f59e0b')
                            : 'var(--text-secondary)',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '10px 12px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 6,
                        }}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {cType === 'vacation' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{t('leave.duration_mode_label', 'Duration')} *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      { key: 'full_day', label: t('leave.duration_full_day', 'Full day leave'), icon: <CalendarDays size={13} strokeWidth={2.4} /> },
                      { key: 'short_leave', label: t('leave.duration_short_leave', 'Short leave'), icon: <Clock3 size={13} strokeWidth={2.4} /> },
                    ] as const).map((opt) => {
                      const selected = cDurationType === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setCDurationType(opt.key)}
                          style={{
                            borderRadius: 8,
                            border: `1px solid ${
                              selected
                                ? (opt.key === 'full_day' ? 'var(--accent)' : '#8b5cf6')
                                : '#d1d5db'
                            }`,
                            background: selected
                              ? (opt.key === 'full_day' ? 'var(--accent-light)' : 'rgba(139,92,246,0.08)')
                              : '#ffffff',
                            color: selected
                              ? (opt.key === 'full_day' ? 'var(--accent)' : '#8b5cf6')
                              : 'var(--text-secondary)',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '10px 12px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {opt.icon}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <DatePicker label={`${t('leave.start_date')} *`} value={cStart} onChange={setCStart} />
                </div>
                <div style={{ flex: 1 }}>
                  <DatePicker label={`${t('leave.end_date')} *`} value={cEnd} onChange={setCEnd} disabled={cDurationType === 'short_leave'} />
                </div>
              </div>

              {cDurationType === 'short_leave' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{t('leave.short_leave_time_range', 'Time range')} *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input type="time" value={cShortStartTime} onChange={(e) => setCShortStartTime(e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', cursor: 'text' }} />
                    <input type="time" value={cShortEndTime} onChange={(e) => setCShortEndTime(e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', cursor: 'text' }} />
                  </div>
                </div>
              )}

              {cStart && cEnd && new Date(cStart) <= new Date(cEnd) && (
                <div style={{ marginBottom: 14, padding: '8px 12px', background: '#ffffff', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, color: '#4b5563', fontWeight: 600 }}>
                  {cDurationType === 'short_leave'
                    ? (() => {
                        const hours = shortLeaveHours(cShortStartTime, cShortEndTime);
                        return hours != null
                          ? t('leave.short_leave_hours', { hours })
                          : t('leave.short_leave_hint', 'Select start and end time for a short leave.');
                      })()
                    : t('leave.working_days', { n: countWorkingDays(cStart, cEnd) })}
                </div>
              )}

              {cOverlapLoading && cUserId && (
                <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, color: '#4b5563', fontWeight: 600 }}>
                  {t('common.loading')}
                </div>
              )}

              {!cOverlapLoading && cOverlappingLeaves.length > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.25)', background: 'rgba(220,38,38,0.06)' }}>
                  <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700, marginBottom: 8 }}>
                    {t('leave.error_employee_has_leave_same_day', 'This user already has leave on the same day.')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cOverlappingLeaves.slice(0, 3).map((conflict) => {
                      const conflictShort = conflict.leaveDurationType === 'short_leave';
                      return (
                        <div key={conflict.id} style={{ background: '#fff', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 7, padding: '7px 9px' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                            {t(`leave.type_${conflict.leaveType}`)} · {t(`leave.status_${conflict.status.toLowerCase().replace(/ /g, '_')}`)}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {conflictShort
                              ? `${fmtDate(conflict.startDate, locale)} · ${conflict.shortStartTime ?? '--:--'}-${conflict.shortEndTime ?? '--:--'}`
                              : `${fmtDate(conflict.startDate, locale)} → ${fmtDate(conflict.endDate, locale)}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>{t('leave.notes_label')}</label>
                <textarea
                  value={cNotes}
                  onChange={(e) => setCNotes(e.target.value)}
                  rows={2}
                  placeholder={t('leave.notes_placeholder')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', background: '#fff', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setCreateOpen(false); setCEmployeeOpen(false); }}
                  disabled={cSaving}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #d1d5db', background: '#fff', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={cSaving}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: cSaving ? 'not-allowed' : 'pointer', opacity: cSaving ? 0.7 : 1 }}
                >
                  {cSaving ? t('common.saving') : t('leave.admin_new')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Confirm Modal ───────────────────────────────────────── */}
      {approveTarget && (() => {
        const avatarUrl = getAvatarUrl(approveTarget.userAvatarFilename);
        const initials = initialsForPerson(approveTarget.userName, approveTarget.userSurname);
        const avatarFallbackColor = avatarColorFromName(`${approveTarget.userName ?? ''} ${approveTarget.userSurname ?? ''}`.trim() || String(approveTarget.userId));
        const dateRangeStr = approveTarget.leaveDurationType === 'short_leave'
          ? `${fmtDate(approveTarget.startDate, locale)} · ${approveTarget.shortStartTime ?? '--:--'}-${approveTarget.shortEndTime ?? '--:--'}`
          : `${fmtDate(approveTarget.startDate, locale)} → ${fmtDate(approveTarget.endDate, locale)}`;

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={(e) => { if (e.target === e.currentTarget) setApproveTarget(null); }}
          >
            {/* Capped at the viewport with its own scroll. The dialog grew with
                its content — shifts, balance, warnings — until the buttons were
                pushed off screen on a laptop. Now only the body scrolls. */}
            <div style={{
              background: 'var(--surface)', borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
              width: '100%', maxWidth: 460, border: '1px solid var(--border)',
              padding: 20,
              display: 'flex', flexDirection: 'column', gap: 12,
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid rgba(148,163,184,0.4)',
                  background: avatarUrl ? 'transparent' : avatarFallbackColor,
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={`${approveTarget.userSurname ?? ''} ${approveTarget.userName ?? ''}`.trim()} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : initials}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                    {t('leave.action_approve_title', 'Approva Permesso')}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {approveTarget.userName} {approveTarget.userSurname}
                  </p>
                </div>
              </div>

              {/* Date & Period details */}
              <div style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--text)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('leave.col_period', 'Periodo')}:</span>
                  <span style={{ fontWeight: 700 }}>{dateRangeStr}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('leave.type_label', 'Tipo')}:</span>
                  <span style={{ fontWeight: 700, color: approveTarget.leaveType === 'vacation' ? '#3b82f6' : '#f59e0b' }}>
                    {t(`leave.type_${approveTarget.leaveType}`)}
                  </span>
                </div>
              </div>

              {/* Shifts query list */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  {t('leave.existing_shifts_label', 'Turni nel periodo di permesso')}
                </div>
                {shiftsLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                    {t('leave.loading_shifts', 'Caricamento turni...')}
                  </div>
                ) : shiftsForTarget.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px', background: 'var(--surface-warm)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                    {t('leave.no_shifts_for_period', 'Nessun turno in questo periodo')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto', paddingRight: 4 }}>
                    {shiftsForTarget.map((shift) => {
                      const isConfirmed = shift.status === 'confirmed';
                      return (
                        <div key={shift.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: 'var(--surface-warm)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 700 }}>{fmtDate(shift.date, locale)}</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                              ({shift.startTime.substring(0, 5)} - {shift.endTime.substring(0, 5)})
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{shift.storeName}</span>
                          </div>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: isConfirmed ? 'rgba(22,163,74,0.1)' : 'rgba(245,158,11,0.1)',
                            color: isConfirmed ? '#16a34a' : '#d97706',
                          }}>
                            {isConfirmed ? t('shifts.status_confirmed', 'Confermato') : t('shifts.status_scheduled', 'Programmato')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* The allocation this approval will draw from. An approver was
                  previously deciding blind, and only discovered a missing or
                  exhausted balance when the request was refused. */}
              <div style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--surface-warm)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 5,
                }}>
                  {t('leave.balance_of_employee', 'Saldo del dipendente')} · {new Date(approveTarget.startDate).getFullYear()}
                </div>

                {targetBalanceLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
                ) : !targetBalances || targetBalances.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#b45309', fontWeight: 600, lineHeight: 1.45 }}>
                    <span aria-hidden>⚠</span>
                    <span>{t('leave.balance_missing_approve', 'Nessun saldo configurato per questo dipendente e anno. Configuralo nella scheda Saldi prima di approvare.')}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {targetBalances.map((b) => {
                      const exhausted = b.remainingDays <= 0;
                      const isRequestType = b.leaveType === approveTarget.leaveType;
                      return (
                        <div key={b.leaveType} style={{
                          display: 'flex', flexDirection: 'column', gap: 2,
                          padding: '6px 10px', borderRadius: 6,
                          // The type being requested is the one that matters here.
                          background: isRequestType ? 'var(--surface)' : 'transparent',
                          border: isRequestType ? '1px solid var(--border)' : '1px solid transparent',
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            {t(`leave.type_${b.leaveType}`)}{isRequestType ? ' ←' : ''}
                          </span>
                          <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                            <strong>{b.usedDays}</strong>
                            <span style={{ color: 'var(--text-muted)' }}> / {b.totalDays}</span>
                            <span style={{ color: exhausted ? '#dc2626' : '#16a34a', fontWeight: exhausted ? 700 : 400, marginLeft: 5 }}>
                              ({b.remainingDays} {t('leave.balance_remaining_short').toLowerCase()})
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Checkbox and Logic Guide Text */}
              {shiftsForTarget.length > 0 && (
                <div style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 10,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={cancelShiftsChecked}
                      onChange={(e) => setCancelShiftsChecked(e.target.checked)}
                      style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                      {t('leave.cancel_shifts_checkbox', 'Annulla i turni programmati e confermati')}
                    </span>
                  </label>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {t('leave.cancel_shifts_guide', 'Se abilitato, l\'approvazione del permesso annullerà automaticamente i turni mostrati sopra e ne sottrarrà le ore dal riepilogo.')}
                  </p>
                </div>
              )}

              {/* An auto-approved request cannot be approved again — it is
                  already terminal. Reopening is the actual remedy, so it is
                  offered right where the attempt failed. */}
              {leaveVisual(approveTarget).state === 'unverified' && (
                <div style={{
                  margin: '4px 0 10px', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.28)',
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>
                    ⚠ {t('leave.badge_unverified', 'Da verificare')}
                  </div>
                  <p style={{ fontSize: 12, color: '#7f1d1d', margin: '0 0 8px', lineHeight: 1.45 }}>
                    {t('leave.unverified_explain', 'Questa richiesta risulta approvata ma nessuna persona l\'ha decisa: è stata approvata automaticamente per inattività. Non può essere approvata di nuovo.')}
                  </p>
                  <button
                    disabled={reopening}
                    onClick={async () => {
                      setReopening(true); setApproveError(null);
                      try {
                        await reopenLeaveRequest(approveTarget.id);
                        showFlash(t('leave.reopen_success', 'Richiesta riaperta e riassegnata a HR'));
                        setApproveTarget(null);
                        fetchRequests();
                      } catch (err: unknown) {
                        setApproveError(translateApiError(err, t, t('common.error')) ?? t('common.error'));
                      } finally { setReopening(false); }
                    }}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: 'none',
                      background: reopening ? '#9ca3af' : '#b91c1c', color: '#fff',
                      fontSize: 12.5, fontWeight: 700, cursor: reopening ? 'wait' : 'pointer',
                    }}
                  >
                    {reopening ? t('common.loading') : t('leave.reopen_action', 'Riapri e rimanda a HR')}
                  </button>
                </div>
              )}

              {/* The refusal appears here, beside the button that caused it,
                  instead of the dialog vanishing and the message surfacing
                  somewhere the approver was no longer looking. */}
              {approveError && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  margin: '4px 0 10px', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                  color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.45,
                }}>
                  <span aria-hidden>⚠</span>
                  <span>{approveError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setApproveTarget(null)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  disabled={approveSaving}
                  onClick={async () => {
                    const target = approveTarget;
                    if (!target) return;
                    // Close only once it has actually worked, so a refusal stays
                    // on screen next to the button that caused it.
                    const ok = await handleApprove(target, cancelShiftsChecked && shiftsForTarget.length > 0);
                    if (ok) setApproveTarget(null);
                  }}
                  style={{
                    flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                    background: approveSaving ? '#9ca3af' : '#16a34a', color: '#fff',
                    fontSize: 14, fontWeight: 700,
                    cursor: approveSaving ? 'wait' : 'pointer',
                  }}
                >
                  {approveSaving ? t('common.loading') : t('common.confirm', 'Confirm')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Reject Modal ──────────────────────────────────────────────────── */}
      {rejectTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !rejectSaving) setRejectTarget(null); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', width: '100%', maxWidth: 400, border: '1px solid var(--border)', padding: 28 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {t('leave.reject_title')}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {rejectTarget.userName} {rejectTarget.userSurname} · {fmtDate(rejectTarget.startDate, locale)} → {fmtDate(rejectTarget.endDate, locale)}
            </p>
            {rejectError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{rejectError}</div>}
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder={t('leave.reject_notes_placeholder')}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRejectTarget(null)} disabled={rejectSaving} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={handleReject} disabled={rejectSaving} style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: rejectSaving ? 'not-allowed' : 'pointer', opacity: rejectSaving ? 0.7 : 1 }}>
                {rejectSaving ? t('common.loading') : t('leave.reject_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── My Leave Drawer ───────────────────────────────────────────────── */}
      <LeaveRequestDrawer
        open={myLeaveOpen}
        onClose={() => setMyLeaveOpen(false)}
        onSubmitted={() => { setMyLeaveOpen(false); fetchRequests(); }}
      />

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.3)', width: '100%', maxWidth: 380, border: '1px solid var(--border)', padding: 28 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>⚠</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {t('leave.admin_delete_confirm')}
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {deleteTarget.userName} {deleteTarget.userSurname} · {t(`leave.type_${deleteTarget.leaveType}`)} · {fmtDate(deleteTarget.startDate, locale)} → {fmtDate(deleteTarget.endDate, locale)}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFilterModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(13,33,55,0.48)',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setShowFilterModal(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              width: 'min(520px, 92vw)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Accent stripe */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />

            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #8B6914 0%, #B48719 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      fontSize: '17px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      fontFamily: 'var(--font-display)',
                      margin: 0,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {t('leave.filterTitle', 'Filtra richieste')}
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {t('leave.filterSubtitle', 'Affina la ricerca delle richieste di ferie e permessi')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '24px',
                  lineHeight: 1,
                  padding: '4px 8px',
                }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Company filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('common.company', 'Company')}
                </label>
                <select
                  value={tempCompanyId}
                  onChange={(e) => {
                    setTempCompanyId(e.target.value);
                    setTempStoreId('');
                  }}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '0 10px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">{t('shifts.allCompanies', 'All Companies')}</option>
                  {companyList.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Store filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('common.store', 'Negozio')}
                </label>
                <select
                  value={tempStoreId}
                  onChange={(e) => setTempStoreId(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '0 10px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">{t('common.all')} {t('common.store', 'store').toLowerCase()}</option>
                  {(tempCompanyId
                    ? stores.filter((s: any) => String(s.companyId) === tempCompanyId || s.companyName === companyList.find(c => String(c.id) === tempCompanyId)?.name)
                    : stores
                  ).map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.companyName ? `${s.name} (${s.companyName})` : s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Leave Type filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('leave.type_label', 'Tipo')}
                </label>
                <select
                  value={tempType}
                  onChange={(e) => setTempType(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '0 10px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">{t('common.all')} {t('leave.type_label', 'type').toLowerCase()}</option>
                  <option value="vacation">{t('leave.type_vacation', 'Ferie')}</option>
                  <option value="sick">{t('leave.type_sick', 'Malattia')}</option>
                </select>
              </div>

              {/* Status filter */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                  {t('leave.col_status', 'Stato')}
                </label>
                <select
                  value={tempStatus}
                  onChange={(e) => setTempStatus(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '0 10px',
                    background: 'var(--background)',
                    color: 'var(--text)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  <option value="pending">{t('leave.status_pending')}</option>
                  <option value="approved">{t('leave.status_approved')}</option>
                  <option value="cancelled">{t('leave.status_cancelled')}</option>
                </select>
              </div>

              {/* Date pickers (row) */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    {t('attendance.dateFrom', 'Dal')}
                  </label>
                  <DatePicker
                    value={tempDateFrom}
                    onChange={(val) => setTempDateFrom(val ?? '')}
                    disablePortal={true}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    {t('attendance.dateTo', 'Al')}
                  </label>
                  <DatePicker
                    value={tempDateTo}
                    onChange={(val) => setTempDateTo(val ?? '')}
                    align="right"
                    disablePortal={true}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-warm)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                flexShrink: 0,
              }}
            >
              <button
                onClick={resetAllFilters}
                style={{
                  padding: '9px 20px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-secondary)',
                  transition: 'background 0.15s',
                }}
              >
                {t('employees.resetFilters', 'Reset all')}
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowFilterModal(false)}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('common.cancel', 'Annulla')}
                </button>
                <button
                  onClick={applyFilters}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)',
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(139,105,20,0.24)',
                  }}
                >
                  {t('employees.applyFilters', 'Applica filtri')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
