import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Building2, CalendarClock, Clock3, Filter, MapPin, Sparkles, Store, UserRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl, getStoreLogoUrl } from '../../api/client';
import { DatePicker } from '../../components/ui/DatePicker';
import { Employee, Store as StoreType, Company } from '../../types';
import { getEmployees, EmployeeListParams } from '../../api/employees';
import { getStores } from '../../api/stores';
import { getCompanies } from '../../api/companies';
import {
  TransferAssignment,
  TransferLinkedShift,
  TransferStatus,
  createTransfer,
  updateTransfer,
  listTransfers,
  listTransferShifts,
  cancelTransfer,
  deleteTransfer,
  completeTransfer,
} from '../../api/transfers';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { TransferFilterModal, TransferFilterValues } from './TransferFilterModal';
import { SelectOption } from '../../components/ui/CustomSelect';

const WRITE_ROLES = ['admin', 'hr', 'area_manager'] as const;

interface TransferFormState {
  user_id: string;
  origin_store_id: string;
  target_store_id: string;
  start_date: string;
  end_date: string;
  cancel_origin_shifts: boolean;
  reason: string;
  notes: string;
}

interface SuccessNotice {
  title: string;
  details: Array<{
    type: 'employee' | 'company' | 'period' | 'origin' | 'target' | 'time' | 'setting' | 'count' | 'note';
    text: string;
  }>;
}

const EMPTY_FORM: TransferFormState = {
  user_id: '',
  origin_store_id: '',
  target_store_id: '',
  start_date: '',
  end_date: '',
  cancel_origin_shifts: true,
  reason: '',
  notes: '',
};

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function statusBadge(status: TransferStatus): { bg: string; color: string; label: string } {
  if (status === 'active') {
    return { bg: 'rgba(21,128,61,0.12)', color: '#166534', label: 'Active' };
  }
  if (status === 'completed') {
    return { bg: 'rgba(2,132,199,0.12)', color: '#0c4a6e', label: 'Completed' };
  }
  return { bg: 'rgba(107,114,128,0.14)', color: '#374151', label: 'Cancelled' };
}

function shiftStatusBadge(status: TransferLinkedShift['status']): { bg: string; color: string } {
  if (status === 'confirmed') {
    return { bg: 'rgba(22,163,74,0.14)', color: '#166534' };
  }
  if (status === 'cancelled') {
    return { bg: 'rgba(107,114,128,0.18)', color: '#374151' };
  }
  return { bg: 'rgba(30,64,175,0.14)', color: '#1e3a8a' };
}

function transferDaysInclusive(startDate: string, endDate: string): number | null {
  const s = startDate.split('-').map(Number);
  const e = endDate.split('-').map(Number);
  if (s.length !== 3 || e.length !== 3 || s.some(Number.isNaN) || e.some(Number.isNaN)) {
    return null;
  }
  const startMs = Date.UTC(s[0], s[1] - 1, s[2]);
  const endMs = Date.UTC(e[0], e[1] - 1, e[2]);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }
  return Math.floor((endMs - startMs) / 86400000) + 1;
}

function formatTransferDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale);
}

function transferCompanyGroupLabel(transfer: TransferAssignment): string {
  if (!transfer.groupName) return transfer.companyName;
  return `${transfer.companyName} / ${transfer.groupName}`;
}

function successDetailIcon(type: SuccessNotice['details'][number]['type']) {
  if (type === 'employee') return <UserRound size={12} />;
  if (type === 'company') return <Building2 size={12} />;
  if (type === 'period') return <CalendarClock size={12} />;
  if (type === 'origin' || type === 'target') return <Store size={12} />;
  if (type === 'time') return <Clock3 size={12} />;
  if (type === 'setting' || type === 'count') return <ArrowLeftRight size={12} />;
  return <Sparkles size={12} />;
}

