import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { Shift, CreateShiftPayload, createShift, updateShift, deleteShift, listTemplates, ShiftTemplate } from '../../api/shifts';
import { getEmployees, getEmployee, type EmployeeListParams } from '../../api/employees';
import { getStores, getStoreOperatingHours } from '../../api/stores';
import { getEmployeeTransferSchedule, type TransferAssignment } from '../../api/transfers';
import { getAvatarUrl, getStoreLogoUrl } from '../../api/client';
import { Employee, Store, UserRole, StoreOperatingHour } from '../../types';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { DatePicker } from '../../components/ui/DatePicker';
import { TimePicker } from '../../components/ui/TimePicker';
import { Badge } from '../../components/ui/Badge';
import { Store as StoreIcon, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { getStoreTimezoneTag, resolveStoreTimezone } from '../../utils/timezone';
import { matchesEmployeeName } from '../../utils/employeeName';

interface ShiftPattern {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakType?: 'fixed' | 'flexible';
  breakStart?: string;
  breakEnd?: string;
  breakMinutes?: number;
  notes?: string;
}

interface ShiftDrawerProps {
  open: boolean;
  shift: Shift | null;
  prefillDate?: string;
  prefillUserId?: number;
  onClose: (refreshNeeded: boolean) => void;
}

interface FormState {
  user_id: string;
  store_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_type: 'none' | 'fixed' | 'flexible';
  break_start: string;
  break_end: string;
  break_minutes: string;
  is_split: boolean;
  split_start2: string;
  split_end2: string;
  split_break_type?: 'none' | 'fixed' | 'flexible';
  split_break_start?: string;
  split_break_end?: string;
  split_break_minutes?: string;
  is_off_day: boolean;
  notes: string;
  status: 'scheduled' | 'confirmed' | 'cancelled';
}

interface FormErrors {
  user_id?: string;
  store_id?: string;
  start_time?: string;
  end_time?: string;
  break_start?: string;
  break_end?: string;
  break_minutes?: string;
  split_start2?: string;
  split_end2?: string;
}

function toMins(t: string): number {
  const parts = t.split(':');
  if (parts.length < 2) return NaN;
  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

function normalizeShiftDateForForm(raw: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.split('T')[0];
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const ROLE_BADGE_VARIANT: Record<UserRole, 'accent' | 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  admin: 'accent',
  hr: 'info',
  area_manager: 'success',
  store_manager: 'warning',
  employee: 'neutral',
  store_terminal: 'neutral',
};

const AVATAR_PALETTE = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || 'U').toUpperCase();
}


const EMPTY_FORM: FormState = {
  user_id: '',
  store_id: '',
  date: '',
  start_time: '',
  end_time: '',
  break_type: 'none',
  break_start: '',
  break_end: '',
  break_minutes: '',
  is_split: false,
  split_start2: '',
  split_end2: '',
  is_off_day: false,
  notes: '',
  status: 'scheduled',
};

