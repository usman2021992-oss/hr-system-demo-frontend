import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, RefreshCw, Copy, CheckCircle2, KeyRound, ChevronDown, ShieldAlert, ShieldCheck, Store as StoreIcon } from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getEmployee, createEmployee, updateEmployee, getEmployees } from '../../api/employees';
import { deleteEmployeePermanently } from '../../api/employees';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useNavigate } from 'react-router-dom';
import { getCompanies } from '../../api/companies';
import { translateApiError } from '../../utils/apiErrors';
import { getStores } from '../../api/stores';
import apiClient, { getAvatarUrl, getCompanyLogoUrl, getStoreLogoUrl } from '../../api/client';
import { Company, Employee, Store, UserRole } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { DatePicker } from '../../components/ui/DatePicker';
import { LocationFieldGroup } from '../../components/location';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';

interface EmployeeFormProps {
  open?: boolean;
  employeeId?: number;
  onSuccess: () => void;
  onCancel: () => void;
  onCreated?: (employee: Employee) => void;
}

const ROLE_BADGE_VARIANT: Record<string, { bg: string; color: string; border: string }> = {
  admin: { bg: 'rgba(201,151,58,0.10)', color: 'var(--accent)', border: 'rgba(201,151,58,0.20)' },
  hr: { bg: 'var(--info-bg)', color: 'var(--info)', border: 'var(--info-border)' },
  area_manager: { bg: 'var(--success-bg)', color: 'var(--success)', border: 'var(--success-border)' },
  store_manager: { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'var(--warning-border)' },
  employee: { bg: 'var(--background)', color: 'var(--text-muted)', border: 'var(--border)' },
  store_terminal: { bg: 'var(--background)', color: 'var(--text-muted)', border: 'var(--border)' },
};

interface FormData {
  name: string;
  surname: string;
  email: string;
  uniqueId: string;
  role: UserRole | '';
  companyId: string;
  storeId: string;
  supervisorId: string;
  department: string;
  hireDate: string;
  contractEndDate: string;
  workingType: 'full_time' | 'part_time' | '';
  weeklyHours: string;
  personalEmail: string;
  dateOfBirth: string;
  nationality: string;
  gender: string;
  iban: string;
  phone: string;
  country: string;
  city: string;
  state: string;
  address: string;
  cap: string;
  firstAidFlag: boolean;
  maritalStatus: string;
  contractType: string;
  probationMonths: string;
  terminationDate: string;
  terminationType: string;
}

const initialFormData: FormData = {
  name: '', surname: '', email: '', uniqueId: '', role: '',
  companyId: '',
  storeId: '', supervisorId: '', department: '',
  hireDate: '', contractEndDate: '', workingType: '', weeklyHours: '',
  personalEmail: '', dateOfBirth: '', nationality: '', gender: '',
  iban: '', phone: '', country: '', city: '', state: '', address: '', cap: '', firstAidFlag: false, maritalStatus: '',
  contractType: '', probationMonths: '', terminationDate: '', terminationType: '',
};

function generateUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'EMP-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#!$%&';
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  // Guarantee at least one from each class then fill to 12 chars
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      margin: '4px 0 20px',
    }}>
      <span style={{
        fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
        fontFamily: 'var(--font-display)', textTransform: 'uppercase',
        letterSpacing: '0.1em', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: 'var(--border-light)' }} />
    </div>
  );
}