async function loadEmployeesByPages(baseParams: Omit<EmployeeListParams, 'page' | 'limit'>): Promise<Employee[]> {
  const limit = 100;
  let page = 1;
  let pages = 1;
  const all: Employee[] = [];

  do {
    const res = await getEmployees({ ...baseParams, limit, page });
    all.push(...res.employees);
    pages = Math.max(1, res.pages || 1);
    page += 1;
  } while (page <= pages);

  return Array.from(new Map(all.map((emp) => [emp.id, emp])).values())
    .filter((emp) => emp.role === 'employee' && emp.status === 'active')
    .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`));
}

export default function TransfersPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const dateLocale = i18n.language?.startsWith('it') ? 'it-IT' : 'en-GB';

  const canWrite = Boolean(user && WRITE_ROLES.includes(user.role as (typeof WRITE_ROLES)[number]));
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';
  const isSuperAdmin = user?.isSuperAdmin === true;

  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [storeFilter, setStoreFilter] = useState<string>('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [transfers, setTransfers] = useState<TransferAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessNotice | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<TransferAssignment | null>(null);
  const [form, setForm] = useState<TransferFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [linkedShifts, setLinkedShifts] = useState<TransferLinkedShift[]>([]);
  const [linkedShiftsLoading, setLinkedShiftsLoading] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const employeePickerRef = useRef<HTMLDivElement | null>(null);
  const [originStorePickerOpen, setOriginStorePickerOpen] = useState(false);
  const [targetStorePickerOpen, setTargetStorePickerOpen] = useState(false);
  const originStorePickerRef = useRef<HTMLDivElement | null>(null);
  const targetStorePickerRef = useRef<HTMLDivElement | null>(null);

  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelRestoreOriginalShifts, setCancelRestoreOriginalShifts] = useState(true);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const selectedEmployee = useMemo(
    () => employees.find((emp) => emp.id === Number(form.user_id)),
    [employees, form.user_id],
  );

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((emp) => {
      const fullName = `${emp.name} ${emp.surname}`.toLowerCase();
      const roleLabel = t(`roles.${emp.role}`, emp.role).toLowerCase();
      const storeLabel = (emp.storeName ?? '').toLowerCase();
      const companyLabel = (emp.companyName ?? '').toLowerCase();
      return fullName.includes(q) || roleLabel.includes(q) || storeLabel.includes(q) || companyLabel.includes(q) || emp.email.toLowerCase().includes(q);
    });
  }, [employeeSearch, employees, t]);

  const selectedEmployeeAvatarUrl = selectedEmployee?.avatarFilename
    ? getAvatarUrl(selectedEmployee.avatarFilename)
    : null;

  const selectedOriginStore = useMemo(
    () => stores.find((store) => String(store.id) === form.origin_store_id) ?? null,
    [stores, form.origin_store_id],
  );

  const selectedTargetStore = useMemo(
    () => stores.find((store) => String(store.id) === form.target_store_id) ?? null,
    [stores, form.target_store_id],
  );

  const selectedEmployeeInitials = `${selectedEmployee?.name?.[0] ?? ''}${selectedEmployee?.surname?.[0] ?? ''}`.toUpperCase() || 'U';
  const selectedEmployeeFullName = selectedEmployee
    ? `${selectedEmployee.name} ${selectedEmployee.surname}`
    : t('transfers.form.employee', 'Dipendente');

  const selectedEmployeeRoleLabel = selectedEmployee
    ? t(`roles.${selectedEmployee.role}`, selectedEmployee.role)
    : '';

  const linkedShiftBuckets = useMemo(() => {
    if (!editingTransfer) {
      return {
        origin: [] as TransferLinkedShift[],
        transferred: [] as TransferLinkedShift[],
        other: [] as TransferLinkedShift[],
      };
    }
    const origin: TransferLinkedShift[] = [];
    const transferred: TransferLinkedShift[] = [];
    const other: TransferLinkedShift[] = [];
    for (const shift of linkedShifts) {
      if (shift.storeId === editingTransfer.originStoreId) {
        origin.push(shift);
        continue;
      }
      if (shift.storeId === editingTransfer.targetStoreId || shift.assignmentId === editingTransfer.id) {
        transferred.push(shift);
        continue;
      }
      other.push(shift);
    }
    return { origin, transferred, other };
  }, [linkedShifts, editingTransfer]);

  // Load companies and stores for filters
  useEffect(() => {
    if (isAdminOrHr || isSuperAdmin) {
      getCompanies()
        .then(setCompanies)
        .catch(() => setCompanies([]));
    }
    getStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, [isAdminOrHr, isSuperAdmin]);

  // Filter options
  const companyOptions = useMemo<SelectOption[]>(() => {
    return companies.map((c) => ({
      value: String(c.id),
      label: c.name,
    }));
  }, [companies]);

  const storeOptions = useMemo<SelectOption[]>(() => {
    return stores.map((s) => ({
      value: String(s.id),
      label: s.companyName ? `${s.name} (${s.companyName})` : s.name,
    }));
  }, [stores]);

  const statusOptions = useMemo<SelectOption[]>(() => [
    { value: 'active', label: t('transfers.status.active', 'Active') },
    { value: 'completed', label: t('transfers.status.completed', 'Completed') },
    { value: 'cancelled', label: t('transfers.status.cancelled', 'Cancelled') },
  ], [t]);

  const hasActiveFilters = !!(search || companyFilter || storeFilter || (statusFilter !== 'all'));

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; label: string; value: string }> = [];
    
    if (companyFilter) {
      const company = companies.find((c) => String(c.id) === companyFilter);
      if (company) {
        tags.push({ key: 'company', label: t('transfers.filterCompany', 'Company'), value: company.name });
      }
    }
    
    if (storeFilter) {
      const store = stores.find((s) => String(s.id) === storeFilter);
      if (store) {
        tags.push({ key: 'store', label: t('transfers.filterStore', 'Store'), value: store.name });
      }
    }
    
    if (statusFilter !== 'all') {
      const statusLabel = t(`transfers.status.${statusFilter}`, statusFilter);
      tags.push({ key: 'status', label: t('transfers.filterStatus', 'Status'), value: statusLabel });
    }
    
    return tags;
  }, [companyFilter, storeFilter, statusFilter, companies, stores, t]);

  // Client-side search filtering
  const filteredTransfers = useMemo(() => {
    if (!search.trim()) return transfers;
    
    const searchLower = search.toLowerCase().trim();
    return transfers.filter((transfer) => {
      const fullName = `${transfer.userName} ${transfer.userSurname}`.toLowerCase();
      const originStore = transfer.originStoreName?.toLowerCase() || '';
      const targetStore = transfer.targetStoreName?.toLowerCase() || '';
      const companyName = transfer.companyName?.toLowerCase() || '';
      const status = transfer.status.toLowerCase();
      
      return (
        fullName.includes(searchLower) ||
        originStore.includes(searchLower) ||
        targetStore.includes(searchLower) ||
        companyName.includes(searchLower) ||
        status.includes(searchLower)
      );
    });
  }, [transfers, search]);

  const handleApplyFilters = useCallback((filters: TransferFilterValues) => {
    setCompanyFilter(filters.company_id);
    setStoreFilter(filters.store_id);
    setStatusFilter(filters.status ? (filters.status as TransferStatus) : 'all');
    setShowFilterModal(false);
  }, []);

  const removeFilter = useCallback((key: string) => {
    if (key === 'company') setCompanyFilter('');
    if (key === 'store') setStoreFilter('');
    if (key === 'status') setStatusFilter('all');
  }, []);

  const resetAllFilters = useCallback(() => {
    setSearch('');
    setCompanyFilter('');
    setStoreFilter('');
    setStatusFilter('all');
  }, []);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (storeFilter) params.store_id = parseInt(storeFilter, 10);
      // Note: Backend doesn't support company_id filter directly, but we can filter client-side
      const data = await listTransfers(Object.keys(params).length > 0 ? params : undefined);
      
      // Client-side company filter
      let filtered = data.transfers;
      if (companyFilter) {
        filtered = filtered.filter(t => String(t.companyId) === companyFilter);
      }
      
      setTransfers(filtered);
    } catch (err: any) {
      const code = err?.response?.data?.code as string | undefined;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, storeFilter, companyFilter, t]);

  useEffect(() => {
    void fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    if (!employeePickerOpen && !originStorePickerOpen && !targetStorePickerOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (employeePickerOpen && !employeePickerRef.current?.contains(target)) {
        setEmployeePickerOpen(false);
      }
      if (originStorePickerOpen && !originStorePickerRef.current?.contains(target)) {
        setOriginStorePickerOpen(false);
      }
      if (targetStorePickerOpen && !targetStorePickerRef.current?.contains(target)) {
        setTargetStorePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [employeePickerOpen, originStorePickerOpen, targetStorePickerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    let mounted = true;

    Promise.all([
      loadEmployeesByPages({ status: 'active' }),
      getStores(),
    ])
      .then(([loadedEmployees, loadedStores]) => {
        if (!mounted) return;
        setEmployees(loadedEmployees);
        setStores(loadedStores.filter((s) => s.isActive));
      })
      .catch(() => {
        if (!mounted) return;
        setEmployees([]);
        setStores([]);
      });

    return () => {
      mounted = false;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || !editingTransfer) {
      setLinkedShifts([]);
      setLinkedShiftsLoading(false);
      return;
    }

    let mounted = true;
    setLinkedShiftsLoading(true);

    listTransferShifts(editingTransfer.id)
      .then((res) => {
        if (!mounted) return;
        setLinkedShifts(res.shifts ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setLinkedShifts([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLinkedShiftsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [drawerOpen, editingTransfer]);

  function openCreateDrawer() {
    const today = toIsoDate(new Date());
    setEditingTransfer(null);
    setLinkedShifts([]);
    setLinkedShiftsLoading(false);
    setForm({ ...EMPTY_FORM, start_date: today, end_date: today, cancel_origin_shifts: true });
    setEmployeePickerOpen(false);
    setOriginStorePickerOpen(false);
    setTargetStorePickerOpen(false);
    setEmployeeSearch('');
    setDrawerOpen(true);
  }

  function openEditDrawer(transfer: TransferAssignment) {
    setEditingTransfer(transfer);
    setLinkedShifts([]);
    setLinkedShiftsLoading(false);
    setForm({
      user_id: String(transfer.userId),
      origin_store_id: String(transfer.originStoreId),
      target_store_id: String(transfer.targetStoreId),
      start_date: transfer.startDate,
      end_date: transfer.endDate,
      cancel_origin_shifts: transfer.cancelOriginShifts !== false,
      reason: transfer.reason ?? '',
      notes: transfer.notes ?? '',
    });
    setEmployeePickerOpen(false);
    setOriginStorePickerOpen(false);
    setTargetStorePickerOpen(false);
    setEmployeeSearch('');
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    setDrawerOpen(false);
    setEditingTransfer(null);
    setForm(EMPTY_FORM);
    setLinkedShifts([]);
    setLinkedShiftsLoading(false);
    setEmployeePickerOpen(false);
    setOriginStorePickerOpen(false);
    setTargetStorePickerOpen(false);
    setEmployeeSearch('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!form.user_id || !form.target_store_id || !form.start_date || !form.end_date) {
      setError(t('errors.VALIDATION_ERROR'));
      return;
    }

    if (form.start_date > form.end_date) {
      setError(t('errors.INVALID_DATE_RANGE', t('errors.DEFAULT')));
      return;
    }

    const payload = {
      user_id: Number(form.user_id),
      origin_store_id: form.origin_store_id ? Number(form.origin_store_id) : undefined,
      target_store_id: Number(form.target_store_id),
      start_date: form.start_date,
      end_date: form.end_date,
      cancel_origin_shifts: form.cancel_origin_shifts,
      reason: form.reason.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    try {
      if (editingTransfer) {
        const updated = await updateTransfer(editingTransfer.id, payload);
        const warn = updated.warnings?.existingShifts ?? 0;
        const transfer = updated.transfer;
        const detailLines: SuccessNotice['details'] = [
          { type: 'employee' as const, text: `${t('transfers.table.employee', 'Dipendente')}: ${transfer.userName} ${transfer.userSurname}` },
          { type: 'company' as const, text: `${t('transfers.table.company', 'Azienda')}: ${transferCompanyGroupLabel(transfer)}` },
          { type: 'period' as const, text: `${t('transfers.table.period', 'Periodo')}: ${transfer.startDate} - ${transfer.endDate}` },
          { type: 'origin' as const, text: `${t('transfers.table.origin', 'Origine')}: ${transfer.originStoreName}` },
          { type: 'target' as const, text: `${t('transfers.table.target', 'Destinazione')}: ${transfer.targetStoreName}` },
          { type: 'time' as const, text: `${t('transfers.createdAt', 'Creato il')}: ${formatTransferDateTime(transfer.createdAt, dateLocale)}` },
          { type: 'setting' as const, text: `${t('transfers.form.cancelOriginShifts', 'Annulla turni nel negozio di origine')}: ${transfer.cancelOriginShifts ? t('common.yes', 'Sì') : t('common.no', 'No')}` },
          { type: 'count' as const, text: `${t('transfers.originShiftsCancelled', 'Turni origine annullati')}: ${updated.originShiftsCancelled ?? 0}` },
          { type: 'count' as const, text: `${t('transfers.originShiftsRestored', 'Turni origine ripristinati')}: ${updated.originShiftsRestored ?? 0}` },
        ];
        if (warn > 0) {
          detailLines.push(
            {
              type: 'note' as const,
              text: t('transfers.updatedWithWarnings', {
                defaultValue: `${warn} turni esistenti nel periodo da verificare.`,
                count: warn,
              }),
            },
          );
        }
        setSuccess({
          title: t('transfers.updated', 'Trasferimento aggiornato'),
          details: detailLines,
        });
      } else {
        const created = await createTransfer(payload);
        const warn = created.warnings?.existingShifts ?? 0;
        const transfer = created.transfer;
        const detailLines: SuccessNotice['details'] = [
          { type: 'employee' as const, text: `${t('transfers.table.employee', 'Dipendente')}: ${transfer.userName} ${transfer.userSurname}` },
          { type: 'company' as const, text: `${t('transfers.table.company', 'Azienda')}: ${transferCompanyGroupLabel(transfer)}` },
          { type: 'period' as const, text: `${t('transfers.table.period', 'Periodo')}: ${transfer.startDate} - ${transfer.endDate}` },
          { type: 'origin' as const, text: `${t('transfers.table.origin', 'Origine')}: ${transfer.originStoreName}` },
          { type: 'target' as const, text: `${t('transfers.table.target', 'Destinazione')}: ${transfer.targetStoreName}` },
          { type: 'time' as const, text: `${t('transfers.createdAt', 'Creato il')}: ${formatTransferDateTime(transfer.createdAt, dateLocale)}` },
          { type: 'setting' as const, text: `${t('transfers.form.cancelOriginShifts', 'Annulla turni nel negozio di origine')}: ${transfer.cancelOriginShifts ? t('common.yes', 'Sì') : t('common.no', 'No')}` },
          { type: 'count' as const, text: `${t('transfers.originShiftsCancelled', 'Turni origine annullati')}: ${created.originShiftsCancelled ?? 0}` },
        ];
        if (warn > 0) {
          detailLines.push(
            {
              type: 'note' as const,
              text: t('transfers.createdWithWarnings', {
                defaultValue: `${warn} turni esistenti nel periodo da verificare.`,
                count: warn,
              }),
            },
          );
        }
        setSuccess({
          title: t('transfers.created', 'Trasferimento creato'),
          details: detailLines,
        });
      }

      closeDrawer();
      await fetchTransfers();
    } catch (err: any) {
      const code = err?.response?.data?.code as string | undefined;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    } finally {
      setSaving(false);
    }
  }

  async function doCancelTransfer() {
    if (!editingTransfer) return;
    setConfirmCancelOpen(false);
    setError(null);
    try {
      const result = await cancelTransfer(editingTransfer.id, undefined, { restore_origin_shifts: cancelRestoreOriginalShifts });
      const cancelledTransfer = result.transfer;
      const cancelledCount = result.cancelledTargetShifts ?? result.cancelledShifts ?? result.detachedShifts ?? 0;
      const restoredCount = result.restoredOriginShifts ?? 0;
      const restoreEnabled = result.restoreOriginalShiftsEnabled ?? cancelRestoreOriginalShifts;
      setSuccess({
        title: t('transfers.cancel', 'Trasferimento annullato'),
        details: [
          { type: 'employee', text: `${t('transfers.table.employee', 'Dipendente')}: ${cancelledTransfer.userName} ${cancelledTransfer.userSurname}` },
          { type: 'company', text: `${t('transfers.table.company', 'Azienda')}: ${transferCompanyGroupLabel(cancelledTransfer)}` },
          { type: 'period', text: `${t('transfers.table.period', 'Periodo')}: ${cancelledTransfer.startDate} - ${cancelledTransfer.endDate}` },
          { type: 'time', text: `${t('transfers.cancelledAt', 'Data annullamento')}: ${formatTransferDateTime(cancelledTransfer.cancelledAt, dateLocale)}` },
          { type: 'count', text: `${t('transfers.cancelledTargetShifts', 'Turni destinazione annullati')}: ${cancelledCount}` },
          {
            type: 'setting',
            text: `${t('transfers.restoreOriginalShifts', 'Ripristina turni originali')}: ${restoreEnabled ? t('common.yes', 'Sì') : t('common.no', 'No')}`,
          },
          {
            type: 'count',
            text: restoreEnabled
              ? `${t('transfers.restoredOriginShifts', 'Turni origine ripristinati')}: ${restoredCount}`
              : t('transfers.restoreOriginalShiftsSkipped', 'Ripristino turni originali disattivato.'),
          },
        ],
      });
      closeDrawer();
      await fetchTransfers();
    } catch (err: any) {
      const code = err?.response?.data?.code as string | undefined;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    }
  }

  async function doCompleteTransfer() {
    if (!editingTransfer) return;
    setConfirmCompleteOpen(false);
    setError(null);
    try {
      const completedTransfer = await completeTransfer(editingTransfer.id);
      setSuccess({
        title: t('transfers.completed', 'Trasferimento completato'),
        details: [
          { type: 'employee', text: `${t('transfers.table.employee', 'Dipendente')}: ${completedTransfer.userName} ${completedTransfer.userSurname}` },
          { type: 'company', text: `${t('transfers.table.company', 'Azienda')}: ${transferCompanyGroupLabel(completedTransfer)}` },
          { type: 'period', text: `${t('transfers.table.period', 'Periodo')}: ${completedTransfer.startDate} - ${completedTransfer.endDate}` },
          { type: 'time', text: `${t('transfers.completedAt', 'Completato il')}: ${formatTransferDateTime(completedTransfer.updatedAt, dateLocale)}` },
        ],
      });
      closeDrawer();
      await fetchTransfers();
    } catch (err: any) {
      const code = err?.response?.data?.code as string | undefined;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    }
  }

  async function doDeleteTransfer() {
    if (!editingTransfer) return;
    setConfirmDeleteOpen(false);
    setError(null);
    try {
      const result = await deleteTransfer(editingTransfer.id);
      const deletedTargetCount = result.deletedTargetShifts ?? result.detachedShifts ?? 0;
      const restoredOriginCount = result.restoredOriginShifts ?? 0;
      setSuccess({
        title: t('transfers.deleted', 'Trasferimento eliminato'),
        details: [
          { type: 'employee', text: `${t('transfers.table.employee', 'Dipendente')}: ${editingTransfer.userName} ${editingTransfer.userSurname}` },
          { type: 'company', text: `${t('transfers.table.company', 'Azienda')}: ${transferCompanyGroupLabel(editingTransfer)}` },
          { type: 'period', text: `${t('transfers.table.period', 'Periodo')}: ${editingTransfer.startDate} - ${editingTransfer.endDate}` },
          { type: 'count', text: `${t('transfers.deletedTargetShifts', 'Turni destinazione eliminati')}: ${deletedTargetCount}` },
          { type: 'count', text: `${t('transfers.restoredOriginShifts', 'Turni origine ripristinati')}: ${restoredOriginCount}` },
        ],
      });
      closeDrawer();
      await fetchTransfers();
    } catch (err: any) {
      const code = err?.response?.data?.code as string | undefined;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    }
  }

  function handleEmployeeSelect(employeeId: string) {
    const employee = employees.find((emp) => emp.id === Number(employeeId));
    setForm((prev) => ({
      ...prev,
      user_id: employeeId,
      origin_store_id: employee?.storeId != null ? String(employee.storeId) : '',
    }));
    setEmployeeSearch('');
  }

  return (
    <div className="page-enter" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>
            {t('transfers.title', 'Trasferimenti temporanei')}
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('transfers.subtitle', 'Gestisci assegnazioni temporanee tra negozi e monitora i turni impattati.')}
          </p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={openCreateDrawer}>
            <ArrowLeftRight size={14} />
            {t('transfers.new', 'Nuovo trasferimento')}
          </button>
        )}
      </div>

      {/* Search and Filter Section */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: 18,
      }}>
        {/* Search and Filter Button Row */}
        <div style={{ 
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 12px',
          boxShadow: 'var(--shadow-xs)',
        }}>
          {/* Search Input */}
          <div style={{ flex: 1, position: 'relative' }}>
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="var(--text-muted)" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              placeholder={t('transfers.searchPlaceholder', 'Search transfers...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '40px',
                padding: '10px 12px 10px 40px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                fontFamily: 'var(--font-body)',
                background: 'var(--background)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilterModal(true)}
            style={{
              background: hasActiveFilters
                ? 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)'
                : 'var(--surface)',
              color: hasActiveFilters ? '#fff' : 'var(--text-secondary)',
              border: hasActiveFilters ? 'none' : '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
              transition: 'all 0.2s',
              boxShadow: hasActiveFilters ? '0 2px 8px rgba(139,105,20,0.24)' : 'none',
              position: 'relative',
            }}
          >
            <Filter size={16} strokeWidth={2.5} />
            {t('transfers.filters', 'Filters')}
            {activeFilterTags.length > 0 && (
              <span
                style={{
                  background: '#fff',
                  color: 'var(--accent)',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '999px',
                  minWidth: '18px',
                  textAlign: 'center',
                }}
              >
                {activeFilterTags.length}
              </span>
            )}
          </button>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={resetAllFilters}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '10px 14px',
                fontSize: '13px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              title={t('transfers.resetFilters', 'Reset all filters')}
            >
              <X size={16} />
              {t('transfers.reset', 'Reset')}
            </button>
          )}
        </div>

        {/* Active Filter Tags */}
        {activeFilterTags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 4px' }}>
            {activeFilterTags.map((tag) => (
              <div
                key={tag.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(13,33,55,0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{tag.label}:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{tag.value}</span>
                <button
                  onClick={() => removeFilter(tag.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: 4,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  title={t('transfers.removeFilter', 'Remove filter')}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {success && (
        <div style={{
          marginBottom: 12,
          borderRadius: 12,
          border: '1px solid rgba(13,33,55,0.26)',
          background: 'linear-gradient(135deg, rgba(13,33,55,0.1) 0%, rgba(201,151,58,0.1) 100%)',
          boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid rgba(13,33,55,0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(13,33,55,0.12)',
                color: 'var(--primary)',
                flexShrink: 0,
              }}>
                <ArrowLeftRight size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>{success.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {t('transfers.successCardSubtitle', 'Transfer operation completed successfully')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              aria-label={t('common.close', 'Close')}
              style={{
                border: '1px solid rgba(13,33,55,0.2)',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.64)',
                color: 'var(--primary)',
                width: 28,
                height: 28,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ padding: '10px 14px', display: 'grid', gap: 5 }}>
            {success.details.map((line, idx) => (
              <div key={`${line.type}-${idx}-${line.text}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ marginTop: 1, color: 'var(--accent)', opacity: 0.95 }}>
                  {successDetailIcon(line.type)}
                </span>
                <div style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--text-primary)' }}>{line.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, borderRadius: 8, padding: '10px 12px', border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                <th style={thStyle}>{t('transfers.table.employee', 'Dipendente')}</th>
                <th style={thStyle}>{t('transfers.table.company', 'Azienda')}</th>
                <th style={thStyle}>{t('transfers.table.origin', 'Origine')}</th>
                <th style={thStyle}>{t('transfers.table.target', 'Destinazione')}</th>
                <th style={thStyle}>{t('transfers.table.period', 'Periodo')}</th>
                <th style={thStyle}>{t('transfers.table.status', 'Stato')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>{t('common.actions', 'Azioni')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    {t('common.loading', 'Caricamento...')}
                  </td>
                </tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                    {search ? t('transfers.noResults', 'No transfers found matching your search') : t('transfers.empty', 'Nessun trasferimento trovato')}
                  </td>
                </tr>
              ) : filteredTransfers.map((transfer) => {
                const badge = statusBadge(transfer.status);
                const fullName = `${transfer.userName} ${transfer.userSurname}`.trim();
                const initials = `${transfer.userName?.[0] ?? ''}${transfer.userSurname?.[0] ?? ''}`.toUpperCase() || 'U';
                const avatarUrl = getAvatarUrl(transfer.userAvatarFilename);
                const daysInPeriod = transferDaysInclusive(transfer.startDate, transfer.endDate);
                const originStoreLogoUrl = getStoreLogoUrl(transfer.originStoreLogoFilename);
                const targetStoreLogoUrl = getStoreLogoUrl(transfer.targetStoreLogoFilename);
                const originStoreInitials = transfer.originStoreName?.slice(0, 2).toUpperCase() || 'OR';
                const targetStoreInitials = transfer.targetStoreName?.slice(0, 2).toUpperCase() || 'TA';
                return (
                  <tr key={transfer.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: 'rgba(13,33,55,0.14)',
                          color: '#0D2137',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fullName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                            {transfer.userEmail || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'rgba(13,33,55,0.08)',
                          color: 'var(--accent)',
                          fontSize: 10,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>
                            {transfer.companyName ? transfer.companyName.slice(0, 2).toUpperCase() : 'CO'}
                          </span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: transfer.companyName ? 'var(--text-primary)' : 'var(--text-disabled)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: 700,
                              maxWidth: '140px'
                            }}
                            title={transfer.companyName ?? undefined}
                          >
                            {transfer.companyName ?? '—'}
                          </div>
                          {transfer.groupName ? (
                            <div style={{ 
                              fontSize: 11, 
                              color: 'var(--text-muted)', 
                              marginTop: 2, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap',
                              maxWidth: '140px'
                            }} title={transfer.groupName}>
                              {transfer.groupName}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: originStoreLogoUrl ? '#fff' : 'rgba(13,33,55,0.08)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {originStoreLogoUrl ? (
                            <img src={originStoreLogoUrl} alt={transfer.originStoreName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>{originStoreInitials}</span>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: 13, 
                          fontWeight: 600, 
                          color: 'var(--text-primary)', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          maxWidth: '140px'
                        }} title={transfer.originStoreName}>
                          {transfer.originStoreName}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: targetStoreLogoUrl ? '#fff' : 'rgba(13,33,55,0.08)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {targetStoreLogoUrl ? (
                            <img src={targetStoreLogoUrl} alt={transfer.targetStoreName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)' }}>{targetStoreInitials}</span>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: 13, 
                          fontWeight: 600, 
                          color: 'var(--text-primary)', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          maxWidth: '140px'
                        }} title={transfer.targetStoreName}>
                          {transfer.targetStoreName}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div>
                        <div style={{ 
                          fontSize: 13, 
                          fontWeight: 700, 
                          color: 'var(--text-primary)',
                          marginBottom: 4
                        }}>
                          {daysInPeriod != null ? (
                            <span>{daysInPeriod} {daysInPeriod === 1 ? t('transfers.day', 'giorno') : t('transfers.days', 'giorni')}</span>
                          ) : '—'}
                        </div>
                        <div style={{ 
                          fontSize: 11, 
                          color: 'var(--text-muted)', 
                          lineHeight: 1.3 
                        }}>
                          {transfer.startDate} - {transfer.endDate}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: badge.bg, color: badge.color, padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                        {t(`transfers.status.${transfer.status}`, badge.label)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button 
                        onClick={() => openEditDrawer(transfer)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--accent)',
                          fontFamily: 'var(--font-body)',
                          padding: '5px 10px',
                          borderRadius: 'var(--radius-sm)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t('common.detail', 'Dettaglio')} →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && createPortal(
        <>
          <div
            onClick={closeDrawer}
            style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(13,33,55,0.5)', backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(520px, 100vw)',
            background: 'var(--surface)',
            zIndex: 1101,
            borderLeft: '1px solid var(--border)',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--primary)' }}>
                {editingTransfer ? t('transfers.edit', 'Modifica trasferimento') : t('transfers.new', 'Nuovo trasferimento')}
              </h3>
              <button onClick={closeDrawer} style={closeBtnStyle}>x</button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                <div style={fieldRowStyle}>
                  <label style={labelStyle}>{t('transfers.form.employee', 'Dipendente')}</label>
                  <div ref={employeePickerRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      disabled={Boolean(editingTransfer)}
                      onClick={() => {
                        if (editingTransfer) return;
                        setOriginStorePickerOpen(false);
                        setTargetStorePickerOpen(false);
                        setEmployeePickerOpen((prev) => !prev);
                      }}
                      style={{
                        ...inputStyle,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        cursor: editingTransfer ? 'not-allowed' : 'pointer',
                        opacity: editingTransfer ? 0.75 : 1,
                      }}
                    >
                      {selectedEmployee ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: 'rgba(13,33,55,0.14)',
                            color: '#0D2137',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {selectedEmployeeAvatarUrl ? (
                              <img src={selectedEmployeeAvatarUrl} alt={selectedEmployeeFullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : selectedEmployeeInitials}
                          </span>
                          <span style={{ minWidth: 0, textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {selectedEmployeeFullName}
                            </span>
                            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span>{selectedEmployeeRoleLabel}</span>
                              {selectedEmployee.storeName ? <span>{` · ${selectedEmployee.storeName}`}</span> : null}
                              {selectedEmployee.companyName ? (
                                <span style={{ color: '#0f766e', fontWeight: 700 }}>{` · ${selectedEmployee.companyName}`}</span>
                              ) : null}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('transfers.form.selectEmployee', 'Seleziona dipendente')}</span>
                      )}
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{employeePickerOpen ? '▲' : '▼'}</span>
                    </button>

                    {employeePickerOpen && !editingTransfer && (
                      <div style={{
                        position: 'absolute',
                        zIndex: 20,
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                        maxHeight: 260,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}>
                        <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                          <input
                            value={employeeSearch}
                            onChange={(e) => setEmployeeSearch(e.target.value)}
                            placeholder={t('common.search', 'Cerca...')}
                            style={{ ...inputStyle, width: '100%', padding: '7px 9px', fontSize: 12 }}
                          />
                        </div>
                        <div style={{ overflowY: 'auto', maxHeight: 204 }}>
                          {filteredEmployees.length === 0 ? (
                            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                              {t('common.noData', 'Nessun dato')}
                            </div>
                          ) : (
                            filteredEmployees.map((emp) => {
                              const fullName = `${emp.name} ${emp.surname}`.trim();
                              const roleLabel = t(`roles.${emp.role}`, emp.role);
                              const avatarUrl = getAvatarUrl(emp.avatarFilename);
                              const initials = `${emp.name?.[0] ?? ''}${emp.surname?.[0] ?? ''}`.toUpperCase() || 'U';
                              const selected = String(emp.id) === form.user_id;
                              return (
                                <button
                                  key={emp.id}
                                  type="button"
                                  onClick={() => {
                                    handleEmployeeSelect(String(emp.id));
                                    setEmployeePickerOpen(false);
                                  }}
                                  style={{
                                    width: '100%',
                                    border: 'none',
                                    borderBottom: '1px solid var(--border)',
                                    background: selected ? 'var(--surface-warm)' : 'var(--surface)',
                                    padding: '8px 10px',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    background: 'rgba(13,33,55,0.14)',
                                    color: '#0D2137',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {avatarUrl ? (
                                      <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : initials}
                                  </span>
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {fullName}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      <span>{roleLabel}</span>
                                      {emp.storeName ? <span>{` · ${emp.storeName}`}</span> : null}
                                      {emp.companyName ? (
                                        <span style={{ color: '#0f766e', fontWeight: 700 }}>{` · ${emp.companyName}`}</span>
                                      ) : null}
                                    </span>
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {selectedEmployee && (
                    <div style={{
                      marginTop: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-warm)',
                    }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'rgba(13,33,55,0.14)',
                        color: '#0D2137',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {selectedEmployeeAvatarUrl ? (
                          <img src={selectedEmployeeAvatarUrl} alt={selectedEmployeeFullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : selectedEmployeeInitials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {selectedEmployeeFullName}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span>{selectedEmployeeRoleLabel}</span>
                          {selectedEmployee.storeName ? <span>{` · ${selectedEmployee.storeName}`}</span> : null}
                          {selectedEmployee.companyName ? (
                            <span style={{ color: '#0f766e', fontWeight: 700 }}>{` · ${selectedEmployee.companyName}`}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={helpTextStyle}>
                    {t('transfers.form.employeeRoleOnly', 'Vengono mostrati solo utenti con ruolo Employee.')}
                  </div>
                </div>

                <div style={{ ...fieldRowStyle, marginTop: 8 }}>
                  <label style={labelStyle}>{t('transfers.form.originStore', 'Negozio origine')}</label>
                  <div ref={originStorePickerRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeePickerOpen(false);
                        setTargetStorePickerOpen(false);
                        setOriginStorePickerOpen((prev) => !prev);
                      }}
                      style={{
                        ...inputStyle,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {selectedOriginStore ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: 'rgba(13,33,55,0.14)',
                            color: '#0D2137',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {getStoreLogoUrl(selectedOriginStore.logoFilename) ? (
                              <img
                                src={getStoreLogoUrl(selectedOriginStore.logoFilename) ?? ''}
                                alt={selectedOriginStore.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : selectedOriginStore.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {selectedOriginStore.name}
                            </span>
                          </span>
                          <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {selectedOriginStore.companyName ?? '—'}
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {selectedEmployee?.storeName
                            ? t('transfers.form.detectedOrigin', {
                              defaultValue: `Origine rilevata: ${selectedEmployee.storeName}`,
                              store: selectedEmployee.storeName,
                            })
                            : t('transfers.form.useEmployeeStore', 'Usa negozio assegnato al dipendente')}
                        </span>
                      )}
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{originStorePickerOpen ? '▲' : '▼'}</span>
                    </button>

                    {originStorePickerOpen && (
                      <div style={{
                        position: 'absolute',
                        zIndex: 20,
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                        maxHeight: 260,
                        overflowY: 'auto',
                      }}>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, origin_store_id: '' }));
                            setOriginStorePickerOpen(false);
                          }}
                          style={{
                            width: '100%',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                            background: form.origin_store_id ? 'var(--surface)' : 'var(--surface-warm)',
                            padding: '8px 10px',
                            textAlign: 'left',
                            color: 'var(--text-secondary)',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {t('transfers.form.useEmployeeStore', 'Usa negozio assegnato al dipendente')}
                        </button>
                        {stores.map((store) => (
                          <button
                            key={store.id}
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, origin_store_id: String(store.id) }));
                              setOriginStorePickerOpen(false);
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              borderBottom: '1px solid var(--border)',
                              background: form.origin_store_id === String(store.id) ? 'var(--surface-warm)' : 'var(--surface)',
                              padding: '8px 10px',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{
                              width: 24,
                              height: 24,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: '1px solid var(--border)',
                              background: 'rgba(13,33,55,0.14)',
                              color: '#0D2137',
                              fontSize: 10,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {getStoreLogoUrl(store.logoFilename) ? (
                                <img src={getStoreLogoUrl(store.logoFilename) ?? ''} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : store.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span style={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {store.name}
                            </span>
                            <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {store.companyName ?? '—'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!form.origin_store_id && selectedEmployee?.storeName && (
                    <div style={helpTextStyle}>
                      <MapPin size={11} />
                      {t('transfers.form.detectedOrigin', {
                        defaultValue: `Origine rilevata: ${selectedEmployee.storeName}`,
                        store: selectedEmployee.storeName,
                      })}
                    </div>
                  )}
                </div>

                <div style={{ ...fieldRowStyle, marginTop: 8 }}>
                  <label style={labelStyle}>{t('transfers.form.targetStore', 'Negozio destinazione')}</label>
                  <div ref={targetStorePickerRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeePickerOpen(false);
                        setOriginStorePickerOpen(false);
                        setTargetStorePickerOpen((prev) => !prev);
                      }}
                      style={{
                        ...inputStyle,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {selectedTargetStore ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: 'rgba(13,33,55,0.14)',
                            color: '#0D2137',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {getStoreLogoUrl(selectedTargetStore.logoFilename) ? (
                              <img
                                src={getStoreLogoUrl(selectedTargetStore.logoFilename) ?? ''}
                                alt={selectedTargetStore.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : selectedTargetStore.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {selectedTargetStore.name}
                            </span>
                          </span>
                          <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {selectedTargetStore.companyName ?? '—'}
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('transfers.form.selectStore', 'Seleziona negozio')}</span>
                      )}
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{targetStorePickerOpen ? '▲' : '▼'}</span>
                    </button>

                    {targetStorePickerOpen && (
                      <div style={{
                        position: 'absolute',
                        zIndex: 20,
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                        maxHeight: 260,
                        overflowY: 'auto',
                      }}>
                        {stores.map((store) => (
                          <button
                            key={store.id}
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, target_store_id: String(store.id) }));
                              setTargetStorePickerOpen(false);
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              borderBottom: '1px solid var(--border)',
                              background: form.target_store_id === String(store.id) ? 'var(--surface-warm)' : 'var(--surface)',
                              padding: '8px 10px',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{
                              width: 24,
                              height: 24,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: '1px solid var(--border)',
                              background: 'rgba(13,33,55,0.14)',
                              color: '#0D2137',
                              fontSize: 10,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {getStoreLogoUrl(store.logoFilename) ? (
                                <img src={getStoreLogoUrl(store.logoFilename) ?? ''} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : store.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span style={{ minWidth: 0, flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {store.name}
                            </span>
                            <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {store.companyName ?? '—'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div style={fieldRowStyle}>
                    <DatePicker
                      label={t('transfers.form.startDate', 'Data inizio')}
                      value={form.start_date}
                      onChange={(value) => setForm((p) => ({ ...p, start_date: value }))}
                      disablePortal={true}
                      align="left"
                    />
                  </div>
                  <div style={fieldRowStyle}>
                    <DatePicker
                      label={t('transfers.form.endDate', 'Data fine')}
                      value={form.end_date}
                      onChange={(value) => setForm((p) => ({ ...p, end_date: value }))}
                      disablePortal={true}
                      align="right"
                    />
                  </div>
                </div>

                <div style={{
                  marginTop: 10,
                  padding: '9px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--surface-warm)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}>
                  <input
                    id="cancel-origin-shifts"
                    type="checkbox"
                    checked={form.cancel_origin_shifts}
                    onChange={(e) => setForm((prev) => ({ ...prev, cancel_origin_shifts: e.target.checked }))}
                    style={{ marginTop: 2 }}
                  />
                  <label htmlFor="cancel-origin-shifts" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.35, cursor: 'pointer' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.form.cancelOriginShifts', 'Annulla turni negozio origine nel periodo')}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t('transfers.form.cancelOriginShiftsHint', 'Se attivo, i turni del negozio di origine verranno annullati durante il trasferimento e ripristinati in caso di annullamento del trasferimento.')}
                    </div>
                  </label>
                </div>

                <div style={{ ...fieldRowStyle, marginTop: 8 }}>
                  <label style={labelStyle}>{t('transfers.form.reason', 'Motivazione')}</label>
                  <input
                    type="text"
                    maxLength={500}
                    value={form.reason}
                    onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                    style={inputStyle}
                    placeholder={t('transfers.form.reasonPlaceholder', 'Es. supporto picco vendite')}
                  />
                </div>

                <div style={{ ...fieldRowStyle, marginTop: 8 }}>
                  <label style={labelStyle}>{t('common.notes', 'Note')}</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    style={{ ...inputStyle, minHeight: 84, resize: 'vertical' }}
                    maxLength={1500}
                  />
                </div>

                {editingTransfer && (
                  <>
                    <div style={{
                      marginTop: 14,
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      background: 'rgba(13,33,55,0.03)',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        {t('transfers.metaTitle', 'Dettagli trasferimento')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Transferred by with avatar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: 'rgba(13,33,55,0.14)',
                            color: '#0D2137',
                            fontSize: 10,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {editingTransfer.createdByAvatarFilename ? (
                              <img 
                                src={getAvatarUrl(editingTransfer.createdByAvatarFilename) ?? ''} 
                                alt={editingTransfer.createdByName ?? ''} 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                              />
                            ) : (
                              <span>{editingTransfer.createdByName?.[0] ?? 'U'}{editingTransfer.createdBySurname?.[0] ?? ''}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.transferredBy', 'Trasferito da')}:</strong>{' '}
                            {editingTransfer.createdByName ? `${editingTransfer.createdByName} ${editingTransfer.createdBySurname ?? ''}`.trim() : '—'}
                          </div>
                        </div>

                        {/* Status badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.statusLabel', 'Stato')}:</strong>
                          </div>
                          <span style={{ 
                            background: statusBadge(editingTransfer.status).bg, 
                            color: statusBadge(editingTransfer.status).color, 
                            padding: '3px 10px', 
                            borderRadius: 999, 
                            fontSize: 10, 
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {t(`transfers.status.${editingTransfer.status}`, statusBadge(editingTransfer.status).label)}
                          </span>
                        </div>

                        {/* Company */}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.table.company', 'Azienda')}:</strong>{' '}
                          {transferCompanyGroupLabel(editingTransfer)}
                        </div>

                        {/* Created at */}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.transferredAt', 'Data trasferimento')}:</strong>{' '}
                          {formatTransferDateTime(editingTransfer.createdAt, dateLocale)}
                        </div>

                        {editingTransfer.status === 'completed' && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.completedAt', 'Completato il')}:</strong>{' '}
                            {formatTransferDateTime(editingTransfer.updatedAt, dateLocale)}
                          </div>
                        )}

                        {editingTransfer.cancelledAt && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                background: 'rgba(13,33,55,0.14)',
                                color: '#0D2137',
                                fontSize: 10,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {editingTransfer.cancelledByAvatarFilename ? (
                                  <img 
                                    src={getAvatarUrl(editingTransfer.cancelledByAvatarFilename) ?? ''} 
                                    alt={editingTransfer.cancelledByName ?? ''} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                  />
                                ) : (
                                  <span>{editingTransfer.cancelledByName?.[0] ?? 'U'}{editingTransfer.cancelledBySurname?.[0] ?? ''}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.cancelledBy', 'Annullato da')}:</strong>{' '}
                                {editingTransfer.cancelledByName ? `${editingTransfer.cancelledByName} ${editingTransfer.cancelledBySurname ?? ''}`.trim() : '—'}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.cancelledAt', 'Data annullamento')}:</strong>{' '}
                              {formatTransferDateTime(editingTransfer.cancelledAt, dateLocale)}
                            </div>
                          </>
                        )}

                        {/* Cancel origin shifts - full width at the end */}
                        <div style={{ 
                          marginTop: 4,
                          paddingTop: 10,
                          borderTop: '1px solid var(--border)',
                          fontSize: 11, 
                          color: 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.form.cancelOriginShifts', 'Annulla turni negozio origine nel periodo')}:</strong>{' '}
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: editingTransfer.cancelOriginShifts ? 'rgba(22,163,74,0.14)' : 'rgba(107,114,128,0.14)',
                            color: editingTransfer.cancelOriginShifts ? '#166534' : '#374151',
                          }}>
                            {editingTransfer.cancelOriginShifts ? t('common.yes', 'Sì') : t('common.no', 'No')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{
                      marginTop: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: 'rgba(13,33,55,0.03)',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {t('transfers.linkedShiftsTitle', 'Linked shifts')}
                        {(() => {
                          const days = transferDaysInclusive(editingTransfer.startDate, editingTransfer.endDate);
                          if (days == null) return null;
                          return (
                            <span style={{
                              marginLeft: 8,
                              width: 'fit-content',
                              padding: '2px 8px',
                              borderRadius: 999,
                              border: '1px solid rgba(13,33,55,0.2)',
                              background: 'rgba(13,33,55,0.05)',
                              color: 'var(--text-secondary)',
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              display: 'inline-block',
                              verticalAlign: 'middle',
                            }}>
                              {t('transfers.table.daysShort', 'days') ? `${days} ${t('transfers.table.daysShort', 'days')}` : `${days} days`}
                            </span>
                          );
                        })()}
                      </div>

                      {linkedShiftsLoading ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('common.loading', 'Caricamento...')}
                        </div>
                      ) : linkedShifts.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('transfers.linkedShiftsEmpty', 'No linked shifts found for this transfer.')}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {[
                            {
                              key: 'transferred',
                              title: t('transfers.linkedTransferredStore', 'Turni negozio destinazione'),
                              shifts: linkedShiftBuckets.transferred,
                              accent: 'rgba(13,148,136,0.35)',
                              storeName: editingTransfer.targetStoreName,
                              storeLogoFilename: editingTransfer.targetStoreLogoFilename,
                            },
                            {
                              key: 'origin',
                              title: t('transfers.linkedOriginStore', 'Turni negozio origine'),
                              shifts: linkedShiftBuckets.origin,
                              accent: 'rgba(30,64,175,0.35)',
                              storeName: editingTransfer.originStoreName,
                              storeLogoFilename: editingTransfer.originStoreLogoFilename,
                            },
                            {
                              key: 'other',
                              title: t('transfers.linkedOtherStore', 'Altri turni correlati'),
                              shifts: linkedShiftBuckets.other,
                              accent: 'rgba(107,114,128,0.28)',
                              storeName: null,
                              storeLogoFilename: null,
                            },
                          ].map((section) => (
                            <div key={section.key} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                              <div style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: 'var(--text-secondary)',
                                padding: '7px 9px',
                                borderBottom: '1px solid var(--border)',
                                background: 'var(--surface-warm)',
                                borderLeft: `3px solid ${section.accent}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                              }}>
                                <span>{section.title} ({section.shifts.length})</span>
                                {section.storeName && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 6,
                                      overflow: 'hidden',
                                      border: '1px solid var(--border)',
                                      background: section.storeLogoFilename ? '#fff' : 'rgba(13,33,55,0.08)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}>
                                      {section.storeLogoFilename ? (
                                        <img 
                                          src={getStoreLogoUrl(section.storeLogoFilename) ?? ''} 
                                          alt={section.storeName} 
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                      ) : (
                                        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)' }}>
                                          {section.storeName.slice(0, 2).toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                      {section.storeName}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
                                {section.shifts.length === 0 ? (
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 2px' }}>—</div>
                                ) : section.shifts.map((shift) => {
                                  const sb = shiftStatusBadge(shift.status);
                                  return (
                                    <div key={shift.id} style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: 10,
                                      background: 'var(--surface)',
                                      border: '1px solid var(--border)',
                                      borderRadius: 8,
                                      padding: '7px 9px',
                                    }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>
                                          {shift.date} · {shift.startTime.slice(0, 5)}-{shift.endTime.slice(0, 5)}
                                          {shift.shiftHours != null && shift.shiftHours !== '' ? ` (${shift.shiftHours}h)` : ''}
                                        </div>
                                      </div>
                                      <span style={{
                                        background: sb.bg,
                                        color: sb.color,
                                        borderRadius: 999,
                                        padding: '3px 8px',
                                        fontSize: 10,
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {t(`shifts.status.${shift.status}`, shift.status)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {editingTransfer && (
                  <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {editingTransfer.status === 'active' && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setConfirmCompleteOpen(true)}
                        >
                          {t('transfers.markCompleted', 'Segna completato')}
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => {
                              setCancelRestoreOriginalShifts(true);
                              setConfirmCancelOpen(true);
                            }}
                          >
                            {t('transfers.cancel', 'Annulla trasferimento')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  {editingTransfer && canWrite && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={saving}
                      style={{
                        background: '#DC2626',
                        border: '1px solid #DC2626',
                        color: '#fff',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      {t('transfers.delete', 'Elimina trasferimento')}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeDrawer} disabled={saving}>
                  {t('common.cancel', 'Annulla')}
                </button>
                {canWrite && (
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? t('common.saving', 'Salvataggio...') : t('common.save', 'Salva')}
                  </button>
                )}
                </div>
              </div>
            </form>
          </div>
        </>,
        document.body,
      )}

      <ConfirmModal
        open={confirmCancelOpen}
        title={t('transfers.cancelConfirmTitle', 'Conferma annullamento')}
        message={t('transfers.cancelConfirmMessage', 'Vuoi annullare questo trasferimento? I turni del negozio destinazione verranno annullati e quelli del negozio origine verranno ripristinati quando possibile.')}
        variant="warning"
        onCancel={() => setConfirmCancelOpen(false)}
        onConfirm={() => { void doCancelTransfer(); }}
      >
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={cancelRestoreOriginalShifts}
            onChange={(event) => setCancelRestoreOriginalShifts(event.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{t('transfers.restoreOriginalShifts', 'Ripristina turni originali')}</strong>
            <span style={{ display: 'block', marginTop: 2, color: 'var(--text-muted)' }}>
              {t('transfers.restoreOriginalShiftsHint', 'Se attivo, i turni annullati del negozio di origine vengono riportati a schedulati.')}
            </span>
          </span>
        </label>
      </ConfirmModal>

      <ConfirmModal
        open={confirmCompleteOpen}
        title={t('transfers.completeConfirmTitle', 'Conferma completamento')}
        message={t('transfers.completeConfirmMessage', 'Segnare il trasferimento come completato?')}
        variant="primary"
        onCancel={() => setConfirmCompleteOpen(false)}
        onConfirm={() => { void doCompleteTransfer(); }}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        title={t('transfers.deleteConfirmTitle', 'Conferma eliminazione')}
        message={t('transfers.deleteConfirmMessage', 'Eliminare definitivamente questo trasferimento? I collegamenti ai turni verranno rimossi.')}
        variant="danger"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => { void doDeleteTransfer(); }}
      />

      {/* Filter Modal */}
      <TransferFilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={handleApplyFilters}
        initialFilters={{
          company_id: companyFilter,
          store_id: storeFilter,
          status: statusFilter !== 'all' ? statusFilter : '',
        }}
        companyOptions={companyOptions}
        storeOptions={storeOptions}
        statusOptions={statusOptions}
        showCompanyFilter={(isAdminOrHr || isSuperAdmin) && companies.length > 0}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 700,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--text-secondary)',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  background: 'rgba(13,33,55,0.03)',
};

const closeBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontWeight: 700,
  cursor: 'pointer',
};

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--text-primary)',
  background: 'var(--surface)',
  fontFamily: 'var(--font-body)',
};

const helpTextStyle: React.CSSProperties = {
  marginTop: 2,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  color: 'var(--text-muted)',
};