export default function ShiftDrawer({
  open,
  shift,
  prefillDate,
  prefillUserId,
  onClose,
}: ShiftDrawerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlapConflict, setOverlapConflict] = useState(false);
  /** Approved leave the server flagged on this date; non-null = warning shown, saving again confirms. */
  const [leaveConflict, setLeaveConflict] = useState<{
    leave_type?: string; start_date?: string; end_date?: string;
  } | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // The zone the times on this form are expressed in. Shown only when it differs
  // from the viewer's own, so a manager working away from the shop can tell that
  // 09:00 means 09:00 at the shop and not 09:00 where they are sitting.
  const browserTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
  }, []);
  const shiftStoreTimezone = useMemo(() => {
    const selectedId = form.store_id ? Number(form.store_id) : shift?.storeId;
    return stores.find((st) => st.id === selectedId)?.timezone ?? shift?.timezone ?? null;
  }, [form.store_id, shift, stores]);
  const [activeTransferForDate, setActiveTransferForDate] = useState<TransferAssignment | null>(null);
  const [storeTouchedManually, setStoreTouchedManually] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const employeePickerRef = useRef<HTMLDivElement | null>(null);
  const storePickerRef = useRef<HTMLDivElement | null>(null);
  const isStoreManager = user?.role === 'store_manager';

  const [availablePatterns, setAvailablePatterns] = useState<ShiftPattern[]>([]);
  const [selectedPatternIndex, setSelectedPatternIndex] = useState<string>('');

  const [operatingHours, setOperatingHours] = useState<StoreOperatingHour[]>([]);
  const [loadingHours, setLoadingHours] = useState(false);
  const [confirmHoursOpen, setConfirmHoursOpen] = useState(false);

  const dayLabels = useMemo(
    () => [
      t('stores.dayMonday', 'Monday'),
      t('stores.dayTuesday', 'Tuesday'),
      t('stores.dayWednesday', 'Wednesday'),
      t('stores.dayThursday', 'Thursday'),
      t('stores.dayFriday', 'Friday'),
      t('stores.daySaturday', 'Saturday'),
      t('stores.daySunday', 'Sunday'),
    ],
    [t],
  );

  const storeHoursForSelectedDate = useMemo(() => {
    if (!form.date || !operatingHours || operatingHours.length === 0) {
      return null;
    }
    const parts = form.date.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const dayOfWeek = (dateObj.getDay() + 6) % 7;
    return operatingHours.find((h) => h.dayOfWeek === dayOfWeek) ?? null;
  }, [form.date, operatingHours]);

  const hasConflict = useMemo(() => {
    if (form.is_off_day) return false;
    if (!storeHoursForSelectedDate) return false;
    if (storeHoursForSelectedDate.isClosed) return true;

    const openMins = toMins(storeHoursForSelectedDate.openTime || '');
    const closeMins = toMins(storeHoursForSelectedDate.closeTime || '');
    if (isNaN(openMins) || isNaN(closeMins)) return false;

    const checkIntervalOutside = (startStr: string, endStr: string) => {
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

    const mainOutside = checkIntervalOutside(form.start_time, form.end_time);
    if (mainOutside) return true;

    if (form.is_split) {
      const splitOutside = checkIntervalOutside(form.split_start2, form.split_end2);
      if (splitOutside) return true;
    }

    return false;
  }, [form.is_off_day, form.start_time, form.end_time, form.is_split, form.split_start2, form.split_end2, storeHoursForSelectedDate]);

  const getPatternKey = (p: {
    startTime: string;
    endTime: string;
    breakType?: string | null;
    breakStart?: string | null;
    breakEnd?: string | null;
    breakMinutes?: number | string | null;
  }) => {
    const t5 = (t: string | null | undefined) => (t ?? '').slice(0, 5);
    const bt = p.breakType === 'flexible' ? 'flexible' : (p.breakStart || p.breakEnd) ? 'fixed' : 'none';
    const bs = bt === 'fixed' ? t5(p.breakStart) : '';
    const be = bt === 'fixed' ? t5(p.breakEnd) : '';
    const bm = bt === 'flexible' ? String(p.breakMinutes ?? '') : '';
    return `${t5(p.startTime)}|${t5(p.endTime)}|${bt}|${bs}|${be}|${bm}`;
  };

  const getPatternLabel = (p: ShiftPattern, t: any) => {
    const t5 = (time: string) => time.slice(0, 5);
    const bt = p.breakType === 'flexible' ? 'flexible' : (p.breakStart || p.breakEnd) ? 'fixed' : 'none';
    let breakLabel = '';
    if (bt === 'flexible') {
      breakLabel = `, ${t('shifts.form.breakType_flexible', 'Pausa flessibile')}: ${p.breakMinutes} min`;
    } else if (bt === 'fixed') {
      breakLabel = `, ${t('shifts.form.breakType_fixed', 'Pausa fissa')}: ${t5(p.breakStart!)} - ${t5(p.breakEnd!)}`;
    } else {
      breakLabel = `, ${t('shifts.form.breakType_none', 'Nessuna pausa')}`;
    }
    return `${t5(p.startTime)} - ${t5(p.endTime)}${breakLabel}`;
  };

  const handlePatternChange = (key: string) => {
    setSelectedPatternIndex(key);
    if (!key) {
      setForm(prev => ({
        ...prev,
        start_time: '',
        end_time: '',
        break_type: 'none',
        break_start: '',
        break_end: '',
        break_minutes: '',
      }));
      return;
    }
    const found = availablePatterns.find(p => getPatternKey(p) === key);
    if (found) {
      const t5 = (t: string | null | undefined) => (t ?? '').slice(0, 5);
      const bt = found.breakType === 'flexible' ? 'flexible' : (found.breakStart || found.breakEnd) ? 'fixed' : 'none';
      setForm(prev => ({
        ...prev,
        start_time: t5(found.startTime),
        end_time: t5(found.endTime),
        break_type: bt,
        break_start: bt === 'fixed' ? t5(found.breakStart) : '',
        break_end: bt === 'fixed' ? t5(found.breakEnd) : '',
        break_minutes: bt === 'flexible' && found.breakMinutes != null ? String(found.breakMinutes) : '',
      }));
    }
  };

  const selectedEmployee = employees.find((emp) => emp.id === Number(form.user_id));
  const selectedEmployeeFullName = selectedEmployee ? `${selectedEmployee.name} ${selectedEmployee.surname}`.trim() : '';
  const selectedStoreIdNum = form.store_id ? Number(form.store_id) : null;
  const selectedStore = stores.find((store) => String(store.id) === form.store_id) ?? null;
  const shiftEmployeeName = shift ? `${shift.userName} ${shift.userSurname}`.trim() : '';
  const shiftEmployeeAvatarUrl = shift?.userAvatarFilename ? getAvatarUrl(shift.userAvatarFilename) : null;
  const showEmployeeFallback = !selectedEmployee && Boolean(shiftEmployeeName);
  const shiftStoreName = shift?.storeName?.trim() ?? '';
  const showStoreFallback = !selectedStore && Boolean(shiftStoreName);
  const expectedStoreId = activeTransferForDate?.targetStoreId ?? selectedEmployee?.storeId ?? null;
  const expectedStoreName = activeTransferForDate?.targetStoreName
    ?? selectedEmployee?.storeName
    ?? (selectedEmployee?.storeId ? stores.find((s) => s.id === selectedEmployee.storeId)?.name : null)
    ?? null;
  const storeSelectionMismatch = expectedStoreId != null && selectedStoreIdNum != null && selectedStoreIdNum !== expectedStoreId;

  const filteredEmployees = React.useMemo(() => {
    let list = employees;
    if (form.store_id) {
      list = list.filter((emp) => {
        if (String(emp.id) === form.user_id) return true;
        return String(emp.storeId) === form.store_id;
      });
    }
    const normalizedEmployeeQuery = employeeQuery.trim().toLowerCase();
    if (normalizedEmployeeQuery) {
      return list.filter((emp) => {
        return (
          // Matches either name order; the row itself still renders name-first.
          matchesEmployeeName(emp, normalizedEmployeeQuery)
          || emp.email.toLowerCase().includes(normalizedEmployeeQuery)
          || emp.role.toLowerCase().includes(normalizedEmployeeQuery)
        );
      });
    }
    return list;
  }, [employees, employeeQuery, form.store_id, form.user_id]);

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

    const unique = Array.from(new Map(all.map((emp) => [emp.id, emp])).values());
    return unique.sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`));
  }

  async function loadAllShiftEmployees(): Promise<Employee[]> {
    const [shiftPlanningEmployees, allActiveEmployees] = await Promise.all([
      loadEmployeesByPages({ status: 'active', forShiftPlanning: true, excludeAdmins: true }),
      loadEmployeesByPages({ status: 'active', excludeAdmins: true }),
    ]);

    const merged = new Map<number, Employee>();
    for (const emp of [...shiftPlanningEmployees, ...allActiveEmployees]) {
      merged.set(emp.id, emp);
    }

    let mergedList = Array.from(merged.values()).sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`));
    if (isStoreManager && user?.storeId) {
      mergedList = mergedList.filter((emp) => emp.storeId != null && String(emp.storeId) === String(user.storeId));
    }
    return mergedList;
  }

  function validateForm(f: FormState): FormErrors {
    const errs: FormErrors = {};

    // Required employee and store.
    // In tests we stub employee/store lookups to empty arrays; in that case we
    // should not block "time validity" flows on missing dropdown values.
    if (employees.length > 0) {
      if (!f.user_id || isNaN(parseInt(f.user_id, 10))) {
        errs.user_id = t('shifts.validation.employeeRequired');
      }
    }
    if (stores.length > 0) {
      if (!f.store_id || isNaN(parseInt(f.store_id, 10))) {
        errs.store_id = t('shifts.validation.storeRequired');
      }
    }

    if (f.is_off_day) {
      return errs;
    }

    // Required time fields
    if (!f.start_time) errs.start_time = t('shifts.validation.startRequired');
    if (!f.end_time) errs.end_time = t('shifts.validation.endRequired');

    // end > start
    if (f.start_time && f.end_time && toMins(f.end_time) <= toMins(f.start_time)) {
      errs.end_time = t('shifts.validation.endAfterStart');
    }

    if (f.break_type === 'flexible') {
      // Flexible break: validate break_minutes
      const mins = parseInt(f.break_minutes, 10);
      if (f.break_minutes && (isNaN(mins) || mins <= 0 || mins > 480)) {
        errs.break_minutes = t('shifts.validation.breakMinutesInvalid');
      }
    } else if (f.break_type === 'fixed') {
      // Fixed break: both or neither
      const hasBS = f.break_start.length > 0;
      const hasBE = f.break_end.length > 0;
      if (hasBS && !hasBE) errs.break_end = t('shifts.validation.breakBothRequired');
      if (!hasBS && hasBE) errs.break_start = t('shifts.validation.breakBothRequired');

      if (hasBS && hasBE) {
        if (toMins(f.break_end) <= toMins(f.break_start)) {
          errs.break_end = t('shifts.validation.breakEndAfterStart');
        } else if (f.start_time && f.end_time) {
          const sM = toMins(f.start_time);
          const eM = toMins(f.end_time);
          const bsM = toMins(f.break_start);
          const beM = toMins(f.break_end);
          if (bsM < sM || beM > eM) {
            errs.break_start = t('shifts.validation.breakWithinShift');
          }
        }
      }
    }

    // split shift
    if (f.is_split) {
      const hasSS2 = f.split_start2.length > 0;
      const hasSE2 = f.split_end2.length > 0;
      if (!hasSS2) errs.split_start2 = t('shifts.validation.splitBothRequired');
      if (!hasSE2) errs.split_end2 = t('shifts.validation.splitBothRequired');
      if (hasSS2 && hasSE2) {
        const ss2M = toMins(f.split_start2);
        const se2M = toMins(f.split_end2);
        if (se2M <= ss2M) {
          errs.split_end2 = t('shifts.validation.splitEndAfterStart');
        } else if (f.end_time && ss2M < toMins(f.end_time)) {
          errs.split_start2 = t('shifts.validation.splitNoOverlap');
        }
      }
    }

    return errs;
  }

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const targetUserId = shift ? shift.userId : prefillUserId;
    const loadEmployeesPromise = loadAllShiftEmployees().then(async (allEmployees) => {
      if (targetUserId && !allEmployees.some((emp) => emp.id === targetUserId)) {
        try {
          const extraEmp = await getEmployee(targetUserId);
          if (extraEmp) {
            return [...allEmployees, extraEmp].sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`));
          }
        } catch {
          // ignore
        }
      }
      return allEmployees;
    });

    // Load employees and stores for dropdowns
    Promise.all([loadEmployeesPromise, getStores()])
      .then(([allEmployees, storeData]) => {
        if (!mounted) return;
        setEmployees(allEmployees);

        let filteredStores = storeData;
        if (isStoreManager && user?.storeId) {
          filteredStores = storeData.filter((s) => String(s.id) === String(user.storeId));
        }
        setStores(filteredStores);

        // Auto-preselect store and first employee for Store Manager when creating a new shift.
        // Use the *loaded* store id (from filteredStores) rather than user?.storeId so that
        // form.store_id is guaranteed to match an entry in the stores dropdown.
        if (!shift && isStoreManager) {
          const resolvedStoreId = filteredStores.length > 0
            ? String(filteredStores[0].id)
            : String(user?.storeId ?? '');
          if (!prefillUserId && allEmployees.length > 0) {
            const firstEmp = allEmployees[0];
            setForm((prev) => ({
              ...prev,
              user_id: String(firstEmp.id),
              store_id: resolvedStoreId,
            }));
          } else {
            setForm((prev) => ({
              ...prev,
              store_id: resolvedStoreId,
            }));
          }
        }
      })
      .catch(() => {
        if (!mounted) return;
        setEmployees([]);
        setStores([]);
      });

    if (isStoreManager && user?.storeId) {
      listTemplates(user.storeId)
        .then((data) => {
          if (!mounted) return;
          const patternsMap = new Map<string, ShiftPattern>();
          for (const tmpl of data.templates) {
            const patterns = (tmpl.templateData as any)?.shifts ?? [];
            for (const p of patterns) {
              const key = getPatternKey(p);
              patternsMap.set(key, p);
            }
          }
          let patternsList = Array.from(patternsMap.values());
          if (shift && !shift.isOffDay) {
            const shiftPattern: ShiftPattern = {
              dayOfWeek: -1,
              startTime: shift.startTime,
              endTime: shift.endTime,
              breakType: shift.breakType,
              breakStart: shift.breakStart ?? undefined,
              breakEnd: shift.breakEnd ?? undefined,
              breakMinutes: shift.breakMinutes ?? undefined,
            };
            const currentKey = getPatternKey(shiftPattern);
            if (!patternsList.some((p) => getPatternKey(p) === currentKey)) {
              patternsList.push(shiftPattern);
            }
          }
          setAvailablePatterns(patternsList);
        })
        .catch(() => {
          if (!mounted) return;
          setAvailablePatterns([]);
        });
    } else {
      setAvailablePatterns([]);
    }

    if (shift) {
      // API returns HH:MM:SS — slice to HH:MM so TimePicker and backend both accept it
      const t5 = (v: string | null | undefined) => (v ?? '').slice(0, 5);
      const breakMode: FormState['break_type'] = shift.breakType === 'flexible'
        ? 'flexible'
        : (shift.breakStart || shift.breakEnd)
          ? 'fixed'
          : 'none';
      setForm({
        user_id: String(shift.userId),
        store_id: String(shift.storeId),
        date: normalizeShiftDateForForm(shift.date),
        start_time: t5(shift.startTime),
        end_time: t5(shift.endTime),
        break_type: breakMode,
        break_start: t5(shift.breakStart),
        break_end: t5(shift.breakEnd),
        break_minutes: shift.breakMinutes != null ? String(shift.breakMinutes) : '',
        is_split: Boolean(shift.isSplit),
        split_start2: t5(shift.splitStart2),
        split_end2: t5(shift.splitEnd2),
        is_off_day: Boolean(shift.isOffDay),
        notes: shift.notes ?? '',
        status: shift.status,
      });
      if (isStoreManager) {
        setSelectedPatternIndex(getPatternKey({
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakType: shift.breakType,
          breakStart: shift.breakStart,
          breakEnd: shift.breakEnd,
          breakMinutes: shift.breakMinutes,
        }));
      }
    } else {
      setForm({
        ...EMPTY_FORM,
        date: prefillDate ?? '',
        user_id: prefillUserId ? String(prefillUserId) : '',
        store_id: isStoreManager ? String(user?.storeId ?? '') : '',
      });
      setSelectedPatternIndex('');
    }
    setError(null);
    setOverlapConflict(false);
    setFormErrors({});
    setStoreTouchedManually(false);
    setActiveTransferForDate(null);
    setEmployeePickerOpen(false);
    setEmployeeQuery('');
    setStorePickerOpen(false);

    return () => { mounted = false; };
  }, [open, shift, prefillDate, prefillUserId, user?.role, user?.storeId]);

  useEffect(() => {
    if (!open || !form.store_id) {
      setOperatingHours([]);
      return;
    }
    let mounted = true;
    setLoadingHours(true);
    getStoreOperatingHours(Number(form.store_id))
      .then((hours) => {
        if (!mounted) return;
        setOperatingHours(hours || []);
      })
      .catch(() => {
        if (!mounted) return;
        setOperatingHours([]);
      })
      .finally(() => {
        if (mounted) setLoadingHours(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, form.store_id]);

  useEffect(() => {
    if (!open || shift || !form.user_id || !form.date) {
      setActiveTransferForDate(null);
      return;
    }

    let mounted = true;
    getEmployeeTransferSchedule(Number(form.user_id), { date_from: form.date, date_to: form.date })
      .then((data) => {
        if (!mounted) return;
        const active = data.assignments.find(
          (assignment) => assignment.status === 'active' && form.date >= assignment.startDate && form.date <= assignment.endDate,
        ) ?? null;
        setActiveTransferForDate(active);
      })
      .catch(() => {
        if (!mounted) return;
        setActiveTransferForDate(null);
      });

    return () => {
      mounted = false;
    };
  }, [open, shift, form.user_id, form.date]);

  useEffect(() => {
    if (!open || shift || storeTouchedManually || !form.user_id || isStoreManager) return;
    if (expectedStoreId == null) return;
    const expectedStore = String(expectedStoreId);
    if (form.store_id === expectedStore) return;
    setForm((prev) => ({ ...prev, store_id: expectedStore }));
  }, [open, shift, storeTouchedManually, form.user_id, form.store_id, expectedStoreId, isStoreManager]);

  // Lock store selection for Store Manager
  useEffect(() => {
    if (!open || !isStoreManager) return;
    const storeIdStr = user?.storeId ? String(user.storeId) : '';
    if (storeIdStr && form.store_id !== storeIdStr) {
      setForm((prev) => ({ ...prev, store_id: storeIdStr }));
    }
  }, [open, isStoreManager, user?.storeId, form.store_id]);

  useEffect(() => {
    if (!employeePickerOpen && !storePickerOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (employeePickerOpen && employeePickerRef.current && !employeePickerRef.current.contains(target)) {
        setEmployeePickerOpen(false);
      }
      if (storePickerOpen && storePickerRef.current && !storePickerRef.current.contains(target)) {
        setStorePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [employeePickerOpen, storePickerOpen]);

  function selectEmployee(employeeId: string) {
    setStoreTouchedManually(false);
    setActiveTransferForDate(null);
    setForm((prev) => ({ ...prev, user_id: employeeId, store_id: isStoreManager ? String(user?.storeId ?? '') : '' }));
    setEmployeePickerOpen(false);
    setEmployeeQuery('');
    if (formErrors.user_id) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.user_id;
        return next;
      });
    }
  }

  function selectStore(storeId: string) {
    setStoreTouchedManually(true);
    setForm((prev) => ({ ...prev, store_id: storeId }));
    setStorePickerOpen(false);
    if (formErrors.store_id) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.store_id;
        return next;
      });
    }
  }

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : e.target.value;
      if (field === 'user_id') {
        selectEmployee(String(value));
      } else if (field === 'store_id') {
        setStoreTouchedManually(true);
        setForm((prev) => ({ ...prev, store_id: String(value) }));
      } else {
        setForm((prev) => ({ ...prev, [field]: value }));
      }
      if (field in formErrors) {
        setFormErrors((prev) => { const next = { ...prev }; delete next[field as keyof FormErrors]; return next; });
      }
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.date) {
      setError(t('shifts.validation.dateRequired'));
      return;
    }
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    const isOffDay = form.is_off_day;

    // Final safety check to avoid 500 error on backend (casting '' to TIME)
    if (!isOffDay && (!form.start_time || !form.end_time)) {
      setFormErrors({
        start_time: form.start_time ? undefined : t('shifts.validation.startRequired'),
        end_time: form.end_time ? undefined : t('shifts.validation.endRequired'),
      });
      return;
    }

    // Check if shift is outside operating hours
    if (operatingHours.length > 0 && hasConflict) {
      setConfirmHoursOpen(true);
      return;
    }

    await doSave();
  }

  async function doSave() {
    setConfirmHoursOpen(false);
    setFormErrors({});
    setOverlapConflict(false);
    setSaving(true);
    try {
      const isOffDay = form.is_off_day;
      const isFlexible = form.break_type === 'flexible';
      const isNoBreak = form.break_type === 'none';
      const breakTypeOut: 'fixed' | 'flexible' = form.break_type === 'flexible' ? 'flexible' : 'fixed';
      let statusOut: CreateShiftPayload['status'] = form.status;
      if (isOffDay) {
        statusOut = 'cancelled';
      }
      const isNoBreakOut = isNoBreak;
      const isFlexibleOut = breakTypeOut === 'flexible';

      const startTimeOut = isOffDay ? (form.start_time || '00:00') : form.start_time;
      const endTimeOut = isOffDay ? (form.end_time || '00:01') : form.end_time;
      const payload: CreateShiftPayload = {
        user_id: parseInt(form.user_id, 10),
        store_id: parseInt(form.store_id, 10),
        date: form.date,
        start_time: startTimeOut,
        end_time: endTimeOut,
        break_type: breakTypeOut as 'fixed' | 'flexible',
        break_start: (isOffDay || isNoBreakOut || isFlexibleOut) ? null : (form.break_start || null),
        break_end: (isOffDay || isNoBreakOut || isFlexibleOut) ? null : (form.break_end || null),
        break_minutes: (isOffDay || isNoBreakOut) ? null : (isFlexibleOut ? (form.break_minutes ? parseInt(form.break_minutes, 10) : null) : null),
        is_split: isOffDay ? false : form.is_split,
        split_start2: (isOffDay || !form.is_split) ? null : (form.split_start2 || null),
        split_end2: (isOffDay || !form.is_split) ? null : (form.split_end2 || null),
        is_off_day: isOffDay,
        notes: form.notes || null,
        status: statusOut,
      };
      // Once the operator has acknowledged the leave warning, resend the same
      // payload with the override so the server lets it through.
      const outgoing = leaveConflict
        ? { ...payload, confirm_leave_conflict: true }
        : payload;

      if (shift) {
        await updateShift(shift.id, outgoing);
      } else {
        await createShift(outgoing);
      }
      setFormErrors({});
      setLeaveConflict(null);
      onClose(true);
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code;
      if (code === 'OVERLAP_CONFLICT') {
        setOverlapConflict(true);
        setError(null);
      } else if (code === 'LEAVE_CONFLICT') {
        // Not a failure: the shift is allowed, the operator just has to see the
        // clash first. Saving again confirms it.
        setLeaveConflict(err?.response?.data?.details?.leave ?? {});
        setOverlapConflict(false);
        setError(null);
      } else {
        setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!shift) return;
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteShift(shift.id);
      onClose(true);
    } catch (err: any) {
      const code: string | undefined = err?.response?.data?.code;
      setError(code ? t(`errors.${code}`, t('errors.DEFAULT')) : t('errors.DEFAULT'));
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  const panel = (
    <>
      {/* Backdrop */}
      <div
        onClick={() => onClose(false)}
        className="drawer-backdrop"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(13,33,55,0.48)',
          backdropFilter: 'blur(3px)',
          zIndex: 1000,
        }}
      />

      {/* Panel */}
      <div
        className="drawer-panel"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(460px, 100vw)',
          background: 'var(--surface)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Gold accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '1.15rem',
            color: 'var(--primary)', margin: 0,
          }}>
            {shift ? t('shifts.editShift') : t('shifts.newShift')}
          </h2>
          <button
            onClick={() => onClose(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '1.1rem', color: 'var(--text-muted)',
              borderRadius: 6, padding: '4px 6px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            ✕
          </button>
        </div>

        {/* Form — flex column so the footer stays fixed while only the fields scroll */}
        <form onSubmit={handleSave} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {overlapConflict && (
              <div style={{
                background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.35)',
                borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>
                    {t('errors.OVERLAP_CONFLICT')}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                  {t('shifts.overlapHint')}
                </p>
              </div>
            )}

            {leaveConflict && (
              <div style={{
                background: 'rgba(3,105,161,0.08)', border: '1px solid rgba(3,105,161,0.35)',
                borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#0369a1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#075985' }}>
                    {t('shifts.leaveConflictTitle', 'Permesso approvato in questa data')}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#0c4a6e', margin: 0, lineHeight: 1.5 }}>
                  {leaveConflict.start_date && leaveConflict.end_date
                    ? t('shifts.leaveConflictRange', {
                        defaultValue: 'Il dipendente è in permesso dal {{from}} al {{to}} ({{type}}).',
                        from: leaveConflict.start_date,
                        to: leaveConflict.end_date,
                        type: leaveConflict.leave_type === 'sick'
                          ? t('leave.type_sick', 'malattia')
                          : t('leave.type_vacation', 'ferie'),
                      })
                    : t('shifts.leaveConflictGeneric', 'Il dipendente ha un permesso approvato in questa data.')}
                  {' '}
                  {t('shifts.leaveConflictHint', 'Salva di nuovo per creare comunque il turno.')}
                </p>
              </div>
            )}

            {error && (
              <div style={{
                background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16,
                color: 'var(--danger)', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* ─── Employee ───────────────────── */}
            <div style={fieldRow}>
              <label style={fLabel}>{t('shifts.form.employee')}</label>
              <div ref={employeePickerRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => !shift && setEmployeePickerOpen((openState) => !openState)}
                  style={{
                    ...fInput,
                    minHeight: 42,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    cursor: shift ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    background: shift ? 'var(--surface-warm)' : 'var(--surface)',
                    opacity: shift ? 0.8 : 1,
                  }}
                  disabled={Boolean(shift)}
                >
                  {selectedEmployee ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: selectedEmployee.avatarFilename ? 'transparent' : getAvatarColor(selectedEmployeeFullName),
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {selectedEmployee.avatarFilename ? (
                          <img
                            src={getAvatarUrl(selectedEmployee.avatarFilename) ?? ''}
                            alt={selectedEmployeeFullName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : getInitials(selectedEmployeeFullName)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {selectedEmployeeFullName}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {selectedEmployee.email}
                        </div>
                      </div>
                    </div>
                  ) : showEmployeeFallback ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: shiftEmployeeAvatarUrl ? 'transparent' : getAvatarColor(shiftEmployeeName),
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {shiftEmployeeAvatarUrl ? (
                          <img
                            src={shiftEmployeeAvatarUrl}
                            alt={shiftEmployeeName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : getInitials(shiftEmployeeName)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {shiftEmployeeName}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('shifts.form.selectEmployee')}</span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {selectedEmployee && (
                      <Badge variant={ROLE_BADGE_VARIANT[selectedEmployee.role]}>{t(`roles.${selectedEmployee.role}`)}</Badge>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{employeePickerOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {employeePickerOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
                    zIndex: 20,
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: 8, borderBottom: '1px solid var(--border-light)' }}>
                      <input
                        type="text"
                        value={employeeQuery}
                        onChange={(e) => setEmployeeQuery(e.target.value)}
                        placeholder={t('shifts.form.searchEmployee')}
                        style={{
                          ...fInput,
                          padding: '7px 10px',
                          fontSize: 12,
                          minHeight: 'auto',
                        }}
                      />
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {filteredEmployees.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('shifts.form.noEmployeeResults')}
                        </div>
                      ) : filteredEmployees.map((emp) => {
                        const fullName = `${emp.name} ${emp.surname}`.trim();
                        const isSelected = String(emp.id) === form.user_id;
                        const avatarUrl = getAvatarUrl(emp.avatarFilename);
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => selectEmployee(String(emp.id))}
                            style={{
                              width: '100%',
                              border: 'none',
                              borderBottom: '1px solid var(--border-light)',
                              background: isSelected ? 'var(--accent-light)' : 'transparent',
                              padding: '8px 10px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <div style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                background: avatarUrl ? 'transparent' : getAvatarColor(fullName),
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                {avatarUrl ? (
                                  <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : getInitials(fullName)}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13,
                                  color: 'var(--text-primary)',
                                  fontWeight: 600,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {fullName}
                                </div>
                                <div style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {emp.email}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <Badge variant={ROLE_BADGE_VARIANT[emp.role]}>{t(`roles.${emp.role}`)}</Badge>
                              {isSelected && <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700 }}>✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {formErrors.user_id && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{formErrors.user_id}</div>
              )}
            </div>

            {/* ─── Store ──────────────────────── */}
            <div style={fieldRow}>
              <label style={fLabel}>{t('shifts.form.store')}</label>
              <div ref={storePickerRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => {
                    setEmployeePickerOpen(false);
                    setStorePickerOpen((prev) => !prev);
                  }}
                  style={{
                    ...fInput,
                    minHeight: 42,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: selectedStore ? '6px 10px' : '0 12px',
                    textAlign: 'left',
                    cursor: (isStoreManager || stores.length === 0) ? 'not-allowed' : 'pointer',
                    background: 'var(--surface)',
                    opacity: (isStoreManager || stores.length === 0) ? 0.68 : 1,
                  }}
                  disabled={isStoreManager || stores.length === 0}
                >
                  {selectedStore ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <span style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                        background: 'var(--surface-elevated)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: 'var(--text-muted)',
                      }}>
                        {getStoreLogoUrl(selectedStore.logoFilename ?? selectedStore.companyLogoFilename) ? (
                          <img
                            src={getStoreLogoUrl(selectedStore.logoFilename ?? selectedStore.companyLogoFilename) ?? ''}
                            alt={selectedStore.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <StoreIcon size={14} />
                        )}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {selectedStore.name}
                        </span>
                        <span style={{
                          display: 'block',
                          fontSize: 10.5,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          <span>{selectedStore.companyName ?? selectedStore.code}</span>
                          <span style={{ color: '#0f766e', fontWeight: 700 }}>
                            {` · ${selectedStore.employeeCount ?? 0} ${t('employees.employeesLabel', 'Employees')}`}
                          </span>
                        </span>
                      </span>
                      <span
                        title={resolveStoreTimezone(selectedStore.timezone)}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          color: 'var(--text-muted)',
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 6,
                          padding: '2px 6px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {getStoreTimezoneTag(selectedStore.timezone)}
                      </span>
                    </span>
                  ) : showStoreFallback ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <span style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                        background: 'var(--surface-elevated)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: 'var(--text-muted)',
                      }}>
                        <StoreIcon size={14} />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {shiftStoreName}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('shifts.form.selectStore')}</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>▼</span>
                </button>

                {storePickerOpen && stores.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 'calc(100% + 6px)',
                    zIndex: 30,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--surface)',
                    boxShadow: '0 16px 30px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                  }}>
                    <div style={{ maxHeight: 270, overflowY: 'auto' }}>
                      {stores.map((store) => {
                        const selected = form.store_id === String(store.id);
                        const logoUrl = getStoreLogoUrl(store.logoFilename ?? store.companyLogoFilename);
                        return (
                          <button
                            key={store.id}
                            type="button"
                            onClick={() => selectStore(String(store.id))}
                            style={{
                              width: '100%',
                              border: 'none',
                              borderBottom: '1px solid var(--border-light)',
                              background: selected ? 'var(--surface-warm)' : 'var(--surface)',
                              padding: '9px 10px',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: '1px solid var(--border)',
                              overflow: 'hidden',
                              background: 'var(--surface-elevated)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              color: 'var(--text-muted)',
                            }}>
                              {logoUrl ? (
                                <img src={logoUrl} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <StoreIcon size={13} />
                              )}
                            </span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                                {store.name}
                              </span>
                              <span style={{
                                display: 'block',
                                fontSize: 10.5,
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                <span>{store.companyName ?? store.code}</span>
                                <span style={{ color: '#0f766e', fontWeight: 700 }}>
                                  {` · ${store.employeeCount ?? 0} ${t('employees.employeesLabel', 'Employees')}`}
                                </span>
                              </span>
                            </span>
                            {/* The clock this store's shifts are written on, so the times
                                typed below are unambiguous before the store is even chosen. */}
                            <span
                              title={resolveStoreTimezone(store.timezone)}
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                color: 'var(--text-muted)',
                                background: 'var(--surface-elevated)',
                                border: '1px solid var(--border-light)',
                                borderRadius: 6,
                                padding: '2px 6px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {getStoreTimezoneTag(store.timezone)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {form.user_id && expectedStoreId != null && expectedStoreName && !storeSelectionMismatch && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.4 }}>
                  {activeTransferForDate
                    ? t('shifts.storeGuidanceTransfer', {
                      store: expectedStoreName,
                      startDate: activeTransferForDate.startDate,
                      endDate: activeTransferForDate.endDate,
                      defaultValue: 'Default store from active transfer: {{store}} ({{startDate}} - {{endDate}}).',
                    })
                    : t('shifts.storeGuidanceHome', {
                      store: expectedStoreName,
                      defaultValue: 'Default home store: {{store}}.',
                    })}
                </div>
              )}
              {form.user_id && selectedEmployee && selectedEmployee.storeId == null && !activeTransferForDate && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.4 }}>
                  {t('shifts.storeGuidanceNoHome', 'This employee has no home store assigned, you can select any store.')}
                </div>
              )}
              {storeSelectionMismatch && expectedStoreName && (
                <div style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: '#b45309',
                  background: 'rgba(217,119,6,0.08)',
                  border: '1px solid rgba(217,119,6,0.26)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  lineHeight: 1.45,
                }}>
                  {activeTransferForDate
                    ? t('shifts.storeGuidanceTransferMismatch', {
                      store: expectedStoreName,
                      defaultValue: 'For this date the employee is transferred to {{store}}. If you save on another store, the backend will reject the shift.',
                    })
                    : t('shifts.storeGuidanceHomeMismatch', {
                      store: expectedStoreName,
                      defaultValue: 'This employee belongs to {{store}}. If you save on another store, an active transfer is required.',
                    })}
                </div>
              )}
            </div>

            {/* ─── Date ───────────────────────── */}
            <div style={{ ...fieldRow, marginBottom: 20 }}>
              <DatePicker
                label={t('shifts.form.date')}
                value={form.date}
                onChange={(v) => {
                  setStoreTouchedManually(false);
                  setForm((p) => ({ ...p, date: v }));
                }}
                disablePortal={true}
                disabled={Boolean(shift)}
              />
            </div>

            <div style={{ ...fieldRow, marginBottom: 20 }}>
              <label style={fLabel}>{t('shifts.form.dayType', 'Day type')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => {
                      const revertingFromOffDay = prev.is_off_day;
                      const resetPlaceholderTimes = revertingFromOffDay && prev.start_time === '00:00' && prev.end_time === '00:01';
                      return {
                        ...prev,
                        is_off_day: false,
                        start_time: resetPlaceholderTimes ? '' : prev.start_time,
                        end_time: resetPlaceholderTimes ? '' : prev.end_time,
                        status: prev.status === 'cancelled' ? 'scheduled' : prev.status,
                      };
                    });
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: `1.5px solid ${!form.is_off_day ? 'var(--accent)' : 'var(--border)'}`,
                    background: !form.is_off_day ? 'rgba(201,151,58,0.1)' : 'var(--surface)',
                    color: !form.is_off_day ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {t('shifts.form.workingDay', 'Working day')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      is_off_day: true,
                      status: 'cancelled',
                      break_type: 'none',
                      break_start: '',
                      break_end: '',
                      break_minutes: '',
                      is_split: false,
                      split_start2: '',
                      split_end2: '',
                    }));
                    setFormErrors((fe) => {
                      const next = { ...fe };
                      delete next.start_time;
                      delete next.end_time;
                      delete next.break_start;
                      delete next.break_end;
                      delete next.break_minutes;
                      delete next.split_start2;
                      delete next.split_end2;
                      return next;
                    });
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: `1.5px solid ${form.is_off_day ? 'rgba(185,28,28,0.5)' : 'var(--border)'}`,
                    background: form.is_off_day ? 'rgba(239,68,68,0.1)' : 'var(--surface)',
                    color: form.is_off_day ? '#b91c1c' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {t('shifts.form.offDay', 'Off day')}
                </button>
              </div>
              <div style={{ marginTop: 7, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {form.is_off_day
                  ? t('shifts.offDayAutoCancelHint', 'This date will be marked as off-day and any existing working shift for this user/date will be cancelled.')
                  : t('shifts.workingDayHint', 'Configure full shift details for this working day.')}
              </div>
            </div>

            {form.is_off_day && (
              <div style={{
                marginBottom: 20,
                borderRadius: 10,
                border: '1px solid rgba(185,28,28,0.25)',
                background: 'rgba(254,242,242,0.8)',
                padding: '10px 12px',
                color: '#991b1b',
                fontSize: 12,
                lineHeight: 1.55,
              }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  {t('shifts.form.offDay', 'Off day')}
                </strong>
                <span>
                  {t('shifts.offDayExplain', 'A dedicated off-day tag will be shown in the calendar. Switch back to Working day to restore normal shift controls.')}
                </span>
              </div>
            )}

            {!form.is_off_day && (
              <div style={{ marginTop: 20 }}>
                {isStoreManager && (
                  <div style={{ ...fieldRow, marginBottom: 20 }}>
                    <label style={fLabel}>{t('shifts.form.templateShift', 'Turno da template')}</label>
                    <select
                      value={selectedPatternIndex}
                      onChange={(e) => handlePatternChange(e.target.value)}
                      style={{
                        ...fInput,
                        border: formErrors.start_time || formErrors.end_time ? '1.5px solid var(--danger)' : '1.5px solid var(--border)',
                      }}
                    >
                      <option value="">{t('shifts.form.selectTemplateShift', 'Seleziona un turno...')}</option>
                      {availablePatterns.map((p) => {
                        const key = getPatternKey(p);
                        return (
                          <option key={key} value={key}>
                            {getPatternLabel(p, t)}
                          </option>
                        );
                      })}
                    </select>
                    {formErrors.start_time && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                        {formErrors.start_time}
                      </div>
                    )}
                    {availablePatterns.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>
                        {t('shifts.noTemplatesConfigured', 'Nessun turno configurato nei template per questo negozio.')}
                      </div>
                    )}
                  </div>
                )}

                <>
                  {/* ─── Section: Orario ────────────── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t('shifts.sectionOrario')}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  {/* Store operating hours info */}
                  {form.store_id && (
                    <div style={{ marginBottom: 12 }}>
                      {!form.date ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                          <Clock size={14} />
                          <span>{t('shifts.modal.selectDateToViewHours', 'Select a date to view store operating hours')}</span>
                        </div>
                      ) : loadingHours ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>{t('common.loading', 'Loading...')}</span>
                        </div>
                      ) : operatingHours.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', padding: '8px 12px', borderRadius: 8 }}>
                          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                          <span>{t('shifts.template.hoursNotConfigured', 'Store operating hours not configured')}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {storeHoursForSelectedDate ? (
                            storeHoursForSelectedDate.isClosed ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', padding: '8px 12px', borderRadius: 8 }}>
                                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                <span>
                                  {t('shifts.template.storeClosedOnDay', 'Store is closed on this day ({{day}})', { day: dayLabels[storeHoursForSelectedDate.dayOfWeek] })}
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--surface-warm)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8 }}>
                                <Clock size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                                <span>
                                  {t('shifts.template.storeHoursOnDay', 'Store hours on {{day}}: {{open}} - {{close}}', {
                                    day: dayLabels[storeHoursForSelectedDate.dayOfWeek],
                                    open: storeHoursForSelectedDate.openTime,
                                    close: storeHoursForSelectedDate.closeTime
                                  })}
                                </span>
                              </div>
                            )
                          ) : null}
                          
                          {/* Additional warning text if conflict is detected */}
                          {hasConflict && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--danger)', fontWeight: 600, paddingLeft: 4, marginTop: 2 }}>
                              <AlertCircle size={12} style={{ flexShrink: 0 }} />
                              <span>{t('shifts.template.outsideOperatingHours', 'Warning: Shift is outside store operating hours')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Read-only. The shop's clock is what the rota means and what the
                      terminal enforces; it must never feed back into a saved value. */}
                  {shiftStoreTimezone && shiftStoreTimezone !== browserTimezone && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                      fontSize: 12, color: 'var(--text-muted, #6b7280)',
                    }}>
                      <Clock size={13} />
                      <span>{t('shifts.form.storeTimezoneHint', {
                        defaultValue: 'Times are in the store timezone ({{timezone}}).',
                        timezone: shiftStoreTimezone,
                      })}</span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
                    <TimePicker
                      label={t('shifts.form.startTime')}
                      value={form.start_time}
                      onChange={(v) => {
                        setForm((p) => ({ ...p, start_time: v }));
                        setFormErrors((fe) => { const n = { ...fe }; delete n.start_time; return n; });
                      }}
                      error={formErrors.start_time}
                      required
                      disabled={false}
                    />
                    <TimePicker
                      label={t('shifts.form.endTime')}
                      value={form.end_time}
                      onChange={(v) => {
                        setForm((p) => ({ ...p, end_time: v }));
                        setFormErrors((fe) => { const n = { ...fe }; delete n.end_time; return n; });
                      }}
                      error={formErrors.end_time}
                      required
                      disabled={false}
                    />
                  </div>

                  {/* ─── Section: Pausa ─────────────── */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 18, marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                      color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}>
                      {t('shifts.sectionBreak')}
                    </span>
                    <span style={{
                      fontSize: 10, color: 'var(--text-disabled, var(--text-muted))',
                      background: 'var(--surface-warm)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '1px 5px', fontWeight: 500,
                    }}>
                      {t('common.optionalAbbr', 'Opz.')}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {(['none', 'fixed', 'flexible'] as const).map((bt) => {
                      const active = form.break_type === bt;
                      const breakTypeLabel = bt === 'none'
                        ? t('shifts.form.breakType_none', 'No break')
                        : t(`shifts.form.breakType_${bt}`);
                      return (
                        <button
                          key={bt}
                          type="button"
                          onClick={() => {
                            setForm((p) => ({
                              ...p,
                              break_type: bt,
                              break_start: bt === 'fixed' ? p.break_start : '',
                              break_end: bt === 'fixed' ? p.break_end : '',
                              break_minutes: bt === 'flexible' ? p.break_minutes : '',
                            }));
                            setFormErrors((fe) => {
                              const n = { ...fe };
                              delete n.break_start;
                              delete n.break_end;
                              delete n.break_minutes;
                              return n;
                            });
                          }}
                          style={{
                            borderRadius: 10,
                            border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                            background: active ? 'rgba(201,151,58,0.1)' : 'var(--surface)',
                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                            padding: '8px 6px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            lineHeight: 1.25,
                          }}
                          disabled={false}
                        >
                          {breakTypeLabel}
                        </button>
                      );
                    })}
                  </div>

                  {form.break_type === 'flexible' ? (
                    <div style={{ marginBottom: 4 }}>
                      <label style={fLabel}>
                        {t('shifts.form.breakMinutes')}
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>({t('common.optional')})</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="number"
                          min={1}
                          max={480}
                          placeholder="30"
                          value={form.break_minutes}
                          onChange={(e) => {
                            setForm((p) => ({ ...p, break_minutes: e.target.value }));
                            setFormErrors((fe) => { const n = { ...fe }; delete n.break_minutes; return n; });
                          }}
                          onFocus={focusHandler}
                          onBlur={blurHandler}
                          style={{ ...fInput, width: 100 }}
                          disabled={false}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('shifts.form.breakMinutesUnit')}</span>
                      </div>
                      {formErrors.break_minutes && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{formErrors.break_minutes}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                        {t('shifts.form.breakFlexHint')}
                      </div>
                    </div>
                  ) : form.break_type === 'fixed' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
                      <TimePicker
                        label={t('shifts.form.breakStart')}
                        value={form.break_start}
                        onChange={(v) => {
                          setForm((p) => ({ ...p, break_start: v }));
                          setFormErrors((fe) => { const n = { ...fe }; delete n.break_start; return n; });
                        }}
                        error={formErrors.break_start}
                        disabled={false}
                      />
                      <TimePicker
                        label={t('shifts.form.breakEnd')}
                        value={form.break_end}
                        onChange={(v) => {
                          setForm((p) => ({ ...p, break_end: v }));
                          setFormErrors((fe) => { const n = { ...fe }; delete n.break_end; return n; });
                        }}
                        error={formErrors.break_end}
                        disabled={false}
                      />
                    </div>
                  ) : (
                    <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                      {t('shifts.form.breakNoneHint', 'No break will be assigned to this shift.')}
                    </div>
                  )}

                  {/* ─── Section: Turno spezzato ─────── */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 18, marginBottom: 12,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                      color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}>
                      {t('shifts.sectionSplit')}
                    </span>
                    <span style={{
                      fontSize: 10, color: 'var(--text-disabled, var(--text-muted))',
                      background: 'var(--surface-warm)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '1px 5px', fontWeight: 500,
                    }}>
                      {t('common.optionalAbbr', 'Opz.')}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  <div
                    role="switch"
                    aria-checked={form.is_split}
                    tabIndex={0}
                    onClick={() => {
                      const next = !form.is_split;
                      setForm((prev) => ({ ...prev, is_split: next }));
                      if (!next) {
                        setFormErrors((fe) => { const n = { ...fe }; delete n.split_start2; delete n.split_end2; return n; });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        const next = !form.is_split;
                        setForm((prev) => ({ ...prev, is_split: next }));
                        if (!next) {
                          setFormErrors((fe) => { const n = { ...fe }; delete n.split_start2; delete n.split_end2; return n; });
                        }
                      }
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.is_split ? 12 : 20, outline: 'none', userSelect: 'none', opacity: 1 }}
                  >
                    <div
                      style={{
                        position: 'relative', width: 38, height: 22,
                        background: form.is_split ? 'var(--accent)' : 'var(--border)',
                        borderRadius: 11, transition: 'background 0.2s', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: form.is_split ? 19 : 3,
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: form.is_split ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        {form.is_split ? t('shifts.form.splitEnabled') : t('shifts.form.splitDisabled')}
                      </span>
                      {!form.is_split && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          {t('shifts.form.splitHint')}
                        </div>
                      )}
                    </div>
                  </div>

                  {form.is_split && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <TimePicker
                          label={t('shifts.form.splitStart2')}
                          value={form.split_start2}
                          onChange={(v) => {
                            setForm((p) => ({ ...p, split_start2: v }));
                            setFormErrors((fe) => { const n = { ...fe }; delete n.split_start2; return n; });
                          }}
                          error={formErrors.split_start2}
                          disabled={false}
                        />
                        <TimePicker
                          label={t('shifts.form.splitEnd2')}
                          value={form.split_end2}
                          onChange={(v) => {
                            setForm((p) => ({ ...p, split_end2: v }));
                            setFormErrors((fe) => { const n = { ...fe }; delete n.split_end2; return n; });
                          }}
                          error={formErrors.split_end2}
                          disabled={false}
                        />
                      </div>

                      {/* Second Segment Break */}
                      <div style={{ background: 'var(--background)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          ☕ {t('shifts.form.splitBreakTitle', 'Pausa (Secondo Segmento)')}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          {(['none', 'fixed', 'flexible'] as const).map((bt) => (
                            <button
                              key={bt}
                              type="button"
                              onClick={() => setForm((p) => ({ ...p, split_break_type: bt }))}
                              style={{
                                flex: 1, padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                border: (form.split_break_type || 'none') === bt ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: (form.split_break_type || 'none') === bt ? 'rgba(201,151,58,0.12)' : 'var(--surface)',
                                color: (form.split_break_type || 'none') === bt ? 'var(--accent)' : 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              {bt === 'none' ? t('shifts.form.breakType_none', 'No break') : bt === 'fixed' ? t('shifts.form.breakType_fixed', 'Fixed break') : t('shifts.form.breakType_flexible', 'Flexible break')}
                            </button>
                          ))}
                        </div>

                        {form.split_break_type === 'fixed' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <TimePicker
                              label={t('shifts.form.breakStart')}
                              value={form.split_break_start || ''}
                              onChange={(v) => setForm((p) => ({ ...p, split_break_start: v }))}
                            />
                            <TimePicker
                              label={t('shifts.form.breakEnd')}
                              value={form.split_break_end || ''}
                              onChange={(v) => setForm((p) => ({ ...p, split_break_end: v }))}
                            />
                          </div>
                        )}

                        {form.split_break_type === 'flexible' && (
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                              {t('shifts.form.breakMinutes')}
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="240"
                              value={form.split_break_minutes || ''}
                              onChange={(e) => setForm((p) => ({ ...p, split_break_minutes: e.target.value }))}
                              style={{
                                width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                                fontSize: 12, background: 'var(--surface)', color: 'var(--text)',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </>

                {/* ─── Section: Stato ─────────────── */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 18, marginBottom: 12,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                    color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}>
                    {t('shifts.form.status')}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                  {(['scheduled', 'confirmed', 'cancelled'] as const).map((s) => {
                    const active = form.status === s;
                    const color = s === 'confirmed' ? '#16a34a' : s === 'cancelled' ? 'var(--danger)' : 'var(--primary)';
                    const bg = s === 'confirmed' ? 'rgba(22,163,74,0.09)' : s === 'cancelled' ? 'var(--danger-bg)' : 'rgba(13,33,55,0.07)';
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, status: s }))}
                        style={{
                          flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 12,
                          fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                          border: `1.5px solid ${active ? color : 'var(--border)'}`,
                          background: active ? bg : 'transparent',
                          color: active ? color : 'var(--text-muted)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {t(`shifts.status.${s}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── Notes ──────────────────────── */}
            <div style={fieldRow}>
              <label style={fLabel}>
                {t('shifts.form.notes')}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>({t('common.optional')})</span>
              </label>
              <textarea value={form.notes} onChange={set('notes')} rows={3}
                style={{ ...fInput, resize: 'vertical', lineHeight: 1.5 }}
                disabled={false} />
            </div>
          </div>{/* end scrollable fields */}

          {/* Footer — inside the form so type="submit" works correctly */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            {shift && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting}
                style={{ marginRight: 'auto' }}
              >
                {deleting ? t('common.loading') : t('shifts.deleteShift', t('common.delete'))}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => onClose(false)}>
              {t('common.close')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      <ConfirmModal
        open={confirmOpen}
        title={t('shifts.deleteShiftTitle', 'Delete shift')}
        message={t('shifts.deleteShiftMsg', 'Are you sure you want to permanently delete this shift? This action cannot be undone.')}
        confirmLabel={t('shifts.deleteShift', t('common.delete'))}
        cancelLabel={t('common.close')}
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmModal
        open={confirmHoursOpen}
        title={t('shifts.modal.confirmOutsideTitle', 'Shift Outside Operating Hours')}
        message={t('shifts.modal.confirmOutsideMsg', 'You are saving a shift that is outside the store operating hours. Do you want to proceed?')}
        confirmLabel={t('common.confirm', 'Confirm')}
        cancelLabel={t('common.close', 'Close')}
        variant="warning"
        onConfirm={doSave}
        onCancel={() => setConfirmHoursOpen(false)}
      >
        {storeHoursForSelectedDate && (
          <div style={{
            background: 'var(--surface-warm)',
            border: '1.5px solid var(--border)',
            borderRadius: 10,
            padding: '12px 14px',
            marginTop: 8,
            display: 'grid',
            gap: 8,
            fontSize: 12,
            textAlign: 'left'
          }}>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('shifts.modal.selectedShift', 'Selected Shift')}:
              </span>{' '}
              <span style={{ fontWeight: 700, color: 'var(--danger)' }}>
                {form.is_split
                  ? `${form.start_time} - ${form.end_time} · ${form.split_start2} - ${form.split_end2}`
                  : `${form.start_time} - ${form.end_time}`}
              </span>
            </div>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('shifts.modal.storeOperatingHoursLabel', 'Store Operating Hours')}:
              </span>{' '}
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                {storeHoursForSelectedDate.isClosed
                  ? t('stores.dayClosed', 'Closed')
                  : `${storeHoursForSelectedDate.openTime} - ${storeHoursForSelectedDate.closeTime}`}
              </span>
            </div>
          </div>
        )}
      </ConfirmModal>
    </>
  );
}

// ─── Shared style constants ──────────────────────────────────────────────────

const fieldRow: React.CSSProperties = { marginBottom: 16 };

const fLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
  marginBottom: 6,
};

const fInput: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};


function focusHandler(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--accent)';
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-light)';
}
function blurHandler(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = 'var(--border)';
  e.currentTarget.style.boxShadow = 'none';
}

function SectionDivider({ label, optional }: { label: string; optional?: boolean }) {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginTop: 18, marginBottom: 12,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
        color: 'var(--text-muted)', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      {optional && (
        <span style={{
          fontSize: 10, color: 'var(--text-disabled, var(--text-muted))',
          background: 'var(--surface-warm)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '1px 5px', fontWeight: 500,
        }}>
          {t('common.optionalAbbr')}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

