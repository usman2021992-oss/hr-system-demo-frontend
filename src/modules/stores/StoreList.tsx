import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ReactCountryFlag from 'react-country-flag';
import { useAuth } from '../../context/AuthContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useToast } from '../../context/ToastContext';
import { getStores, createStore, updateStore, deactivateStore, activateStore, deleteStorePermanent } from '../../api/stores';
import { getCompanies } from '../../api/companies';
import { getCompanyLogoUrl, getAvatarUrl, getStoreLogoUrl } from '../../api/client';
import { translateApiError } from '../../utils/apiErrors';
import { Company, Store } from '../../types';
import { Table, Column } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Select } from '../../components/ui/Select';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { LocationFieldGroup } from '../../components/location';
import { TimezoneOptionContent } from '../../components/timezone/TimezoneOptionContent';
import { Eye, EyeOff, RefreshCw, Link as LinkIcon, Unlink, Database, CheckCircle, XCircle, Search, X, Filter } from 'lucide-react';
import { StoreFilterModal, StoreFilterValues } from './StoreFilterModal';
import {
  getBrowserTimeZone,
  getPreferredTimezoneForCountry,
  getTimezoneOptionValues,
} from '../../utils/timezone';
import { getCountryDisplayName } from '../../utils/country';
import {
  getExternalOverview,
  listExternalDepositi,
  listExternalMappings,
  upsertExternalMapping,
  deleteExternalMapping,
  ExternalDepositoRow,
  ExternalDbOverview,
} from '../../api/externalAffluence';

interface StoreFormData {
  name: string;
  code: string;
  address: string;
  cap: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  timezone: string;
  maxStaff: string;
}

const emptyForm: StoreFormData = {
  name: '',
  code: '',
  address: '',
  cap: '',
  city: '',
  state: '',
  country: '',
  phone: '',
  timezone: '',
  maxStaff: '',
};

interface FormErrors {
  name?: string;
  code?: string;
  companyId?: string;
}

// Words to skip when deriving a store code from the name
const SKIP_WORDS = new Set([
  'negozio', 'store', 'shop', 'il', 'la', 'lo', 'le', 'gli', 'i',
  'di', 'del', 'della', 'dei', 'delle', 'degli', 'the', 'a', 'an',
]);

function generateStoreCode(name: string, existingCodes: string[]): string {
  const words = name.trim().split(/\s+/);
  const meaningful = words.find((w) => {
    const clean = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return clean.length >= 2 && !SKIP_WORDS.has(clean);
  });
  if (!meaningful) return '';

  const prefix = meaningful
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 3)
    .toUpperCase();

  if (prefix.length < 2) return '';

  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const nums = existingCodes
    .map((c) => { const m = c.match(pattern); return m ? parseInt(m[1], 10) : NaN; })
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(2, '0')}`;
}

const COMPANY_AVATAR_PALETTE = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];

function getCompanyAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COMPANY_AVATAR_PALETTE[Math.abs(hash) % COMPANY_AVATAR_PALETTE.length];
}

function getCompanyInitials(name?: string): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function getStoreInitials(name?: string): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function toStoreSlug(store: Store): string {
  const base = store.name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${store.id}-${base || 'store'}`;
}

