import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Store } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { StoreActivityType, WindowDisplayActivity } from '../../api/windowDisplay';
import { getEmployees } from '../../api/employees';
import { getAvatarUrl, getCompanyLogoUrl, getStoreLogoUrl } from '../../api/client';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { Input } from '../../components/ui/Input';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  ACTIVITY_ICON_OPTIONS,
  getActivityDefaultIcon,
  getActivityIcon,
  getActivityPalette,
  getActivityTypeLabel,
  isCustomActivityType,
  STORE_ACTIVITY_DEFINITIONS,
  STORE_ACTIVITY_GROUPS,
} from './storeActivityCatalog';

interface CalendarActivitiesModalProps {
  open: boolean;
  onClose: () => void;
  viewMode: 'day' | 'week' | 'month';
  currentDate: Date;
  initialDate?: string | null;
  /** Preselect this store when the modal is opened from a calendar activity block. */
  initialStoreId?: number | null;
  /** Focus (open in edit mode) this activity when the modal is opened from a calendar activity block. */
  initialActivityId?: number | null;
  stores: Store[];
  canManage: boolean;
  activities: WindowDisplayActivity[];
  saving?: boolean;
  onSave: (payload: {
    id?: number;
    storeId: number;
    dates: string[];
    activityType: StoreActivityType;
    activityIcon: string | null;
    customActivityName: string | null;
    durationHours: number | null;
    notes: string | null;
    companyId?: number | null;
  }) => Promise<{ created: number; skipped: string[] }>;
  onDelete: (id: number, companyId?: number | null) => Promise<void>;
}

type StoreOption = {
  id: number;
  name: string;
  companyId: number | null;
  companyName: string;
  logoFilename: string | null;
  companyLogoFilename: string | null;
  employeeCount: number | null;
};

type StoreMeta = {
  hrName: string | null;
  hrAvatarFilename: string | null;
  areaManagerName: string | null;
  areaManagerAvatarFilename: string | null;
  employeeCount: number;
};

function formatIsoMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

function lastDayOfMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const end = new Date(year, monthIndex + 1, 0);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const d = String(end.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeNumberInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function shiftIsoMonth(month: string, offset: number): string {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return month;
  const shifted = new Date(year, monthIndex + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function parseIsoMonth(month: string): { year: number; monthIndex: number } {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    const fallback = new Date();
    return { year: fallback.getFullYear(), monthIndex: fallback.getMonth() };
  }
  return { year, monthIndex };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function humanName(name: string | null | undefined, surname: string | null | undefined): string | null {
  const value = `${name ?? ''} ${surname ?? ''}`.trim();
  return value || null;
}

function initialsFromName(fullName: string | null): string {
  if (!fullName) return '?';
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export default function CalendarActivitiesModal({
  open,
  onClose,
  viewMode,
  currentDate,
  initialDate,
  initialStoreId,
  initialActivityId,
  stores,
  canManage,
  activities,
  saving = false,
  onSave,
  onDelete,
}: CalendarActivitiesModalProps) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useBreakpoint();
  const { user } = useAuth();
  const isStoreManager = user?.role === 'store_manager';
  const [selectedMonth, setSelectedMonth] = useState(formatIsoMonth(currentDate));
  const monthPickerRef = useRef<HTMLDivElement | null>(null);
  // Store/activity to jump to when the modal is opened from a calendar activity block.
  // Held in a ref so the reset-on-open effect cannot clobber it mid-flush.
  const pendingFocusRef = useRef<{ storeId: number; activityId: number | null } | null>(null);
  const selectedStoreRef = useRef<HTMLButtonElement | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(currentDate.getFullYear());
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [formType, setFormType] = useState<StoreActivityType>('window_display');
  const [formIcon, setFormIcon] = useState('');
  const [formCustomActivityName, setFormCustomActivityName] = useState('');
  const [formDurationHours, setFormDurationHours] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localInfo, setLocalInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryEmployees, setDirectoryEmployees] = useState<Array<{
    id: number;
    companyId: number;
    storeId: number | null;
    supervisorId: number | null;
    role: string;
    status: string;
    name: string;
    surname: string;
    avatarFilename: string | null;
  }>>([]);

  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
  const monthPickerLabels = useMemo(() => (
    Array.from({ length: 12 }, (_, idx) => (
      new Date(2000, idx, 1).toLocaleDateString(locale, { month: 'short' })
    ))
  ), [locale]);
  const selectedMonthParts = useMemo(() => parseIsoMonth(selectedMonth), [selectedMonth]);

  useEffect(() => {
    if (!open) return;
    const month = initialDate?.slice(0, 7) ?? formatIsoMonth(currentDate);
    setSelectedMonth(month);
    setMonthPickerOpen(false);
    setSelectedCompanyId(null);
    setLocalError(null);

    // Opened from a calendar activity block → preselect that store and focus its activity.
    if (initialStoreId != null) {
      pendingFocusRef.current = { storeId: initialStoreId, activityId: initialActivityId ?? null };
      setSelectedStoreId(initialStoreId);
    } else {
      pendingFocusRef.current = null;
    }
  }, [open, initialDate, currentDate, initialStoreId, initialActivityId]);

  useEffect(() => {
    setMonthPickerYear(selectedMonthParts.year);
  }, [selectedMonthParts.year]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!monthPickerRef.current?.contains(event.target as Node)) {
        setMonthPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [monthPickerOpen]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadDirectory = async () => {
      setDirectoryLoading(true);
      try {
        const resp = await getEmployees({ limit: 500, status: 'active' });
        if (!cancelled) {
          setDirectoryEmployees(resp.employees.map((employee) => ({
            id: employee.id,
            companyId: employee.companyId,
            storeId: employee.storeId,
            supervisorId: employee.supervisorId,
            role: employee.role,
            status: employee.status,
            name: employee.name,
            surname: employee.surname,
            avatarFilename: employee.avatarFilename ?? null,
          })));
        }
      } catch {
        if (!cancelled) {
          setDirectoryEmployees([]);
        }
      } finally {
        if (!cancelled) {
          setDirectoryLoading(false);
        }
      }
    };

    void loadDirectory();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const allStores = useMemo<StoreOption[]>(() => {
    const map = new Map<number, StoreOption>();

    for (const store of stores) {
      map.set(store.id, {
        id: store.id,
        name: store.name,
        companyId: store.companyId,
        companyName: store.companyName ?? `${t('companies.single', 'Company')} #${store.companyId}`,
        logoFilename: store.logoFilename ?? null,
        companyLogoFilename: store.companyLogoFilename ?? null,
        employeeCount: store.employeeCount ?? null,
      });
    }

    for (const activity of activities) {
      if (!map.has(activity.storeId)) {
        map.set(activity.storeId, {
          id: activity.storeId,
          name: activity.storeName ?? `${t('stores.single', 'Store')} #${activity.storeId}`,
          companyId: activity.companyId,
          companyName: `${t('companies.single', 'Company')} #${activity.companyId}`,
          logoFilename: null,
          companyLogoFilename: null,
          employeeCount: null,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [stores, activities, t]);

  const companyOptions = useMemo(() => {
    const companies = new Map<number, string>();
    for (const store of allStores) {
      if (store.companyId == null) continue;
      companies.set(store.companyId, store.companyName);
    }
    return Array.from(companies.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStores]);

  const monthActivities = useMemo(() => (
    activities.filter((item) => {
      if (item.yearMonth !== selectedMonth) return false;
      if (selectedCompanyId == null) return true;
      return item.companyId === selectedCompanyId;
    })
  ), [activities, selectedMonth, selectedCompanyId]);

  const activitiesByStore = useMemo(() => {
    const map = new Map<number, WindowDisplayActivity[]>();
    for (const item of monthActivities) {
      const list = map.get(item.storeId);
      if (list) list.push(item);
      else map.set(item.storeId, [item]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startDate.localeCompare(b.startDate));
    }
    return map;
  }, [monthActivities]);

  const availableStores = useMemo(() => (
    allStores.filter((store) => (selectedCompanyId == null ? true : store.companyId === selectedCompanyId))
  ), [allStores, selectedCompanyId]);

  // Group stores under their company (ATS Positions pattern): company header + store count.
  const storesByCompany = useMemo(() => {
    const groups = new Map<number, { companyId: number; companyName: string; companyLogoFilename: string | null; stores: StoreOption[] }>();
    for (const store of availableStores) {
      const key = store.companyId ?? -1;
      const existing = groups.get(key);
      if (existing) {
        existing.stores.push(store);
      } else {
        groups.set(key, {
          companyId: key,
          companyName: store.companyName,
          companyLogoFilename: store.companyLogoFilename,
          stores: [store],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [availableStores]);

  useEffect(() => {
    if (!open) return;
    // A store was explicitly picked from the calendar — don't auto-select over it.
    if (pendingFocusRef.current) return;
    if (isStoreManager && user?.storeId) {
      setSelectedStoreId(user.storeId);
      return;
    }
    if (!availableStores.length) {
      setSelectedStoreId(null);
      return;
    }

    if (selectedStoreId && availableStores.some((item) => item.id === selectedStoreId)) {
      return;
    }

    // On mobile, don't auto-select a store - let user choose
    if (isMobile) {
      setSelectedStoreId(null);
      return;
    }

    setSelectedStoreId(availableStores[0].id);
  }, [open, availableStores, selectedStoreId, isMobile, isStoreManager, user?.storeId]);

  const selectedStore = useMemo(
    () => availableStores.find((store) => store.id === selectedStoreId) ?? null,
    [availableStores, selectedStoreId],
  );

  const selectedStoreActivities = useMemo(
    () => (selectedStoreId ? activitiesByStore.get(selectedStoreId) ?? [] : []),
    [activitiesByStore, selectedStoreId],
  );

  const editingActivity = useMemo(
    () => (editingActivityId != null ? selectedStoreActivities.find((a) => a.id === editingActivityId) ?? null : null),
    [selectedStoreActivities, editingActivityId],
  );

  // Map every occupied date (expanding any legacy multi-day ranges) to its activity.
  const activityByDate = useMemo(() => {
    const map = new Map<string, WindowDisplayActivity>();
    for (const activity of selectedStoreActivities) {
      const start = new Date(`${activity.startDate}T12:00:00`);
      const end = new Date(`${activity.endDate}T12:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        map.set(`${y}-${m}-${day}`, activity);
      }
    }
    return map;
  }, [selectedStoreActivities]);

  // Monday-based calendar grid of the selected month (null = leading blank slot).
  const monthGrid = useMemo(() => {
    const total = daysInMonth(selectedMonthParts.year, selectedMonthParts.monthIndex);
    const firstDow = (new Date(selectedMonthParts.year, selectedMonthParts.monthIndex, 1).getDay() + 6) % 7;
    const slots: (string | null)[] = [];
    for (let i = 0; i < firstDow; i += 1) slots.push(null);
    for (let day = 1; day <= total; day += 1) {
      slots.push(`${selectedMonth}-${String(day).padStart(2, '0')}`);
    }
    return slots;
  }, [selectedMonth, selectedMonthParts]);

  // Reset to a clean "create" state whenever the modal opens or the store/month changes.
  useEffect(() => {
    if (!open) return;
    setEditingActivityId(null);
    setSelectedDates([]);
    setFormType('window_display');
    setFormIcon('');
    setFormCustomActivityName('');
    setFormDurationHours('');
    setFormNotes('');
    setLocalError(null);
    setLocalInfo(null);
  }, [open, selectedStoreId, selectedMonth]);

  // If the activity being edited disappears (deleted/refetched away), drop back to create mode.
  useEffect(() => {
    if (editingActivityId != null && !editingActivity) {
      setEditingActivityId(null);
    }
  }, [editingActivityId, editingActivity]);

  // Apply the focus requested by a calendar activity click. Declared after the reset effect
  // above so that, in the same commit, this runs last and wins.
  useEffect(() => {
    if (!open) return;
    const pending = pendingFocusRef.current;
    if (!pending || selectedStoreId !== pending.storeId) return;

    if (pending.activityId == null) {
      pendingFocusRef.current = null;
      return;
    }

    const activity = selectedStoreActivities.find((item) => item.id === pending.activityId);
    if (!activity) return; // activities for this store/month not loaded yet — retry on next change
    pendingFocusRef.current = null;
    beginEditActivity(activity);
  }, [open, selectedStoreId, selectedStoreActivities]);

  // Bring the selected store into view in the (possibly long) grouped store list.
  useEffect(() => {
    if (!open || !selectedStoreId) return;
    selectedStoreRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedStoreId]);

  const storeMetaById = useMemo(() => {
    const employees = directoryEmployees.filter((employee) => employee.status === 'active');
    const employeeById = new Map<number, (typeof employees)[number]>();
    for (const employee of employees) {
      employeeById.set(employee.id, employee);
    }

    const meta = new Map<number, StoreMeta>();

    for (const store of allStores) {
      const companyEmployees = employees.filter((employee) => employee.companyId === store.companyId);
      const companyHr = companyEmployees.find((employee) => employee.role === 'hr') ?? null;
      const companyAreaManager = companyEmployees.find((employee) => employee.role === 'area_manager') ?? null;

      const storeManagers = companyEmployees.filter((employee) => employee.role === 'store_manager' && employee.storeId === store.id);
      const areaManagerFromStoreManager = storeManagers
        .map((manager) => manager.supervisorId)
        .filter((id): id is number => Boolean(id))
        .map((id) => employeeById.get(id) ?? null)
        .find((employee) => employee?.role === 'area_manager') ?? null;

      const employeeCount = store.employeeCount ?? employees.filter((employee) => employee.storeId === store.id).length;

      meta.set(store.id, {
        hrName: companyHr ? humanName(companyHr.name, companyHr.surname) : null,
        hrAvatarFilename: companyHr?.avatarFilename ?? null,
        areaManagerName: areaManagerFromStoreManager
          ? humanName(areaManagerFromStoreManager.name, areaManagerFromStoreManager.surname)
          : companyAreaManager
            ? humanName(companyAreaManager.name, companyAreaManager.surname)
            : null,
        areaManagerAvatarFilename: areaManagerFromStoreManager?.avatarFilename
          ?? companyAreaManager?.avatarFilename
          ?? null,
        employeeCount,
      });
    }

    return meta;
  }, [directoryEmployees, allStores]);

  const isBusy = busy || saving;
  const monthLabel = new Date(`${selectedMonth}-02T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const activityTypeOptions = useMemo<SelectOption[]>(() => {
    const rows: SelectOption[] = [];
    for (const group of STORE_ACTIVITY_GROUPS) {
      const groupLabel = t(group.labelKey, group.labelFallback);
      for (const type of group.types) {
        const definition = STORE_ACTIVITY_DEFINITIONS[type];
        const activityLabel = t(definition.labelKey, definition.labelFallback);
        rows.push({
          value: type,
          label: `${groupLabel} ${activityLabel} ${definition.defaultIcon}`,
          render: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{definition.defaultIcon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {activityLabel}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.2, whiteSpace: 'nowrap', flexShrink: 0 }}>
                • {groupLabel}
              </span>
            </span>
          ),
        });
      }
    }
    return rows;
  }, [t]);

  const activityIconOptions = useMemo<SelectOption[]>(() => (
    ACTIVITY_ICON_OPTIONS.map((option) => {
      const label = option.label.trim();
      const firstSpace = label.indexOf(' ');
      const iconPart = firstSpace > 0 ? label.slice(0, firstSpace) : label;
      const textPart = firstSpace > 0 ? label.slice(firstSpace + 1) : label;
      return {
        value: option.value,
        label,
        render: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{iconPart}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{textPart}</span>
          </span>
        ),
      };
    })
  ), []);

  function extractError(err: unknown): string {
    const axiosErr = err as { response?: { data?: { error?: string; code?: string } } };
    const code = axiosErr?.response?.data?.code;
    const message = axiosErr?.response?.data?.error;
    if (code) return t(`errors.${code}`, message ?? t('errors.DEFAULT', 'An unexpected error occurred.'));
    return message || t('errors.DEFAULT', 'An unexpected error occurred.');
  }

  function beginCreate(): void {
    setEditingActivityId(null);
    setSelectedDates([]);
    setFormType('window_display');
    setFormIcon('');
    setFormCustomActivityName('');
    setFormDurationHours('');
    setFormNotes('');
    setLocalError(null);
    setLocalInfo(null);
  }

  function beginEditActivity(activity: WindowDisplayActivity): void {
    setEditingActivityId(activity.id);
    setSelectedDates([activity.startDate]);
    setFormType(activity.activityType);
    setFormIcon(activity.activityIcon ?? '');
    setFormCustomActivityName(activity.customActivityName ?? '');
    setFormDurationHours(activity.durationHours != null ? String(activity.durationHours) : '');
    setFormNotes(activity.notes ?? '');
    setLocalError(null);
    setLocalInfo(null);
  }

  function handleDayClick(day: string): void {
    if (!canManage || isBusy) return;
    const occupant = activityByDate.get(day) ?? null;

    // A date owned by another activity → switch to editing that activity.
    if (occupant && occupant.id !== editingActivityId) {
      beginEditActivity(occupant);
      return;
    }

    // Edit mode: move the edited activity to the clicked (free or own) date.
    if (editingActivityId != null) {
      setSelectedDates([day]);
      setLocalError(null);
      return;
    }

    // Create mode: toggle the empty date in the multi-select.
    setSelectedDates((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
    setLocalError(null);
  }

  function validateActivityFields(): { ok: false } | { ok: true; customActivityName: string; durationHours: number | null } {
    const normalizedCustomActivityName = formCustomActivityName.trim();
    if (isCustomActivityType(formType) && !normalizedCustomActivityName) {
      setLocalError(t('shifts.customActivityRequired', 'Add a custom activity label.'));
      return { ok: false };
    }
    const durationHours = normalizeNumberInput(formDurationHours);
    if (formDurationHours.trim().length > 0 && durationHours == null) {
      setLocalError(t('shifts.windowDisplayDurationInvalid', 'Duration must be a positive number.'));
      return { ok: false };
    }
    return { ok: true, customActivityName: normalizedCustomActivityName, durationHours };
  }

  async function handleSaveCreate(): Promise<void> {
    if (!selectedStoreId) {
      setLocalError(t('shifts.windowDisplayStoreRequired', 'Select a store first.'));
      return;
    }
    if (selectedDates.length === 0) {
      setLocalError(t('shifts.selectAtLeastOneDate', 'Select at least one date on the calendar.'));
      return;
    }
    const validated = validateActivityFields();
    if (!validated.ok) return;

    setLocalError(null);
    setLocalInfo(null);
    setBusy(true);
    try {
      const companyId = selectedStore?.companyId ?? selectedCompanyId ?? null;
      const result = await onSave({
        storeId: selectedStoreId,
        dates: [...selectedDates].sort(),
        activityType: formType,
        activityIcon: formIcon.trim() || null,
        customActivityName: isCustomActivityType(formType) ? validated.customActivityName : null,
        durationHours: validated.durationHours,
        notes: formNotes.trim() || null,
        companyId,
      });

      if (result && result.skipped.length > 0 && result.created === 0) {
        setLocalError(t('shifts.allDatesHaveActivities', 'Every selected date already has an activity. Pick other dates.'));
        return;
      }
      if (result && result.skipped.length > 0) {
        setLocalInfo(t('shifts.someDatesSkipped', {
          count: result.skipped.length,
          dates: result.skipped.join(', '),
          defaultValue: '{{count}} date(s) already had an activity and were skipped: {{dates}}',
        }));
      }
      setSelectedDates([]);
    } catch (err) {
      setLocalError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(): Promise<void> {
    if (editingActivityId == null || !selectedStoreId) return;
    const theDate = selectedDates[0];
    if (!theDate) {
      setLocalError(t('shifts.selectAtLeastOneDate', 'Select at least one date on the calendar.'));
      return;
    }
    const validated = validateActivityFields();
    if (!validated.ok) return;

    setLocalError(null);
    setLocalInfo(null);
    setBusy(true);
    try {
      const companyId = selectedStore?.companyId ?? editingActivity?.companyId ?? selectedCompanyId ?? null;
      await onSave({
        id: editingActivityId,
        storeId: selectedStoreId,
        dates: [theDate],
        activityType: formType,
        activityIcon: formIcon.trim() || null,
        customActivityName: isCustomActivityType(formType) ? validated.customActivityName : null,
        durationHours: validated.durationHours,
        notes: formNotes.trim() || null,
        companyId,
      });
    } catch (err) {
      setLocalError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!editingActivity) return;
    setLocalError(null);
    setLocalInfo(null);
    setBusy(true);
    try {
      await onDelete(editingActivity.id, editingActivity.companyId);
      beginCreate();
    } catch (err) {
      setLocalError(extractError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        background: 'rgba(13,33,55,0.52)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile? 12 : 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(1140px, 100%)',
          maxHeight: '92vh',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: '0 28px 66px rgba(0,0,0,0.24)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          background: 'var(--primary)',
          color: '#fff',
          padding: isMobile ? '12px 14px' : '14px 18px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: isMobile ? 10 : 12,
          position: isMobile ? 'sticky' : 'relative',
          top: 0,
          zIndex: 50,
        }}>
          {isMobile ? (
            /* Mobile header layout */
            <>
              {/* Top row: Title and Close icon */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 1.2, opacity: 0.68, textTransform: 'uppercase' }}>
                    {viewMode === 'month'
                      ? t('shifts.monthView', 'Month')
                      : viewMode === 'week'
                        ? t('shifts.weekView', 'Week')
                        : t('shifts.dayView', 'Day')}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', marginTop: 2 }}>
                    {t('shifts.storeActivityMapping', 'Store activity mapping')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: '#fff',
                    borderRadius: 8,
                    width: 36,
                    height: 36,
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Company filter */}
              {!isStoreManager && (
                <select
                  value={selectedCompanyId ?? ''}
                  onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.28)',
                    background: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: 12,
                    padding: '0 10px',
                    fontWeight: 700,
                    width: '100%',
                    height: 34,
                  }}
                >
                  <option value="" style={{ color: '#111827' }}>{t('shifts.allCompanies', 'All companies')}</option>
                  {companyOptions.map((company) => (
                    <option key={company.id} value={company.id} style={{ color: '#111827' }}>
                      {company.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Month picker */}
              <div
                ref={monthPickerRef}
                style={{
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.28)',
                  background: 'rgba(255,255,255,0.12)',
                  padding: '2px',
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth((prev) => shiftIsoMonth(prev, -1));
                      setMonthPickerOpen(false);
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.26)',
                      background: 'rgba(255,255,255,0.16)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 15,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                    aria-label={t('common.previous', 'Previous')}
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonthPickerOpen((prev) => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.28)',
                      background: 'rgba(255,255,255,0.2)',
                      color: '#fff',
                      fontSize: 12,
                      padding: '0 12px',
                      fontWeight: 700,
                      minWidth: 180,
                      minHeight: 30,
                      cursor: 'pointer',
                    }}
                  >
                    <CalendarDays size={14} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{monthLabel}</span>
                    <span style={{ fontSize: 10, opacity: 0.9 }}>{monthPickerOpen ? '▲' : '▼'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth((prev) => shiftIsoMonth(prev, 1));
                      setMonthPickerOpen(false);
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.26)',
                      background: 'rgba(255,255,255,0.16)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 15,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                    aria-label={t('common.next', 'Next')}
                  >
                    ›
                  </button>
                </div>

                {monthPickerOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 276,
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: '#ffffff',
                    overflow: 'hidden',
                    boxShadow: '0 18px 42px rgba(15,23,42,0.35)',
                    zIndex: 40,
                  }}>
                    {/* Month picker content - keeping existing */}
                    <div style={{
                      background: 'var(--primary)',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}>
                      <button
                        type="button"
                        onClick={() => setMonthPickerYear((prev) => prev - 1)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.24)',
                          background: 'rgba(255,255,255,0.12)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                        aria-label={t('common.previous', 'Previous')}
                      >
                        ‹
                      </button>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: '#fff', letterSpacing: 0.2 }}>
                        {monthPickerYear}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMonthPickerYear((prev) => prev + 1)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.24)',
                          background: 'rgba(255,255,255,0.12)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                        aria-label={t('common.next', 'Next')}
                      >
                        ›
                      </button>
                    </div>

                    <div style={{ background: 'var(--surface-warm)', padding: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                        {monthPickerLabels.map((label, idx) => {
                          const today = new Date();
                          const isSelected = monthPickerYear === selectedMonthParts.year && idx === selectedMonthParts.monthIndex;
                          const isCurrentMonth = monthPickerYear === today.getFullYear() && idx === today.getMonth();
                          const monthDays = daysInMonth(monthPickerYear, idx);

                          return (
                            <button
                              key={`${label}-${idx}`}
                              type="button"
                              onClick={() => {
                                setSelectedMonth(`${monthPickerYear}-${String(idx + 1).padStart(2, '0')}`);
                                setMonthPickerOpen(false);
                              }}
                              style={{
                                borderRadius: 7,
                                border: isCurrentMonth && !isSelected ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                                background: isSelected ? 'var(--accent)' : 'transparent',
                                color: isSelected ? '#fff' : isCurrentMonth ? 'var(--primary)' : 'var(--text-primary)',
                                fontSize: 12,
                                fontWeight: isSelected ? 800 : 700,
                                padding: '7px 6px',
                                textTransform: 'capitalize',
                                cursor: 'pointer',
                                boxShadow: isSelected ? '0 2px 8px rgba(201,151,58,0.35)' : 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 1,
                              }}
                            >
                              <span>{label}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, opacity: isSelected ? 0.88 : 0.7 }}>
                                {monthDays}d
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Desktop header layout - unchanged */
            <>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 1.2, opacity: 0.68, textTransform: 'uppercase' }}>
                  {viewMode === 'month'
                    ? t('shifts.monthView', 'Month')
                    : viewMode === 'week'
                      ? t('shifts.weekView', 'Week')
                      : t('shifts.dayView', 'Day')}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', marginTop: 2 }}>
                  {t('shifts.storeActivityMapping', 'Store activity mapping')} - {monthLabel}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {!isStoreManager && (
                  <select
                    value={selectedCompanyId ?? ''}
                    onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                    style={{
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.28)',
                      background: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 12,
                      padding: '0 10px',
                      fontWeight: 700,
                      minWidth: 190,
                      height: 34,
                    }}
                  >
                    <option value="" style={{ color: '#111827' }}>{t('shifts.allCompanies', 'All companies')}</option>
                    {companyOptions.map((company) => (
                      <option key={company.id} value={company.id} style={{ color: '#111827' }}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                )}

                <div
                  ref={monthPickerRef}
                  style={{
                    position: 'relative',
                  }}
                >
                  <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.28)',
                  background: 'rgba(255,255,255,0.12)',
                  padding: '2px',
                  }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth((prev) => shiftIsoMonth(prev, -1));
                      setMonthPickerOpen(false);
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.26)',
                      background: 'rgba(255,255,255,0.16)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 15,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                    aria-label={t('common.previous', 'Previous')}
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    onClick={() => setMonthPickerOpen((prev) => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.28)',
                      background: 'rgba(255,255,255,0.2)',
                      color: '#fff',
                      fontSize: 12,
                      padding: '0 12px',
                      fontWeight: 700,
                      minWidth: 198,
                      minHeight: 30,
                      cursor: 'pointer',
                    }}
                  >
                    <CalendarDays size={14} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{monthLabel}</span>
                    <span style={{ fontSize: 10, opacity: 0.9 }}>{monthPickerOpen ? '▲' : '▼'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth((prev) => shiftIsoMonth(prev, 1));
                      setMonthPickerOpen(false);
                    }}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.26)',
                      background: 'rgba(255,255,255,0.16)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 15,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                    aria-label={t('common.next', 'Next')}
                  >
                    ›
                  </button>
                  </div>

                  {monthPickerOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      width: 276,
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      background: '#ffffff',
                      overflow: 'hidden',
                      boxShadow: '0 18px 42px rgba(15,23,42,0.35)',
                      zIndex: 40,
                }}>
                  <div style={{
                    background: 'var(--primary)',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <button
                      type="button"
                      onClick={() => setMonthPickerYear((prev) => prev - 1)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.24)',
                        background: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 800,
                        lineHeight: 1,
                      }}
                      aria-label={t('common.previous', 'Previous')}
                    >
                      ‹
                    </button>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: '#fff', letterSpacing: 0.2 }}>
                      {monthPickerYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMonthPickerYear((prev) => prev + 1)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.24)',
                        background: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 800,
                        lineHeight: 1,
                      }}
                      aria-label={t('common.next', 'Next')}
                    >
                      ›
                    </button>
                  </div>

                  <div style={{ background: 'var(--surface-warm)', padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                      {monthPickerLabels.map((label, idx) => {
                        const today = new Date();
                        const isSelected = monthPickerYear === selectedMonthParts.year && idx === selectedMonthParts.monthIndex;
                        const isCurrentMonth = monthPickerYear === today.getFullYear() && idx === today.getMonth();
                        const monthDays = daysInMonth(monthPickerYear, idx);

                        return (
                          <button
                            key={`${label}-${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedMonth(`${monthPickerYear}-${String(idx + 1).padStart(2, '0')}`);
                              setMonthPickerOpen(false);
                            }}
                            style={{
                              borderRadius: 7,
                              border: isCurrentMonth && !isSelected ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                              background: isSelected ? 'var(--accent)' : 'transparent',
                              color: isSelected ? '#fff' : isCurrentMonth ? 'var(--primary)' : 'var(--text-primary)',
                              fontSize: 12,
                              fontWeight: isSelected ? 800 : 700,
                              padding: '7px 6px',
                              textTransform: 'capitalize',
                              cursor: 'pointer',
                              boxShadow: isSelected ? '0 2px 8px rgba(201,151,58,0.35)' : 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                            }}
                          >
                            <span>{label}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, opacity: isSelected ? 0.88 : 0.7 }}>
                              {monthDays}d
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#fff',
                borderRadius: 8,
                padding: '0 12px',
                height: 34,
                cursor: 'pointer',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {t('common.close', 'Close')}
            </button>
          </>
          )}
        </div>

        <div style={{
          display: isMobile ? 'flex' : 'grid',
          flexDirection: isMobile ? 'column' : undefined,
          gridTemplateColumns: isMobile ? undefined : (isStoreManager ? 'minmax(0, 1fr)' : '360px minmax(0, 1fr)'),
          gap: 0,
          minHeight: 470,
          height: 'calc(92vh - 74px)',
          maxHeight: 'calc(92vh - 74px)',
          overflowX: 'hidden',
          overflowY: isMobile ? 'auto' : 'hidden',
        }}>
          {/* Store list - hide on mobile when store is selected, and hide completely for store manager */}
          {!isStoreManager && (!isMobile || !selectedStoreId) && (
            <div style={{
              borderRight: isMobile ? 'none' : '1px solid var(--border)',
              borderBottom: isMobile && selectedStoreId ? '1px solid var(--border)' : 'none',
              background: 'var(--background)',
              overflowY: isMobile ? 'visible' : 'auto',
              overflowX: 'hidden',
              padding: 12,
              minHeight: 0,
              width: '100%',
            }}>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 8,
            }}>
              {t('stores.title', 'Stores')} {directoryLoading ? `(${t('common.loading', 'Loading...')})` : ''}
            </div>

            {!availableStores.length ? (
              <div style={{
                borderRadius: 8,
                border: '1px dashed var(--border)',
                padding: 12,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}>
                {t('shifts.noStoresAvailable', 'No stores available for this view.')}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {storesByCompany.map((group) => (
                  <div key={`company-${group.companyId}`} style={{ display: 'grid', gap: 8 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '2px 2px 6px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {(() => {
                          const compLogo = getCompanyLogoUrl(group.companyLogoFilename);
                          return (
                            <span style={{
                              width: 22, height: 22, borderRadius: 6, overflow: 'hidden',
                              border: '1px solid var(--border)', background: 'rgba(13,33,55,0.1)',
                              color: '#0D2137', display: 'inline-flex', alignItems: 'center',
                              justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 800,
                            }}>
                              {compLogo
                                ? <img src={compLogo} alt={group.companyName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : group.companyName.slice(0, 2).toUpperCase()}
                            </span>
                          );
                        })()}
                        <span style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.companyName}
                        </span>
                      </div>
                      <span style={{
                        borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)',
                        color: 'var(--text-secondary)', fontSize: 10, fontWeight: 800, padding: '2px 8px',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {group.stores.length} {group.stores.length === 1 ? t('stores.single', 'Store') : t('stores.title', 'Stores')}
                      </span>
                    </div>
                    {group.stores.map((store) => {
                  const selected = selectedStoreId === store.id;
                  const meta = storeMetaById.get(store.id);
                  const storeLogo = getStoreLogoUrl(store.logoFilename);
                  const companyLogo = getCompanyLogoUrl(store.companyLogoFilename);
                  const avatar = storeLogo ?? companyLogo;
                  const hrAvatar = getAvatarUrl(meta?.hrAvatarFilename ?? null);
                  const areaManagerAvatar = getAvatarUrl(meta?.areaManagerAvatarFilename ?? null);
                  const hrInitials = initialsFromName(meta?.hrName ?? null);
                  const areaManagerInitials = initialsFromName(meta?.areaManagerName ?? null);

                  return (
                    <button
                      key={store.id}
                      type="button"
                      ref={selected ? selectedStoreRef : undefined}
                      onClick={() => {
                        pendingFocusRef.current = null;
                        setSelectedStoreId(store.id);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        borderRadius: 10,
                        border: selected ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: selected ? 'rgba(30,74,122,0.08)' : 'var(--surface)',
                        padding: 10,
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 7,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'rgba(13,33,55,0.14)',
                          color: '#0D2137',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: 10,
                          fontWeight: 800,
                        }}>
                          {avatar ? (
                            <img src={avatar} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : store.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontWeight: 800, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {store.name}
                          </span>
                        </span>
                        <span style={{
                          borderRadius: 999,
                          border: '1px solid rgba(148,163,184,0.34)',
                          background: 'rgba(248,250,252,0.9)',
                          color: '#334155',
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          lineHeight: 1.2,
                        }}>
                          {(meta?.employeeCount ?? store.employeeCount ?? 0)} {t('shifts.monthlyEmployees', 'Employees')}
                        </span>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: 'linear-gradient(135deg,var(--primary),var(--accent))',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}>
                            {hrAvatar ? (
                              <img src={hrAvatar} alt={meta?.hrName ?? t('roles.hr', 'HR')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : hrInitials}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{t('roles.hr', 'HR')}</div>
                            <div style={{ marginTop: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {meta?.hrName ?? t('common.notAvailable', 'N/A')}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: 'linear-gradient(135deg,var(--primary),var(--accent))',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}>
                            {areaManagerAvatar ? (
                              <img src={areaManagerAvatar} alt={meta?.areaManagerName ?? t('roles.area_manager', 'Area manager')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : areaManagerInitials}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{t('roles.area_manager', 'Area manager')}</div>
                            <div style={{ marginTop: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {meta?.areaManagerName ?? t('common.notAvailable', 'N/A')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Form section - show full screen on mobile when store is selected */}
          {(!isMobile || selectedStoreId) && (
            <div style={{
              padding: 14,
              overflowY: 'auto',
              overflowX: 'hidden',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              width: '100%',
              height: isMobile && selectedStoreId ? '100%' : 'auto',
              background: 'var(--surface)',
            }}>
            {/* Mobile: Back button to return to store list */}
            {isMobile && selectedStoreId && !isStoreManager && (
              <button
                type="button"
                onClick={() => setSelectedStoreId(null)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                {t('common.back', 'Back to stores')}
              </button>
            )}
            {!selectedStoreId ? (
              <div style={{
                borderRadius: 10,
                border: '1px dashed var(--border)',
                padding: 14,
                color: 'var(--text-muted)',
                fontSize: 12,
              }}>
                {t('shifts.selectStoreToManageActivity', 'Select a store to view activity details.')}
              </div>
            ) : (
              <>
                <div style={{
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{selectedStore?.name}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{selectedStore?.companyName}</div>
                  </div>
                  <div style={{
                    borderRadius: 999,
                    border: selectedStoreActivities.length > 0 ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(148,163,184,0.25)',
                    background: selectedStoreActivities.length > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
                    color: selectedStoreActivities.length > 0 ? '#166534' : '#475569',
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '4px 10px',
                    lineHeight: 1.2,
                  }}>
                    {selectedStoreActivities.length > 0
                      ? t('shifts.activitiesCount', { count: selectedStoreActivities.length, defaultValue: '{{count}} activities' })
                      : t('shifts.activityNotConfigured', 'No activity configured')}
                  </div>
                </div>

                {localError && (
                  <div style={{
                    borderRadius: 8,
                    border: '1px solid var(--danger-border)',
                    background: 'var(--danger-bg)',
                    color: 'var(--danger)',
                    fontSize: 12,
                    padding: '8px 10px',
                    fontWeight: 700,
                  }}>
                    {localError}
                  </div>
                )}

                {localInfo && (
                  <div style={{
                    borderRadius: 8,
                    border: '1px solid rgba(217,119,6,0.32)',
                    background: 'rgba(254,243,199,0.6)',
                    color: '#92400e',
                    fontSize: 12,
                    padding: '8px 10px',
                    fontWeight: 700,
                  }}>
                    {localInfo}
                  </div>
                )}

                <div style={{
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: 14,
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {t('shifts.activityTypeField', 'Activity type')}
                    </label>
                    <CustomSelect
                      value={formType}
                      onChange={(value) => {
                        const nextType = (value as StoreActivityType | null) ?? 'window_display';
                        setFormType(nextType);
                        if (!isCustomActivityType(nextType)) {
                          setFormCustomActivityName('');
                        }
                      }}
                      options={activityTypeOptions}
                      placeholder={t('shifts.activityTypeField', 'Activity type')}
                      disabled={!canManage || isBusy}
                      searchable
                      isClearable={false}
                      searchPlaceholder={t('common.search', 'Search...')}
                      noOptionsMessage={t('common.noData', 'No options found')}
                      menuMaxHeight={228}
                    />
                  </div>

                  <div style={{ display: 'grid', gap: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {t('shifts.activityIcon', 'Icon')}
                    </label>
                    <CustomSelect
                      value={formIcon || null}
                      onChange={(value) => setFormIcon(value ?? '')}
                      options={activityIconOptions}
                      placeholder={t('shifts.activityIconAuto', { icon: getActivityDefaultIcon(formType), defaultValue: `Auto (${getActivityDefaultIcon(formType)})` })}
                      disabled={!canManage || isBusy}
                      searchable
                      isClearable
                      searchPlaceholder={t('common.search', 'Search...')}
                      noOptionsMessage={t('common.noData', 'No options found')}
                      menuMaxHeight={228}
                    />
                  </div>

                  {isCustomActivityType(formType) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Input
                        label={t('shifts.customActivityLabel', 'Custom activity label')}
                        value={formCustomActivityName}
                        disabled={!canManage || isBusy}
                        onChange={(e) => setFormCustomActivityName(e.target.value)}
                        placeholder={t('shifts.customActivityPlaceholder', 'Example: VIP private fitting night')}
                        maxLength={120}
                      />
                    </div>
                  )}

                  {/* Multi-date selector (one activity per selected date) */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {editingActivityId != null
                          ? t('shifts.activityDateEditHint', 'Activity date — click another day to move it')
                          : t('shifts.activitySelectDates', 'Select date(s)')}
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                          {editingActivityId != null
                            ? (selectedDates[0] ?? '')
                            : t('shifts.datesSelectedCount', { count: selectedDates.length, defaultValue: '{{count}} selected' })}
                        </span>
                        {editingActivityId == null && selectedDates.length > 0 && canManage && (
                          <button
                            type="button"
                            onClick={() => setSelectedDates([])}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                          >
                            {t('common.clear', 'Clear')}
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
                      background: 'var(--surface-warm)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: 8,
                    }}>
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                        <div key={`dow-${i}`} style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4 }}>{day}</div>
                      ))}
                      {monthGrid.map((dateStr, i) => {
                        if (!dateStr) return <div key={`empty-${i}`} />;
                        const occupant = activityByDate.get(dateStr) ?? null;
                        const dayNum = dateStr.split('-')[2];
                        const isEditingThis = editingActivityId != null && occupant?.id === editingActivityId;
                        const isEditTarget = editingActivityId != null && selectedDates[0] === dateStr;
                        const isPicked = editingActivityId == null && selectedDates.includes(dateStr);
                        const isActive = isEditingThis || isEditTarget || isPicked;
                        const occupantOther = occupant != null && occupant.id !== editingActivityId;
                        const palette = occupant ? getActivityPalette(occupant.activityType) : null;
                        const occIcon = occupant ? getActivityIcon(occupant.activityType, occupant.activityIcon) : null;

                        let background = 'rgba(148,163,184,0.10)';
                        let color: string = 'var(--text-primary)';
                        let border = '1px solid transparent';
                        if (isActive) {
                          background = 'var(--accent)';
                          color = '#fff';
                        } else if (occupantOther && palette) {
                          background = palette.background;
                          color = palette.color;
                          border = `1px solid ${palette.border}`;
                        }

                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={!canManage || isBusy}
                            onClick={() => handleDayClick(dateStr)}
                            title={occupant ? `${getActivityTypeLabel(t, occupant.activityType, occupant.customActivityName)} · ${dateStr}` : dateStr}
                            style={{
                              aspectRatio: '1',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                              borderRadius: 8,
                              border,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: canManage && !isBusy ? 'pointer' : 'default',
                              background,
                              color,
                            }}
                          >
                            <span>{dayNum}</span>
                            {(occupant && !isActive) || isEditingThis ? (
                              <span style={{ fontSize: 10, lineHeight: 1 }}>{occIcon}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--accent)' }} /> {t('common.selected', 'Selected')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: 'rgba(217,119,6,0.32)' }} /> {t('shifts.hasActivity', 'Has activity')}
                      </span>
                    </div>
                  </div>

                  <Input
                    label={t('shifts.activityDurationHours', 'Duration (hours)')}
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={formDurationHours}
                    disabled={!canManage || isBusy}
                    onChange={(e) => setFormDurationHours(e.target.value)}
                    placeholder={t('shifts.activityDurationPlaceholder', 'Optional')}
                  />

                  <div style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {t('common.notes', 'Notes')}
                    </label>
                    <textarea
                      value={formNotes}
                      disabled={!canManage || isBusy}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={4}
                      className="field-input"
                      style={{
                        resize: 'vertical',
                        minHeight: 92,
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '13.5px',
                        color: 'var(--text-primary)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                      placeholder={t('shifts.activityNotesPlaceholder', 'Optional notes for this activity')}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {canManage
                      ? (editingActivityId != null
                        ? t('shifts.activityEditHint', 'Editing an activity — change its details or move its date, then Update.')
                        : t('shifts.activityCreateHint', 'Pick one or more dates, set the activity, then Save. One activity per date.'))
                      : t('shifts.activityReadOnlyHint', 'Read-only mode: you can view activities but cannot edit.')}
                  </div>

                  {canManage && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {editingActivityId != null && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={beginCreate}
                          style={{
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            borderRadius: 'var(--radius)',
                            padding: '0 14px',
                            height: 38,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: isBusy ? 'default' : 'pointer',
                          }}
                        >
                          {t('shifts.newActivity', '+ New')}
                        </button>
                      )}
                      {editingActivityId != null ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={isBusy}
                            onClick={handleDelete}
                          >
                            {isBusy ? t('common.loading', 'Loading...') : t('common.delete', 'Delete')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={isBusy || selectedDates.length === 0}
                            onClick={handleUpdate}
                          >
                            {isBusy ? t('common.loading', 'Loading...') : t('common.update', 'Update')}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={isBusy || !selectedStoreId || selectedDates.length === 0}
                          onClick={handleSaveCreate}
                        >
                          {isBusy ? t('common.loading', 'Loading...') : t('common.save', 'Save')}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* This store's activities for the selected month */}
                {selectedStoreActivities.length > 0 && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}>
                      {t('shifts.storeActivitiesThisMonth', 'Activities this month')} ({selectedStoreActivities.length})
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {selectedStoreActivities.map((activity) => {
                        const palette = getActivityPalette(activity.activityType);
                        const icon = getActivityIcon(activity.activityType, activity.activityIcon);
                        const isEditing = activity.id === editingActivityId;
                        const dateLabel = activity.startDate === activity.endDate
                          ? activity.startDate
                          : `${activity.startDate} → ${activity.endDate}`;
                        return (
                          <button
                            key={activity.id}
                            type="button"
                            onClick={() => { if (canManage) beginEditActivity(activity); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              textAlign: 'left',
                              width: '100%',
                              border: isEditing ? '1px solid var(--primary)' : '1px solid var(--border)',
                              background: isEditing ? 'rgba(30,74,122,0.08)' : 'var(--surface)',
                              borderRadius: 10,
                              padding: '8px 10px',
                              cursor: canManage ? 'pointer' : 'default',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                flexShrink: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: palette.background,
                                border: `1px solid ${palette.border}`,
                                borderLeft: `3px solid ${palette.accentBorder}`,
                                fontSize: 14,
                              }}>
                                {icon}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {getActivityTypeLabel(t, activity.activityType, activity.customActivityName)}
                              </span>
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {dateLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
