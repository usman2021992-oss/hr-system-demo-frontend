import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Moon, Palmtree, Pencil, PlayCircle, Store as StoreIcon, Thermometer, Trash2, Filter, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import CustomSelect from '../../components/ui/CustomSelect';
import {
  Shift,
  ShiftTemplate,
  listShifts,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createShift,
} from '../../api/shifts';
import { getLeaveBlocks, LeaveBlock } from '../../api/leave';
import { getStores, getStoreOperatingHours } from '../../api/stores';
import { getEmployees } from '../../api/employees';
import { getTransferBlocks, TransferAssignment } from '../../api/transfers';
import { getAvatarUrl } from '../../api/client';
import { Store as StoreType, Employee, StoreOperatingHour } from '../../types';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { DatePicker } from '../../components/ui/DatePicker';

import { useBreakpoint } from '../../hooks/useBreakpoint';

interface ShiftPattern {
  dayOfWeek: number; // 0=Mon … 6=Sun
  startTime: string; // 'HH:MM'
  endTime: string;
  breakType?: 'fixed' | 'flexible';
  breakStart?: string;
  breakEnd?: string;
  breakMinutes?: number;
  notes?: string;
}

interface TemplateData {
  shifts: ShiftPattern[];
}

type ApplyEmployeeItem = Employee & {
  isTransferredForApply?: boolean;
  transferForApply?: TransferAssignment | null;
};

// Per-day config used inside the create wizard
interface DayConfig {
  enabled: boolean;
  startTime: string;
  endTime: string;
  breakType: 'none' | 'fixed' | 'flexible';
  breakStart: string;
  breakEnd: string;
  breakMinutes: string;
}

const DEFAULT_DAY_CONFIG: DayConfig = {
  enabled: false,
  startTime: '',
  endTime: '',
  breakType: 'none',
  breakStart: '',
  breakEnd: '',
  breakMinutes: '',
};

function parseHmToMinutes(value: string): number | null {
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60) + m;
}