export function EmployeeForm({ open = true, employeeId, onSuccess, onCancel, onCreated }: EmployeeFormProps) {
  const isEditMode = employeeId !== undefined;
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const row2: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px',
  };
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [loadingSupervisors, setLoadingSupervisors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [step1Errors, setStep1Errors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [companyPermissionMap, setCompanyPermissionMap] = useState<Record<number, boolean>>({});
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [supervisorPickerOpen, setSupervisorPickerOpen] = useState(false);
  const [supervisorQuery, setSupervisorQuery] = useState('');

  const companyPickerRef = useRef<HTMLDivElement | null>(null);
  const storePickerRef = useRef<HTMLDivElement | null>(null);
  const supervisorPickerRef = useRef<HTMLDivElement | null>(null);

  // Password for new employee (create mode only)
  const [tempPassword, setTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editPasswordError, setEditPasswordError] = useState<string | undefined>();
  // After creation: show credentials card
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const regeneratePassword = useCallback(() => {
    setTempPassword(generateTempPassword());
    setPasswordError(undefined);
  }, []);

  const tRole = (roleKey: string) => (t as (k: string) => string)(`roles.${roleKey}`);
  const isSuperAdmin = user?.isSuperAdmin === true;

  const isPrivilegedCompanyUser = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'area_manager' || isSuperAdmin;
  const canPickCompany = true;
  const isCompanyEditable = isPrivilegedCompanyUser;
  const canAssignAdminRole = user?.isSuperAdmin === true || user?.role === 'admin';
  const isAreaManagerCreator = user?.role === 'area_manager' && !isEditMode;

  const selectedCompanyId = formData.companyId ? parseInt(formData.companyId, 10) : NaN;
  const effectiveCompanyId = Number.isNaN(selectedCompanyId)
    ? (isCompanyEditable ? null : (user?.companyId ?? null))
    : selectedCompanyId;

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedStore = stores.find((store) => String(store.id) === formData.storeId) ?? null;
  const selectedSupervisor = supervisors.find((sup) => String(sup.id) === formData.supervisorId) ?? null;
  const normalizedSupervisorQuery = supervisorQuery.trim().toLowerCase();
  const filteredSupervisors = normalizedSupervisorQuery
    ? supervisors.filter((sup) => {
        const fullName = `${sup.name} ${sup.surname}`.toLowerCase();
        return (
          fullName.includes(normalizedSupervisorQuery)
          || sup.email.toLowerCase().includes(normalizedSupervisorQuery)
          || sup.role.toLowerCase().includes(normalizedSupervisorQuery)
          || (sup.companyName ?? '').toLowerCase().includes(normalizedSupervisorQuery)
        );
      })
    : supervisors;

  const canCreateInCompany = useCallback((companyId: number): boolean => {
    if (isSuperAdmin) return true;
    return companyPermissionMap[companyId] !== false;
  }, [companyPermissionMap, isSuperAdmin]);
  useEffect(() => {
    if (effectiveCompanyId == null) {
      setStores([]);
      return;
    }
    getStores({ targetCompanyId: effectiveCompanyId }).then(setStores).catch(() => {
      setError(t('employees.errorLoadStores'));
    });
  }, [effectiveCompanyId, t, isEditMode]);

  // Load companies for admin/hr so grouped users can pick a target company
  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'hr' || user?.role === 'area_manager' || isSuperAdmin) {
      getCompanies()
        .then(setCompanies)
        .catch(() => setCompanies([]));
    }
  }, [isEditMode, isSuperAdmin, user?.role]);

  useEffect(() => {
    if (!canPickCompany || companies.length === 0) {
      setCompanyPermissionMap({});
      return;
    }

    if (isSuperAdmin) {
      setCompanyPermissionMap(Object.fromEntries(companies.map((company) => [company.id, true])));
      return;
    }

    let mounted = true;
    Promise.all(
      companies.map(async (company) => {
        try {
          const { data } = await apiClient.get('/permissions/effective', {
            params: { target_company_id: company.id },
          });
          return [company.id, Boolean(data?.data?.modules?.dipendenti)] as const;
        } catch {
          return [company.id, false] as const;
        }
      }),
    )
      .then((entries) => {
        if (!mounted) return;
        setCompanyPermissionMap(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!mounted) return;
        setCompanyPermissionMap({});
      });

    return () => {
      mounted = false;
    };
  }, [canPickCompany, companies, isSuperAdmin]);

  useEffect(() => {
    if (!companyPickerOpen && !storePickerOpen && !supervisorPickerOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (companyPickerOpen && !companyPickerRef.current?.contains(target)) {
        setCompanyPickerOpen(false);
      }
      if (storePickerOpen && !storePickerRef.current?.contains(target)) {
        setStorePickerOpen(false);
      }
      if (supervisorPickerOpen && !supervisorPickerRef.current?.contains(target)) {
        setSupervisorPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [companyPickerOpen, storePickerOpen, supervisorPickerOpen]);

  // Load supervisor options (same company, filtered client-side)
  useEffect(() => {
    let mounted = true;
    if (effectiveCompanyId == null) {
      setSupervisors([]);
      setLoadingSupervisors(false);
      return () => { mounted = false; };
    }
    setLoadingSupervisors(true);
    getEmployees({ limit: 500, targetCompanyId: effectiveCompanyId ?? undefined })
      .then((res) => {
        if (!mounted) return;
        const eligibleRoles: UserRole[] = ['admin', 'hr', 'area_manager', 'store_manager'];
        const list = (res?.employees ?? [])
          .filter((e) => eligibleRoles.includes(e.role))
          .filter((e) => (employeeId ? e.id !== employeeId : true));
        setSupervisors(list);
      })
      .catch(() => {
        // Non-blocking: user can still save without supervisor
        if (!mounted) return;
        setSupervisors([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingSupervisors(false);
      });
    return () => { mounted = false; };
  }, [employeeId, effectiveCompanyId]);

  // Keep selected store valid when target company changes.
  useEffect(() => {
    if (!formData.storeId) return;
    const exists = stores.some((s) => String(s.id) === formData.storeId);
    if (!exists) {
      setFormData((prev) => ({ ...prev, storeId: '' }));
    }
  }, [stores, formData.storeId, isEditMode]);

  // Keep selected supervisor valid when target company changes.
  useEffect(() => {
    if (isEditMode) return;
    if (!formData.supervisorId) return;
    const exists = supervisors.some((s) => String(s.id) === formData.supervisorId);
    if (!exists) {
      setFormData((prev) => ({ ...prev, supervisorId: '' }));
    }
  }, [supervisors, formData.supervisorId, isEditMode]);

  // Auto-generate uniqueId and temp password for new employees only
  useEffect(() => {
    if (!isEditMode) {
      setFormData((prev) => ({
        ...prev,
        uniqueId: generateUniqueId(),
        role: isAreaManagerCreator ? 'employee' : prev.role,
      }));
      setTempPassword(generateTempPassword());
    }
  }, [isAreaManagerCreator, isEditMode]);

  useEffect(() => {
    if (!open) return;
    setCompanyPickerOpen(false);
    setStorePickerOpen(false);
    setSupervisorPickerOpen(false);
    setSupervisorQuery('');
  }, [open]);

  useEffect(() => {
    if (!isEditMode || !employeeId) return;
    let mounted = true;
    setLoadingData(true);
    
    // Load employee data and stores in parallel, but set form data only after stores are loaded
    Promise.all([
      getEmployee(employeeId),
      // Pre-load companies if user can pick company
      (user?.role === 'admin' || user?.role === 'hr' || user?.role === 'area_manager' || isSuperAdmin) ? getCompanies() : Promise.resolve([])
    ])
      .then(async ([emp, companiesList]) => {
        if (!mounted) return;
        
        // Set companies first if loaded
        if (companiesList.length > 0) {
          setCompanies(companiesList);
        }
        
        // Load stores for the employee's company BEFORE setting form data
        if (emp.companyId != null) {
          try {
            const companyStores = await getStores({ targetCompanyId: emp.companyId });
            if (mounted) {
              setStores(companyStores);
            }
          } catch {
            // Non-blocking: continue even if stores fail to load
            if (mounted) {
              setStores([]);
            }
          }
        }
        
        // Now set form data after stores are loaded
        if (!mounted) return;
        setFormData({
          name: emp.name ?? '',
          surname: emp.surname ?? '',
          email: emp.email ?? '',
          uniqueId: emp.uniqueId ?? '',
          role: emp.role ?? '',
          companyId: emp.companyId != null ? String(emp.companyId) : '',
          storeId: emp.storeId != null ? String(emp.storeId) : '',
          supervisorId: emp.supervisorId != null ? String(emp.supervisorId) : '',
          department: emp.department ?? '',
          hireDate: emp.hireDate ?? '',
          contractEndDate: emp.contractEndDate ?? '',
          workingType: emp.workingType ?? '',
          weeklyHours: emp.weeklyHours != null ? String(emp.weeklyHours) : '',
          personalEmail: emp.personalEmail ?? '',
          dateOfBirth: emp.dateOfBirth ?? '',
          nationality: emp.nationality ?? '',
          gender: emp.gender ?? '',
          iban: emp.iban ?? '',
          phone: emp.phone ?? '',
          country: emp.country ?? '',
          city: emp.city ?? '',
          state: emp.state ?? '',
          address: emp.address ?? '',
          cap: emp.cap ?? '',
          firstAidFlag: emp.firstAidFlag ?? false,
          maritalStatus: emp.maritalStatus ?? '',
          contractType: emp.contractType ?? '',
          probationMonths: emp.probationMonths != null ? String(emp.probationMonths) : '',
          terminationDate: emp.terminationDate ? emp.terminationDate.split('T')[0] : '',
          terminationType: emp.terminationType ?? '',
        });
      })
      .catch(() => {
        if (!mounted) return;
        setError(t('employees.errorLoadData'));
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingData(false);
      });
    return () => { mounted = false; };
  }, [isEditMode, employeeId, t, user?.role, isSuperAdmin]);

  const set = (field: keyof FormData, value: string | boolean | number[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (step1Errors[field]) setStep1Errors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validateStep1 = (silent = false): { valid: boolean; missingFields: string[] } => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    const missingFields: string[] = [];

    if (!formData.name.trim()) {
      errs.name = t('employees.fieldRequired');
      missingFields.push(t('common.name'));
    }
    if (!formData.surname.trim()) {
      errs.surname = t('employees.fieldRequired');
      missingFields.push(t('common.surname'));
    }
    if (!formData.email.trim()) {
      errs.email = t('employees.fieldRequired');
      missingFields.push(t('employees.emailField'));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errs.email = t('employees.emailInvalid');
    }
    if (!formData.role) {
      errs.role = t('employees.fieldRequired');
      missingFields.push(t('common.role'));
    }
    if (canPickCompany && !formData.companyId) {
      errs.companyId = t('employees.fieldRequired');
      missingFields.push(t('employees.companyField'));
    }
    if (canPickCompany && formData.companyId) {
      const requestedCompanyId = parseInt(formData.companyId, 10);
      if (!Number.isNaN(requestedCompanyId) && !canCreateInCompany(requestedCompanyId)) {
        errs.companyId = t('employees.companyPermissionDenied', 'You do not have permission to create employees in this company.');
      }
    }
    
    // Store is now optional
    // if (!formData.storeId) errs.storeId = t('employees.fieldRequired');

    if (!isEditMode && !formData.uniqueId.trim()) {
      errs.uniqueId = t('employees.fieldRequired');
      missingFields.push(t('employees.colUniqueId'));
    }

    if (!silent) setStep1Errors(errs);
    return { valid: Object.keys(errs).length === 0, missingFields };
  };

  const handleNext = () => {
    // Validate password for new employees before advancing
    if (!isEditMode && tempPassword.length < 8) {
      setPasswordError(t('employees.passwordTooShort'));
      return;
    }
    if (isEditMode && editPassword.length > 0 && editPassword.length < 8) {
      setEditPasswordError(t('employees.passwordTooShort'));
      return;
    }
    const step1 = validateStep1();
    if (step1.valid) {
      // Check store capacity if a store is selected
      if (!isEditMode && formData.storeId) {
        const store = stores.find(s => String(s.id) === formData.storeId);
        if (store && store.maxStaff != null && (store.employeeCount ?? 0) >= store.maxStaff) {
          showToast(t('employees.storeFullCapacity', 'That store has full capacity'), 'error');
          return;
        }
      }
      setStep(2);
    }
  };
  const handleBack = () => setStep(1);

  const validateStep2 = (): { valid: boolean; error?: string; missingFields: string[] } => {
    const missingFields: string[] = [];

    // Weekly hours
    if (formData.weeklyHours) {
      const hours = parseFloat(formData.weeklyHours);
      if (isNaN(hours) || hours < 0 || hours > 80) return { valid: false, error: t('employees.weeklyHoursInvalid'), missingFields: [] };
    }
    // Probation months max
    if (formData.probationMonths) {
      const months = parseInt(formData.probationMonths, 10);
      if (isNaN(months) || months < 0 || months > 60) return { valid: false, error: t('employees.probationInvalid'), missingFields: [] };
    }
    // Personal email required and format
    if (!formData.personalEmail.trim()) {
      missingFields.push(t('employees.personalEmailField'));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personalEmail)) {
      return { valid: false, error: t('employees.emailInvalid'), missingFields: [] };
    }
    // Italian CAP: exactly 5 digits
    if (formData.cap && !/^\d{5}$/.test(formData.cap.trim())) {
      return { valid: false, error: t('employees.capInvalid'), missingFields: [] };
    }
    // IBAN basic check: 15–34 alphanumeric chars
    if (formData.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(formData.iban.trim().toUpperCase())) {
      return { valid: false, error: t('employees.ibanInvalid'), missingFields: [] };
    }
    // contractEndDate must be after hireDate
    if (formData.hireDate && formData.contractEndDate && formData.contractEndDate < formData.hireDate) {
      return { valid: false, error: t('employees.contractEndBeforeHire'), missingFields: [] };
    }
    // Termination date/type must both be set or neither
    if (formData.terminationDate && !formData.terminationType) return { valid: false, error: t('employees.terminationTypeMissing'), missingFields: [] };
    if (formData.terminationType && !formData.terminationDate) return { valid: false, error: t('employees.terminationDateMissing'), missingFields: [] };
    // Termination date must not be before hire date
    if (formData.hireDate && formData.terminationDate && formData.terminationDate < formData.hireDate) {
      return { valid: false, error: t('employees.terminationBeforeHire'), missingFields: [] };
    }

    if (missingFields.length > 0) return { valid: false, missingFields };
    return { valid: true, missingFields: [] };
  };

  const handleSubmit = async () => {
    const step1 = validateStep1();
    const step2 = validateStep2();

    const allMissingFields = [...step1.missingFields, ...step2.missingFields];
    if (allMissingFields.length > 0) {
      setError(`${t('employees.fieldRequired')}: ${allMissingFields.join(', ')}`);
      if (!step1.valid && step === 2) setStep(1);
      return;
    }

    if (!step2.valid) {
      setError(step2.error || t('employees.errorSave'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: formData.name,
        surname: formData.surname,
        email: formData.email,
        uniqueId: formData.uniqueId || undefined,
        role: formData.role as UserRole,
        storeId: formData.storeId ? parseInt(formData.storeId, 10) : null,
        supervisorId: formData.supervisorId ? parseInt(formData.supervisorId, 10) : null,
        department: formData.department || undefined,
        hireDate: formData.hireDate || undefined,
        contractEndDate: formData.contractEndDate || undefined,
        workingType: (formData.workingType as 'full_time' | 'part_time') || null,
        weeklyHours: formData.weeklyHours ? parseFloat(formData.weeklyHours) : null,
        personalEmail: formData.personalEmail || null,
        dateOfBirth: formData.dateOfBirth || null,
        nationality: formData.nationality || null,
        gender: formData.gender || null,
        iban: formData.iban || null,
        phone: formData.phone || null,
        country: formData.country || null,
        city: formData.city || null,
        state: formData.state || null,
        address: formData.address || null,
        cap: formData.cap || null,
        firstAidFlag: formData.firstAidFlag,
        maritalStatus: formData.maritalStatus || null,
        contractType: formData.contractType || null,
        probationMonths: formData.probationMonths ? parseInt(formData.probationMonths, 10) : null,
        terminationDate: formData.terminationDate || null,
        terminationType: formData.terminationType || null,
        password: isEditMode && editPassword.trim() ? editPassword : undefined,
        companyId: formData.companyId && formData.companyId.trim() ? parseInt(formData.companyId, 10) : undefined,
      };
      if (isEditMode && employeeId) {
        await updateEmployee(employeeId, payload);
        onSuccess();
      } else {
        const createPayload: Parameters<typeof createEmployee>[0] = {
          ...payload,
          email: formData.email,
          name: formData.name,
          surname: formData.surname,
          role: formData.role as UserRole,
          password: tempPassword,
        };
        // Cross-company creation: include target companyId if selected
        if (formData.companyId) {
          (createPayload as Record<string, unknown>).companyId = parseInt(formData.companyId, 10);
        }
        const createdEmployee = await createEmployee(createPayload);
        onCreated?.(createdEmployee);
        // Show credentials card instead of closing immediately
        setCreatedCredentials({ name: `${formData.name} ${formData.surname}`, email: formData.email, password: tempPassword });
      }
    } catch (err: unknown) {
      setError(translateApiError(err, t, t('employees.errorSave')));
    } finally {
      setLoading(false);
    }
  };

  const drawerTitle = isEditMode ? t('employees.editEmployee') : t('employees.newEmployeeTitle');

  if (!open) return null;

  return createPortal(
    <div
      className="drawer-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
        background: 'rgba(13, 33, 55, 0.48)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onCancel}
    >
      {/* Drawer panel */}
      <div
        className="drawer-panel"
        style={{
          position: 'relative',
          width: 'min(560px, 100vw)',
          height: '100%',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 48px rgba(0,0,0,0.16)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold-to-navy accent stripe at top */}
        <div style={{
          height: '3px', flexShrink: 0,
          background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)',
        }} />

        {/* Header */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{
              fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)', margin: '0 0 3px', letterSpacing: '-0.02em',
            }}>
              {drawerTitle}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
              {isEditMode
                ? t('employees.editEmployee')
                : `${t('employees.step1')} & ${t('employees.step2')}`}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px 6px',
              fontSize: '22px', lineHeight: 1, borderRadius: 'var(--radius-sm)',
              display: 'flex', alignItems: 'center', marginTop: '-2px',
              transition: 'color 0.15s',
            }}
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--surface-warm)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {([1, 2] as const).map((s, i) => (
              <React.Fragment key={s}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: step >= s ? 'var(--primary)' : 'var(--border)',
                    color: step >= s ? '#fff' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-display)',
                    transition: 'background 0.25s ease, color 0.25s ease',
                    boxShadow: step === s ? '0 0 0 3px rgba(13,33,55,0.12)' : 'none',
                  }}>
                    {step > s ? '✓' : s}
                  </div>
                  <span style={{
                    fontSize: '10px', fontFamily: 'var(--font-body)',
                    fontWeight: step === s ? 700 : 400,
                    color: step === s ? 'var(--primary)' : 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                  }}>
                    {s === 1 ? t('employees.step1') : t('employees.step2')}
                  </span>
                </div>
                {i === 0 && (
                  <div style={{
                    flex: 1, height: '2px', margin: '0 10px', marginBottom: '18px',
                    background: step > 1 ? 'var(--primary)' : 'var(--border)',
                    transition: 'background 0.3s ease',
                    borderRadius: '2px',
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Credentials card (shown after successful create) ── */}
        {createdCredentials && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px' : '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(21,128,61,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--success)',
              }}>
                <CheckCircle2 size={28} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {t('employees.credentialsTitle')}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 340 }}>
                  {t('employees.credentialsSubtitle')}
                </div>
              </div>

              <div style={{
                width: '100%',
                background: 'var(--surface-warm)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14,
                    flexShrink: 0,
                  }}>
                    {createdCredentials.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{createdCredentials.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{createdCredentials.email}</div>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--border-light)' }} />

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    {t('employees.tempPasswordLabel')}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                  }}>
                    <KeyRound size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                    <code style={{
                      flex: 1, fontFamily: 'monospace', fontSize: 15,
                      fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.06em',
                      userSelect: 'all',
                    }}>
                      {createdCredentials.password}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(createdCredentials.password);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      style={{
                        background: copied ? 'rgba(21,128,61,0.1)' : 'var(--accent-light)',
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        padding: '5px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 600,
                        color: copied ? 'var(--success)' : 'var(--accent)',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                      {copied ? t('employees.copied') : t('employees.copyPassword')}
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  background: 'rgba(180,83,9,0.06)',
                  border: '1px solid rgba(180,83,9,0.15)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                  <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500, lineHeight: 1.4 }}>
                    {t('employees.credentialsWarning')}
                  </span>
                </div>
              </div>
            </div>
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-warm)',
              display: 'flex', justifyContent: 'flex-end',
              flexShrink: 0,
            }}>
              <button
                onClick={onSuccess}
                style={{
                  padding: '9px 24px',
                  background: 'var(--primary)',
                  color: '#fff', border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px', fontWeight: 600,
                  fontFamily: 'var(--font-body)', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        )}

        {/* Scrollable body */}
        {!createdCredentials && (
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px' }}>
          {loadingData ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '56px' }}>
              <Spinner size="md" />
            </div>
          ) : (
            <>
              {error && (
                <div style={{ marginBottom: '16px' }}>
                  <Alert variant="danger" title={t('common.error')}>{error}</Alert>
                </div>
              )}

              {/* ── Step 1 ── */}
              {step === 1 && (
                <div>
                  <SectionDivider label={t('employees.step1')} />
                  <div style={row2}>
                    <Input
                      label={`${t('common.name')} *`}
                      value={formData.name}
                      onChange={(e) => set('name', e.target.value)}
                      error={step1Errors.name}
                    />
                    <Input
                      label={`${t('common.surname')} *`}
                      value={formData.surname}
                      onChange={(e) => set('surname', e.target.value)}
                      error={step1Errors.surname}
                    />
                  </div>
                  <div style={row2}>
                    <Input
                      label={`${t('employees.emailField')} *`}
                      type="email"
                      value={formData.email}
                      onChange={(e) => set('email', e.target.value)}
                      error={step1Errors.email}
                    />
                    <div>
                      <Input
                        label={isEditMode ? t('employees.colUniqueId') : `${t('employees.colUniqueId')} *`}
                        value={formData.uniqueId}
                        onChange={(e) => set('uniqueId', e.target.value)}
                        error={step1Errors.uniqueId}
                      />
                      {!isEditMode && (
                        <button
                          type="button"
                          onClick={() => set('uniqueId', generateUniqueId())}
                          style={{
                            marginTop: '5px', background: 'none', border: 'none',
                            cursor: 'pointer', fontSize: '11px', color: 'var(--accent)',
                            fontFamily: 'var(--font-body)', fontWeight: 500,
                            padding: '2px 0', display: 'flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          ↻ {t('employees.regenerateId')}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Company selector: rich options with logo/owner/store count + permission hint */}
                  {canPickCompany && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{
                        display: 'block',
                        marginBottom: '5px',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        letterSpacing: '0.01em',
                      }}>
                        {`${t('employees.companyField')} *`}
                      </div>
                      <div ref={companyPickerRef} style={{ position: 'relative' }}>
                        <button
                          type="button"
                          disabled={!isCompanyEditable}
                          onClick={() => setCompanyPickerOpen((prev) => !prev)}
                          style={{
                            width: '100%',
                            border: `1px solid ${step1Errors.companyId ? 'var(--danger)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface)',
                            minHeight: 46,
                            padding: selectedCompany ? '7px 10px' : '0 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            cursor: isCompanyEditable ? 'pointer' : 'not-allowed',
                            opacity: isCompanyEditable ? 1 : 0.8,
                          }}
                        >
                          {selectedCompany ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                              <span style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--border)',
                                background: 'rgba(13,33,55,0.08)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {getCompanyLogoUrl(selectedCompany.logoFilename) ? (
                                  <img
                                    src={getCompanyLogoUrl(selectedCompany.logoFilename) ?? ''}
                                    alt={selectedCompany.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>
                                    {selectedCompany.name.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </span>
                              <span style={{ minWidth: 0, textAlign: 'left' }}>
                                <span style={{
                                  display: 'block',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: 'var(--text-primary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {selectedCompany.name}
                                </span>
                                <span style={{
                                  display: 'block',
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {selectedCompany.ownerName
                                    ? `${selectedCompany.ownerName}${selectedCompany.ownerSurname ? ` ${selectedCompany.ownerSurname}` : ''}`
                                    : t('companies.ownerMissing', 'No owner assigned')}
                                </span>
                              </span>
                              <span style={{
                                marginLeft: 'auto',
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'nowrap',
                              }}>
                                {`${selectedCompany.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                              </span>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                borderRadius: 999,
                                border: `1px solid ${canCreateInCompany(selectedCompany.id) ? 'rgba(21,128,61,0.3)' : 'rgba(185,28,28,0.28)'}`,
                                background: canCreateInCompany(selectedCompany.id) ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)',
                                color: canCreateInCompany(selectedCompany.id) ? '#166534' : '#991b1b',
                                padding: '2px 7px',
                                fontSize: 10,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}>
                                {canCreateInCompany(selectedCompany.id) ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                                {canCreateInCompany(selectedCompany.id)
                                  ? t('employees.companyAllowed', 'Can create')
                                  : t('employees.companyNotAllowed', 'Not allowed')}
                              </span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                              {t('employees.selectCompany', 'Select company')}
                            </span>
                          )}
                          <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                        </button>

                        {companyPickerOpen && (
                          <div style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 'calc(100% + 6px)',
                            zIndex: 20,
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            background: 'var(--surface)',
                            boxShadow: '0 16px 30px rgba(0,0,0,0.15)',
                            maxHeight: 280,
                            overflowY: 'auto',
                          }}>
                            {companies.map((company) => {
                                const companyCreationAllowed = canCreateInCompany(company.id);
                              return (
                                <button
                                  key={company.id}
                                  type="button"
                                    disabled={!companyCreationAllowed}
                                  onClick={() => {
                                      if (!companyCreationAllowed) return;
                                    set('companyId', String(company.id));
                                    setCompanyPickerOpen(false);
                                  }}
                                  style={{
                                    width: '100%',
                                    border: 'none',
                                    borderBottom: '1px solid var(--border)',
                                    background: formData.companyId === String(company.id) ? 'var(--surface-warm)' : 'var(--surface)',
                                    padding: '9px 10px',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    opacity: companyCreationAllowed ? 1 : 0.58,
                                    cursor: companyCreationAllowed ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  <span style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    border: '1px solid var(--border)',
                                    background: 'rgba(13,33,55,0.08)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {getCompanyLogoUrl(company.logoFilename) ? (
                                      <img
                                        src={getCompanyLogoUrl(company.logoFilename) ?? ''}
                                        alt={company.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    ) : (
                                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>
                                        {company.name.slice(0, 2).toUpperCase()}
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                                      {company.name}
                                    </span>
                                    <span style={{
                                      display: 'block',
                                      fontSize: 10.5,
                                      color: 'var(--text-muted)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {company.ownerName
                                        ? `${company.ownerName}${company.ownerSurname ? ` ${company.ownerSurname}` : ''}`
                                        : t('companies.ownerMissing', 'No owner assigned')}
                                    </span>
                                  </span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontWeight: 700 }}>
                                      {`${company.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                                    </span>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      borderRadius: 999,
                                      border: `1px solid ${companyCreationAllowed ? 'rgba(21,128,61,0.3)' : 'rgba(185,28,28,0.28)'}`,
                                      background: companyCreationAllowed ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.1)',
                                      color: companyCreationAllowed ? '#166534' : '#991b1b',
                                      padding: '2px 7px',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {companyCreationAllowed ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                                      {companyCreationAllowed
                                        ? t('employees.companyAllowed', 'Can create')
                                        : t('employees.companyNotAllowed', 'Not allowed')}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {step1Errors.companyId && (
                        <span style={{ marginTop: '4px', fontSize: '12px', color: 'var(--danger)', display: 'block' }}>
                          {step1Errors.companyId}
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{
                      display: 'block',
                      marginBottom: '5px',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      color: step1Errors.role ? 'var(--danger)' : 'var(--text-secondary)',
                      letterSpacing: '0.01em',
                    }}>
                      {`${t('common.role')} *`}
                    </div>
                    <CustomSelect
                      value={formData.role || null}
                      onChange={(value) => set('role', value || '')}
                      options={isAreaManagerCreator ? [
                        { value: 'employee', label: tRole('employee') },
                      ] : [
                        ...((canAssignAdminRole || formData.role === 'admin') ? [{ value: 'admin', label: tRole('admin') }] : []),
                        { value: 'hr', label: tRole('hr') },
                        { value: 'area_manager', label: tRole('area_manager') },
                        { value: 'store_manager', label: tRole('store_manager') },
                        { value: 'employee', label: tRole('employee') },
                      ]}
                      placeholder={t('employees.selectRole')}
                      error={step1Errors.role}
                      isClearable={false}
                      searchable={false}
                    />
                  </div>

                  <SectionDivider label={t('common.store')} />
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{
                      display: 'block',
                      marginBottom: '5px',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.01em',
                    }}>
                      {t('common.store')}
                    </div>
                    <div ref={storePickerRef} style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (canPickCompany && effectiveCompanyId == null) return;
                          setStorePickerOpen((prev) => !prev);
                        }}
                        disabled={canPickCompany && effectiveCompanyId == null}
                        style={{
                          width: '100%',
                          border: `1px solid ${step1Errors.storeId ? 'var(--danger)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface)',
                          minHeight: 42,
                          padding: selectedStore ? '7px 10px' : '0 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          cursor: (canPickCompany && effectiveCompanyId == null) ? 'not-allowed' : 'pointer',
                          opacity: (canPickCompany && effectiveCompanyId == null) ? 0.6 : 1,
                        }}
                      >
                        {selectedStore ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <span style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: '1px solid var(--border)',
                              background: 'rgba(13,33,55,0.08)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {getStoreLogoUrl(selectedStore.logoFilename) ? (
                                <img
                                  src={getStoreLogoUrl(selectedStore.logoFilename) ?? ''}
                                  alt={selectedStore.name}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <StoreIcon size={14} color="var(--primary)" />
                              )}
                            </span>
                            <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
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
                            </span>
                            <span style={{ 
                              fontSize: 11, 
                              fontWeight: 700, 
                              color: (selectedStore.maxStaff != null && (selectedStore.employeeCount ?? 0) >= selectedStore.maxStaff) ? 'var(--danger)' : 'var(--text-secondary)', 
                              whiteSpace: 'nowrap' 
                            }}>
                              {(selectedStore.maxStaff != null && (selectedStore.employeeCount ?? 0) >= selectedStore.maxStaff) 
                                ? t('employees.capacityFull', 'Capacity Full')
                                : `${selectedStore.employeeCount ?? 0} ${t('employees.employeesLabel', 'Employees')}`}
                            </span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            {canPickCompany && effectiveCompanyId == null
                              ? t('employees.selectCompanyFirst', 'Select company first')
                              : t('employees.noStore')}
                          </span>
                        )}
                        <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                      </button>

                      {step1Errors.storeId && (
                        <span style={{ marginTop: '4px', fontSize: '12px', color: 'var(--danger)', display: 'block' }}>
                          {step1Errors.storeId}
                        </span>
                      )}

                      {storePickerOpen && !(canPickCompany && effectiveCompanyId == null) && (
                        <div style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 'calc(100% + 6px)',
                          zIndex: 20,
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          background: 'var(--surface)',
                          boxShadow: '0 16px 30px rgba(0,0,0,0.15)',
                          maxHeight: 260,
                          overflowY: 'auto',
                        }}>
                          <button
                            type="button"
                            onClick={() => {
                              set('storeId', '');
                              setStorePickerOpen(false);
                            }}
                            style={{
                              width: '100%',
                              border: 'none',
                              borderBottom: '1px solid var(--border)',
                              background: formData.storeId ? 'var(--surface)' : 'var(--surface-warm)',
                              padding: '10px 12px',
                              textAlign: 'left',
                              color: 'var(--text-secondary)',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            {t('employees.noStore')}
                          </button>
                          {stores.map((store) => (
                            <button
                              key={store.id}
                              type="button"
                              onClick={() => {
                                set('storeId', String(store.id));
                                setStorePickerOpen(false);
                              }}
                              style={{
                                width: '100%',
                                border: 'none',
                                borderBottom: '1px solid var(--border)',
                                background: formData.storeId === String(store.id) ? 'var(--surface-warm)' : 'var(--surface)',
                                padding: '9px 10px',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--border)',
                                background: 'rgba(13,33,55,0.08)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {getStoreLogoUrl(store.logoFilename) ? (
                                  <img
                                    src={getStoreLogoUrl(store.logoFilename) ?? ''}
                                    alt={store.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <StoreIcon size={14} color="var(--primary)" />
                                )}
                              </span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {store.name}
                                </span>
                              </span>
                              <span style={{ 
                                fontSize: 10.5, 
                                color: (store.maxStaff != null && (store.employeeCount ?? 0) >= store.maxStaff) ? 'var(--danger)' : 'var(--text-secondary)', 
                                fontWeight: 700, 
                                whiteSpace: 'nowrap' 
                              }}>
                                {(store.maxStaff != null && (store.employeeCount ?? 0) >= store.maxStaff)
                                  ? t('employees.capacityFull', 'Capacity Full')
                                  : `${store.employeeCount ?? 0} ${t('employees.employeesLabel', 'Employees')}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{
                      display: 'block',
                      marginBottom: '5px',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.01em',
                    }}>
                      {t('employees.supervisorField')}
                    </div>
                    <div ref={supervisorPickerRef} style={{ position: 'relative' }}>
                      <button
                        type="button"
                        disabled={loadingSupervisors || (canPickCompany && effectiveCompanyId == null)}
                        onClick={() => {
                          if (loadingSupervisors || (canPickCompany && effectiveCompanyId == null)) return;
                          setCompanyPickerOpen(false);
                          setStorePickerOpen(false);
                          setSupervisorPickerOpen((prev) => !prev);
                        }}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface)',
                          minHeight: 46,
                          padding: selectedSupervisor ? '7px 10px' : '0 12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          cursor: (loadingSupervisors || (canPickCompany && effectiveCompanyId == null)) ? 'not-allowed' : 'pointer',
                          opacity: (loadingSupervisors || (canPickCompany && effectiveCompanyId == null)) ? 0.68 : 1,
                        }}
                      >
                        {selectedSupervisor ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <span style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              overflow: 'hidden',
                              background: selectedSupervisor.avatarFilename ? 'transparent' : 'rgba(13,33,55,0.16)',
                              color: '#0D2137',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}>
                              {selectedSupervisor.avatarFilename ? (
                                <img
                                  src={getAvatarUrl(selectedSupervisor.avatarFilename) ?? ''}
                                  alt={`${selectedSupervisor.name} ${selectedSupervisor.surname}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : `${selectedSupervisor.name?.[0] ?? ''}${selectedSupervisor.surname?.[0] ?? ''}`.toUpperCase() || 'U'}
                            </span>
                            <span style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                              <span style={{
                                display: 'block',
                                fontSize: 13,
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {selectedSupervisor.name} {selectedSupervisor.surname}
                              </span>
                              <span style={{
                                display: 'block',
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {(selectedSupervisor.companyName ?? selectedCompany?.name)
                                  ? selectedSupervisor.companyName ?? selectedCompany?.name
                                  : '-'}
                              </span>
                            </span>
                            {/* Role Badge - Taller and Centered on the Right */}
                            <div style={{
                              fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase',
                              padding: '4px 8px', borderRadius: 8,
                              background: ROLE_BADGE_VARIANT[selectedSupervisor.role]?.bg || 'rgba(13,33,55,0.06)',
                              color: ROLE_BADGE_VARIANT[selectedSupervisor.role]?.color || 'var(--text-muted)',
                              border: `1px solid ${ROLE_BADGE_VARIANT[selectedSupervisor.role]?.border || 'var(--border)'}`,
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                              alignSelf: 'center',
                              marginLeft: 8
                            }}>
                              {tRole(selectedSupervisor.role)}
                            </div>
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            {loadingSupervisors
                              ? t('common.loading', 'Loading...')
                              : (canPickCompany && effectiveCompanyId == null
                                ? t('employees.selectCompanyFirst', 'Select company first')
                                : t('employees.noSupervisor'))}
                          </span>
                        )}
                        <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                      </button>

                      {supervisorPickerOpen && !(loadingSupervisors || (canPickCompany && effectiveCompanyId == null)) && (
                        <div style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 'calc(100% + 6px)',
                          zIndex: 20,
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          background: 'var(--surface)',
                          boxShadow: '0 16px 30px rgba(0,0,0,0.15)',
                          maxHeight: 280,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                        }}>
                          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                            <input
                              type="text"
                              value={supervisorQuery}
                              onChange={(e) => setSupervisorQuery(e.target.value)}
                              placeholder={t('employees.searchSupervisor', 'Search supervisor...')}
                              style={{
                                width: '100%',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                background: 'var(--surface)',
                                height: 34,
                                padding: '0 10px',
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div style={{ overflowY: 'auto', maxHeight: 230 }}>
                            <button
                              type="button"
                              onClick={() => {
                                set('supervisorId', '');
                                setSupervisorPickerOpen(false);
                                setSupervisorQuery('');
                              }}
                              style={{
                                width: '100%',
                                border: 'none',
                                borderBottom: '1px solid var(--border)',
                                background: formData.supervisorId ? 'var(--surface)' : 'var(--surface-warm)',
                                padding: '10px 12px',
                                textAlign: 'left',
                                color: 'var(--text-secondary)',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              {t('employees.noSupervisor')}
                            </button>

                            {filteredSupervisors.length === 0 ? (
                              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                                {t('common.noData', 'No data')}
                              </div>
                            ) : filteredSupervisors.map((sup) => {
                              const selected = formData.supervisorId === String(sup.id);
                              const avatarUrl = getAvatarUrl(sup.avatarFilename);
                              const fullName = `${sup.name} ${sup.surname}`.trim();
                              return (
                                <button
                                  key={sup.id}
                                  type="button"
                                  onClick={() => {
                                    set('supervisorId', String(sup.id));
                                    setSupervisorPickerOpen(false);
                                    setSupervisorQuery('');
                                  }}
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
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    background: avatarUrl ? 'transparent' : 'rgba(13,33,55,0.14)',
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
                                    ) : `${sup.name?.[0] ?? ''}${sup.surname?.[0] ?? ''}`.toUpperCase() || 'U'}
                                  </span>
                                  <span style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                                      {fullName}
                                    </span>
                                    <span style={{
                                      display: 'block',
                                      fontSize: 10.5,
                                      color: 'var(--text-muted)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {(sup.companyName ?? selectedCompany?.name) ? `${sup.companyName ?? selectedCompany?.name}` : ''}
                                    </span>
                                  </span>
                                  {/* Role Badge - Taller and Centered on the Right */}
                                  <div style={{
                                    fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase',
                                    padding: '4px 8px', borderRadius: 8,
                                    background: ROLE_BADGE_VARIANT[sup.role]?.bg || 'rgba(13,33,55,0.06)',
                                    color: ROLE_BADGE_VARIANT[sup.role]?.color || 'var(--text-muted)',
                                    border: `1px solid ${ROLE_BADGE_VARIANT[sup.role]?.border || 'var(--border)'}`,
                                    flexShrink: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                  }}>
                                    {tRole(sup.role)}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Input
                      label={t('common.department')}
                      value={formData.department}
                      onChange={(e) => set('department', e.target.value)}
                    />
                  </div>

                  {/* Password */}
                  {!isEditMode ? (
                    <>
                      <SectionDivider label={t('employees.sectionSystemAccess')} />
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', fontFamily: 'var(--font-body)' }}>
                          {t('employees.tempPasswordLabel')} *
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={tempPassword}
                              onChange={(e) => { setTempPassword(e.target.value); setPasswordError(undefined); }}
                              style={{
                                width: '100%',
                                height: '38px',
                                padding: '0 38px 0 12px',
                                border: `1px solid ${passwordError ? 'var(--danger)' : 'var(--border)'}`,
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '13px',
                                fontFamily: 'var(--font-body)',
                                background: 'var(--surface)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                boxSizing: 'border-box',
                                letterSpacing: showPassword ? 'normal' : '0.12em',
                              }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-light)'; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = passwordError ? 'var(--danger)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              style={{
                                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                              }}
                            >
                              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={regeneratePassword}
                            title={t('employees.regeneratePassword')}
                            style={{
                              height: 38, padding: '0 10px',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface)',
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                              display: 'flex', alignItems: 'center', gap: 5,
                              fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 500,
                              flexShrink: 0,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-warm)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; }}
                          >
                            <RefreshCw size={13} />
                            {t('employees.regeneratePassword')}
                          </button>
                        </div>
                        {passwordError && (
                          <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>{passwordError}</div>
                        )}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                          {t('employees.tempPasswordHint')}
                        </div>
                      </div>
                    </>
                  ) : (user?.role === 'admin' || isSuperAdmin) ? (
                    <>
                      <SectionDivider label={t('employees.sectionSystemAccess')} />
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px', fontFamily: 'var(--font-body)' }}>
                          {t('profile.newPassword')} ({t('common.optional', { defaultValue: 'optional' })})
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input
                              type={showEditPassword ? 'text' : 'password'}
                              value={editPassword}
                              onChange={(e) => { setEditPassword(e.target.value); setEditPasswordError(undefined); }}
                              placeholder={t('employees.leaveEmptyToKeepPassword', { defaultValue: 'Leave empty to keep current password' })}
                              style={{
                                width: '100%',
                                height: '38px',
                                padding: '0 38px 0 12px',
                                border: `1px solid ${editPasswordError ? 'var(--danger)' : 'var(--border)'}`,
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '13px',
                                fontFamily: 'var(--font-body)',
                                background: 'var(--surface)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                boxSizing: 'border-box',
                                letterSpacing: showEditPassword ? 'normal' : '0.12em',
                              }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-light)'; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = editPasswordError ? 'var(--danger)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPassword((v) => !v)}
                              style={{
                                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0,
                              }}
                            >
                              {showEditPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>
                        {editPasswordError && (
                          <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>{editPasswordError}</div>
                        )}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                          {t('employees.tempPasswordHint')}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* ── Step 2 ── */}
              {step === 2 && (
                <div>
                  <SectionDivider label={t('employees.hireDateField')} />
                  <div style={row2}>
                    <DatePicker
                      label={t('employees.hireDateField')}
                      value={formData.hireDate}
                      onChange={(v) => set('hireDate', v)}
                      placement="bottom"
                    />
                    <DatePicker
                      label={t('employees.contractEndField')}
                      value={formData.contractEndDate}
                      onChange={(v) => set('contractEndDate', v)}
                      placement="bottom"
                    />
                  </div>
                  <div style={row2}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <label style={{
                        display: 'block', fontSize: '12px', fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-body)', marginBottom: '5px', letterSpacing: '0.01em',
                      }}>
                        {t('employees.workingTypeField')}
                      </label>
                      <CustomSelect
                        value={formData.workingType || null}
                        onChange={(value) => set('workingType', value || '')}
                        options={[
                          { value: 'full_time', label: t('employees.fullTime') },
                          { value: 'part_time', label: t('employees.partTime') },
                        ]}
                        placeholder={t('employees.selectOption')}
                        isClearable={true}
                        searchable={false}
                      />
                    </div>
                    <Input
                      label={t('employees.weeklyHoursField')}
                      type="number"
                      min="0" max="80" step="0.5"
                      value={formData.weeklyHours}
                      onChange={(e) => set('weeklyHours', e.target.value)}
                    />
                  </div>

                  <SectionDivider label={t('employees.contractualDetails')} />
                  <div style={row2}>
                    <Input
                      label={`${t('employees.personalEmailField')} *`}
                      type="email"
                      value={formData.personalEmail}
                      onChange={(e) => set('personalEmail', e.target.value)}
                    />
                    <DatePicker
                      label={t('employees.dateOfBirthField')}
                      value={formData.dateOfBirth}
                      onChange={(v) => set('dateOfBirth', v)}
                      initialViewYear={new Date().getFullYear() - 30}
                      placement="bottom"
                    />
                  </div>
                  <div style={row2}>
                    <Input
                      label={t('employees.nationalityField')}
                      value={formData.nationality}
                      onChange={(e) => set('nationality', e.target.value)}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <label style={{
                        display: 'block', fontSize: '12px', fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-body)', marginBottom: '5px', letterSpacing: '0.01em',
                      }}>
                        {t('employees.genderField')}
                      </label>
                      <CustomSelect
                        value={formData.gender || null}
                        onChange={(value) => set('gender', value || '')}
                        options={[
                          { value: 'M', label: t('employees.genderMale') },
                          { value: 'F', label: t('employees.genderFemale') },
                          { value: 'other', label: t('employees.genderOther') },
                        ]}
                        placeholder={t('employees.selectOption')}
                        isClearable={true}
                        searchable={false}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <Input
                      label={t('employees.ibanField')}
                      value={formData.iban}
                      onChange={(e) => set('iban', e.target.value)}
                      placeholder={t('employees.ibanPlaceholder')}
                    />
                  </div>

                  <SectionDivider label={t('employees.addressField')} />
                  <LocationFieldGroup
                    value={{
                      country: formData.country,
                      state: formData.state,
                      city: formData.city,
                      address: formData.address,
                      postalCode: formData.cap,
                      phone: formData.phone,
                    }}
                    onChange={(location) => {
                      set('country', location.country);
                      set('state', location.state);
                      set('city', location.city);
                      set('address', location.address);
                      set('cap', location.postalCode);
                      set('phone', location.phone);
                    }}
                    includeAddress
                    includePostalCode
                    includePhone
                    labels={{
                      country: t('companies.country', 'Country'),
                      state: t('companies.state', 'State'),
                      city: t('companies.city', 'City'),
                      address: t('employees.addressField'),
                      postalCode: t('employees.capField'),
                      phone: t('companies.companyPhoneNumbers', 'Phone'),
                    }}
                  />
                  <div style={row2}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <label style={{
                        display: 'block', fontSize: '12px', fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-body)', marginBottom: '5px', letterSpacing: '0.01em',
                      }}>
                        {t('employees.maritalStatusField')}
                      </label>
                      <CustomSelect
                        value={formData.maritalStatus || null}
                        onChange={(value) => set('maritalStatus', value || '')}
                        options={[
                          { value: 'Celibe', label: t('employees.marital_celibe') },
                          { value: 'Nubile', label: t('employees.marital_nubile') },
                          { value: 'Coniugato', label: t('employees.marital_coniugato') },
                          { value: 'Coniugata', label: t('employees.marital_coniugata') },
                          { value: 'Divorziato', label: t('employees.marital_divorziato') },
                          { value: 'Divorziata', label: t('employees.marital_divorziata') },
                          { value: 'Vedovo', label: t('employees.marital_vedovo') },
                          { value: 'Vedova', label: t('employees.marital_vedova') },
                          { value: 'Separato', label: t('employees.marital_separato') },
                          { value: 'Separata', label: t('employees.marital_separata') },
                          { value: 'Unione Civile', label: t('employees.marital_unione_civile') },
                        ]}
                        placeholder={t('employees.selectOption')}
                        isClearable={true}
                        searchable={true}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px', paddingTop: '22px' }}>
                      <input
                        id="firstAidFlag"
                        type="checkbox"
                        checked={formData.firstAidFlag}
                        onChange={(e) => set('firstAidFlag', e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                      <label
                        htmlFor="firstAidFlag"
                        style={{
                          fontSize: '13px', fontWeight: 500,
                          color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                          cursor: 'pointer',
                        }}
                      >
                        {t('employees.firstAidField')}
                      </label>
                    </div>
                  </div>
                  <div style={row2}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <label style={{
                        display: 'block', fontSize: '12px', fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-body)', marginBottom: '5px', letterSpacing: '0.01em',
                      }}>
                        {t('employees.contractTypeField')}
                      </label>
                      <CustomSelect
                        value={formData.contractType || null}
                        onChange={(value) => set('contractType', value || '')}
                        options={[
                          { value: 'Tempo Indeterminato', label: t('employees.contractType_indeterminato') },
                          { value: 'Tempo Determinato', label: t('employees.contractType_determinato') },
                          { value: 'Apprendistato', label: t('employees.contractType_apprendistato') },
                          { value: 'Stage / Tirocinio', label: t('employees.contractType_stage') },
                          { value: 'Partita IVA / Collaborazione', label: t('employees.contractType_partita_iva') },
                          { value: 'Altro', label: t('employees.contractType_altro') },
                        ]}
                        placeholder={t('employees.selectOption')}
                        isClearable={true}
                        searchable={false}
                      />
                    </div>
                    <Input
                      label={t('employees.probationField')}
                      type="number"
                      min="0"
                      value={formData.probationMonths}
                      onChange={(e) => set('probationMonths', e.target.value)}
                      placeholder={t('employees.probationPlaceholder')}
                    />
                  </div>
                  <div style={row2}>
                    <DatePicker
                      label={t('employees.terminationDateField')}
                      value={formData.terminationDate}
                      onChange={(v) => set('terminationDate', v)}
                      placement="top"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <label style={{
                        display: 'block', fontSize: '12px', fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-body)', marginBottom: '5px', letterSpacing: '0.01em',
                      }}>
                        {t('employees.terminationTypeField')}
                      </label>
                      <CustomSelect
                        value={formData.terminationType || null}
                        onChange={(value) => set('terminationType', value || '')}
                        options={[
                          { value: 'Dimissioni volontarie', label: t('employees.terminationType_dimissioni') },
                          { value: 'Fine contratto', label: t('employees.terminationType_fine_contratto') },
                          { value: 'Licenziamento', label: t('employees.terminationType_licenziamento') },
                          { value: 'Pensionamento', label: t('employees.terminationType_pensionamento') },
                          { value: 'Risoluzione consensuale', label: t('employees.terminationType_consensuale') },
                          { value: 'Altro', label: t('employees.terminationType_altro') },
                        ]}
                        placeholder={t('employees.selectOption')}
                        isClearable={true}
                        searchable={false}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>)}

        {/* Footer (only shown when not on credentials card) */}
        {!createdCredentials && <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-warm)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isEditMode && (user?.role === 'admin' || user?.isSuperAdmin) && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading || deleting}
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
                  opacity: (loading || deleting) ? 0.5 : 1,
                }}
              >
                {t('common.delete')}
              </button>
            )}
            <button
              onClick={onCancel}
              disabled={loading}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '8px 16px',
              fontSize: '13px', color: 'var(--text-secondary)',
              fontFamily: 'var(--font-body)', cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {t('common.cancel')}
          </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step === 2 && (
              <Button variant="secondary" onClick={handleBack} disabled={loading}>
                ← {t('common.back')}
              </Button>
            )}
            {step === 1 && (
              <Button variant="primary" onClick={handleNext}>
                {t('common.next')} →
              </Button>
            )}
            {step === 2 && (
              <Button variant="primary" onClick={handleSubmit} loading={loading}>
                {t('common.save')}
              </Button>
            )}
          </div>
        </div>}
      {showDeleteConfirm && (
        <ConfirmModal
          open={showDeleteConfirm}
          title={t('employees.confirmPermanentDelete', 'Delete employee permanently')}
          message={t('employees.confirmPermanentDeleteMsg', 'This action will remove the user and all related data. This cannot be undone.')}
          variant="danger"
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={async () => {
            if (!employeeId) return;
            setDeleting(true);
            try {
              await deleteEmployeePermanently(employeeId);
              showToast(t('employees.permanentlyDeleted'), 'success');
              setShowDeleteConfirm(false);
              onCancel();
              navigate('/dipendenti');
            } catch (err: unknown) {
              const message = translateApiError(err, t, 'Delete error') ?? 'Delete error';
              showToast(message, 'error');
            } finally {
              setDeleting(false);
            }
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      </div>
    </div>,
    document.body
  );
}

export default EmployeeForm;