export function StoreList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const isAdmin = user?.role === 'admin';
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';
  const isSuperAdmin = user?.isSuperAdmin === true;

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<StoreFilterValues>({
    company_id: '',
    status: '',
    country: '',
  });

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [formCompanyId, setFormCompanyId] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formData, setFormData] = useState<StoreFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
  const [terminalPassword, setTerminalPassword] = useState('');
  const [terminalPasswordVisible, setTerminalPasswordVisible] = useState(false);
  const [terminalPasswordError, setTerminalPasswordError] = useState<string | null>(null);
  // true while the code field shows an auto-suggested value (new form only)
  const codeIsAuto = useRef(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivatingStore, setDeactivatingStore] = useState<Store | null>(null);
  const [deactivateInput, setDeactivateInput] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const [activateOpen, setActivateOpen] = useState(false);
  const [activatingStore, setActivatingStore] = useState<Store | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

  // External database integration state (Step 2)
  const [externalDbOverview, setExternalDbOverview] = useState<ExternalDbOverview | null>(null);
  const [externalStores, setExternalStores] = useState<ExternalDepositoRow[]>([]);
  const [externalStoresLoading, setExternalStoresLoading] = useState(false);
  const [externalStoresError, setExternalStoresError] = useState<string | null>(null);
  const [externalSearchQuery, setExternalSearchQuery] = useState('');
  const [externalStoreCode, setExternalStoreCode] = useState('');
  const [externalStoreName, setExternalStoreName] = useState('');

  // Filtered stores for real-time search
  const filteredExternalStores = useMemo(() => {
    if (!externalSearchQuery.trim()) return externalStores;
    const query = externalSearchQuery.toLowerCase().trim();
    return externalStores.filter(store => 
      (store.storeName?.toLowerCase().includes(query)) ||
      (store.companyName?.toLowerCase().includes(query)) ||
      (store.externalStoreCode?.toLowerCase().includes(query))
    );
  }, [externalStores, externalSearchQuery]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [currentMapping, setCurrentMapping] = useState<{ externalStoreCode: string; externalStoreName: string | null } | null>(null);
  const [createdStoreId, setCreatedStoreId] = useState<number | null>(null);
  const [refreshingInternalDb, setRefreshingInternalDb] = useState(false);
  const [refreshingExternalDb, setRefreshingExternalDb] = useState(false);

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const nameMatch = store.name.toLowerCase().includes(query);
        const codeMatch = store.code.toLowerCase().includes(query);
        const cityMatch = store.city?.toLowerCase().includes(query);
        const companyMatch = store.companyName?.toLowerCase().includes(query);
        if (!nameMatch && !codeMatch && !cityMatch && !companyMatch) {
          return false;
        }
      }
      if (filters.company_id && String(store.companyId) !== filters.company_id) {
        return false;
      }
      if (filters.status) {
        const isStoreActive = store.isActive;
        if (filters.status === 'active' && !isStoreActive) return false;
        if (filters.status === 'inactive' && isStoreActive) return false;
      }
      if (filters.country && store.country !== filters.country) {
        return false;
      }
      return true;
    });
  }, [stores, search, filters]);

  const statusOptions = useMemo<SelectOption[]>(() => [
    { value: 'active', label: t('common.active', 'Active') },
    { value: 'inactive', label: t('common.inactive', 'Inactive') },
  ], [t]);

  const countryOptions = useMemo<SelectOption[]>(() => {
    const uniqueCountries = Array.from(new Set(stores.map((s) => s.country).filter((c): c is string => !!c)));
    return uniqueCountries.map((c) => ({
      value: c,
      label: getCountryDisplayName(c) || c,
    }));
  }, [stores]);

  const showCompanyFilter = (isAdminOrHr || isSuperAdmin) && companies.length > 0;

  const hasActiveFilters = !!(filters.company_id || filters.status || filters.country);

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; label: string; value: string }> = [];
    if (filters.company_id) {
      const company = companies.find((c) => String(c.id) === filters.company_id);
      if (company) {
        tags.push({ key: 'company_id', label: t('stores.filterCompany', 'Company'), value: company.name });
      }
    }
    if (filters.status) {
      tags.push({
        key: 'status',
        label: t('stores.filterStatus', 'Status'),
        value: filters.status === 'active' ? t('common.active', 'Active') : t('common.inactive', 'Inactive'),
      });
    }
    if (filters.country) {
      tags.push({ key: 'country', label: t('stores.filterCountry', 'Country'), value: getCountryDisplayName(filters.country) || filters.country });
    }
    return tags;
  }, [filters, companies, t]);

  const removeFilter = (key: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: '',
    }));
  };

  const resetFilters = () => {
    setFilters({
      company_id: '',
      status: '',
      country: '',
    });
    setSearch('');
  };

  const browserTimezone = useMemo(() => getBrowserTimeZone(), []);

  const timezoneOptions = useMemo<SelectOption[]>(() => {
    return getTimezoneOptionValues([formData.timezone, browserTimezone]).map((timezone) => ({
      value: timezone,
      label: timezone,
      render: <TimezoneOptionContent timezone={timezone} />,
    }));
  }, [browserTimezone, formData.timezone]);

  const companyOptions = useMemo<SelectOption[]>(() => {
    return companies.map((c) => ({
      value: String(c.id),
      label: c.name,
      render: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {c.logoFilename && getCompanyLogoUrl(c.logoFilename) ? (
            <img
              src={getCompanyLogoUrl(c.logoFilename) || ''}
              alt={c.name}
              style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: getCompanyAvatarColor(c.name),
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 8,
            }}>
              {getCompanyInitials(c.name)}
            </div>
          )}
          <span>{c.name}</span>
        </div>
      )
    }));
  }, [companies]);

  const activeEmployeeCount = editingStore?.employeeCount ?? 0;
  const maxCapacityLabel = editingStore?.maxStaff != null ? String(editingStore.maxStaff) : '—';

  const loadStores = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStores();
      setStores(data);
    } catch {
      setError(t('stores.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  // Load companies for any admin/HR so grouped users can pick a target company
  useEffect(() => {
    if (!isAdminOrHr) return;
    setCompaniesLoading(true);
    getCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setCompaniesLoading(false));
  }, [isAdminOrHr]);

  const openNewForm = () => {
    setEditingStore(null);
    setFormData({ ...emptyForm, timezone: browserTimezone });
    setFormErrors({});
    setFormError(null);
    // Super-admin has no default company; require explicit selection.
    // Grouped admin/hr default to their own company.
    setFormCompanyId(isSuperAdmin ? null : (user?.companyId ?? null));
    codeIsAuto.current = true;
    setFormStep(1);
    setTerminalPassword('');
    setTerminalPasswordVisible(false);
    setTerminalPasswordError(null);
    // Reset external integration state
    setExternalDbOverview(null);
    setExternalStores([]);
    setExternalStoresError(null);
    setExternalSearchQuery('');
    setExternalStoreCode('');
    setExternalStoreName('');
    setIntegrationError(null);
    setCurrentMapping(null);
    setCreatedStoreId(null);
    setFormOpen(true);
  };

  const openEditForm = async (store: Store) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      code: store.code,
      address: store.address ?? '',
      cap: store.cap ?? '',
      city: store.city ?? '',
      state: store.state ?? '',
      country: store.country ?? '',
      phone: store.phone ?? '',
      timezone: store.timezone ?? getPreferredTimezoneForCountry(store.country, browserTimezone),
      maxStaff: store.maxStaff != null ? String(store.maxStaff) : '',
    });
    setFormErrors({});
    setFormError(null);
    codeIsAuto.current = false;
    setFormStep(1);
    // Reset external integration state
    setExternalDbOverview(null);
    setExternalStores([]);
    setExternalStoresError(null);
    setExternalSearchQuery('');
    setExternalStoreCode('');
    setExternalStoreName('');
    setIntegrationError(null);
    setCurrentMapping(null);
    setCreatedStoreId(store.id);
    
    // Load existing mapping if any
    try {
      const targetCompanyId = store.companyId;
      const mappings = await listExternalMappings(targetCompanyId);
      const existingMapping = mappings.find(m => m.localStoreId === store.id && m.isActive);
      if (existingMapping) {
        setCurrentMapping({
          externalStoreCode: existingMapping.externalStoreCode,
          externalStoreName: existingMapping.externalStoreName,
        });
      }
    } catch (err) {
      // Silently fail - user can still integrate manually
      console.error('Failed to load existing mapping:', err);
    }
    
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormStep(1);
    setEditingStore(null);
    setFormData(emptyForm);
    setFormErrors({});
    setFormError(null);
    setTerminalPasswordError(null);
    codeIsAuto.current = false;
    setFormCompanyId(null);
    // Reset external integration state
    setExternalDbOverview(null);
    setExternalStores([]);
    setExternalStoresError(null);
    setExternalSearchQuery('');
    setExternalStoreCode('');
    setExternalStoreName('');
    setIntegrationError(null);
    setCurrentMapping(null);
    setCreatedStoreId(null);
  };

  const handleCloseFormWithReload = async () => {
    if (createdStoreId) {
      await loadStores();
    }
    closeForm();
  };

  // Show company selector when multiple companies are available (grouped admin/HR + super admin)
  const showCompanyPicker = companies.length > 1;
  const selectedCompany = companies.find((c) => c.id === formCompanyId) ?? null;

  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    if (!formData.name.trim()) errors.name = t('stores.validationName');
    if (!formData.code.trim()) errors.code = t('stores.validationCode');
    if (showCompanyPicker && !editingStore && !formCompanyId) errors.companyId = t('stores.validationCompany');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let newPassword = '';
    for (let i = 0; i < 12; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTerminalPassword(newPassword);
    setTerminalPasswordError(null);
  };

  const getTerminalEmail = () => {
    const storeName = formData.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    let companyName = '';
    if (formCompanyId) {
      companyName = companies.find((c) => c.id === formCompanyId)?.name || 'company';
    } else {
      companyName = companies[0]?.name || 'company';
    }
    companyName = companyName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${storeName || 'store'}@${companyName}.com`;
  };

  const validateTerminal = (): boolean => {
    if (!terminalPassword || terminalPassword.length < 8) {
      setTerminalPasswordError('Password must be at least 8 characters');
      return false;
    }
    setTerminalPasswordError(null);
    return true;
  };

  const handleNext = () => {
    if (!validateForm()) return;
    // Move to step 2 (Terminal Setup) in create mode
    setFormStep(2);
    if (!terminalPassword) {
      // Auto-generate and reveal the password so user can note it down
      generatePassword();
      setTerminalPasswordVisible(true);
    }
  };

  const handleSkipClick = () => {
    setSkipConfirmOpen(true);
  };

  const handleConfirmSkip = () => {
    setSkipConfirmOpen(false);
    handleSave(true);
  };

  // Load external database overview and stores for Step 2
  const loadExternalDbData = async () => {
    setExternalStoresLoading(true);
    setExternalStoresError(null);
    try {
      const targetCompanyId = formCompanyId ?? user?.companyId;
      const [overview, depositiRows] = await Promise.all([
        getExternalOverview(targetCompanyId ?? undefined),
        listExternalDepositi({ targetCompanyId: targetCompanyId ?? undefined, limit: 300 }),
      ]);
      setExternalDbOverview(overview);
      setExternalStores(depositiRows);
    } catch (err) {
      setExternalStoresError(translateApiError(err, t, t('externalAffluence.errorLoadStores')));
    } finally {
      setExternalStoresLoading(false);
    }
  };

  // Refresh database connections
  const handleRefreshDatabases = async () => {
    setRefreshingInternalDb(true);
    setRefreshingExternalDb(true);
    try {
      const targetCompanyId = formCompanyId ?? user?.companyId;
      const overview = await getExternalOverview(targetCompanyId ?? undefined);
      setExternalDbOverview(overview);
    } catch (err) {
      setExternalStoresError(translateApiError(err, t, t('externalAffluence.errorLoadStores')));
    } finally {
      setRefreshingInternalDb(false);
      setRefreshingExternalDb(false);
    }
  };

  // Search external stores
  const handleExternalSearch = async () => {
    if (!externalSearchQuery.trim()) {
      loadExternalDbData();
      return;
    }
    setExternalStoresLoading(true);
    setExternalStoresError(null);
    try {
      const targetCompanyId = formCompanyId ?? user?.companyId;
      const depositiRows = await listExternalDepositi({
        search: externalSearchQuery.trim(),
        targetCompanyId: targetCompanyId ?? undefined,
        limit: 300,
      });
      setExternalStores(depositiRows);
    } catch (err) {
      setExternalStoresError(translateApiError(err, t, t('externalAffluence.errorLoadStores')));
    } finally {
      setExternalStoresLoading(false);
    }
  };

  // Integrate store with external database
  const handleIntegrateStore = async () => {
    if (!externalStoreCode.trim()) {
      setIntegrationError(t('externalAffluence.externalStoreCodeRequired'));
      return;
    }

    // Validate store name if provided
    if (externalStoreName.trim()) {
      const matchingStore = externalStores.find(s => s.externalStoreCode === externalStoreCode.trim());
      if (matchingStore && matchingStore.storeName && matchingStore.storeName !== externalStoreName.trim()) {
        setIntegrationError(t('externalAffluence.storeNameMismatch', `Store name "${externalStoreName.trim()}" does not match the name "${matchingStore.storeName}" for store code "${externalStoreCode.trim()}".`));
        return;
      }
      if (!matchingStore) {
        setIntegrationError(t('externalAffluence.storeCodeNotFound', `Store code "${externalStoreCode.trim()}" not found in available external stores.`));
        return;
      }
    }

    const storeId = createdStoreId ?? editingStore?.id;
    if (!storeId) {
      setIntegrationError(t('externalAffluence.storeNotFound'));
      return;
    }

    setIntegrationLoading(true);
    setIntegrationError(null);
    try {
      const targetCompanyId = formCompanyId ?? user?.companyId;
      await upsertExternalMapping(storeId, {
        externalStoreCode: externalStoreCode.trim(),
        targetCompanyId: targetCompanyId ?? undefined,
      });
      setCurrentMapping({
        externalStoreCode: externalStoreCode.trim(),
        externalStoreName: externalStoreName.trim() || null,
      });
      setExternalStoreCode('');
      setExternalStoreName('');
      showToast(t('externalAffluence.integrationSuccess'), 'success');
    } catch (err) {
      setIntegrationError(translateApiError(err, t, t('externalAffluence.errorIntegration')));
    } finally {
      setIntegrationLoading(false);
    }
  };

  // Remove integration
  const handleRemoveIntegration = async () => {
    const storeId = createdStoreId ?? editingStore?.id;
    if (!storeId) return;

    setIntegrationLoading(true);
    setIntegrationError(null);
    try {
      const targetCompanyId = formCompanyId ?? user?.companyId;
      await deleteExternalMapping(storeId, targetCompanyId ?? undefined);
      setCurrentMapping(null);
      showToast(t('externalAffluence.integrationRemoved'), 'success');
    } catch (err) {
      setIntegrationError(translateApiError(err, t, t('externalAffluence.errorRemoveIntegration')));
    } finally {
      setIntegrationLoading(false);
    }
  };

  const handleSave = async (skipTerminal: boolean = false) => {
    if (editingStore) {
      if (!validateForm()) return;
    } else if (!skipTerminal) {
      if (!validateTerminal()) return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const payload: Partial<Store> = {
        name: formData.name.trim(),
        code: formData.code.trim(),
        address: formData.address.trim() || null,
        cap: formData.cap.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        country: formData.country.trim() || null,
        phone: formData.phone.trim() || null,
        timezone: (formData.timezone || getPreferredTimezoneForCountry(formData.country, browserTimezone)).trim(),
        maxStaff: formData.maxStaff ? parseInt(formData.maxStaff, 10) : 0,
      };

      // Cross-company store creation: send the target company
      if (showCompanyPicker && !editingStore && formCompanyId != null) {
        payload.companyId = formCompanyId;
      }
      if (editingStore) {
        await updateStore(editingStore.id, payload);
        showToast(t('stores.updatedSuccess'), 'success');
        closeForm();
        await loadStores();
      } else {
        const terminalPayload = skipTerminal
          ? undefined
          : { email: getTerminalEmail(), password: terminalPassword };

        if (!skipTerminal && !terminalPassword) {
          setFormError('Terminal password is required');
          setFormSaving(false);
          return;
        }

        const createdStore = await createStore({
          ...payload,
          terminal: terminalPayload
        });
        showToast(t('stores.createdSuccess'), 'success');
        
        // Store the created store ID and move to step 3 for integration
        setCreatedStoreId(createdStore.id);
        await loadStores();
        setFormStep(3);
        if (isSuperAdmin) {
          await loadExternalDbData();
        }
      }
    } catch (err: unknown) {
      setFormError(translateApiError(err, t, t('stores.errorSave')));
    } finally {
      setFormSaving(false);
    }
  };

  const openDelete = (store: Store) => {
    setDeletingStore(store);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeletingStore(null);
    setDeleteError(null);
  };

  const handleDeletePermanent = async () => {
    if (!deletingStore) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteStorePermanent(deletingStore.id);
      showToast(t('stores.deletedSuccess'), 'success');
      closeDelete();
      await loadStores();
    } catch (err: unknown) {
      setDeleteError(translateApiError(err, t, t('stores.errorDelete')));
    } finally {
      setDeleting(false);
    }
  };

  const openActivate = (store: Store) => {
    setActivatingStore(store);
    setActivateError(null);
    setActivateOpen(true);
  };

  const closeActivate = () => {
    setActivateOpen(false);
    setActivatingStore(null);
    setActivateError(null);
  };

  const handleActivate = async () => {
    if (!activatingStore) return;
    setActivating(true);
    setActivateError(null);
    try {
      await activateStore(activatingStore.id);
      showToast(t('stores.activatedSuccess'), 'success');
      closeActivate();
      await loadStores();
    } catch (err: unknown) {
      setActivateError(translateApiError(err, t, t('stores.errorActivate')));
    } finally {
      setActivating(false);
    }
  };

  const openConfirm = (store: Store) => {
    setDeactivatingStore(store);
    setDeactivateInput('');
    setDeactivateError(null);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setDeactivatingStore(null);
    setDeactivateInput('');
    setDeactivateError(null);
  };

  const handleDeactivate = async () => {
    if (!deactivatingStore) return;
    if (deactivateInput.trim() !== deactivatingStore.name) {
      setDeactivateError(t('stores.deactivateNameError', 'Type the exact store name to confirm deactivation.'));
      return;
    }
    setDeactivating(true);
    setDeactivateError(null);
    try {
      await deactivateStore(deactivatingStore.id);
      showToast(t('stores.deactivatedSuccess'), 'success');
      closeConfirm();
      await loadStores();
    } catch (err: unknown) {
      setDeactivateError(translateApiError(err, t, t('stores.errorDeactivate')));
    } finally {
      setDeactivating(false);
    }
  };

  const columns: Column<Store>[] = [
    ...(isSuperAdmin || stores.some((s) => !!s.companyName) ? [{
      key: 'companyName' as keyof Store,
      label: t('stores.colCompany'),
      render: (row: Store) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: row.companyLogoFilename ? '#fff' : 'rgba(13,33,55,0.08)',
            color: 'var(--accent)',
            fontSize: 11,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {row.companyLogoFilename ? (
              <img
                src={getCompanyLogoUrl(row.companyLogoFilename) ?? ''}
                alt={row.companyName ?? 'Company'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>
                {getCompanyInitials(row.companyName)}
              </span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '13.5px',
                color: row.companyName ? 'var(--text-primary)' : 'var(--text-disabled)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 700,
              }}
              title={row.companyName ?? undefined}
            >
              {row.companyName ?? '—'}
            </div>
            {row.groupName ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.groupName}>
                {row.groupName}
              </div>
            ) : null}
          </div>
        </div>
      ),
    }] : []),
    {
      key: 'name',
      label: t('stores.colStore', 'Store'),
      render: (row) => {
        const storeLogoUrl = row.logoFilename ? getStoreLogoUrl(row.logoFilename) : null;
        const countryLabel = getCountryDisplayName(row.country);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: storeLogoUrl ? '#fff' : 'rgba(13,33,55,0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {storeLogoUrl ? (
                <img src={storeLogoUrl} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>{getStoreInitials(row.name)}</span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.name}>
                {truncateText(row.name, 18)}
              </div>
              {(row.country || countryLabel) ? (
                <div style={{ marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  {row.country ? <ReactCountryFlag countryCode={row.country} svg style={{ width: '0.95em', height: '0.95em' }} /> : null}
                  <span>{truncateText(countryLabel ?? row.country ?? '—', 24)}</span>
                </div>
              ) : null}
            </div>
          </div>
        );
      },
    },
    { key: 'code', label: t('stores.colCode') },
    { key: 'address', label: t('stores.colAddress'), render: (row) => truncateText(row.address ?? '—', 32) },
    { key: 'cap', label: t('stores.colCap'), render: (row) => row.cap ?? '—' },
    {
      key: 'maxStaff',
      label: t('stores.colMaxStaff'),
      render: (row) => {
        const max = row.maxStaff;
        const current = row.employeeCount ?? 0;
        if (max === null || max <= 0) {
          return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        }
        const pct = Math.min((current / max) * 100, 100);
        
        let barColor = '#10B981';
        if (pct >= 90) {
          barColor = '#EF4444';
        } else if (pct >= 70) {
          barColor = '#F59E0B';
        }
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 100 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{max}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{Math.round((current / max) * 100)}%</span>
            </div>
            <div style={{
              width: '100%',
              height: 6,
              borderRadius: 3,
              background: 'rgba(13,33,55,0.08)',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 3,
                background: barColor,
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500 }}>
              {current} / {max} {t('stores.staffUnit', 'employees')}
            </div>
          </div>
        );
      }
    },
    { key: 'employeeCount', label: t('stores.colEmployees'), render: (row) => String(row.employeeCount ?? 0) },
    {
      key: 'isActive',
      label: t('stores.colStatus'),
      render: (row) =>
        row.isActive ? (
          <Badge variant="success">{t('common.active')}</Badge>
        ) : (
          <Badge variant="danger">{t('common.inactive')}</Badge>
        ),
    },
    {
      key: 'actions',
      label: t('stores.colActions'),
      render: (row) => {
        return (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => navigate(`/negozi/${toStoreSlug(row)}`)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600, color: 'var(--accent)',
                fontFamily: 'var(--font-body)', padding: '5px 10px',
                borderRadius: 'var(--radius-sm)', display: 'inline-flex',
                alignItems: 'center', gap: '3px', whiteSpace: 'nowrap',
              }}
            >
              {t('common.open')} →
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="page-enter" style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        gap: '12px',
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            margin: '0 0 3px',
            letterSpacing: '-0.02em',
          }}>
            {t('stores.title')}
          </h1>
          {!loading && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {filteredStores.length > 0
                ? t('common.showingResults', { from: 1, to: filteredStores.length, total: filteredStores.length })
                : t('common.noData')}
            </p>
          )}
        </div>
        {isAdminOrHr && (
          <Button onClick={openNewForm}>{t('stores.newStore')}</Button>
        )}
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "10px 12px",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          {/* Universal Search Input */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={18}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <Input
              placeholder={t('stores.searchPlaceholder', 'Search stores by name, code, or city...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: "40px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: "14px",
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Filter Button */}
          <button
            onClick={() => setShowFilterModal(true)}
            style={{
              background: hasActiveFilters
                ? "linear-gradient(135deg, var(--accent) 0%, #B48719 100%)"
                : "var(--surface)",
              color: hasActiveFilters ? "#fff" : "var(--text-secondary)",
              border: hasActiveFilters ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
              transition: "all 0.2s",
              boxShadow: hasActiveFilters ? "0 2px 8px rgba(139,105,20,0.24)" : "none",
              position: "relative",
              height: '42px',
              boxSizing: 'border-box'
            }}
          >
            <Filter size={16} strokeWidth={2.5} />
            {t("common.filters", "Filters")}
            {activeFilterTags.length > 0 && (
              <span
                style={{
                  background: "#fff",
                  color: "var(--accent)",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: "999px",
                  minWidth: "18px",
                  textAlign: "center",
                }}
              >
                {activeFilterTags.length}
              </span>
            )}
          </button>

          {/* Reset Filters Button */}
          {(hasActiveFilters || search) && (
            <button
              onClick={resetFilters}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "10px 14px",
                fontSize: "13px",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexShrink: 0,
                transition: "border-color 0.15s, color 0.15s",
                height: '42px',
                boxSizing: 'border-box'
              }}
              title={t("stores.resetFilters", "Reset all filters")}
            >
              <X size={16} />
              {!isMobile && t("common.reset", "Reset")}
            </button>
          )}
        </div>

        {/* Active Filter Tags */}
        {activeFilterTags.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              padding: "0 4px",
            }}
          >
            {activeFilterTags.map((tag) => (
              <div
                key={tag.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "linear-gradient(135deg, rgba(139,105,20,0.08) 0%, rgba(180,135,25,0.08) 100%)",
                  border: "1px solid rgba(139,105,20,0.25)",
                  borderRadius: "8px",
                  padding: "6px 10px 6px 12px",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                  {tag.label}:
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {tag.value}
                </span>
                <button
                  onClick={() => removeFilter(tag.key)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    borderRadius: "4px",
                    transition: "background 0.15s, color 0.15s",
                  }}
                  title={t("stores.removeFilter", "Remove filter")}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: '16px' }}>
          <Alert variant="danger" title={t('common.error')} onClose={() => setError(null)}>
            {error}
          </Alert>
        </div>
      )}

      <Table<Store>
        columns={columns}
        data={filteredStores}
        loading={loading}
        emptyText={t('stores.noStores')}
        headerBackground="var(--primary)"
        headerTextColor="#ffffff"
        headerBorderBottom="none"
      />

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={handleCloseFormWithReload}
        title={editingStore ? t('stores.editStore') : t('stores.newStore')}
        footer={
          <>
            {editingStore && formStep === 2 ? (
              <>
                <Button variant="secondary" onClick={() => setFormStep(1)}>
                  ← {t('common.back')}
                </Button>
                <Button variant="secondary" onClick={handleCloseFormWithReload}>
                  {t('common.close')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={handleCloseFormWithReload} disabled={formSaving || integrationLoading}>
                  {formStep === 3 ? t('common.close') : t('common.cancel')}
                </Button>
                {editingStore ? (
                  formStep === 1 ? (
                    <>
                      <Button onClick={() => handleSave()} loading={formSaving}>
                        {t('common.save')}
                      </Button>
                      <Button variant="secondary" onClick={async () => { setFormStep(2); if (isSuperAdmin) { await loadExternalDbData(); } }}>
                        {t('stores.goToIntegration')} →
                      </Button>
                    </>
                  ) : null
                ) : formStep === 1 ? (
                  <Button onClick={() => handleNext()}>
                    {t('common.next')}
                  </Button>
                ) : formStep === 2 ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={() => setFormStep(1)}>
                      ← {t('common.back')}
                    </Button>
                    <Button variant="secondary" onClick={() => handleSkipClick()} disabled={formSaving}>
                      {t('stores.skipTerminal')}
                    </Button>
                    <Button onClick={() => handleSave()} loading={formSaving}>
                      {t('common.next')}
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button onClick={handleCloseFormWithReload}>
                      {t('common.finish', 'Finish')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Step Indicators */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--surface-warm)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            marginBottom: '20px',
          }}>
            {(editingStore ? [1, 2] : [1, 2, 3]).map((s, idx) => {
              const isActive = formStep === s;
              const isCompleted = formStep > s;
              
              let stepLabel = '';
              if (editingStore) {
                stepLabel = s === 1 
                  ? t('stores.stepDetails', 'Dettagli') 
                  : t('stores.stepIntegration', 'Integrazione');
              } else {
                stepLabel = s === 1 
                  ? t('stores.stepDetails', 'Dettagli') 
                  : s === 2 
                    ? t('stores.storeTerminal', 'Terminale') 
                    : t('stores.stepIntegration', 'Integrazione');
              }

              return (
                <React.Fragment key={s}>
                  {idx > 0 && (
                    <div style={{
                      flex: 1,
                      height: '2px',
                      background: isCompleted ? '#10B981' : 'var(--border)',
                      margin: '0 8px',
                      marginTop: '11px',
                      transition: 'background 0.3s ease',
                    }} />
                  )}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    textAlign: 'center',
                  }}>
                    <span style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: isCompleted ? '#10B981' : isActive ? 'var(--accent)' : 'var(--border)',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      transition: 'all 0.3s ease',
                    }}>
                      {isCompleted ? '✓' : s}
                    </span>
                    <span style={{
                      fontSize: '11.5px',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--accent)' : isCompleted ? '#10B981' : 'var(--text-muted)',
                      transition: 'all 0.3s ease',
                      whiteSpace: 'nowrap',
                    }}>
                      {stepLabel}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          {formError && (
            <Alert variant="danger" onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          )}

          {(formStep === 3 && !editingStore) || (formStep === 2 && editingStore) ? (
            /* ========== STEP 3/2: External Database Integration ========== */
            !isSuperAdmin ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Store Info - ATS Style */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    🏪 {t('stores.colName', 'Store')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {(editingStore?.logoFilename || createdStoreId) && getStoreLogoUrl(editingStore?.logoFilename) ? (
                      <img 
                        src={getStoreLogoUrl(editingStore?.logoFilename) || ''} 
                        alt={formData.name}
                        style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--accent)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 14,
                      }}>
                        {formData.name?.[0]?.toUpperCase() || 'S'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formData.name}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          background: 'var(--surface-50)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}>
                          {formData.code}
                        </span>
                        {formData.country && (
                          <ReactCountryFlag 
                            countryCode={formData.country} 
                            svg 
                            style={{ width: '0.9em', height: '0.9em' }} 
                          />
                        )}
                      </div>
                      {formData.city && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {formData.city}{formData.state ? `, ${formData.state}` : ''}{formData.country ? ` · ${formData.country}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Premium Admin notice banner */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 24px',
                  background: 'var(--surface-50)',
                  borderRadius: '12px',
                  border: '1px dashed var(--border)',
                  textAlign: 'center',
                  gap: '16px',
                }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'rgba(13,33,55,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                  }}>
                    <Database size={24} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('externalAffluence.integration', 'Store Integration')}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '380px', lineHeight: 1.5 }}>
                      {t('stores.adminIntegrationNotice')}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Database Connection Status - Enhanced */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
              }}>
                {/* Internal Database */}
                <div style={{
                  padding: '14px',
                  background: 'var(--surface-50)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} color="var(--text-muted)" />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('externalAffluence.internalDatabase')}
                      </span>
                    </div>
                    <button
                      onClick={handleRefreshDatabases}
                      disabled={refreshingInternalDb}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: refreshingInternalDb ? 'not-allowed' : 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        opacity: refreshingInternalDb ? 0.5 : 1,
                      }}
                    >
                      <RefreshCw size={14} style={{ animation: refreshingInternalDb ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {externalDbOverview?.connections.internal.ok ? (
                      <CheckCircle size={16} color="#10B981" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 600, color: externalDbOverview?.connections.internal.ok ? '#10B981' : '#EF4444' }}>
                      {externalDbOverview?.connections.internal.ok ? t('common.connected') : t('common.disconnected')}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {externalDbOverview?.databases.internal.databaseName ?? '—'}
                  </div>
                  {externalDbOverview?.counts && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{externalDbOverview.counts.stores}</span> {t('common.stores', 'Stores')}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600 }}>{externalDbOverview.counts.companies}</span> {t('common.companies', 'Companies')}
                      </div>
                    </div>
                  )}
                </div>

                {/* External Database */}
                <div style={{
                  padding: '14px',
                  background: 'var(--surface-50)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} color="var(--text-muted)" />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('externalAffluence.externalDatabase')}
                      </span>
                    </div>
                    <button
                      onClick={handleRefreshDatabases}
                      disabled={refreshingExternalDb}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: refreshingExternalDb ? 'not-allowed' : 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        opacity: refreshingExternalDb ? 0.5 : 1,
                      }}
                    >
                      <RefreshCw size={14} style={{ animation: refreshingExternalDb ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {externalDbOverview?.connections.external.ok ? (
                      <CheckCircle size={16} color="#10B981" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 600, color: externalDbOverview?.connections.external.ok ? '#10B981' : '#EF4444' }}>
                      {externalDbOverview?.connections.external.ok ? t('common.connected') : t('common.disconnected')}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {externalDbOverview?.databases.external.databaseName ?? '—'}
                  </div>
                  {externalStores.length > 0 && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{externalStores.length}</span> {t('common.stores', 'Stores')}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600 }}>{new Set(externalStores.map(s => s.companyName).filter(Boolean)).size}</span> {t('common.companies', 'Companies')}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Company Info - ATS Style */}
              {selectedCompany && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    🏢 {t('common.company', 'Company')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {selectedCompany.logoFilename && getCompanyLogoUrl(selectedCompany.logoFilename) ? (
                      <img 
                        src={getCompanyLogoUrl(selectedCompany.logoFilename) || ''} 
                        alt={selectedCompany.name}
                        style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 14,
                      }}>
                        {selectedCompany.name?.[0]?.toUpperCase() || 'C'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedCompany.name}
                        </span>
                        {selectedCompany.country && (
                          <ReactCountryFlag 
                            countryCode={selectedCompany.country} 
                            svg 
                            style={{ width: '0.9em', height: '0.9em', flexShrink: 0 }} 
                          />
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {selectedCompany.groupName && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--accent)',
                            background: 'var(--accent-light)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}>
                            {selectedCompany.groupName}
                          </span>
                        )}
                        {(selectedCompany.ownerName || selectedCompany.ownerSurname) && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {selectedCompany.ownerAvatarFilename && getAvatarUrl(selectedCompany.ownerAvatarFilename) ? (
                              <img 
                                src={getAvatarUrl(selectedCompany.ownerAvatarFilename) || ''} 
                                alt={`${selectedCompany.ownerName} ${selectedCompany.ownerSurname}`}
                                style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: 'var(--primary)', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 7, fontWeight: 700,
                              }}>
                                {selectedCompany.ownerName?.[0]?.toUpperCase() || 'O'}
                              </div>
                            )}
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                              {selectedCompany.ownerName} {selectedCompany.ownerSurname}
                            </span>
                          </div>
                        )}
                        {selectedCompany.storeCount != null && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            · {selectedCompany.storeCount} {t('employees.storesLabel', 'Stores')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Store Info - ATS Style */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                  🏪 {t('stores.colName', 'Store')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {(editingStore?.logoFilename || createdStoreId) && getStoreLogoUrl(editingStore?.logoFilename) ? (
                    <img 
                      src={getStoreLogoUrl(editingStore?.logoFilename) || ''} 
                      alt={formData.name}
                      style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'var(--accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14,
                    }}>
                      {formData.name?.[0]?.toUpperCase() || 'S'}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formData.name}
                      </span>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        background: 'var(--surface-50)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}>
                        {formData.code}
                      </span>
                      {formData.country && (
                        <ReactCountryFlag 
                          countryCode={formData.country} 
                          svg 
                          style={{ width: '0.9em', height: '0.9em' }} 
                        />
                      )}
                    </div>
                    {formData.city && (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        {formData.city}{formData.state ? `, ${formData.state}` : ''}{formData.country ? ` · ${formData.country}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Integration Section */}
              {integrationError && (
                <Alert variant="danger" onClose={() => setIntegrationError(null)}>
                  {integrationError}
                </Alert>
              )}

              {currentMapping ? (
                /* Show comprehensive integration details */
                <div style={{
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden',
                }}>
                  {/* Header */}
                  <div style={{ 
                    background: 'var(--primary)', 
                    padding: '14px 18px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={18} color="#fff" />
                      <div>
                        <div style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '2px' }}>
                          {t('externalAffluence.integration', 'Integration')}
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                          {t('externalAffluence.integrationActive')}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleRemoveIntegration}
                      loading={integrationLoading}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        background: 'rgba(239,68,68,0.9)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '11px'
                      }}
                    >
                      <Unlink size={12} />
                      {t('common.remove')}
                    </Button>
                  </div>

                  {/* Integration Details Grid */}
                  <div style={{ padding: '18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      {/* External Store Info */}
                      <div style={{ 
                        padding: '14px',
                        background: 'var(--background)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ 
                          fontSize: '10px', 
                          fontWeight: 700, 
                          color: 'var(--accent)', 
                          textTransform: 'uppercase', 
                          letterSpacing: '1.5px', 
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          🌐 {t('externalAffluence.externalStore', 'External Store')}
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('externalAffluence.storeCode', 'Store Code')}
                          </span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginTop: '2px', fontFamily: 'monospace' }}>
                            {currentMapping.externalStoreCode}
                          </div>
                        </div>
                        {currentMapping.externalStoreName && (
                          <div>
                            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {t('externalAffluence.storeName', 'Store Name')}
                            </span>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {currentMapping.externalStoreName}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Internal Store Info */}
                      <div style={{ 
                        padding: '14px',
                        background: 'var(--surface-warm)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ 
                          fontSize: '10px', 
                          fontWeight: 700, 
                          color: 'var(--primary)', 
                          textTransform: 'uppercase', 
                          letterSpacing: '1.5px', 
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          🏪 {t('externalAffluence.internalStore', 'Internal Store')}
                        </div>
                        {selectedCompany && (
                          <div style={{ marginBottom: '10px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              🏢 {t('common.company', 'Company')}
                            </span>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                              {selectedCompany.name}
                            </div>
                          </div>
                        )}
                        <div style={{ marginBottom: '10px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('externalAffluence.storeCode', 'Store Code')}
                          </span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginTop: '2px', fontFamily: 'monospace' }}>
                            {formData.code}
                          </div>
                        </div>
                        {formData.name && (
                          <div>
                            <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {t('externalAffluence.storeName', 'Store Name')}
                            </span>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {formData.name}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Show integration form */
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input
                      label={t('externalAffluence.externalStoreCode') + ' *'}
                      value={externalStoreCode}
                      onChange={(e) => setExternalStoreCode(e.target.value.trim())}
                      placeholder={t('externalAffluence.placeholderStoreCode')}
                    />
                    <Input
                      label={t('externalAffluence.externalStoreName')}
                      value={externalStoreName}
                      onChange={(e) => setExternalStoreName(e.target.value)}
                      placeholder={t('externalAffluence.placeholderStoreName')}
                    />
                  </div>
                  <Button
                    onClick={handleIntegrateStore}
                    loading={integrationLoading}
                    disabled={!externalStoreCode.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
                  >
                    <LinkIcon size={16} />
                    {t('externalAffluence.integrateStore')}
                  </Button>
                </>
              )}

              {/* External Stores Table - Hide when integration exists */}
              {!currentMapping && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    overflow: 'hidden',
                  }}>
                    {/* Header */}
                    <div style={{ 
                      background: 'var(--primary)', 
                      padding: '12px 16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between' 
                    }}>
                      <div>
                        <div style={{ fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '2px' }}>
                          {t('externalAffluence.availableStores', 'Available Stores')}
                        </div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                          {t('externalAffluence.availableExternalStores')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {externalStoresLoading && (
                          <div style={{
                            width: 14, height: 14, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                            animation: 'spin 0.7s linear infinite',
                          }} />
                        )}
                      </div>
                    </div>

                    {/* Search Bar */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Input
                          value={externalSearchQuery}
                          onChange={(e) => setExternalSearchQuery(e.target.value)}
                          placeholder={t('externalAffluence.searchStores', 'Search by store name, company, or code...')}
                          style={{ flex: 1 }}
                        />
                        <Button onClick={handleExternalSearch} loading={externalStoresLoading} size="sm">
                          <Search size={14} />
                        </Button>
                      </div>
                    </div>

                    {externalStoresError && (
                      <div style={{ padding: '12px 16px' }}>
                        <Alert variant="danger" onClose={() => setExternalStoresError(null)}>
                          {externalStoresError}
                        </Alert>
                      </div>
                    )}

                    {externalStoresLoading ? (
                      <div style={{ padding: '40px', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          {t('common.loading')}...
                        </div>
                      </div>
                    ) : filteredExternalStores.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🏪</div>
                        {externalSearchQuery.trim() ? 
                          t('externalAffluence.noSearchResults', 'No stores found matching your search.') :
                          t('externalAffluence.noExternalStores')
                        }
                      </div>
                    ) : (
                      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, background: 'var(--accent)', zIndex: 1 }}>
                            <tr>
                              <th style={{ 
                                padding: '8px 10px', 
                                textAlign: 'left', 
                                fontSize: '8px', 
                                fontWeight: 700, 
                                color: '#fff', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1.2px',
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                width: '15%'
                              }}>
                                {t('externalAffluence.storeCode')}
                              </th>
                              <th style={{ 
                                padding: '8px 10px', 
                                textAlign: 'left', 
                                fontSize: '8px', 
                                fontWeight: 700, 
                                color: '#fff', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1.2px',
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                width: '25%'
                              }}>
                                {t('externalAffluence.storeName')}
                              </th>
                              <th style={{ 
                                padding: '8px 10px', 
                                textAlign: 'left', 
                                fontSize: '8px', 
                                fontWeight: 700, 
                                color: '#fff', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1.2px',
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                width: '20%'
                              }}>
                                {t('externalAffluence.companyName')}
                              </th>
                              <th style={{ 
                                padding: '8px 10px', 
                                textAlign: 'center', 
                                fontSize: '8px', 
                                fontWeight: 700, 
                                color: '#fff', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1.2px',
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                width: '15%'
                              }}>
                                {t('externalAffluence.dataAvailable')}
                              </th>
                              <th style={{ 
                                padding: '8px 10px', 
                                textAlign: 'left', 
                                fontSize: '8px', 
                                fontWeight: 700, 
                                color: '#fff', 
                                textTransform: 'uppercase', 
                                letterSpacing: '1.2px',
                                width: '25%'
                              }}>
                                {t('externalAffluence.dataRange')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredExternalStores.map((store, idx) => (
                              <tr
                                key={idx}
                                style={{
                                  cursor: 'pointer',
                                  background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-warm)',
                                  transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => { 
                                  e.currentTarget.style.background = 'var(--accent-light)'; 
                                }}
                                onMouseLeave={(e) => { 
                                  e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-warm)'; 
                                }}
                                onClick={() => {
                                  setExternalStoreCode(store.externalStoreCode);
                                  setExternalStoreName(store.storeName ?? '');
                                }}
                              >
                                <td style={{ 
                                  padding: '10px', 
                                  fontSize: '11px', 
                                  fontWeight: 700, 
                                  color: 'var(--primary)', 
                                  borderBottom: '1px solid var(--border-light)',
                                  fontFamily: 'monospace'
                                }}>
                                  {store.externalStoreCode}
                                </td>
                                <td style={{ 
                                  padding: '10px', 
                                  fontSize: '11px', 
                                  color: 'var(--text-primary)', 
                                  borderBottom: '1px solid var(--border-light)',
                                  fontWeight: 500
                                }}>
                                  {store.storeName ?? '—'}
                                </td>
                                <td style={{ 
                                  padding: '10px', 
                                  fontSize: '10px', 
                                  color: 'var(--text-secondary)', 
                                  borderBottom: '1px solid var(--border-light)' 
                                }}>
                                  {store.companyName ?? '—'}
                                </td>
                                <td style={{ 
                                  padding: '10px', 
                                  textAlign: 'center', 
                                  fontSize: '10px', 
                                  borderBottom: '1px solid var(--border-light)' 
                                }}>
                                  {store.availableDays > 0 ? (
                                    <div style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      padding: '2px 6px',
                                      borderRadius: '10px',
                                      background: 'rgba(22,163,74,0.12)',
                                      border: '1px solid rgba(34,197,94,0.3)'
                                    }}>
                                      <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#22c55e' }} />
                                      <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '9px' }}>
                                        {store.availableDays} {t('common.days')}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                                  )}
                                </td>
                                <td style={{ 
                                  padding: '10px', 
                                  fontSize: '9px', 
                                  color: 'var(--text-secondary)', 
                                  borderBottom: '1px solid var(--border-light)',
                                  fontFamily: 'monospace'
                                }}>
                                  {store.availableFromDate && store.availableToDate ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                        {new Date(store.availableFromDate).toLocaleDateString()}
                                      </span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '8px' }}>
                                        → {new Date(store.availableToDate).toLocaleDateString()}
                                      </span>
                                    </div>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            ))
          : formStep === 2 && !editingStore ? (
            /* ========== STEP 2: Terminal Setup (Create Mode Only) ========== */
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.65fr 0.85fr',
              gap: '24px',
              alignItems: 'start',
            }}>
              {/* Left Side: Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {t('stores.terminalDescription', "It's the terminal that employees use to scan QR codes from their mobile devices.")}
                </div>
                
                <Input
                  label="Terminal Email"
                  value={getTerminalEmail()}
                  readOnly
                  onChange={() => {}} // noop to avoid react warnings
                  style={{ backgroundColor: 'var(--surface-50)' }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Temporary password *
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Input
                        type={terminalPasswordVisible ? 'text' : 'password'}
                        value={terminalPassword}
                        onChange={(e) => {
                          setTerminalPassword(e.target.value);
                          if (terminalPasswordError) setTerminalPasswordError(null);
                        }}
                        placeholder="Enter password..."
                        style={{
                          paddingRight: '40px',
                          borderColor: terminalPasswordError ? '#DC2626' : undefined,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setTerminalPasswordVisible(!terminalPasswordVisible)}
                        style={{
                          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                          padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        {terminalPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button variant="secondary" onClick={() => { generatePassword(); setTerminalPasswordVisible(true); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RefreshCw size={14} /> Generate
                    </Button>
                  </div>
                  {terminalPasswordError ? (
                    <p style={{ margin: 0, fontSize: '12px', color: '#DC2626', fontWeight: 600 }}>
                      {terminalPasswordError}
                    </p>
                  ) : (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t('users.passwordHint', 'At least 8 characters. Save it — it will not be shown again.')}
                    </p>
                  )}
                </div>
              </div>

              {/* Right Side: visually stunning QR code tablet representation */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 16px',
                background: 'var(--surface-warm)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-md)',
                minHeight: '260px',
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '240px',
                margin: '0 auto',
              }}>
                <style>{`
                  @keyframes scanLineAnim {
                    0% { top: 10%; }
                    50% { top: 90%; }
                    100% { top: 10%; }
                  }
                  @keyframes qrPulse {
                    0% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.1)); }
                    50% { transform: scale(1.02); filter: drop-shadow(0 0 12px rgba(139, 92, 246, 0.3)); }
                    100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.1)); }
                  }
                `}</style>
                {/* Tablet Frame Header */}
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 800, 
                  color: 'var(--accent)', 
                  letterSpacing: '0.08em', 
                  textTransform: 'uppercase',
                  marginBottom: '16px',
                  background: 'rgba(201, 151, 58, 0.08)',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid rgba(201, 151, 58, 0.15)'
                }}>
                  {t('stores.liveTerminal', 'CLOCK-IN TERMINAL')}
                </div>

                {/* QR Code Graphic Wrapper */}
                <div style={{
                  position: 'relative',
                  width: '120px',
                  height: '120px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'qrPulse 3s infinite ease-in-out',
                }}>
                  {/* Visual QR Code using a detailed mock SVG with gradient and anchors */}
                  <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display: 'block' }}>
                    <defs>
                      <linearGradient id="qrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="var(--accent)" />
                        <stop offset="50%" stopColor="#8B5CF6" />
                        <stop offset="100%" stopColor="#3B82F6" />
                      </linearGradient>
                    </defs>
                    
                    {/* Background abstraction dots */}
                    <rect x="25" y="25" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="35" y="25" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="45" y="35" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="25" y="45" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="35" y="45" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    
                    <rect x="55" y="25" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="65" y="35" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="55" y="45" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="65" y="45" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    
                    <rect x="25" y="55" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="35" y="65" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="45" y="55" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    
                    <rect x="55" y="55" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="65" y="55" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="55" y="65" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="65" y="65" width="6" height="6" fill="url(#qrGrad)" rx="1" />

                    <rect x="75" y="25" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="75" y="35" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="75" y="55" width="6" height="6" fill="url(#qrGrad)" rx="1" />
                    <rect x="75" y="65" width="6" height="6" fill="url(#qrGrad)" rx="1" />

                    {/* Top-Left Anchor */}
                    <path d="M5,5 H21 V21 H5 Z M9,9 V17 H17 V9 Z" fill="url(#qrGrad)" />
                    <rect x="11" y="11" width="6" height="6" fill="url(#qrGrad)" rx="1" />

                    {/* Top-Right Anchor */}
                    <path d="M79,5 H95 V21 H79 Z M83,9 V17 H91 V9 Z" fill="url(#qrGrad)" />
                    <rect x="85" y="11" width="6" height="6" fill="url(#qrGrad)" rx="1" />

                    {/* Bottom-Left Anchor */}
                    <path d="M5,79 H21 V95 H5 Z M9,83 V91 H17 V83 Z" fill="url(#qrGrad)" />
                    <rect x="11" y="85" width="6" height="6" fill="url(#qrGrad)" rx="1" />

                    {/* Bottom-Right Small Alignment Square */}
                    <path d="M81,81 H91 V91 H81 Z M84,84 V88 H88 V84 Z" fill="url(#qrGrad)" />
                  </svg>

                  {/* Red Laser Scanner Line */}
                  <div style={{
                    position: 'absolute',
                    left: '8px',
                    right: '8px',
                    height: '2px',
                    background: '#EF4444',
                    boxShadow: '0 0 8px #EF4444, 0 0 12px #EF4444',
                    animation: 'scanLineAnim 3s infinite linear',
                    zIndex: 2,
                    pointerEvents: 'none',
                  }} />
                </div>

                {/* Info Text below */}
                <div style={{ 
                  fontSize: '11px', 
                  color: 'var(--text-muted)', 
                  marginTop: '16px', 
                  textAlign: 'center', 
                  lineHeight: '1.4', 
                  maxWidth: '180px' 
                }}>
                  {t('stores.terminalScanTip', 'Employees will scan this QR to Clock-in / Clock-out.')}
                </div>
              </div>
            </div>
          ) : (
            /* ========== STEP 1: Store Details ========== */
            <>
          {showCompanyPicker && !editingStore && (
            <div style={{ display: 'grid', gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {t('stores.fieldCompany')}
              </label>
              <CustomSelect
                value={formCompanyId ? String(formCompanyId) : null}
                onChange={(val) => {
                  setFormCompanyId(val ? parseInt(val, 10) : null);
                }}
                options={companyOptions}
                placeholder={t('stores.placeholderCompany')}
                disabled={formSaving || companiesLoading}
                error={formErrors.companyId}
                isClearable={false}
                searchable={companies.length > 5}
                highlightSelected={true}
              />
            </div>
          )}
          <Input
            label={t('stores.fieldName')}
            value={formData.name}
            onChange={(e) => {
              const name = e.target.value;
              setFormData((prev) => {
                if (codeIsAuto.current) {
                  const existingCodes = stores
                    .filter((s) => !editingStore || s.id !== editingStore.id)
                    .map((s) => s.code);
                  const suggested = generateStoreCode(name, existingCodes);
                  return { ...prev, name, code: suggested };
                }
                return { ...prev, name };
              });
            }}
            error={formErrors.name}
            placeholder={t('stores.placeholderName')}
          />
          <div>
            <Input
              label={t('stores.fieldCode')}
              value={formData.code}
              onChange={(e) => {
                codeIsAuto.current = false;
                setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }));
              }}
              error={formErrors.code}
              placeholder={t('stores.placeholderCode')}
            />
            {codeIsAuto.current && formData.code && (
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                {t('stores.codeAutoHint')}
              </p>
            )}
          </div>
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
              setFormData((prev) => {
                const nextTimezone = prev.country !== location.country
                  ? getPreferredTimezoneForCountry(location.country, prev.timezone || browserTimezone)
                  : prev.timezone;

                return {
                  ...prev,
                  country: location.country,
                  state: location.state,
                  city: location.city,
                  address: location.address,
                  cap: location.postalCode,
                  phone: location.phone,
                  timezone: nextTimezone,
                };
              });
            }}
            includeAddress
            includePostalCode
            includePhone
            disabled={formSaving}
            labels={{
              country: t('companies.country', 'Country'),
              state: t('companies.state', 'State'),
              city: t('companies.city', 'City'),
              address: t('stores.fieldAddress'),
              postalCode: t('stores.fieldCap'),
              phone: t('companies.companyPhoneNumbers', 'Phone'),
            }}
          />
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {t('stores.fieldMaxStaff')}
              </label>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {activeEmployeeCount} / {maxCapacityLabel}
              </span>
            </div>
            <Input
              type="number"
              min="0"
              value={formData.maxStaff}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxStaff: e.target.value }))}
              placeholder={t('stores.placeholderMaxStaff')}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {t('stores.fieldTimezone', 'Timezone')}
            </label>
            <CustomSelect
              value={formData.timezone || browserTimezone}
              onChange={(value) => {
                if (!value) return;
                setFormData((prev) => ({ ...prev, timezone: value }));
              }}
              options={timezoneOptions}
              placeholder={t('stores.placeholderTimezone', 'Select timezone')}
              searchPlaceholder={t('settings.timezoneSearchPlaceholder', 'Search timezone...')}
              noOptionsMessage={t('settings.timezoneNoResults', 'No timezone found')}
              disabled={formSaving}
              isClearable={false}
            />
          </div>
            </>
          )}
        </div>
      </Modal>

      {/* Confirm Deactivate Modal */}
      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title={t('stores.confirmDeactivate')}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={deactivating}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeactivate} loading={deactivating} disabled={deactivateInput.trim() !== (deactivatingStore?.name ?? '')}>
              {t('common.deactivate')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {deactivateError && (
            <Alert variant="danger" onClose={() => setDeactivateError(null)}>
              {deactivateError}
            </Alert>
          )}
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {t('stores.confirmDeactivateMsg', { name: deactivatingStore?.name ?? '' })}
          </p>
          <Input
            label={t('stores.typeNameToDeactivate', 'Type the exact store name to deactivate')}
            value={deactivateInput}
            onChange={(event) => setDeactivateInput(event.target.value)}
            placeholder={deactivatingStore?.name ?? ''}
            disabled={deactivating}
          />
          <div style={{ fontSize: 12, color: deactivateInput.trim() === (deactivatingStore?.name ?? '') ? '#166534' : 'var(--text-muted)' }}>
            {deactivateInput.trim() === (deactivatingStore?.name ?? '')
              ? t('stores.deactivateNameMatched', 'Name matches. Deactivation is enabled.')
              : t('stores.deactivateNameMismatch', 'Name must match exactly to deactivate.')}
          </div>
        </div>
      </Modal>

      {/* Activate Modal */}
      <Modal
        open={activateOpen}
        onClose={closeActivate}
        title={t('stores.confirmActivate')}
        footer={
          <>
            <Button variant="secondary" onClick={closeActivate} disabled={activating}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleActivate} loading={activating}>
              {t('common.activate')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activateError && (
            <Alert variant="danger" onClose={() => setActivateError(null)}>
              {activateError}
            </Alert>
          )}
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {t('stores.confirmActivateMsg', { name: activatingStore?.name ?? '' })}
          </p>
        </div>
      </Modal>

      {/* Permanent Delete Modal */}
      <Modal
        open={deleteOpen}
        onClose={closeDelete}
        title={t('stores.confirmDeleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeletePermanent} loading={deleting}>
              {t('stores.confirmDeleteBtn')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {deleteError && (
            <Alert variant="danger" onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {t('stores.confirmDeleteMsg', { name: deletingStore?.name ?? '' })}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--warning)', fontWeight: 500 }}>
            {t('stores.confirmDeleteWarning')}
          </p>
        </div>
      </Modal>

      {/* Skip Terminal Confirmation Modal */}
      <Modal
        open={skipConfirmOpen}
        onClose={() => setSkipConfirmOpen(false)}
        title={t('stores.skipTerminalConfirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSkipConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirmSkip}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {t('stores.skipTerminalConfirmMsg')}
          </p>
        </div>
      </Modal>

      <StoreFilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={setFilters}
        initialFilters={filters}
        companyOptions={companyOptions}
        statusOptions={statusOptions}
        countryOptions={countryOptions}
        showCompanyFilter={showCompanyFilter}
      />
    </div>
  );
}

export default StoreList;