function diffMinutes(startHm: string, endHm: string): number {
  const start = parseHmToMinutes(startHm);
  const end = parseHmToMinutes(endHm);
  if (start == null || end == null) return 0;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function calculatePatternMinutes(pattern: ShiftPattern): number {
  const total = diffMinutes(pattern.startTime, pattern.endTime);
  const breakMinutes = (pattern.breakType ?? 'fixed') === 'flexible'
    ? (pattern.breakMinutes ?? 0)
    : (pattern.breakStart && pattern.breakEnd
      ? diffMinutes(pattern.breakStart, pattern.breakEnd)
      : 0);
  return Math.max(0, total - breakMinutes);
}

function formatMinutesAsHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dayOfWeekMonBased(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function enumerateDatesForPattern(patternDay: number, startDate: string, endDate: string): string[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (dayOfWeekMonBased(cursor) === patternDay) {
      out.push(toIsoDate(cursor));
    }
  }
  return out;
}

function enumerateAllDates(startDate: string, endDate: string): string[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function enumerateMonthsInRange(startDate: string, endDate: string): string[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return [];

  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endCursor) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function overlapDaysInclusive(fromA: string, toA: string, fromB: string, toB: string): number {
  const start = fromA > fromB ? fromA : fromB;
  const end = toA < toB ? toA : toB;
  if (start > end) return 0;
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

function breakTone(breakType: 'none' | 'fixed' | 'flexible', active: boolean): {
  background: string;
  color: string;
  border: string;
} {
  if (breakType === 'none') {
    return {
      background: active ? 'rgba(148,163,184,0.22)' : 'rgba(248,250,252,0.8)',
      color: active ? '#475569' : '#64748b',
      border: active ? 'rgba(100,116,139,0.5)' : 'rgba(203,213,225,0.9)',
    };
  }
  if (breakType === 'flexible') {
    return {
      background: active ? 'rgba(56,189,248,0.18)' : 'rgba(240,249,255,0.9)',
      color: active ? '#0369a1' : '#0c4a6e',
      border: active ? 'rgba(14,116,144,0.45)' : 'rgba(186,230,253,0.95)',
    };
  }
  return {
    background: active ? 'rgba(217,119,6,0.16)' : 'rgba(255,251,235,0.9)',
    color: active ? '#b45309' : '#92400e',
    border: active ? 'rgba(180,83,9,0.4)' : 'rgba(253,230,138,0.95)',
  };
}

function validateShiftPatternTiming(pattern: ShiftPattern, t: (k: string, o?: any) => string, dayLabel: string): string | null {
  const startMinutes = parseHmToMinutes(pattern.startTime);
  const endMinutes = parseHmToMinutes(pattern.endTime);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return t('shifts.validation.endAfterStart', "L'orario di fine deve essere successivo all'inizio") + ` (${dayLabel})`;
  }

  const breakType = pattern.breakType ?? 'fixed';
  if (breakType === 'flexible') {
    const breakMinutes = pattern.breakMinutes ?? null;
    if (breakMinutes == null || Number.isNaN(breakMinutes) || breakMinutes <= 0 || breakMinutes > 480) {
      return t('shifts.validation.breakMinutesInvalid', 'La durata della pausa deve essere compresa tra 1 e 480 minuti') + ` (${dayLabel})`;
    }
    if (breakMinutes >= (endMinutes - startMinutes)) {
      return t('shifts.validation.breakWithinShift', 'La pausa deve rientrare nella finestra del turno') + ` (${dayLabel})`;
    }
  } else {
    const hasBreakStart = Boolean(pattern.breakStart);
    const hasBreakEnd = Boolean(pattern.breakEnd);
    if (hasBreakStart !== hasBreakEnd) {
      return t('shifts.validation.breakBothRequired', 'Se si inserisce una pausa, entrambi gli orari sono obbligatori') + ` (${dayLabel})`;
    }

    if (hasBreakStart && hasBreakEnd) {
      const breakStartMinutes = parseHmToMinutes(pattern.breakStart!);
      const breakEndMinutes = parseHmToMinutes(pattern.breakEnd!);
      if (breakStartMinutes == null || breakEndMinutes == null || breakEndMinutes <= breakStartMinutes) {
        return t('shifts.validation.breakEndAfterStart', "L'orario di fine pausa deve essere successivo all'inizio") + ` (${dayLabel})`;
      }
      if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
        return t('shifts.validation.breakWithinShift', 'La pausa deve rientrare nella finestra del turno') + ` (${dayLabel})`;
      }
    }
  }

  return null;
}

interface ShiftTemplatesPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function ShiftTemplatesPanel({ open, onClose }: ShiftTemplatesPanelProps) {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();
  const { user } = useAuth();

  const isManagementRole = user && (user.isSuperAdmin || ['admin', 'hr', 'area_manager'].includes(user.role));

  const DAY_LABELS_FULL = [
    t('stores.dayMonday', 'Monday'),
    t('stores.dayTuesday', 'Tuesday'),
    t('stores.dayWednesday', 'Wednesday'),
    t('stores.dayThursday', 'Thursday'),
    t('stores.dayFriday', 'Friday'),
    t('stores.daySaturday', 'Saturday'),
    t('stores.daySunday', 'Sunday'),
  ];

  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [storeFilter, setStoreFilter] = useState<number | null>(null);

  // Expanded template (to view shift patterns)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Apply template state
  const [applyTemplate, setApplyTemplate] = useState<ShiftTemplate | null>(null);
  const [applyStartDate, setApplyStartDate] = useState('');
  const [applyEndDate, setApplyEndDate] = useState('');
  const [applySelectedDates, setApplySelectedDates] = useState<string[]>([]);
  const [applyEmployeeIds, setApplyEmployeeIds] = useState<number[]>([]);
  const [applyEmployeeSearch, setApplyEmployeeSearch] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [applyTransfers, setApplyTransfers] = useState<TransferAssignment[]>([]);
  const [applyRangeShifts, setApplyRangeShifts] = useState<Shift[]>([]);
  const [applyLeaveBlocks, setApplyLeaveBlocks] = useState<LeaveBlock[]>([]);
  const [applyContextLoading, setApplyContextLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const applyEmployees = useMemo<ApplyEmployeeItem[]>(() => {
    const byId = new Map<number, ApplyEmployeeItem>();
    for (const emp of employees) {
      byId.set(emp.id, { ...emp, isTransferredForApply: false, transferForApply: null });
    }

    if (!applyTemplate) {
      return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name) || a.surname.localeCompare(b.surname));
    }

    const transferPriority: Record<TransferAssignment['status'], number> = {
      active: 0,
      completed: 1,
      cancelled: 2,
    };

    const transferByUser = new Map<number, TransferAssignment>();
    for (const tb of applyTransfers
      .filter((tb) => tb.targetStoreId === applyTemplate.storeId && tb.status !== 'cancelled')
      .sort((a, b) => {
        if (transferPriority[a.status] !== transferPriority[b.status]) {
          return transferPriority[a.status] - transferPriority[b.status];
        }
        return b.id - a.id;
      })) {
      if (!transferByUser.has(tb.userId)) {
        transferByUser.set(tb.userId, tb);
      }
    }

    for (const transfer of transferByUser.values()) {
      const existing = byId.get(transfer.userId);
      if (existing) {
        byId.set(transfer.userId, {
          ...existing,
          isTransferredForApply: true,
          transferForApply: transfer,
        });
        continue;
      }

      byId.set(transfer.userId, {
        id: transfer.userId,
        companyId: transfer.companyId,
        storeId: transfer.targetStoreId,
        supervisorId: null,
        name: transfer.userName,
        surname: transfer.userSurname,
        email: transfer.userEmail,
        role: 'employee',
        uniqueId: null,
        department: null,
        hireDate: null,
        contractEndDate: null,
        terminationDate: null,
        workingType: null,
        weeklyHours: null,
        status: 'active',
        firstAidFlag: false,
        maritalStatus: null,
        storeName: transfer.targetStoreName,
        companyName: transfer.companyName,
        avatarFilename: transfer.userAvatarFilename,
        isTransferredForApply: true,
        transferForApply: transfer,
      });
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name) || a.surname.localeCompare(b.surname));
  }, [employees, applyTransfers, applyTemplate]);

  const filteredTemplates = useMemo(() => {
    if (!storeFilter) return templates;
    return templates.filter((t) => t.storeId === storeFilter);
  }, [templates, storeFilter]);

  const filteredApplyEmployees = useMemo(() => {
    const q = applyEmployeeSearch.trim().toLowerCase();
    if (!q) return applyEmployees;
    return applyEmployees.filter((employee) => {
      const fullName = `${employee.name} ${employee.surname}`.toLowerCase();
      return fullName.includes(q)
        || (employee.email ?? '').toLowerCase().includes(q)
        || (employee.storeName ?? '').toLowerCase().includes(q)
        || (employee.role ?? '').toLowerCase().includes(q);
    });
  }, [applyEmployees, applyEmployeeSearch]);

  const allFilteredSelected = useMemo(() => {
    if (filteredApplyEmployees.length === 0) return false;
    return filteredApplyEmployees.every((employee) => applyEmployeeIds.includes(employee.id));
  }, [filteredApplyEmployees, applyEmployeeIds]);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // ── Create Wizard ──────────────────────────────────────────────────────────
  // Step 0 = wizard hidden; Step 1 = name/store; Step 2 = day customisation
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [newName, setNewName] = useState('');
  const [newStoreId, setNewStoreId] = useState('');
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(
    Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY_CONFIG }))
  );

  const [templateOperatingHours, setTemplateOperatingHours] = useState<StoreOperatingHour[]>([]);
  const [confirmHoursOpen, setConfirmHoursOpen] = useState(false);

  function toMins(t: string): number {
    const parts = t.split(':');
    if (parts.length < 2) return NaN;
    const [h, m] = parts.map(Number);
    if (isNaN(h) || isNaN(m)) return NaN;
    return h * 60 + m;
  }

  const isTemplateDayOutside = (idx: number, startStr: string, endStr: string) => {
    if (!newStoreId || templateOperatingHours.length === 0) return false;
    const dayHours = templateOperatingHours.find(h => h.dayOfWeek === idx);
    if (!dayHours) return false;
    if (dayHours.isClosed) return true;
    
    const openMins = toMins(dayHours.openTime || '');
    const closeMins = toMins(dayHours.closeTime || '');
    if (isNaN(openMins) || isNaN(closeMins)) return false;

    if (!startStr || !endStr) return false;
    const startMins = toMins(startStr);
    const endMins = toMins(endStr);
    if (isNaN(startMins) || isNaN(endMins)) return false;

    if (openMins <= closeMins) {
      if (startMins > endMins) return true;
      return startMins < openMins || endMins > closeMins;
    } else {
      if (startMins > endMins) {
        return startMins < openMins || endMins > closeMins;
      }
      return !((startMins >= openMins && endMins <= 1440) || (startMins >= 0 && endMins <= closeMins));
    }
  };

  const templateConflictingDays = useMemo(() => {
    if (!newStoreId || templateOperatingHours.length === 0) return [];
    const conflicts: { dayIdx: number; dayName: string; shiftTime: string; storeHours: string }[] = [];
    
    dayConfigs.forEach((d, idx) => {
      if (!d.enabled) return;
      const dayHours = templateOperatingHours.find(h => h.dayOfWeek === idx);
      if (!dayHours) return;

      let isOutside = false;
      if (dayHours.isClosed) {
        isOutside = true;
      } else {
        const openMins = toMins(dayHours.openTime || '');
        const closeMins = toMins(dayHours.closeTime || '');
        const startMins = toMins(d.startTime);
        const endMins = toMins(d.endTime);

        if (!isNaN(openMins) && !isNaN(closeMins) && !isNaN(startMins) && !isNaN(endMins)) {
          if (openMins <= closeMins) {
            if (startMins > endMins) isOutside = true;
            else isOutside = startMins < openMins || endMins > closeMins;
          } else {
            if (startMins > endMins) {
              isOutside = startMins < openMins || endMins > closeMins;
            } else {
              isOutside = !((startMins >= openMins && endMins <= 1440) || (startMins >= 0 && endMins <= closeMins));
            }
          }
        }
      }

      if (isOutside) {
        conflicts.push({
          dayIdx: idx,
          dayName: DAY_LABELS_FULL[idx],
          shiftTime: `${d.startTime} - ${d.endTime}`,
          storeHours: dayHours.isClosed
            ? t('stores.dayClosed', 'Closed')
            : `${dayHours.openTime} - ${dayHours.closeTime}`,
        });
      }
    });

    return conflicts;
  }, [newStoreId, templateOperatingHours, dayConfigs, t]);

  function openWizard() {
    setEditingTemplate(null);
    setNewName('');
    setNewStoreId('');
    setDayConfigs(Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY_CONFIG })));
    setError(null);
    setWizardStep(1);
  }

  function openEditWizard(template: ShiftTemplate) {
    const patterns: ShiftPattern[] = (template.templateData as unknown as TemplateData)?.shifts ?? [];
    const nextDays = Array.from({ length: 7 }, () => ({ ...DEFAULT_DAY_CONFIG }));

    for (const pattern of patterns) {
      if (pattern.dayOfWeek < 0 || pattern.dayOfWeek > 6) continue;
      let breakType: 'none' | 'fixed' | 'flexible';
      if (pattern.breakType === 'flexible' || (pattern.breakType == null && pattern.breakMinutes != null && pattern.breakMinutes > 0)) {
        breakType = 'flexible';
      } else if (pattern.breakType === 'fixed' && (pattern.breakStart || pattern.breakEnd)) {
        breakType = 'fixed';
      } else if (pattern.breakMinutes === 0 || (!pattern.breakStart && !pattern.breakEnd && !pattern.breakMinutes)) {
        breakType = 'none';
      } else {
        breakType = 'fixed';
      }
      nextDays[pattern.dayOfWeek] = {
        enabled: true,
        startTime: pattern.startTime,
        endTime: pattern.endTime,
        breakType,
        breakStart: breakType === 'fixed' ? (pattern.breakStart ?? '') : '',
        breakEnd: breakType === 'fixed' ? (pattern.breakEnd ?? '') : '',
        breakMinutes: breakType === 'flexible' && pattern.breakMinutes != null ? String(pattern.breakMinutes) : '',
      };
    }

    setEditingTemplate(template);
    setNewName(template.name);
    setNewStoreId(String(template.storeId));
    setDayConfigs(nextDays);
    setError(null);
    setWizardStep(1);
  }

  function closeWizard() {
    setWizardStep(0);
    setEditingTemplate(null);
    setError(null);
  }

  function toggleDay(idx: number) {
    setDayConfigs((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, enabled: !d.enabled } : d))
    );
  }

  function updateDay(idx: number, field: keyof Omit<DayConfig, 'enabled'>, value: string) {
    setDayConfigs((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d))
    );
  }

  // Apply the same times to ALL enabled days at once
  function applyGlobalToAll(field: keyof Omit<DayConfig, 'enabled'>, value: string) {
    setDayConfigs((prev) =>
      prev.map((d) => (d.enabled ? { ...d, [field]: value } : d))
    );
  }

  useEffect(() => {
    if (!open) return;
    fetchTemplates();
    getStores().then(setStores).catch(() => { });
  }, [open]);

  useEffect(() => {
    if (!newStoreId) {
      setTemplateOperatingHours([]);
      return;
    }
    let mounted = true;
    getStoreOperatingHours(Number(newStoreId))
      .then((hours) => {
        if (!mounted) return;
        setTemplateOperatingHours(hours || []);
      })
      .catch(() => {
        if (!mounted) return;
        setTemplateOperatingHours([]);
      });
    return () => {
      mounted = false;
    };
  }, [newStoreId]);

  async function fetchTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await listTemplates();
      setTemplates(data.templates);
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const enabledDays = dayConfigs
      .map((d, i) => ({ ...d, dayOfWeek: i }))
      .filter((d) => d.enabled);

    if (!newName.trim() || !newStoreId || enabledDays.length === 0) return;

    // Validate each enabled day has start/end times
    for (const d of enabledDays) {
      if (!d.startTime || !d.endTime) {
        setError(`Please set shift start and end time for ${DAY_LABELS_FULL[d.dayOfWeek]}.`);
        return;
      }

      const timingError = validateShiftPatternTiming(
        {
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
          breakType: d.breakType === 'none' ? 'fixed' : d.breakType,
          breakStart: d.breakType === 'fixed' ? (d.breakStart || undefined) : undefined,
          breakEnd: d.breakType === 'fixed' ? (d.breakEnd || undefined) : undefined,
          breakMinutes: d.breakType === 'flexible' && d.breakMinutes ? parseInt(d.breakMinutes, 10) : undefined,
        },
        t as (k: string, o?: any) => string,
        DAY_LABELS_FULL[d.dayOfWeek],
      );
      if (timingError) {
        setError(timingError);
        return;
      }
    }

    // Check if any template shifts are outside operating hours
    if (templateOperatingHours.length > 0 && templateConflictingDays.length > 0) {
      setConfirmHoursOpen(true);
      return;
    }

    await doSaveTemplate();
  }

  async function doSaveTemplate() {
    setConfirmHoursOpen(false);
    setSaving(true);
    setError(null);
    try {
      const enabledDays = dayConfigs
        .map((d, i) => ({ ...d, dayOfWeek: i }))
        .filter((d) => d.enabled);

      const payload = {
        store_id: parseInt(newStoreId, 10),
        name: newName.trim(),
        template_data: {
          shifts: enabledDays.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            startTime: d.startTime,
            endTime: d.endTime,
            breakType: d.breakType === 'none' ? 'fixed' : d.breakType,
            breakStart: d.breakType === 'fixed' ? (d.breakStart || undefined) : undefined,
            breakEnd: d.breakType === 'fixed' ? (d.breakEnd || undefined) : undefined,
            breakMinutes: d.breakType === 'none' ? 0 : (d.breakType === 'flexible' && d.breakMinutes ? parseInt(d.breakMinutes, 10) : undefined),
          })),
        },
      };

      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, payload);
        setSuccessMsg(`✓ ${t('shifts.templateUpdated', 'Template updated successfully')}`);
      } else {
        await createTemplate(payload);
        setSuccessMsg(`✓ Template "${newName.trim()}" created successfully!`);
      }
      setTimeout(() => setSuccessMsg(null), 4000);
      closeWizard();
      await fetchTemplates();
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: number) {
    setConfirmDeleteId(null);
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((tmpl) => tmpl.id !== id));
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    }
  }

  function openApply(tmpl: ShiftTemplate) {
    const today = toIsoDate(new Date());
    setApplyTemplate(tmpl);
    setApplyStartDate(today);
    setApplyEndDate(today);
    setApplyEmployeeIds([]);
    setApplyEmployeeSearch('');
    setEmployees([]);
    setApplyTransfers([]);
    setEmployeesLoading(true);
    getEmployees({ storeId: tmpl.storeId, status: 'active', limit: 100 })
      .then((d) => setEmployees(d.employees.sort((a, b) => a.name.localeCompare(b.name) || a.surname.localeCompare(b.surname))))
      .catch(() => { setEmployees([]); })
      .finally(() => setEmployeesLoading(false));
  }

  useEffect(() => {
    if (!applyTemplate || !applyStartDate || !applyEndDate || applyStartDate > applyEndDate) {
      setApplyTransfers([]);
      return;
    }

    let mounted = true;
    getTransferBlocks({
      date_from: applyStartDate,
      date_to: applyEndDate,
      status: 'all',
      store_id: applyTemplate.storeId,
    })
      .then((res) => {
        if (!mounted) return;
        setApplyTransfers(res.blocks ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setApplyTransfers([]);
      });

    return () => {
      mounted = false;
    };
  }, [applyTemplate, applyStartDate, applyEndDate]);

  useEffect(() => {
    if (!applyTemplate || !applyStartDate || !applyEndDate || applyStartDate > applyEndDate) {
      setApplyRangeShifts([]);
      setApplyLeaveBlocks([]);
      setApplyContextLoading(false);
      return;
    }

    let mounted = true;
    setApplyContextLoading(true);

    const monthKeys = enumerateMonthsInRange(applyStartDate, applyEndDate);
    Promise.all([
      Promise.all(monthKeys.map((month) => listShifts({ month, store_id: applyTemplate.storeId }))),
      getLeaveBlocks(applyStartDate, applyEndDate),
    ])
      .then(([shiftBuckets, leaveBlocks]) => {
        if (!mounted) return;
        const mergedShifts = shiftBuckets
          .flatMap((bucket) => bucket.shifts)
          .filter((shift) => {
            const dateOnly = shift.date.split('T')[0];
            return dateOnly >= applyStartDate && dateOnly <= applyEndDate;
          });

        setApplyRangeShifts(mergedShifts);
        setApplyLeaveBlocks(leaveBlocks);
      })
      .catch(() => {
        if (!mounted) return;
        setApplyRangeShifts([]);
        setApplyLeaveBlocks([]);
      })
      .finally(() => {
        if (!mounted) return;
        setApplyContextLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [applyTemplate, applyStartDate, applyEndDate]);

  const applyContextByEmployee = useMemo(() => {
    const result = new Map<number, {
      shiftCount: number;
      offDayDates: number;
      vacationDays: number;
      sickDays: number;
      hasPendingLeave: boolean;
    }>();

    for (const emp of applyEmployees) {
      const offDayDates = new Set(
        applyRangeShifts
          .filter((shift) => shift.userId === emp.id && shift.isOffDay)
          .map((shift) => shift.date.split('T')[0]),
      );

      const shiftCount = applyRangeShifts
        .filter((shift) => shift.userId === emp.id && !shift.isOffDay)
        .length;

      let vacationDays = 0;
      let sickDays = 0;
      let hasPendingLeave = false;

      for (const leave of applyLeaveBlocks) {
        if (leave.userId !== emp.id) continue;
        const overlapDays = overlapDaysInclusive(applyStartDate, applyEndDate, leave.startDate, leave.endDate);
        if (overlapDays <= 0) continue;
        if (leave.leaveType === 'vacation') {
          vacationDays += overlapDays;
        } else {
          sickDays += overlapDays;
        }
        if (leave.status !== 'hr_approved') {
          hasPendingLeave = true;
        }
      }

      result.set(emp.id, {
        shiftCount,
        offDayDates: offDayDates.size,
        vacationDays,
        sickDays,
        hasPendingLeave,
      });
    }

    return result;
  }, [applyEmployees, applyRangeShifts, applyLeaveBlocks, applyStartDate, applyEndDate]);

  const activeDOWs = useMemo(() => {
    if (!applyTemplate) return new Set<number>();
    const patterns: ShiftPattern[] = ((applyTemplate.templateData as unknown as TemplateData)?.shifts) ?? [];
    return new Set(patterns.map((p) => p.dayOfWeek));
  }, [applyTemplate]);

  const allDatesInRange = useMemo(() => {
    if (!applyStartDate || !applyEndDate || applyStartDate > applyEndDate) return [];
    return enumerateAllDates(applyStartDate, applyEndDate);
  }, [applyStartDate, applyEndDate]);

  const dateGridSlots = useMemo(() => {
    if (allDatesInRange.length === 0) return [];
    const firstDate = parseIsoDate(allDatesInRange[0]);
    if (!firstDate) return [];
    const startOffset = dayOfWeekMonBased(firstDate);
    const slots: (string | null)[] = [];
    for (let i = 0; i < startOffset; i++) slots.push(null);
    for (const d of allDatesInRange) slots.push(d);
    return slots;
  }, [allDatesInRange]);

  useEffect(() => {
    setApplyEmployeeIds((prev) => prev.filter((id) => applyEmployees.some((emp) => emp.id === id)));
  }, [applyEmployees]);

  useEffect(() => {
    if (applySelectedDates.length > 0 && (applyStartDate || applyEndDate)) {
      setApplySelectedDates((prev) => 
        prev.filter((d) => (applyStartDate ? d >= applyStartDate : true) && (applyEndDate ? d <= applyEndDate : true))
      );
    }
  }, [applyStartDate, applyEndDate]);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!applyTemplate || !applyStartDate || !applyEndDate || applyEmployeeIds.length === 0) return;
    if (applyStartDate > applyEndDate) {
      setError(t('errors.INVALID_DATE_RANGE', t('errors.DEFAULT')));
      return;
    }

    setApplying(true);
    setError(null);
    let created = 0;
    let skipped = 0;
    let skippedOffDay = 0;
    let failed = 0;
    const failureMessages: string[] = [];

    const patterns: ShiftPattern[] =
      ((applyTemplate.templateData as unknown as TemplateData)?.shifts) ?? [];

    for (const pattern of patterns) {
      const timingError = validateShiftPatternTiming(
        pattern,
        t as (k: string, o?: any) => string,
        DAY_LABELS_FULL[pattern.dayOfWeek] ?? `#${pattern.dayOfWeek}`,
      );
      if (timingError) {
        setApplying(false);
        setError(timingError);
        return;
      }
    }

    const patternDates = patterns.map((pattern) => {
      let dates: string[];
      if (applySelectedDates.length > 0) {
        // Use only manually selected dates that match this pattern's DOW
        dates = applySelectedDates.filter((d) => {
          const dobj = parseIsoDate(d);
          return dobj && dayOfWeekMonBased(dobj) === pattern.dayOfWeek;
        });
      } else {
        // Legacy: use entire range
        dates = enumerateDatesForPattern(pattern.dayOfWeek, applyStartDate, applyEndDate);
      }
      return { pattern, dates };
    });

    const applyEmployeeById = new Map(applyEmployees.map((employee) => [employee.id, employee]));

    for (const empId of applyEmployeeIds) {
      const employee = applyEmployeeById.get(empId);
      for (const item of patternDates) {
        for (const dateStr of item.dates) {
          try {
            const breakType = item.pattern.breakType ?? 'fixed';
            const isFlexible = breakType === 'flexible';
            await createShift({
              user_id: empId,
              store_id: applyTemplate.storeId,
              date: dateStr,
              start_time: item.pattern.startTime,
              end_time: item.pattern.endTime,
              break_type: breakType,
              break_start: isFlexible ? null : (item.pattern.breakStart ?? null),
              break_end: isFlexible ? null : (item.pattern.breakEnd ?? null),
              break_minutes: isFlexible ? (item.pattern.breakMinutes ?? null) : null,
              status: 'scheduled',
            });
            created++;
          } catch (err: any) {
            const code: string | undefined = err?.response?.data?.code;
            if (code === 'OVERLAP_CONFLICT') {
              skipped++;
            } else if (code === 'OFF_DAY_ALREADY_MARKED' || code === 'OFF_DAY_SCHEDULE_BLOCKED') {
              skipped++;
              skippedOffDay++;
            } else {
              failed++;
              const backendMessage: string | undefined = err?.response?.data?.error ?? err?.message;
              if (backendMessage) {
                failureMessages.push(`${dateStr}: ${backendMessage}`);
              }
            }
          }
        }
      }
    }

    setApplying(false);
    const parts: string[] = [`✓ ${t('shifts.shiftsCreated', { count: created })}`];
    if (skipped > 0) parts.push(t('shifts.shiftsSkipped', { count: skipped }));
    if (skippedOffDay > 0) {
      parts.push(t('shifts.offDaySkipped', {
        count: skippedOffDay,
        defaultValue: '{{count}} skipped due to off-day markers',
      }));
    }
    if (failed > 0) parts.push(t('shifts.shiftsFailed', { count: failed }));
    setSuccessMsg(parts.join(' · '));
    setTimeout(() => setSuccessMsg(null), 4000);

    if (failureMessages.length > 0) {
      const uniqueMessages = Array.from(new Set(failureMessages));
      setError(uniqueMessages.slice(0, 3).join(' | '));
      return;
    }

    setApplyTemplate(null);
  }

  function toggleEmployee(id: number) {
    setApplyEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  if (!open) return null;

  const enabledCount = dayConfigs.filter((d) => d.enabled).length;

  // ── Wizard Step 2: Day customisation UI ───────────────────────────────────
  const wizard = wizardStep > 0 ? (
    <>
      {/* Wizard backdrop */}
      <div
        onClick={closeWizard}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(13,33,55,0.55)',
          backdropFilter: 'blur(4px)',
          zIndex: 1200,
        }}
      />

      {/* Wizard panel */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: wizardStep === 2 ? 'min(700px, 96vw)' : 'min(460px, 96vw)',
        maxHeight: '90vh',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1201,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.25s ease',
      }}>
        {/* Accent bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            {/* Step pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {[1, 2].map((s) => (
                <div key={s} style={{
                  width: 26, height: 6, borderRadius: 3,
                  background: s <= wizardStep ? 'var(--accent)' : 'var(--border)',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>
              {wizardStep === 1
                ? (editingTemplate
                  ? t('shifts.editTemplate', 'Edit Shift Template')
                  : t('shifts.newTemplate', 'New Shift Template'))
                : t('shifts.customizeDays', 'Customize Days & Times')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {wizardStep === 1
                ? t('shifts.wizardStep1Hint', 'Step 1 of 2 — Name & Location')
                : t('shifts.wizardStep2Hint', 'Step 2 of 2 — Select days and configure shift times')}
            </div>
          </div>
          <button onClick={closeWizard} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1.1rem', color: 'var(--text-muted)', padding: '4px 6px',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {error && (
            <div style={{
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              borderRadius: 8, padding: '9px 12px', marginBottom: 14,
              color: 'var(--danger)', fontSize: 13,
            }}>{error}</div>
          )}

          {/* ── STEP 1 ── */}
          {wizardStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Template Name</label>
                <input
                  type="text"
                  placeholder="e.g. Morning Shift, Weekend Shift…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>Location / Store</label>
                <select
                  value={newStoreId}
                  onChange={(e) => setNewStoreId(e.target.value)}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <option value="">— Select a store —</option>
                  {stores.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.companyName ? `${s.name} (${s.companyName})` : s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {wizardStep === 2 && (
            <div>
              {/* Day selector pills */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  {t('shifts.templateDayToggleTitle', 'Giorni inclusi nel template')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {t('shifts.templateDayToggleHint', 'Seleziona i giorni della settimana coperti da questo template. Il giorno di riposo viene assegnato dinamicamente nel calendario settimanale.')}
                </div>
                <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(74px, 1fr))',
                    gap: 6,
                    minWidth: 560,
                  }}>
                    {DAY_LABELS_FULL.map((label, idx) => {
                      const enabled = dayConfigs[idx].enabled;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          style={{
                            padding: '7px 6px',
                            borderRadius: 10,
                            border: `1.5px solid ${enabled ? 'rgba(15,118,110,0.45)' : 'rgba(148,163,184,0.45)'}`,
                            background: enabled ? 'rgba(20,184,166,0.12)' : 'rgba(248,250,252,0.9)',
                            color: enabled ? '#0f766e' : '#64748b',
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            fontFamily: 'var(--font-body)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {enabledCount === 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('shifts.templateDayRequired', 'Please set at least one working day.')}
                  </div>
                )}
              </div>

              {/* Global time applicator (only if ≥2 days selected) */}
              {enabledCount >= 2 && (
                <div style={{
                  background: 'rgba(201,151,58,0.07)',
                  border: '1px dashed var(--accent)',
                  borderRadius: 10, padding: '12px 14px', marginBottom: 18,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                    ⚡ Apply to All Selected Days
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    {[
                      { field: 'startTime' as const, label: 'Shift Start', inputType: 'time' as const },
                      { field: 'endTime' as const, label: 'Shift End', inputType: 'time' as const },
                    ].map(({ field, label, inputType }) => (
                      <div key={field}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                        <input
                          type={inputType}
                          onChange={(e) => applyGlobalToAll(field, e.target.value)}
                          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Break Type</div>
                    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                      {(['none', 'flexible', 'fixed'] as const).map((bt) => (
                        <button
                          key={bt}
                          type="button"
                          onClick={() => setDayConfigs((prev) => prev.map((d) => {
                            if (!d.enabled) return d;
                            return {
                              ...d,
                              breakType: bt,
                              breakStart: bt === 'fixed' ? d.breakStart : '',
                              breakEnd: bt === 'fixed' ? d.breakEnd : '',
                              breakMinutes: bt === 'flexible' ? d.breakMinutes : '',
                            };
                          }))}
                          style={{
                            border: 'none',
                            background: breakTone(bt, false).background,
                            color: breakTone(bt, false).color,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '5px 10px',
                            cursor: 'pointer',
                            borderRight: '1px solid var(--border-light)',
                          }}
                        >
                          {bt === 'none'
                            ? t('shifts.form.breakType_none', 'Nessuna pausa')
                            : bt === 'flexible'
                              ? t('shifts.form.breakType_flexible', 'Flessibile')
                              : t('shifts.form.breakType_fixed', 'Fissa')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { field: 'breakStart' as const, label: 'Break Start', inputType: 'time' as const },
                      { field: 'breakEnd' as const, label: 'Break End', inputType: 'time' as const },
                    ].map(({ field, label, inputType }) => (
                      <div key={field}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                        <input
                          type={inputType}
                          onChange={(e) => applyGlobalToAll(field, e.target.value)}
                          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                        />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Break (min)</div>
                      <input
                        type="number"
                        min={1}
                        max={480}
                        onChange={(e) => {
                          setDayConfigs((prev) => prev.map((d) =>
                            d.enabled ? { ...d, breakType: 'flexible', breakStart: '', breakEnd: '', breakMinutes: e.target.value } : d
                          ));
                        }}
                        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Per-day rows */}
              {enabledCount > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
                    Configure Each Day
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dayConfigs.map((d, idx) => {
                      if (!d.enabled) return null;
                      return (
                        <div key={idx} style={{
                          background: 'var(--surface-warm)',
                          border: '1.5px solid var(--accent)',
                          borderRadius: 10, padding: '12px 14px',
                        }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 10,
                            gap: 8,
                          }}>
                            <div style={{
                              fontWeight: 700, fontSize: 13,
                              color: 'var(--primary)', fontFamily: 'var(--font-display)',
                            }}>
                              {DAY_LABELS_FULL[idx]}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                                {(['none', 'flexible', 'fixed'] as const).map((bt) => (
                                  <button
                                    key={bt}
                                    type="button"
                                    onClick={() => setDayConfigs((prev) => prev.map((day, i) => {
                                      if (i !== idx) return day;
                                      return {
                                        ...day,
                                        breakType: bt,
                                        breakStart: bt === 'fixed' ? day.breakStart : '',
                                        breakEnd: bt === 'fixed' ? day.breakEnd : '',
                                        breakMinutes: bt === 'flexible' ? day.breakMinutes : '',
                                      };
                                    }))}
                                    onMouseEnter={(e) => {
                                      if (d.breakType !== bt) {
                                        e.currentTarget.style.filter = 'brightness(0.98)';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.filter = '';
                                    }}
                                    style={{
                                      ...(function () {
                                        const tone = breakTone(bt, d.breakType === bt);
                                        return {
                                          background: tone.background,
                                          color: tone.color,
                                          borderColor: tone.border,
                                        };
                                      })(),
                                      border: 'none',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: '5px 10px',
                                      cursor: 'pointer',
                                      borderRight: '1px solid var(--border-light)',
                                    }}
                                  >
                                    {bt === 'none'
                                      ? t('shifts.form.breakType_none', 'Nessuna pausa')
                                      : bt === 'flexible'
                                        ? t('shifts.form.breakType_flexible', 'Flessibile')
                                        : t('shifts.form.breakType_fixed', 'Fissa')}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleDay(idx)}
                                title={t('common.delete', 'Delete')}
                                aria-label={t('common.delete', 'Delete')}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 8,
                                  border: '1px solid rgba(185,28,28,0.24)',
                                  background: 'rgba(220,38,38,0.08)',
                                  color: '#991b1b',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <Trash2 size={14} />
                                </button>
                            </div>
                          </div>

                          {/* Day operating hours info */}
                          {newStoreId && (
                            <div style={{ marginBottom: 10 }}>
                              {templateOperatingHours.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', padding: '6px 10px', borderRadius: 8 }}>
                                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                  <span>{t('shifts.template.hoursNotConfigured', 'Store operating hours not configured')}</span>
                                </div>
                              ) : (
                                (function() {
                                  const dayHours = templateOperatingHours.find(h => h.dayOfWeek === idx);
                                  if (!dayHours) return null;
                                  const isOutside = isTemplateDayOutside(idx, d.startTime, d.endTime);
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {dayHours.isClosed ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', padding: '6px 10px', borderRadius: 8 }}>
                                          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                          <span>{t('shifts.template.storeClosedOnDay', 'Store is closed on this day')}</span>
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8 }}>
                                          <Clock size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                                          <span>
                                            {t('shifts.template.storeHoursOnDay', 'Store hours: {{open}} - {{close}}', { open: dayHours.openTime, close: dayHours.closeTime })}
                                          </span>
                                        </div>
                                      )}
                                      {isOutside && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--danger)', fontWeight: 600, paddingLeft: 4 }}>
                                          <span>{t('shifts.template.outsideOperatingHours', 'Warning: Shift is outside store operating hours')}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: d.breakType === 'none' ? (isMobile ? '1fr' : '1fr 1fr') : d.breakType === 'flexible' ? (isMobile ? '1fr' : '1fr 1fr 1fr') : (isMobile ? '1fr' : '1fr 1fr 1fr 1fr'), gap: 8 }}>
                            <div>
                              <label style={smallLabelStyle}>Shift Start *</label>
                              <input
                                type="time"
                                value={d.startTime}
                                onChange={(e) => updateDay(idx, 'startTime', e.target.value)}
                                required
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                              />
                            </div>
                            <div>
                              <label style={smallLabelStyle}>Shift End *</label>
                              <input
                                type="time"
                                value={d.endTime}
                                onChange={(e) => updateDay(idx, 'endTime', e.target.value)}
                                required
                                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                              />
                            </div>
                            {d.breakType === 'none' ? null : d.breakType === 'flexible' ? (
                              <div>
                                <label style={smallLabelStyle}>{t('shifts.form.breakMinutes', 'Durata pausa (min)')}</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={480}
                                  value={d.breakMinutes}
                                  onChange={(e) => updateDay(idx, 'breakMinutes', e.target.value)}
                                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                                />
                              </div>
                            ) : (
                              <>
                                <div>
                                  <label style={smallLabelStyle}>Break Start</label>
                                  <input
                                    type="time"
                                    value={d.breakStart}
                                    onChange={(e) => updateDay(idx, 'breakStart', e.target.value)}
                                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                                  />
                                </div>
                                <div>
                                  <label style={smallLabelStyle}>Break End</label>
                                  <input
                                    type="time"
                                    value={d.breakEnd}
                                    onChange={(e) => updateDay(idx, 'breakEnd', e.target.value)}
                                    style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 8px' }}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                          {d.breakType === 'flexible' && (
                            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                              {t('shifts.form.breakFlexHint', 'Il dipendente può prendere la pausa in qualsiasi momento del turno, rispettando la durata totale.')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          {wizardStep === 1 ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={closeWizard}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!newName.trim() || !newStoreId}
                onClick={() => { setError(null); setWizardStep(2); }}
              >
                Next →
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => { setError(null); setWizardStep(1); }}>
                ← Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || enabledCount === 0}
                onClick={(e) => handleCreate(e as any)}
              >
                {saving
                  ? 'Saving…'
                  : (editingTemplate
                    ? t('shifts.saveTemplate', 'Save Template')
                    : `✓ Create Template (${enabledCount} day${enabledCount !== 1 ? 's' : ''})`)}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  ) : null;

  const modal = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(13,33,55,0.48)',
          backdropFilter: 'blur(3px)',
          zIndex: 1100,
        }}
      />

      {/* Apply panel (side sheet) */}
      {applyTemplate && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(400px, 95vw)',
          background: 'var(--surface)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1103,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>
                {t('shifts.applyTemplate', 'Apply Template')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{applyTemplate.name}</div>
            </div>
            <button onClick={() => setApplyTemplate(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.1rem', color: 'var(--text-muted)', padding: '4px 6px',
            }}>✕</button>
          </div>

          <form onSubmit={handleApply} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <DatePicker
                  label={t('transfers.form.startDate', 'Start date')}
                  value={applyStartDate}
                  onChange={setApplyStartDate}
                />
                <DatePicker
                  label={t('transfers.form.endDate', 'End date')}
                  value={applyEndDate}
                  onChange={setApplyEndDate}
                />
              </div>
              {applyStartDate && applyEndDate && applyStartDate > applyEndDate && (
                <div style={{
                  marginBottom: 12,
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  color: 'var(--danger)',
                  fontSize: 12,
                }}>
                  {t('errors.INVALID_DATE_RANGE', t('errors.DEFAULT'))}
                </div>
              )}

              {/* Date selection grid */}
              {allDatesInRange.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('shifts.selectSpecificDates', 'Select Specific Dates (Optional)')}</span>
                    {applySelectedDates.length > 0 && (
                      <button type="button" onClick={() => setApplySelectedDates([])} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                        {t('common.clear', 'Clear')}
                      </button>
                    )}
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
                    background: 'var(--surface-warm)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: 8,
                  }}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                      <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 4 }}>{day}</div>
                    ))}
                    {dateGridSlots.map((dateStr, i) => {
                      if (!dateStr) return <div key={`empty-${i}`} />;
                      const isSelected = applySelectedDates.includes(dateStr);
                      const dateObj = parseIsoDate(dateStr)!;
                      const dow = dayOfWeekMonBased(dateObj);
                      const isActiveInTemplate = activeDOWs.has(dow);
                      const dayNum = dateStr.split('-')[2];

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => {
                            setApplySelectedDates((prev) =>
                              prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
                            );
                          }}
                          style={{
                            aspectRatio: '1',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 8,
                            border: 'none',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.12s',
                            background: isSelected ? 'var(--accent)' : 'rgba(148,163,184,0.08)',
                            color: isSelected ? '#fff' : isActiveInTemplate ? 'var(--text-primary)' : 'var(--text-muted)',
                            opacity: isActiveInTemplate ? 1 : 0.5,
                          }}
                        >
                          {dayNum}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} /> {t('common.selected', 'Selected')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(148,163,184,0.3)' }} /> {t('shifts.inTemplate', 'In Template')}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {t('shifts.applyEmployees', 'Employees')}
                  {filteredApplyEmployees.length > 0 && (
                    <button type="button" onClick={() =>
                      setApplyEmployeeIds((prev) => {
                        const visibleIds = filteredApplyEmployees.map((employee) => employee.id);
                        if (allFilteredSelected) {
                          return prev.filter((id) => !visibleIds.includes(id));
                        }
                        const merged = new Set(prev);
                        for (const id of visibleIds) merged.add(id);
                        return Array.from(merged);
                      })
                    } style={{
                      marginLeft: 10, fontSize: 11, background: 'none', border: 'none',
                      color: 'var(--accent)', cursor: 'pointer', fontWeight: 600,
                    }}>
                      {allFilteredSelected ? t('common.none', 'None') : t('common.all', 'All')}
                    </button>
                  )}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <input
                    type="text"
                    value={applyEmployeeSearch}
                    onChange={(event) => setApplyEmployeeSearch(event.target.value)}
                    placeholder={t('common.search', 'Search')}
                    style={{
                      ...inputStyle,
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 12,
                      padding: '7px 9px',
                    }}
                  />
                </div>
                {!employeesLoading && applyContextLoading && (
                  <div style={{
                    marginBottom: 8,
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    background: 'rgba(148,163,184,0.12)',
                    border: '1px solid rgba(148,163,184,0.28)',
                    borderRadius: 8,
                    padding: '6px 8px',
                  }}>
                    {t('shifts.applyingContextLoading', 'Loading off-day and leave context for selected dates...')}
                  </div>
                )}
                {employeesLoading ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading', 'Loading...')}</p>
                ) : filteredApplyEmployees.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.noData', 'No data available')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredApplyEmployees.map((emp) => {
                      const selected = applyEmployeeIds.includes(emp.id);
                      const fullName = `${emp.name} ${emp.surname}`.trim();
                      const initials = `${emp.name?.[0] ?? ''}${emp.surname?.[0] ?? ''}`.toUpperCase() || 'U';
                      const avatarUrl = getAvatarUrl(emp.avatarFilename);
                      const transfer = emp.transferForApply ?? null;
                      const isTransferred = Boolean(emp.isTransferredForApply);
                      const homeStoreName = transfer?.originStoreName ?? emp.storeName;
                      const context = applyContextByEmployee.get(emp.id);
                      const shiftCount = context?.shiftCount ?? 0;
                      const offDayDates = context?.offDayDates ?? 0;
                      const vacationDays = context?.vacationDays ?? 0;
                      const sickDays = context?.sickDays ?? 0;
                      const hasPendingLeave = Boolean(context?.hasPendingLeave);
                      const roleLabel = (emp.role ?? 'employee').replace(/_/g, ' ');
                      return (
                        <label key={emp.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '8px 10px', borderRadius: 8,
                          border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'rgba(201,151,58,0.06)' : 'var(--surface-warm)',
                          cursor: 'pointer',
                          transition: 'all 0.12s',
                        }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleEmployee(emp.id)}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14, marginTop: 6 }}
                          />
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
                          <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {fullName}
                                </div>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  border: '1px solid rgba(100,116,139,0.35)',
                                  background: 'rgba(241,245,249,0.9)',
                                  color: '#475569',
                                  fontSize: 9,
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  lineHeight: 1.3,
                                  flexShrink: 0,
                                }}>
                                  {roleLabel}
                                </span>
                                {isTransferred && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '1px 6px',
                                    borderRadius: 999,
                                    border: '1px solid rgba(15,118,110,0.32)',
                                    background: 'rgba(13,148,136,0.08)',
                                    color: '#0f766e',
                                    fontSize: 9,
                                    fontWeight: 800,
                                    flexShrink: 0,
                                    textTransform: 'uppercase',
                                    lineHeight: 1.3,
                                  }}>
                                    <ArrowLeftRight size={10} />
                                    {t('shifts.transferredEmployee', 'Transferred')}
                                  </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {homeStoreName && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 7px',
                                  borderRadius: 999,
                                  background: 'rgba(13,33,55,0.06)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-muted)',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  lineHeight: 1.2,
                                }}>
                                  <StoreIcon size={10} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }} title={homeStoreName}>
                                    {homeStoreName}
                                  </span>
                                </span>
                              )}
                              {transfer && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 7px',
                                  borderRadius: 999,
                                  background: transfer.status === 'cancelled' ? 'rgba(239,68,68,0.08)' : 'rgba(13,148,136,0.1)',
                                  border: `1px solid ${transfer.status === 'cancelled' ? 'rgba(185,28,28,0.32)' : 'rgba(15,118,110,0.32)'}`,
                                  color: transfer.status === 'cancelled' ? '#991b1b' : '#0f766e',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  lineHeight: 1.2,
                                }}>
                                  <ArrowLeftRight size={10} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }} title={transfer.targetStoreName}>
                                    {transfer.targetStoreName}
                                  </span>
                                  <span style={{ textTransform: 'uppercase', fontSize: 9 }}>
                                    {t(`transfers.status.${transfer.status}`, transfer.status)}
                                  </span>
                                </span>
                              )}
                            </div>
                            {!applyContextLoading && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 7px 2px 6px',
                                  borderRadius: 999,
                                  borderLeft: '3px solid rgba(13,33,55,0.52)',
                                  borderTop: '1px solid rgba(13,33,55,0.22)',
                                  borderRight: '1px solid rgba(13,33,55,0.22)',
                                  borderBottom: '1px solid rgba(13,33,55,0.22)',
                                  background: 'rgba(13,33,55,0.06)',
                                  color: '#0f172a',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  lineHeight: 1.2,
                                }}>
                                  <PlayCircle size={10} />
                                  {t('shifts.shifts', 'Shifts')} · {shiftCount}
                                </span>
                                {offDayDates > 0 && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 7px 2px 6px',
                                    borderRadius: 999,
                                    borderLeft: '3px solid rgba(100,116,139,0.65)',
                                    borderTop: '1px solid rgba(148,163,184,0.38)',
                                    borderRight: '1px solid rgba(148,163,184,0.38)',
                                    borderBottom: '1px solid rgba(148,163,184,0.38)',
                                    background: 'rgba(241,245,249,0.9)',
                                    color: '#475569',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                  }}>
                                    <Moon size={10} />
                                    {t('shifts.form.offDay', 'Off day')} · {offDayDates}
                                  </span>
                                )}
                                {vacationDays > 0 && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 7px 2px 6px',
                                    borderRadius: 999,
                                    borderLeft: '3px solid rgba(37,99,235,0.58)',
                                    borderTop: '1px solid rgba(37,99,235,0.24)',
                                    borderRight: '1px solid rgba(37,99,235,0.24)',
                                    borderBottom: '1px solid rgba(37,99,235,0.24)',
                                    background: 'rgba(219,234,254,0.85)',
                                    color: '#1e40af',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                  }}>
                                    <Palmtree size={10} />
                                    {t('leave.type_vacation', 'Vacation')} · {vacationDays}
                                  </span>
                                )}
                                {sickDays > 0 && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 7px 2px 6px',
                                    borderRadius: 999,
                                    borderLeft: '3px solid rgba(234,88,12,0.55)',
                                    borderTop: '1px solid rgba(234,88,12,0.25)',
                                    borderRight: '1px solid rgba(234,88,12,0.25)',
                                    borderBottom: '1px solid rgba(234,88,12,0.25)',
                                    background: 'rgba(255,237,213,0.85)',
                                    color: '#9a3412',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                  }}>
                                    <Thermometer size={10} />
                                    {t('leave.type_sick', 'Sick')} · {sickDays}
                                    {hasPendingLeave && (
                                      <span style={{
                                        fontSize: 9,
                                        padding: '1px 4px',
                                        borderRadius: 4,
                                        border: '1px dashed rgba(234,88,12,0.35)',
                                        background: 'rgba(255,255,255,0.65)',
                                      }}>
                                        {t('leave.pending_short', 'pending')}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setApplyTemplate(null)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={applying || !applyStartDate || !applyEndDate || applyStartDate > applyEndDate || applyEmployeeIds.length === 0}
              >
                {applying ? t('common.saving', '...') : t('shifts.applyBtn', 'Apply')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(560px, 95vw)',
        maxHeight: '82vh',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1101,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Gold accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--primary)', margin: 0 }}>
            {t('shifts.templatesTitle', 'Shift Templates')}
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1.1rem', color: 'var(--text-muted)', padding: '4px 6px',
          }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {successMsg && (
            <div style={{
              background: 'rgba(30,130,76,0.08)', border: '1px solid rgba(30,130,76,0.3)',
              borderRadius: 8, padding: '9px 12px', marginBottom: 14,
              color: '#1B6B3A', fontSize: 13,
            }}>{successMsg}</div>
          )}
          {error && !wizardStep && (
            <div style={{
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              borderRadius: 8, padding: '9px 12px', marginBottom: 14,
              color: 'var(--danger)', fontSize: 13,
            }}>{error}</div>
          )}

          {/* Create new template button */}
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openWizard}
              style={{
                width: '100%', padding: '12px',
                fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                borderRadius: 10,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
              {t('shifts.newTemplate', 'Create New Shift Template')}
            </button>
          </div>

          {/* Store Filter for management roles */}
          {isManagementRole && stores.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>{t('shifts.filterByStore', 'Filter by Store')}</label>
              <CustomSelect
                value={storeFilter ? String(storeFilter) : ''}
                onChange={(val) => setStoreFilter(val ? Number(val) : null)}
                placeholder={t('shifts.allStores', 'All Stores')}
                options={[
                  { 
                    value: '', 
                    label: t('shifts.allStores', 'All Stores'),
                    render: (
                      <span style={{ color: '#7a5715', fontWeight: 700 }}>
                        {t('shifts.allStores', 'All Stores')}
                      </span>
                    )
                  },
                  ...stores.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    render: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span style={{ color: '#000', fontWeight: 600 }}>{s.name}</span>
                        {s.companyName && (
                          <span style={{ color: '#7a5715', fontSize: 11, fontWeight: 700, marginLeft: 12 }}>
                            {s.companyName}
                          </span>
                        )}
                      </div>
                    )
                  }))
                ]}
                searchable={true}
                isClearable={true}
                controlMinHeight={38}
              />
            </div>
          )}

          {/* Template list */}
          {loading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('common.loading', 'Loading...')}</p>
          ) : filteredTemplates.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '32px 0',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div>{storeFilter 
                ? t('shifts.noTemplatesForStore', 'No templates for this store.')
                : t('shifts.noTemplates', 'No templates yet. Create your first shift template above!')}</div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredTemplates.map((tmpl) => {
                const patterns: ShiftPattern[] = (tmpl.templateData as unknown as TemplateData)?.shifts ?? [];
                const storeName = tmpl.storeName ?? stores.find((s) => s.id === tmpl.storeId)?.name ?? `#${tmpl.storeId}`;
                const isExpanded = expandedId === tmpl.id;
                return (
                  <li key={tmpl.id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    marginBottom: 10,
                    overflow: 'hidden',
                  }}>
                    {/* Template header row */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '11px 14px',
                      background: 'var(--surface-warm)',
                      gap: 8,
                    }}>
                      {/* Template name row */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        minWidth: 0,
                      }}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : tmpl.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 2, lineHeight: 1,
                            transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 13 }}>{tmpl.name}</div>
                        </div>
                      </div>

                      {/* Store name tag and action buttons row */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        paddingLeft: 26,
                        flexWrap: 'wrap',
                      }}>
                        {/* Store tag and pattern count */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, color: 'var(--text-muted)',
                            background: 'var(--border)', borderRadius: 999, padding: '2px 7px',
                          }}>
                            <StoreIcon size={11} />
                            {storeName}
                          </span>
                          {patterns.length > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {patterns.length} {t('shifts.patterns', 'pattern')}
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}>
                          <button
                            type="button"
                            onClick={() => openApply(tmpl)}
                            style={templateApplyBtnStyle}
                          >
                            <PlayCircle size={13} />
                            {t('shifts.applyBtn', 'Apply')}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditWizard(tmpl)}
                            style={templateIconBtnStyle}
                            title={t('common.edit', 'Edit')}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(tmpl.id)}
                            style={templateDangerIconBtnStyle}
                            title={t('common.delete', 'Delete')}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded: shift pattern table */}
                    {isExpanded && patterns.length > 0 && (
                      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                              <th style={{ textAlign: 'left', padding: '4px 6px' }}>{t('shifts.tableDay', 'Day')}</th>
                              <th style={{ textAlign: 'left', padding: '4px 6px' }}>{t('shifts.tableStart', 'Start')}</th>
                              <th style={{ textAlign: 'left', padding: '4px 6px' }}>{t('shifts.tableEnd', 'End')}</th>
                              <th style={{ textAlign: 'left', padding: '4px 6px' }}>{t('shifts.tableBreak', 'Break')}</th>
                              <th style={{ textAlign: 'left', padding: '4px 6px' }}>{t('common.time', 'Time')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {patterns.map((p, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '5px 6px', fontWeight: 600 }}>{DAY_LABELS_FULL[p.dayOfWeek]}</td>
                                <td style={{ padding: '5px 6px' }}>{p.startTime}</td>
                                <td style={{ padding: '5px 6px' }}>{p.endTime}</td>
                                <td style={{ padding: '5px 6px', color: 'var(--text-muted)' }}>
                                  {(p.breakType ?? 'fixed') === 'flexible'
                                    ? `${p.breakMinutes ?? 0}m (${t('shifts.form.breakType_flexible', 'Flexible break')})`
                                    : (p.breakStart && p.breakEnd ? `${p.breakStart}–${p.breakEnd}` : '—')}
                                </td>
                                <td style={{ padding: '5px 6px', fontWeight: 600, color: 'var(--primary)' }}>
                                  {formatMinutesAsHours(calculatePatternMinutes(p))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
          <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={onClose}>
            {t('common.close', 'Close')}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {createPortal(modal, document.body)}
      {wizardStep > 0 && createPortal(wizard, document.body)}
      <ConfirmModal
        open={confirmDeleteId !== null}
        title={t('shifts.deleteTemplateTitle', 'Delete Template')}
        message={t('shifts.deleteTemplateMsg', "Are you sure you want to delete this template? This action cannot be undone.")}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
        onConfirm={() => confirmDeleteId !== null && doDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmModal
        open={confirmHoursOpen}
        title={t('shifts.modal.confirmOutsideTemplateTitle', 'Template Shifts Outside Operating Hours')}
        message={t('shifts.modal.confirmOutsideTemplateMsg', 'Some shifts in this template are outside the store operating hours. Do you want to proceed?')}
        confirmLabel={t('common.confirm', 'Confirm')}
        cancelLabel={t('common.close', 'Close')}
        variant="warning"
        onConfirm={doSaveTemplate}
        onCancel={() => setConfirmHoursOpen(false)}
      >
        <div style={{
          background: 'var(--surface-warm)',
          border: '1.5px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
          marginTop: 8,
          display: 'grid',
          gap: 10,
          fontSize: 12,
          maxHeight: 180,
          overflowY: 'auto',
          textAlign: 'left'
        }}>
          {templateConflictingDays.map((c) => (
            <div key={c.dayIdx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 6, borderBottom: '1px solid var(--border-light)', paddingBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{c.dayName}</span>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('shifts.modal.selectedShift', 'Selected Shift')}: <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{c.shiftTime}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('shifts.modal.storeOperatingHoursLabel', 'Store Operating Hours')}: <span style={{ fontWeight: 600 }}>{c.storeHours}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ConfirmModal>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

const smallLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
};

const templateApplyBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  border: '1px solid rgba(13,33,55,0.15)',
  background: 'rgba(13,33,55,0.9)',
  color: '#fff',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 700,
  padding: '4px 10px',
  cursor: 'pointer',
};

const templateIconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-secondary)',
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const templateDangerIconBtnStyle: React.CSSProperties = {
  ...templateIconBtnStyle,
  color: '#991b1b',
  borderColor: 'rgba(185,28,28,0.24)',
  background: 'rgba(220,38,38,0.08)',
};
