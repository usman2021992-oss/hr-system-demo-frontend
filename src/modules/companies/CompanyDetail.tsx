import { getApiErrorCode } from '../../utils/apiErrors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CurrencySelect from '../../components/ui/CurrencySelect';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactCountryFlag from 'react-country-flag';
import {
  ArrowLeft,
  Building2,
  Layers,
  Store as StoreIcon,
  Users,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  Camera,
  UploadCloud,
  MapPin,
  Image as ImageIcon,
  Coins,
  Hash,
  CalendarClock,
  HardDrive,
  Smartphone,
  Receipt,
  Tag,
  LayoutDashboard,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  activateCompany,
  deactivateCompany,
  deleteCompanyPermanent,
  deleteCompanyLogo,
  getCompanyById,
  transferCompanyOwnership,
  updateCompany,
  uploadCompanyBanner,
  uploadCompanyLogo,
  deleteCompanyBanner,
} from '../../api/companies';
import { getCompanyGroups } from '../../api/companyGroups';
import { getStores } from '../../api/stores';
import { getEmployees } from '../../api/employees';
import { getAvatarUrl, getCompanyBannerUrl, getCompanyLogoUrl, getStoreLogoUrl } from '../../api/client';
import { Company, Employee, Store, BillingOverview } from '../../types';
import { billingApi } from '../../api/billing';
import { translateApiError } from '../../utils/apiErrors';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { Select } from '../../components/ui/Select';
import { DatePicker } from '../../components/ui/DatePicker';
import { LocationFieldGroup } from '../../components/location';
import { getCountryDisplayName } from '../../utils/country';
import { getCompanies } from '../../api/companies';
import {
  EMPTY_FISCAL_ERRORS,
  FiscalFieldErrors,
  hasFiscalErrors,
  validateFiscalFields,
} from '../../utils/italianFiscal';

function parseCompanyIdFromSlug(slug?: string): number | null {
  if (!slug) return null;
  const match = slug.match(/^(\d+)(?:-|$)/);
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return Number.isNaN(id) ? null : id;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || 'CO').toUpperCase();
}

type CompanyProfileForm = {
  registrationNumber: string;
  vatNumber: string;
  sdiRecipientCode: string;
  pecEmail: string;
  companyEmail: string;
  companyPhoneNumbers: string;
  officesLocations: string;
  country: string;
  city: string;
  state: string;
  address: string;
  currency: string;
  pricePerEmployee: number | '';
  pricePerDevice: number | '';
  extraStoragePricePerGb: number | '';
  storageLimitGb: number | '';
  accessValidFrom: string;
  accessValidTo: string;
  discountPercent: number | '';
  discountValidFrom: string;
  discountValidTo: string;
};

const EMPTY_PROFILE_FORM: CompanyProfileForm = {
  registrationNumber: '',
  vatNumber: '',
  sdiRecipientCode: '',
  pecEmail: '',
  companyEmail: '',
  companyPhoneNumbers: '',
  officesLocations: '',
  country: '',
  city: '',
  state: '',
  address: '',
  currency: '',
  pricePerEmployee: '',
  pricePerDevice: '',
  extraStoragePricePerGb: '',
  storageLimitGb: '',
  accessValidFrom: '',
  accessValidTo: '',
  discountPercent: '',
  discountValidFrom: '',
  discountValidTo: '',
};

function profileFromCompany(company: Company | null): CompanyProfileForm {
  if (!company) return { ...EMPTY_PROFILE_FORM };
  return {
    registrationNumber: company.registrationNumber ?? '',
    vatNumber: company.vatNumber ?? '',
    sdiRecipientCode: company.sdiRecipientCode ?? '',
    pecEmail: company.pecEmail ?? '',
    companyEmail: company.companyEmail ?? '',
    companyPhoneNumbers: company.companyPhoneNumbers ?? '',
    officesLocations: company.officesLocations ?? '',
    country: company.country ?? '',
    city: company.city ?? '',
    state: company.state ?? '',
    address: company.address ?? '',
    currency: company.currency ?? '',
    pricePerEmployee: company.pricePerEmployee ?? '',
    pricePerDevice: company.pricePerDevice ?? '',
    extraStoragePricePerGb: company.extraStoragePricePerGb ?? '',
    storageLimitGb: company.storageLimitGb ?? 500,
    accessValidFrom: company.accessValidFrom ? company.accessValidFrom.substring(0, 10) : '',
    accessValidTo: company.accessValidTo ? company.accessValidTo.substring(0, 10) : '',
    discountPercent: company.discountPercent ?? '',
    discountValidFrom: company.discountValidFrom ? company.discountValidFrom.substring(0, 10) : '',
    discountValidTo: company.discountValidTo ? company.discountValidTo.substring(0, 10) : '',
  };
}

function normalizeProfileValue(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function profilePayload(profile: CompanyProfileForm) {
  return {
    registrationNumber: normalizeProfileValue(profile.registrationNumber),
    vatNumber: normalizeProfileValue(profile.vatNumber),
    sdiRecipientCode: normalizeProfileValue(profile.sdiRecipientCode),
    pecEmail: normalizeProfileValue(profile.pecEmail),
    companyEmail: normalizeProfileValue(profile.companyEmail),
    companyPhoneNumbers: normalizeProfileValue(profile.companyPhoneNumbers),
    officesLocations: normalizeProfileValue(profile.officesLocations),
    country: normalizeProfileValue(profile.country),
    city: normalizeProfileValue(profile.city),
    state: normalizeProfileValue(profile.state),
    address: normalizeProfileValue(profile.address),
    currency: normalizeProfileValue(profile.currency),
    pricePerEmployee: profile.pricePerEmployee !== '' ? profile.pricePerEmployee : null,
    pricePerDevice: profile.pricePerDevice !== '' ? profile.pricePerDevice : null,
    extraStoragePricePerGb: profile.extraStoragePricePerGb !== '' ? profile.extraStoragePricePerGb : null,
    storageLimitGb: profile.storageLimitGb !== '' ? profile.storageLimitGb : 500,
    accessValidFrom: normalizeProfileValue(profile.accessValidFrom),
    accessValidTo: normalizeProfileValue(profile.accessValidTo),
    discountPercent: profile.discountPercent !== '' ? profile.discountPercent : null,
    discountValidFrom: normalizeProfileValue(profile.discountValidFrom),
    discountValidTo: normalizeProfileValue(profile.discountValidTo),
  };
}

export default function CompanyDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const { slug } = useParams<{ slug: string }>();
  const companyId = useMemo(() => parseCompanyIdFromSlug(slug), [slug]);
  const locale = i18n.language?.startsWith('it') ? 'it-IT' : 'en-GB';
  const canManageStatus = user?.isSuperAdmin === true;
  // Billing is visible to super admins and to company admins for their own
  // company. HR and area managers never see it.
  const canSeeBillingTab =
    user?.isSuperAdmin === true || user?.role === 'admin' || user?.role === 'hr';
  const isSuperAdmin = !!user?.isSuperAdmin || (user?.role as string) === 'super_admin';

  const [company, setCompany] = useState<Company | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyGroups, setCompanyGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [ownerCandidates, setOwnerCandidates] = useState<Array<{ id: number; name: string; surname: string; avatarFilename?: string | null; companyCount: number }>>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [ownerCandidatesLoading, setOwnerCandidatesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const [editOwnerUserId, setEditOwnerUserId] = useState<string>('');
  const [editProfile, setEditProfile] = useState<CompanyProfileForm>({ ...EMPTY_PROFILE_FORM });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFiscalErrors, setEditFiscalErrors] = useState<FiscalFieldErrors>(EMPTY_FISCAL_ERRORS);

  const [mediaOpen, setMediaOpen] = useState(false);
  const [logoHover, setLogoHover] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logoSize, setLogoSize] = useState<number | null>(null);
  const [bannerSize, setBannerSize] = useState<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusConfirmMode, setStatusConfirmMode] = useState<'deactivate' | 'activate'>('deactivate');
  const [statusConfirmInput, setStatusConfirmInput] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'billing'>('overview');

  // Real subscription data from billing API (Super Admin only)
  const [billingData, setBillingData] = useState<BillingOverview | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const bannerUrl = getCompanyBannerUrl(company?.bannerFilename);
  const logoUrl = getCompanyLogoUrl(company?.logoFilename);

  useEffect(() => {
    if (logoUrl) {
      fetch(logoUrl, { method: 'HEAD' })
        .then((res) => {
          const len = res.headers.get('content-length');
          if (len) {
            setLogoSize(parseInt(len, 10));
          } else {
            fetch(logoUrl)
              .then((res2) => res2.blob())
              .then((blob) => setLogoSize(blob.size))
              .catch(() => {});
          }
        })
        .catch(() => {
          fetch(logoUrl)
            .then((res2) => res2.blob())
            .then((blob) => setLogoSize(blob.size))
            .catch(() => {});
        });
    } else {
      setLogoSize(null);
    }
  }, [logoUrl]);

  useEffect(() => {
    if (bannerUrl) {
      fetch(bannerUrl, { method: 'HEAD' })
        .then((res) => {
          const len = res.headers.get('content-length');
          if (len) {
            setBannerSize(parseInt(len, 10));
          } else {
            fetch(bannerUrl)
              .then((res2) => res2.blob())
              .then((blob) => setBannerSize(blob.size))
              .catch(() => {});
          }
        })
        .catch(() => {
          fetch(bannerUrl)
            .then((res2) => res2.blob())
            .then((blob) => setBannerSize(blob.size))
            .catch(() => {});
        });
    } else {
      setBannerSize(null);
    }
  }, [bannerUrl]);

  // Fetch real subscription data when Super Admin opens the billing tab
  useEffect(() => {
    if (activeTab !== 'billing' || !company?.id) return;
    let cancelled = false;
    const fetchBilling = async () => {
      try {
        setBillingLoading(true);
        const data = await billingApi.getAdminCompanyBilling(company.id);
        if (!cancelled) setBillingData(data);
      } catch (err) {
        // Leave the tab empty rather than blocking the page, but say so in the
        // console — a silent catch here is what made this look like "no data".
        console.warn('[CompanyDetail] Billing data unavailable for company', company.id, err);
        if (!cancelled) setBillingData(null);
      } finally {
        if (!cancelled) setBillingLoading(false);
      }
    };
    fetchBilling();
    return () => { cancelled = true; };
  }, [activeTab, company?.id]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const canEdit = user?.role === 'admin' || (company?.ownerUserId != null && user?.id === company.ownerUserId);

  const storeManagersByStoreId = useMemo(() => {
    const map = new Map<number, Employee>();
    for (const employee of employees) {
      if (employee.role !== 'store_manager' || employee.storeId == null) continue;
      if (!map.has(employee.storeId)) map.set(employee.storeId, employee);
    }
    return map;
  }, [employees]);

  const employeesByStoreId = useMemo(() => {
    const map = new Map<number, Employee[]>();
    for (const employee of employees) {
      if (employee.storeId == null) continue;
      if (!map.has(employee.storeId)) map.set(employee.storeId, []);
      map.get(employee.storeId)!.push(employee);
    }
    return map;
  }, [employees]);

  const ownerOptions = useMemo(() => {
    const candidates = ownerCandidates.map((candidate) => ({
      ...candidate,
      companyCount: allCompanies.filter((item) => item.ownerUserId === candidate.id).length,
    }));

    if (company?.ownerUserId != null && !candidates.some((candidate) => candidate.id === company.ownerUserId)) {
      candidates.unshift({
        id: company.ownerUserId,
        name: company.ownerName ?? t('companies.currentOwner', 'Current owner'),
        surname: company.ownerSurname ?? '',
        avatarFilename: company.ownerAvatarFilename ?? null,
        companyCount: allCompanies.filter((item) => item.ownerUserId === company.ownerUserId).length,
      });
    }

    return candidates;
  }, [allCompanies, company, ownerCandidates, t]);

  const ownerSelectOptions = useMemo<SelectOption[]>(() => {
    return ownerOptions.map((owner) => {
      const fullName = `${owner.name} ${owner.surname ?? ''}`.trim();
      const avatarUrl = getAvatarUrl(owner.avatarFilename);
      return {
        value: String(owner.id),
        label: fullName,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: avatarUrl ? 'transparent' : 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
              {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(fullName)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fullName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {owner.companyCount} {t('companies.ownedCompanies', { defaultValue: 'companies owned', count: owner.companyCount })}
              </div>
            </div>
          </div>
        ),
      };
    });
  }, [ownerOptions, t]);

  const companyGroupOptions = useMemo<SelectOption[]>(() => {
    return [
      {
        value: 'standalone',
        label: t('companies.optionStandalone', 'Standalone'),
      },
      ...companyGroups.map((group) => ({
        value: String(group.id),
        label: group.name,
      })),
    ];
  }, [companyGroups, t]);

  const loadData = useCallback(async () => {
    if (!companyId) {
      setError(t('companies.errorLoad'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [companyData, storeData, employeeData, groupData, ownerData, companyList] = await Promise.all([
        getCompanyById(companyId),
        getStores({ targetCompanyId: companyId }),
        getEmployees({ targetCompanyId: companyId, status: 'active', limit: 300 }),
        getCompanyGroups().catch(() => []),
        getEmployees({ targetCompanyId: companyId, status: 'active', role: 'admin', limit: 200 }).catch(() => ({ employees: [] as Employee[] })),
        getCompanies().catch(() => []),
      ]);

      setCompany(companyData);
      setStores((storeData ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
      setEmployees((employeeData.employees ?? []).slice().sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)));
      setCompanyGroups((groupData ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
      setOwnerCandidates(
        (ownerData.employees ?? [])
          .map((emp) => ({ id: emp.id, name: emp.name, surname: emp.surname, avatarFilename: emp.avatarFilename ?? null, companyCount: 0 }))
          .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)),
      );
      setAllCompanies((companyList ?? []).slice());
    } catch {
      setError(t('companies.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openEditModal() {
    if (!company) return;

    setEditName(company.name);
    setEditGroupId(company.groupId ?? null);
    setEditOwnerUserId(company.ownerUserId != null ? String(company.ownerUserId) : '');
    setEditProfile(profileFromCompany(company));
    setEditError(null);
    setEditFiscalErrors(EMPTY_FISCAL_ERRORS);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!company) return;
    if (!editName.trim()) {
      setEditError(t('companies.validationName'));
      return;
    }

    // Blank e-invoicing fields are allowed; only malformed input blocks saving,
    // so editing a pre-existing company never becomes impossible.
    const fiscalErrors = validateFiscalFields(editProfile, t);
    setEditFiscalErrors(fiscalErrors);
    if (hasFiscalErrors(fiscalErrors)) {
      setEditError(t('companies.validationFiscal', 'Check the electronic invoicing fields'));
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const selectedOwnerId = editOwnerUserId ? parseInt(editOwnerUserId, 10) : null;

      await updateCompany(company.id, {
        name: editName.trim(),
        groupId: editGroupId,
        ...profilePayload(editProfile),
      });
      if (selectedOwnerId && selectedOwnerId !== (company.ownerUserId ?? null)) {
        await transferCompanyOwnership(company.id, selectedOwnerId);
      }
      showToast(t('companies.updatedSuccess'), 'success');
      setEditOpen(false);
      await loadData();
    } catch (err: unknown) {
      setEditError(translateApiError(err, t, t('companies.errorSave')));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleLogoFile(file: File) {
    if (!company) return;
    setLogoUploading(true);
    setMediaError(null);
    try {
      await uploadCompanyLogo(company.id, file);
      showToast(t('companies.logoUpdated'), 'success');
      await loadData();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('companies.logoError'));
      if (getApiErrorCode(err) === 'INVALID_FILE_TYPE') {
        showToast(message ?? t('companies.logoError'), 'warning');
      }
      setMediaError(message);
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleBannerFile(file: File) {
    if (!company) return;
    setBannerUploading(true);
    setMediaError(null);
    try {
      await uploadCompanyBanner(company.id, file);
      showToast(t('companies.bannerUpdated', 'Company banner updated'), 'success');
      await loadData();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('companies.bannerError', 'Error updating company banner'));
      if (getApiErrorCode(err) === 'INVALID_FILE_TYPE') {
        showToast(message ?? t('companies.bannerError', 'Error updating company banner'), 'warning');
      }
      setMediaError(message);
    } finally {
      setBannerUploading(false);
    }
  }

  async function handleDeleteBanner() {
    if (!company) return;
    setBannerUploading(true);
    setMediaError(null);
    try {
      await deleteCompanyBanner(company.id);
      showToast(t('companies.bannerRemoved', 'Company banner removed'), 'success');
      await loadData();
    } catch (err: unknown) {
      setMediaError(translateApiError(err, t, t('companies.bannerDeleteError', 'Error removing company banner')));
    } finally {
      setBannerUploading(false);
    }
  }

  async function handleDeleteLogo() {
    if (!company) return;
    setLogoUploading(true);
    setMediaError(null);
    try {
      await deleteCompanyLogo(company.id);
      showToast(t('companies.logoRemoved', 'Company logo removed'), 'success');
      await loadData();
    } catch (err: unknown) {
      setMediaError(translateApiError(err, t, t('companies.logoDeleteError', 'Error removing company logo')));
    } finally {
      setLogoUploading(false);
    }
  }

  function openStatusConfirm(mode: 'deactivate' | 'activate') {
    setStatusConfirmMode(mode);
    setStatusConfirmInput('');
    setStatusError(null);
    setStatusConfirmOpen(true);
  }

  async function handleStatusConfirm() {
    if (!company) return;

    if (statusConfirmMode === 'deactivate' && statusConfirmInput.trim() !== company.name) {
      setStatusError(t('companies.deactivateNameError', 'Type the exact company name to confirm deactivation.'));
      return;
    }

    setStatusBusy(true);
    setStatusError(null);
    try {
      if (statusConfirmMode === 'deactivate') {
        await deactivateCompany(company.id);
        showToast(t('companies.deactivatedSuccess'), 'success');
      } else {
        await activateCompany(company.id);
        showToast(t('companies.activatedSuccess'), 'success');
      }
      setStatusConfirmOpen(false);
      await loadData();
    } catch (err: unknown) {
      const fallback = statusConfirmMode === 'deactivate' ? t('companies.errorDeactivate') : t('companies.errorActivate');
      setStatusError(translateApiError(err, t, fallback));
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDeleteCompany() {
    if (!company) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteCompanyPermanent(company.id);
      showToast(t('companies.deletedSuccess'), 'success');
      navigate('/aziende');
    } catch (err: unknown) {
      setDeleteError(translateApiError(err, t, t('companies.errorDelete')));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page-enter" style={{ width: '100%' }}>
        <div style={{ height: 180, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', opacity: 0.65 }} />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="page-enter" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/aziende')} style={{ width: 'fit-content' }}>
          <ArrowLeft size={14} />
          {t('common.back')}
        </button>
        <div style={{ border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
          {error ?? t('companies.errorLoad')}
        </div>
      </div>
    );
  }



  const ownerAvatarUrl = getAvatarUrl(company.ownerAvatarFilename);
  const ownerLabel = company.ownerName
    ? `${company.ownerName} ${company.ownerSurname ?? ''}`.trim()
    : t('companies.ownerMissing', 'No owner assigned');
  const activeStores = stores.filter((s) => s.isActive).length;
  const deleteMatches = deleteInput.trim() === company.name;
  const deactivateMatches = statusConfirmInput.trim() === company.name;

  const companyLocation = [company.address, company.city, company.state, company.country]
    .filter((part) => Boolean(part && String(part).trim().length > 0))
    .join(', ');
  const companyCountryName = getCountryDisplayName(company.country);
  const activeEmployees = employees.filter((employee) => employee.role !== 'store_terminal');

  const companyInsights: Array<{ label: string; value: string | null | undefined }> = [
    { label: t('companies.registrationNumber', 'Registration number'), value: company.registrationNumber },
    { label: t('companies.vatNumber', 'VAT number'), value: company.vatNumber },
    { label: t('companies.sdiRecipientCode', 'SDI recipient code'), value: company.sdiRecipientCode },
    { label: t('companies.pecEmail', 'Certified email (PEC)'), value: company.pecEmail },
    { label: t('companies.companyEmail', 'Company email'), value: company.companyEmail },
    { label: t('companies.companyPhoneNumbers', 'Company phone numbers'), value: company.companyPhoneNumbers },
    { label: t('companies.officesLocations', 'Offices locations'), value: company.officesLocations },
    { label: t('companies.location', 'Location'), value: companyLocation || null },
    { label: t('companies.currency', 'Currency'), value: company.currency },
  ];
  const heroTitleOffset = 'clamp(130px, 32vw, 130px)';
  const bannerActionLabel = company.bannerFilename
    ? t('companies.reuploadBanner', 'Re-upload')
    : t('companies.uploadBanner', 'Upload');
  const logoActionLabel = company.logoFilename
    ? t('companies.reuploadLogo', 'Re-upload')
    : t('companies.uploadLogo', 'Upload');

  return (
    <div className="page-enter" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/aziende')}>
          <ArrowLeft size={14} />
          {t('common.back')}
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <Button variant="secondary" onClick={openEditModal}>
              <Pencil size={14} />
              {t('common.edit')}
            </Button>
          )}
          {canManageStatus && company.isActive && (
            <Button variant="danger" onClick={() => openStatusConfirm('deactivate')}>
              <PowerOff size={14} />
              {t('common.deactivate')}
            </Button>
          )}
          {canManageStatus && !company.isActive && (
            <>
              <Button onClick={() => openStatusConfirm('activate')}>
                <Power size={14} />
                {t('common.activate')}
              </Button>
              <Button variant="danger" onClick={() => { setDeleteError(null); setDeleteInput(''); setDeleteOpen(true); }}>
                <Trash2 size={14} />
                {t('common.delete')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          borderRadius: 14,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          background: 'var(--surface)',
        }}
      >
        <div
          style={{
            minHeight: 240,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'flex-end',
            background: bannerUrl
              ? `linear-gradient(180deg, rgba(13,33,55,0.35) 0%, rgba(13,33,55,0.82) 100%), url(${bannerUrl}) center/cover no-repeat`
              : 'linear-gradient(135deg, rgba(13,33,55,0.92) 0%, rgba(22,51,82,0.9) 45%, rgba(15,118,110,0.74) 100%)',
          }}
        >
          <div style={{ minWidth: 0, paddingLeft: heroTitleOffset }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1.00, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {company.name}
              {company.country ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
                  <ReactCountryFlag countryCode={company.country} svg style={{ width: '1em', height: '1em', borderRadius: '4px' }} />
                  {companyCountryName}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ padding: '0 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginTop: -42 }}>
            <button
              type="button"
              onClick={() => setMediaOpen(true)}
              onMouseEnter={() => setLogoHover(true)}
              onMouseLeave={() => setLogoHover(false)}
              style={{
                width: 112,
                height: 112,
                borderRadius: 20,
                overflow: 'hidden',
                background: logoUrl ? '#fff' : 'var(--primary)',
                border: '5px solid var(--surface)',
                boxShadow: '0 12px 24px rgba(15,23,42,0.2)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                initials(company.name)
              )}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(13,33,55,0.62)',
                  opacity: logoHover ? 1 : 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  transition: 'opacity 0.16s ease',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                <Camera size={16} />
                {t('companies.manageMediaCta', 'Manage media')}
              </div>
            </button>

            <div style={{ flex: 1, minWidth: 220, paddingBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {company.groupName ? (
                  <span style={{ fontSize: 11, color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.34)', background: 'rgba(201,151,58,0.12)', borderRadius: 999, padding: '3px 8px' }}>
                    {company.groupName}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 999, padding: '3px 8px' }}>
                    {t('companies.optionStandalone')}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 11,
                    borderRadius: 999,
                    padding: '3px 8px',
                    color: company.isActive ? '#166534' : '#991b1b',
                    border: company.isActive ? '1px solid rgba(34,197,94,0.36)' : '1px solid rgba(248,113,113,0.44)',
                    background: company.isActive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                  }}
                >
                  {company.isActive ? t('common.active') : t('common.inactive')}
                </span>
              </div>
              {company.ownerName && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {ownerAvatarUrl ? (
                    <span style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', border: '1px solid var(--border)' }}>
                      <img src={ownerAvatarUrl} alt={ownerLabel} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </span>
                  ) : null}
                  {ownerLabel}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <InfoChip variant="stores" icon={<StoreIcon size={13} />} label={t('companies.statStores')} value={String(company.storeCount)} />
          <InfoChip
            variant="employees"
            icon={<Users size={13} />}
            label={t('companies.statEmployees')}
            value={String(activeEmployees.length)}
            endSlot={<EmployeeAvatarStack employees={activeEmployees} />}
          />
          {company.ownerName && (
            <InfoChip variant="owner" icon={<Building2 size={13} />} label={t('companies.ownerField')} value={ownerLabel} avatarUrl={ownerAvatarUrl} />
          )}
          <InfoChip variant="since" icon={<CalendarClock size={13} />} label={t('companies.labelCreated')} value={new Date(company.createdAt).toLocaleDateString(locale)} />
          <InfoChip variant="group" icon={<Layers size={13} />} label={t('companies.fieldGroup')} value={company.groupName ?? t('companies.optionStandalone')} />
          {company.country ? (
            <InfoChip
              variant="country"
              icon={<MapPin size={13} />}
              label={t('companies.country', 'Country')}
              value={(
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <ReactCountryFlag countryCode={company.country} svg style={{ width: '1em', height: '1em' }} />
                  {companyCountryName || company.country}
                </span>
              )}
            />
          ) : null}
          {company.currency ? <InfoChip variant="currency" icon={<Coins size={13} />} label={t('companies.currency', 'Currency')} value={company.currency} /> : null}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'inline-flex',
        background: 'var(--surface-warm)',
        borderRadius: 10,
        padding: 4,
        gap: 4,
        border: '1px solid var(--border)',
        marginBottom: 10,
        alignSelf: 'flex-start',
      }}>
        {(canSeeBillingTab ? (['overview', 'billing'] as const) : (['overview'] as const)).map((tab: 'overview' | 'billing') => {
          const isActive = activeTab === tab;
          const label = tab === 'overview' ? 'Overview' : 'Billing';
          const icon = tab === 'overview' ? <LayoutDashboard size={14} /> : <Receipt size={14} />;
          return (
            <button
              key={tab}
              id={`company-detail-tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                background: isActive ? 'var(--accent)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? '0 2px 6px rgba(201, 151, 58, 0.24)' : 'none',
              }}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'linear-gradient(135deg, rgba(13,33,55,0.94) 0%, rgba(16,40,66,0.88) 100%)' }}>
            {t('companies.detailStoresTitle', 'Stores')} ({stores.length})
          </div>
          {stores.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: 'var(--text-muted)' }}>{t('common.noData')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stores.slice(0, 8).map((store) => {
                const manager = storeManagersByStoreId.get(store.id);
                const storeEmployees = employeesByStoreId.get(store.id) ?? [];
                return (
                  <div key={store.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getStoreLogoUrl(store.logoFilename) ? (
                          <img src={getStoreLogoUrl(store.logoFilename)!} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#8B6914' }}>
                            {initials(store.name)}
                          </span>
                        )}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {store.name}
                          </div>
                          {store.country ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                              <ReactCountryFlag countryCode={store.country} svg style={{ width: '0.9em', height: '0.9em' }} />
                              {getCountryDisplayName(store.country)}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{store.code}</span>
                          {manager ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                              <ManagerAvatar employee={manager} />
                              {`${manager.name} ${manager.surname ?? ''}`.trim()}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('stores.noManager')}</span>
                          )}
                          {storeEmployees.length > 0 ? <EmployeeAvatarStack employees={storeEmployees} /> : null}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, borderRadius: 999, padding: '2px 7px', color: store.isActive ? '#166534' : '#991b1b', border: store.isActive ? '1px solid rgba(34,197,94,0.36)' : '1px solid rgba(248,113,113,0.44)', background: store.isActive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)' }}>
                        {store.isActive ? t('common.active') : t('common.inactive')}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate(`/negozi/${toStoreSlug(store)}`)}
                        style={{ padding: '4px 8px', fontSize: 11 }}
                      >
                        {t('common.view', 'View')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase', letterSpacing: '0.04em', background: 'linear-gradient(135deg, rgba(13,33,55,0.94) 0%, rgba(16,40,66,0.88) 100%)' }}>
            {t('companies.profileDetails', 'Company details')}
          </div>
          <div style={{ padding: 14, display: 'grid', gap: 10 }}>
            <InsightRow label={t('companies.companyId', 'Company ID')} value={`#${company.id}`} />
            {companyInsights
              .filter((item) => Boolean(item.value))
              .map((item) => (
                <InsightRow key={item.label} label={item.label} value={item.value as string} />
              ))}
            <InsightRow label={t('companies.activeStores', 'Active stores')} value={`${activeStores}/${stores.length}`} />
          </div>
        </div>
      </div>
      )}

      {/* ── Billing Tab ── */}
      {activeTab === 'billing' && (() => {
        const storageUsedGb = (company.storageUsedBytes || 0) / (1024 * 1024 * 1024);
        const storageLimitGb = company.storageLimitGb || 500;
        const storageOverageGb = Math.max(0, storageUsedGb - storageLimitGb);
        const storageUsedPct = Math.min(100, (storageUsedGb / storageLimitGb) * 100);

        const pricePerEmp = company.pricePerEmployee || 0;
        const pricePerDev = company.pricePerDevice || 0;
        const pricePerGb = company.extraStoragePricePerGb || 0;
        const activeDevCount = company.activeDevicesCount || 0;
        const employeeDevCount = company.employeeDevicesCount || 0;
        const activeEmpCount = activeEmployees.length;

        const empSubtotal = activeEmpCount * pricePerEmp;
        const devSubtotal = activeDevCount * pricePerDev;
        const storageSubtotal = storageOverageGb * pricePerGb;
        const grandTotal = empSubtotal + devSubtotal + storageSubtotal;

        const now = new Date();
        const discountActive = (() => {
          if (!company.discountPercent || company.discountPercent <= 0) return false;
          const fromOk = !company.discountValidFrom || now >= new Date(company.discountValidFrom);
          const toOk = !company.discountValidTo || now <= (() => { const d = new Date(company.discountValidTo); d.setHours(23, 59, 59, 999); return d; })();
          return fromOk && toOk;
        })();
        const discountAmt = discountActive ? grandTotal * (company.discountPercent! / 100) : 0;
        const finalTotal = grandTotal - discountAmt;

        const formatDate = (s?: string | null) => {
          if (!s) return '';
          const d = new Date(s);
          return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        };

        const sectionStyle: React.CSSProperties = {
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--surface)',
          overflow: 'hidden',
        };
        const sectionHeaderStyle: React.CSSProperties = {
          padding: '12px 18px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', gap: 10,
        };
        const rowStyle: React.CSSProperties = {
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto',
          gap: isMobile ? 16 : 12,
          alignItems: isMobile ? 'stretch' : 'center',
          padding: '14px 18px',
        };
        const subtotalBadge = (val: number): React.ReactNode => (
          <span style={{
            display: 'inline-block',
            minWidth: 90, textAlign: 'right',
            fontSize: 15, fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
          }}>
            €{val.toFixed(2)}
          </span>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Live Subscription Status (from billing API) ── */}
            {billingLoading ? (
              <div style={{ ...sectionStyle, padding: '32px 18px', textAlign: 'center' }}>
                <div style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>Loading subscription data…</div>
              </div>
            ) : billingData?.subscription ? (() => {
              const sub = billingData.subscription;
              const statusConfig: Record<string, { bg: string; color: string; label: string; dot: string }> = {
                active: { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', label: 'Active', dot: '🟢' },
                past_due: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Past Due', dot: '🟡' },
                canceled: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: 'Canceled', dot: '⚪' },
                unpaid: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Blocked', dot: '🔴' },
                pending: { bg: 'rgba(234,179,8,0.1)', color: '#ca8a04', label: 'Pending', dot: '⏳' },
                incomplete: { bg: 'rgba(234,179,8,0.1)', color: '#ca8a04', label: 'Incomplete', dot: '⚠️' },
              };
              const sc = statusConfig[sub.status] || statusConfig.pending;
              const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

              return (
                <>
                  {/* Subscription Status Card */}
                  <div style={sectionStyle}>
                    <div style={{ ...sectionHeaderStyle, justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(201,151,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                          <CreditCard size={16} />
                        </span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Subscription Status</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Live data from payment gateway</div>
                        </div>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 14px', borderRadius: 999,
                        background: sc.bg, color: sc.color,
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {sc.dot} {sc.label}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 1, background: 'var(--border-light)' }}>
                      <div style={{ padding: '14px 18px', background: 'var(--surface)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>GATEWAY</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{sub.provider}</div>
                      </div>
                      <div style={{ padding: '14px 18px', background: 'var(--surface)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>BILLING PERIOD</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fmtDate(sub.currentPeriodStart)} — {fmtDate(sub.currentPeriodEnd)}</div>
                      </div>
                      <div style={{ padding: '14px 18px', background: 'var(--surface)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>MONTHLY CHARGE</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                          €{((sub.seatQuantity * sub.unitPriceEmployee + sub.deviceQuantity * sub.unitPriceDevice)).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Billed vs Live quantities */}
                    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>BILLED VS LIVE QUANTITIES</div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                        <div style={{ padding: '10px 14px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Employees</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {sub.seatQuantity} billed
                              {billingData.liveUsage && billingData.liveUsage.employeeCount !== sub.seatQuantity && (
                                <span style={{ color: billingData.liveUsage.employeeCount > sub.seatQuantity ? 'var(--warning)' : 'var(--success)', marginLeft: 6, fontSize: 11 }}>
                                  ({billingData.liveUsage.employeeCount > sub.seatQuantity ? '+' : ''}{billingData.liveUsage.employeeCount - sub.seatQuantity} live)
                                </span>
                              )}
                            </span>
                          </div>
                          {sub.pendingSeatQuantity != null && (
                            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>↓ Pending reduction to {sub.pendingSeatQuantity} at renewal</div>
                          )}
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Terminals</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {sub.deviceQuantity} billed
                              {billingData.liveUsage && billingData.liveUsage.deviceCount !== sub.deviceQuantity && (
                                <span style={{ color: billingData.liveUsage.deviceCount > sub.deviceQuantity ? 'var(--warning)' : 'var(--success)', marginLeft: 6, fontSize: 11 }}>
                                  ({billingData.liveUsage.deviceCount > sub.deviceQuantity ? '+' : ''}{billingData.liveUsage.deviceCount - sub.deviceQuantity} live)
                                </span>
                              )}
                            </span>
                          </div>
                          {sub.pendingDeviceQuantity != null && (
                            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>↓ Pending reduction to {sub.pendingDeviceQuantity} at renewal</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Grace period warning */}
                    {sub.status === 'past_due' && sub.gracePeriodEndsAt && (
                      <div style={{ margin: '0 18px 14px', padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                          Grace period expires: {fmtDate(sub.gracePeriodEndsAt)} — access will be blocked after this date
                        </span>
                      </div>
                    )}

                    {/* Cancel at period end notice */}
                    {sub.cancelAtPeriodEnd && (
                      <div style={{ margin: '0 18px 14px', padding: '10px 14px', background: 'rgba(107,114,128,0.06)', border: '1px solid rgba(107,114,128,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={16} style={{ color: '#6b7280', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                          Subscription set to cancel at end of current period ({fmtDate(sub.currentPeriodEnd)})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Recent Transactions from Billing API */}
                  {billingData.transactions && billingData.transactions.length > 0 && (
                    <div style={sectionStyle}>
                      <div style={sectionHeaderStyle}>
                        <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(201,151,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                          <Receipt size={16} />
                        </span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Transactions</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Last {billingData.transactions.length} payment records</div>
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</th>
                              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                              <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Receipt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billingData.transactions.map((tx: any) => {
                              const txStatusMap: Record<string, { bg: string; color: string; label: string }> = {
                                paid: { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', label: 'Paid' },
                                failed: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', label: 'Failed' },
                                refunded: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: 'Refunded' },
                                pending: { bg: 'rgba(234,179,8,0.1)', color: '#ca8a04', label: 'Pending' },
                              };
                              const ts = txStatusMap[tx.status] || txStatusMap.pending;
                              return (
                                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                  <td style={{ padding: '10px 18px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    {fmtDate(tx.paidAt || tx.createdAt)}
                                  </td>
                                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {tx.description || 'Payment'}
                                    {tx.failureMessage && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>{tx.failureMessage}</div>}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    €{((tx.amountCents || 0) / 100).toFixed(2)}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    <span style={{
                                      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
                                      background: ts.bg, color: ts.color, fontSize: 11, fontWeight: 700,
                                    }}>
                                      {ts.label}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                                    {tx.invoiceUrl ? (
                                      <a href={tx.invoiceUrl} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                                        View ↗
                                      </a>
                                    ) : (
                                      <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              );
            })() : (
              <div style={{ ...sectionStyle, padding: '24px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No Active Subscription</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This company has not activated a billing subscription yet.</div>
              </div>
            )}

            {/* ── Pricing Reference (existing sections below) ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 6, marginBottom: -6 }}>
              PRICING REFERENCE (LIVE CALCULATION)
            </div>

            {/* Employees */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(201,151,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Users size={16} />
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Active Employees</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Live count from employees table where status = active</div>
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>COUNT (LIVE)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{activeEmpCount}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>employees</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 12, borderLeft: '1px solid var(--border-light)', paddingLeft: 12 }}>
                      <strong>{employeeDevCount}</strong> {employeeDevCount === 1 ? 'registered device' : 'registered devices'}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>UNIT PRICE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>€{pricePerEmp.toFixed(2)} / employee / month</div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>SUBTOTAL</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                    €{empSubtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Devices */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(201,151,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Smartphone size={16} />
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Active Devices / Terminals</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Live count of registered terminals where status = active</div>
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>COUNT (LIVE)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{activeDevCount}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeDevCount === 1 ? 'registered terminal device' : 'registered terminal devices'}</span>
                  </div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>UNIT PRICE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>€{pricePerDev.toFixed(2)} / device / month</div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>SUBTOTAL</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                    €{devSubtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Documents Storage */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(201,151,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <HardDrive size={16} />
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Documents Storage</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Aggregated from documents table — active + trash tabs</div>
                </div>
              </div>
              {/* Storage bar */}
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  <span>Used: <strong>{storageUsedGb.toFixed(2)} GB</strong></span>
                  <span>Included: <strong>{storageLimitGb} GB</strong></span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${storageUsedPct}%`, height: '100%', borderRadius: 999, background: storageUsedPct >= 90 ? 'var(--danger)' : storageUsedPct >= 70 ? '#f59e0b' : 'var(--primary)', transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-disabled)', marginTop: 4 }}>
                  <span>0 GB</span>
                  <span>{storageLimitGb} GB</span>
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>INCLUDED GB</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{storageLimitGb}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>GB</span>
                  </div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>OVERAGE PRICE</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>€{pricePerGb.toFixed(2)} / GB extra</div>
                </div>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>SUBTOTAL</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
                    €{storageSubtotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Grand Total */}
            <div style={{ ...sectionStyle, background: 'linear-gradient(135deg, rgba(13,33,55,0.96) 0%, rgba(22,51,82,0.93) 100%)' }}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>LIVE REFERENCE TOTAL</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    <span>Employees ({activeEmpCount} × €{pricePerEmp.toFixed(2)})</span>
                    <span style={{ fontWeight: 700 }}>€{empSubtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    <span>Devices ({activeDevCount} × €{pricePerDev.toFixed(2)})</span>
                    <span style={{ fontWeight: 700 }}>€{devSubtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                    <span>Storage overage ({storageOverageGb.toFixed(2)} GB extra)</span>
                    <span style={{ fontWeight: 700 }}>€{storageSubtotal.toFixed(2)}</span>
                  </div>
                </div>
                {discountActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '8px 12px', background: 'rgba(201,151,58,0.14)', border: '1px solid rgba(201,151,58,0.3)', borderRadius: 8, marginBottom: 12, alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                      <Tag size={13} />
                      Discount {company.discountPercent}%
                      {(company.discountValidFrom || company.discountValidTo) && (
                        <span style={{ fontSize: 11, color: 'rgba(201,151,58,0.8)', fontWeight: 400 }}>
                          ({formatDate(company.discountValidFrom)} — {formatDate(company.discountValidTo)})
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>-€{discountAmt.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>GRAND TOTAL (REFERENCE)</div>
                  <div style={{ fontSize: isMobile ? 30 : 38, fontWeight: 900, fontFamily: 'var(--font-display)', color: '#fff', lineHeight: 1 }}>€{finalTotal.toFixed(2)}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>€{(finalTotal * 12).toFixed(2)} / year estimated</div>
                </div>
                {(company.accessValidFrom || company.accessValidTo) && (
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 8 }}>
                    <CalendarClock size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                      Access period: <strong style={{ color: '#fff' }}>{formatDate(company.accessValidFrom) || 'N/A'} — {formatDate(company.accessValidTo) || 'N/A'}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>

          </div>
        );
      })()}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('companies.editCompany', 'Edit Company')}
        maxWidth={isSuperAdmin ? "980px" : "600px"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={editSaving}>{t('common.cancel')}</Button>
            <Button onClick={() => void handleSaveEdit()} loading={editSaving}>{t('common.save')}</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {editError ? <Alert variant="danger" onClose={() => setEditError(null)}>{editError}</Alert> : null}

          <div style={{
            display: 'grid',
            gridTemplateColumns: (isMobile || !isSuperAdmin) ? '1fr' : '1.1fr 1fr',
            gap: 24,
            alignItems: 'start',
          }}>
            {/* Left Column: Company Information */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 4px 0', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                {t('companies.editCompanyInfoSection', 'Company Information')}
              </h3>

              <Input
                label={t('companies.fieldName', 'Company name *')}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                disabled={editSaving}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {t('companies.fieldGroup', 'Business group')}
                </label>
                <CustomSelect
                  value={editGroupId != null ? String(editGroupId) : 'standalone'}
                  onChange={(value) => setEditGroupId(value === 'standalone' || !value ? null : parseInt(value, 10))}
                  options={companyGroupOptions}
                  placeholder={t('companies.optionStandalone', 'Standalone')}
                  disabled={editSaving}
                  isClearable
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {t('companies.ownerField', 'Owner')}
                </label>
                <CustomSelect
                  value={editOwnerUserId || null}
                  onChange={(value) => setEditOwnerUserId(value ?? '')}
                  options={ownerSelectOptions}
                  placeholder={t('companies.currentOwner', 'Current owner')}
                  disabled={editSaving || ownerCandidatesLoading}
                  searchable
                  isClearable
                  searchPlaceholder={t('companies.ownerSearchPlaceholder', 'Search admin...')}
                  noOptionsMessage={t('companies.ownerNoResults', 'No admin users found')}
                />
              </div>

              <Input
                label={t('companies.registrationNumber', 'Registration number')}
                value={editProfile.registrationNumber}
                onChange={(event) => setEditProfile((prev) => ({ ...prev, registrationNumber: event.target.value }))}
                disabled={editSaving}
              />

              <Input
                label={t('companies.companyEmail', 'Company email')}
                type="email"
                value={editProfile.companyEmail}
                onChange={(event) => setEditProfile((prev) => ({ ...prev, companyEmail: event.target.value }))}
                disabled={editSaving}
              />

              {/* Italian e-invoicing block — grouped so the three billing
                  identifiers read as one unit rather than loose fields. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {t('companies.eInvoicingSection', 'Electronic invoicing')}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                  }}
                >
                  <Input
                    label={t('companies.vatNumber', 'VAT number')}
                    value={editProfile.vatNumber}
                    onChange={(event) => setEditProfile((prev) => ({ ...prev, vatNumber: event.target.value }))}
                    disabled={editSaving}
                    error={editFiscalErrors.vatNumber}
                    hint={t('companies.vatNumberHint', '11 digits, e.g. 12345678903')}
                    placeholder="12345678903"
                    inputMode="numeric"
                  />

                  <Input
                    label={t('companies.sdiRecipientCode', 'SDI recipient code')}
                    value={editProfile.sdiRecipientCode}
                    onChange={(event) =>
                      setEditProfile((prev) => ({ ...prev, sdiRecipientCode: event.target.value.toUpperCase() }))
                    }
                    disabled={editSaving}
                    error={editFiscalErrors.sdiRecipientCode}
                    hint={t('companies.sdiRecipientCodeHint', '7 characters, or 0000000 if invoiced via PEC')}
                    placeholder="0000000"
                    maxLength={7}
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>

                <Input
                  label={t('companies.pecEmail', 'Certified email (PEC)')}
                  type="email"
                  value={editProfile.pecEmail}
                  onChange={(event) => setEditProfile((prev) => ({ ...prev, pecEmail: event.target.value }))}
                  disabled={editSaving}
                  error={editFiscalErrors.pecEmail}
                  hint={t('companies.pecEmailHint', 'Certified mailbox used for electronic invoices')}
                  placeholder="azienda@pec.it"
                />
              </div>

              <Input
                label={t('companies.officesLocations', 'Offices locations')}
                value={editProfile.officesLocations}
                onChange={(event) => setEditProfile((prev) => ({ ...prev, officesLocations: event.target.value }))}
                disabled={editSaving}
              />

              <Input
                label={t('companies.currency', 'Currency')}
                value={editProfile.currency}
                onChange={(event) => setEditProfile((prev) => ({ ...prev, currency: event.target.value }))}
                disabled={editSaving}
              />

              <LocationFieldGroup
                value={{
                  country: editProfile.country,
                  state: editProfile.state,
                  city: editProfile.city,
                  address: editProfile.address,
                  postalCode: '',
                  phone: editProfile.companyPhoneNumbers,
                }}
                onChange={(location) => {
                  setEditProfile((prev) => ({
                    ...prev,
                    country: location.country,
                    state: location.state,
                    city: location.city,
                    address: location.address,
                    companyPhoneNumbers: location.phone,
                  }));
                }}
                includeAddress
                includePostalCode={false}
                includePhone
                disabled={editSaving}
                labels={{
                  country: t('companies.country', 'Country'),
                  state: t('companies.state', 'State'),
                  city: t('companies.city', 'City'),
                  address: t('companies.address', 'Address'),
                  phone: t('companies.companyPhoneNumbers', 'Company phone numbers'),
                }}
              />
            </div>

            {/* Right Column: Billing & Access Settings */}
            {isSuperAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', position: 'relative' }}>
                <h3 style={{
                  fontSize: 13, fontWeight: 800, color: 'var(--accent)',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  margin: '0 0 4px 0', borderBottom: '1px solid var(--border)',
                  paddingBottom: 6, display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 10,
                }}>
                  <span>{t('companies.editBillingAccessSection')}</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                    textTransform: 'none',
                    color: 'var(--text-muted)',
                    background: 'var(--surface-warm)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 20,
                    padding: '2px 8px',
                    whiteSpace: 'nowrap',
                  }}>
                    {t('companies.superAdminOnly')}
                  </span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* The currency the prices below are expressed in. */}
                  <CurrencySelect
                    label={t('companies.currency', 'Currency')}
                    value={editProfile.currency}
                    onChange={(code) => setEditProfile(p => ({ ...p, currency: code }))}
                    disabled={editSaving}
                  />
                  <Input
                    type="number"
                    label={t('companies.pricePerEmployee', 'Set price per employee')}
                    value={editProfile.pricePerEmployee}
                    onChange={(e) => setEditProfile(p => ({ ...p, pricePerEmployee: e.target.value ? Number(e.target.value) : '' }))}
                    disabled={editSaving}
                  />
                  <Input
                    type="number"
                    label={t('companies.pricePerDevice', 'Set price per device')}
                    value={editProfile.pricePerDevice}
                    onChange={(e) => setEditProfile(p => ({ ...p, pricePerDevice: e.target.value ? Number(e.target.value) : '' }))}
                    disabled={editSaving}
                  />
                  <Input
                    type="number"
                    label={t('companies.extraStoragePrice', 'Set extra storage price (per GB)')}
                    value={editProfile.extraStoragePricePerGb}
                    onChange={(e) => setEditProfile(p => ({ ...p, extraStoragePricePerGb: e.target.value ? Number(e.target.value) : '' }))}
                    disabled={editSaving}
                  />
                  <Input
                    type="number"
                    label={t('companies.storageLimit', 'Set Storage Limit (GB)')}
                    value={editProfile.storageLimitGb}
                    onChange={(e) => setEditProfile(p => ({ ...p, storageLimitGb: e.target.value ? Number(e.target.value) : '' }))}
                    disabled={editSaving}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <DatePicker
                      label={t('companies.accessValidFrom', 'From Date')}
                      value={editProfile.accessValidFrom}
                      onChange={(val) => setEditProfile(p => ({ ...p, accessValidFrom: val }))}
                      disabled={editSaving}
                    />
                    <DatePicker
                      label={t('companies.accessValidTo', 'To Date')}
                      value={editProfile.accessValidTo}
                      onChange={(val) => setEditProfile(p => ({ ...p, accessValidTo: val }))}
                      disabled={editSaving}
                    />
                  </div>
                  <Input
                    type="number"
                    label={t('companies.discountPercent', 'Discount (%)')}
                    value={editProfile.discountPercent}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setEditProfile(p => ({ ...p, discountPercent: '' }));
                      } else {
                        const num = Number(val);
                        if (num >= 0 && num <= 100) {
                          setEditProfile(p => ({ ...p, discountPercent: num }));
                        }
                      }
                    }}
                    disabled={editSaving}
                    min={0}
                    max={100}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <DatePicker
                      label={t('companies.discountValidFrom', 'Discount From Date')}
                      value={editProfile.discountValidFrom}
                      onChange={(val) => setEditProfile(p => ({ ...p, discountValidFrom: val }))}
                      disabled={editSaving}
                    />
                    <DatePicker
                      label={t('companies.discountValidTo', 'Discount To Date')}
                      value={editProfile.discountValidTo}
                      onChange={(val) => setEditProfile(p => ({ ...p, discountValidTo: val }))}
                      disabled={editSaving}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={mediaOpen}
        onClose={() => { if (!logoUploading && !bannerUploading) setMediaOpen(false); }}
        title={t('companies.mediaModalTitle', 'Company Media')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mediaError ? <Alert variant="danger" onClose={() => setMediaError(null)}>{mediaError}</Alert> : null}

          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleLogoFile(file);
              event.target.value = '';
            }}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleBannerFile(file);
              event.target.value = '';
            }}
          />

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
            <div
              style={{
                height: 126,
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'flex-end',
                background: bannerUrl ? `linear-gradient(180deg, rgba(13,33,55,0.32) 0%, rgba(13,33,55,0.8) 100%), url(${bannerUrl}) center/cover no-repeat` : 'linear-gradient(135deg, rgba(13,33,55,0.9) 0%, rgba(15,118,110,0.7) 100%)'
              }}
            >
              <div style={{ minWidth: 0, paddingLeft: 94 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1.1, fontWeight: 800, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {company.name}
                  {company.country ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
                      <ReactCountryFlag countryCode={company.country} svg style={{ width: '0.95em', height: '0.95em' }} />
                      {companyCountryName}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div style={{ padding: '0 14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: -42 }}>
                <div style={{ width: 84, height: 84, borderRadius: 16, overflow: 'hidden', background: logoUrl ? '#fff' : 'var(--primary)', border: '4px solid var(--surface)', boxShadow: '0 4px 12px rgba(13,33,55,0.15)', color: '#fff', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {logoUrl ? <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(company.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {company.groupName ? (
                      <span style={{ fontSize: 9, color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.34)', background: 'rgba(201,151,58,0.12)', borderRadius: 999, padding: '1px 6px' }}>
                        {company.groupName}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 999, padding: '1px 6px' }}>
                        {t('companies.optionStandalone')}
                      </span>
                    )}
                    <span style={{ fontSize: 9, borderRadius: 999, padding: '1px 6px', color: company.isActive ? '#166534' : '#991b1b', border: company.isActive ? '1px solid rgba(34,197,94,0.36)' : '1px solid rgba(248,113,113,0.44)', background: company.isActive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)' }}>
                      {company.isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                    {t('companies.mediaPreviewHint', 'Preview updates after each upload')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-warm)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('companies.bannerField', 'Company banner')}
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ height: 108, borderRadius: 10, border: '1px solid var(--border)', background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : 'linear-gradient(135deg, rgba(13,33,55,0.86) 0%, rgba(15,118,110,0.7) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {bannerUrl ? '' : t('companies.bannerEmpty', 'No banner set')}
              </div>
              
              {company.bannerFilename && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    📄 {company.bannerFilename}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                    {bannerSize ? formatBytes(bannerSize) : '...'}
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: company.bannerFilename ? 'repeat(3, 1fr)' : '1fr', gap: 8 }}>
                <button
                  type="button"
                  disabled={bannerUploading || logoUploading}
                  onClick={() => bannerInputRef.current?.click()}
                  style={{ ...mediaActionBtnStyle, width: 'auto', minWidth: 0 }}
                >
                  <UploadCloud size={14} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bannerUploading ? t('companies.bannerUploading', 'Uploading...') : bannerActionLabel}
                  </span>
                </button>
                {company.bannerFilename && (
                  <>
                    <button
                      type="button"
                      disabled={bannerUploading || logoUploading}
                      onClick={() => bannerInputRef.current?.click()}
                      style={{ ...mediaActionBtnStyle, width: 'auto', minWidth: 0 }}
                    >
                      <Pencil size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('companies.editBanner', 'Edit')}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={bannerUploading || logoUploading}
                      onClick={() => void handleDeleteBanner()}
                      style={{ ...mediaActionBtnStyle, borderColor: 'rgba(185,28,28,0.22)', color: '#991b1b', background: 'rgba(220,38,38,0.08)', width: 'auto', minWidth: 0 }}
                    >
                      <Trash2 size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('companies.deleteBanner', 'Delete')}
                      </span>
                    </button>
                  </>
                )}
              </div>
              <div style={mediaMetaRowStyle}>
                <span style={mediaMetaPillStyle}>
                  <ImageIcon size={12} />
                  JPG / PNG / WebP
                </span>
                <span style={mediaMetaPillStyle}>
                  <HardDrive size={12} />
                  {t('companies.bannerMaxSize', 'Max 12MB')}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('companies.bannerHint', 'Wide format recommended. Max 12MB.')}</div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-warm)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('companies.logoField')}
            </div>
            <div style={{ padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', background: logoUrl ? '#fff' : 'var(--primary)', border: '1px solid var(--border)', color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {logoUrl ? <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(company.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{company.name}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>{t('companies.logoHint')}</div>
                </div>
              </div>

              {company.logoFilename && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    📄 {company.logoFilename}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                    {logoSize ? formatBytes(logoSize) : '...'}
                  </span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: company.logoFilename ? 'repeat(3, 1fr)' : '1fr', gap: 8 }}>
                <button
                  type="button"
                  disabled={logoUploading || bannerUploading}
                  onClick={() => logoInputRef.current?.click()}
                  style={{ ...mediaActionBtnStyle, width: 'auto', minWidth: 0 }}
                >
                  <UploadCloud size={14} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {logoUploading ? t('companies.logoUploading', 'Uploading...') : logoActionLabel}
                  </span>
                </button>
                {company.logoFilename && (
                  <>
                    <button
                      type="button"
                      disabled={logoUploading || bannerUploading}
                      onClick={() => logoInputRef.current?.click()}
                      style={{ ...mediaActionBtnStyle, width: 'auto', minWidth: 0 }}
                    >
                      <Pencil size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('companies.editLogo', 'Edit')}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={logoUploading || bannerUploading}
                      onClick={() => void handleDeleteLogo()}
                      style={{ ...mediaActionBtnStyle, borderColor: 'rgba(185,28,28,0.22)', color: '#991b1b', background: 'rgba(220,38,38,0.08)', width: 'auto', minWidth: 0 }}
                    >
                      <Trash2 size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('companies.deleteLogo', 'Delete')}
                      </span>
                    </button>
                  </>
                )}
              </div>
              <div style={mediaMetaRowStyle}>
                <span style={mediaMetaPillStyle}>
                  <ImageIcon size={12} />
                  JPG / PNG / WebP
                </span>
                <span style={mediaMetaPillStyle}>
                  <HardDrive size={12} />
                  {t('companies.logoMaxSize', 'Max 8MB')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={statusConfirmOpen}
        onClose={() => setStatusConfirmOpen(false)}
        title={statusConfirmMode === 'deactivate' ? t('companies.confirmDeactivateTitle') : t('companies.confirmActivateTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusConfirmOpen(false)} disabled={statusBusy}>{t('common.cancel')}</Button>
            {statusConfirmMode === 'deactivate' ? (
              <Button variant="danger" onClick={() => void handleStatusConfirm()} loading={statusBusy} disabled={!deactivateMatches}>{t('common.deactivate')}</Button>
            ) : (
              <Button onClick={() => void handleStatusConfirm()} loading={statusBusy}>{t('common.activate')}</Button>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {statusError ? <Alert variant="danger" onClose={() => setStatusError(null)}>{statusError}</Alert> : null}
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {statusConfirmMode === 'deactivate'
              ? t('companies.confirmDeactivateMsg', { name: company.name })
              : t('companies.confirmActivateMsg', { name: company.name })}
          </p>
          {statusConfirmMode === 'deactivate' && (
            <>
              <Input
                label={t('companies.typeNameToDeactivate', 'Type the exact company name to deactivate')}
                value={statusConfirmInput}
                onChange={(event) => setStatusConfirmInput(event.target.value)}
                placeholder={company.name}
                disabled={statusBusy}
              />
              <div style={{ fontSize: 12, color: deactivateMatches ? '#166534' : 'var(--text-muted)' }}>
                {deactivateMatches
                  ? t('companies.deactivateNameMatched', 'Name matches. Deactivation is enabled.')
                  : t('companies.deactivateNameMismatch', 'Name must match exactly to deactivate.')}
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('companies.confirmDeleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => void handleDeleteCompany()} loading={deleteBusy} disabled={!deleteMatches}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {deleteError ? <Alert variant="danger" onClose={() => setDeleteError(null)}>{deleteError}</Alert> : null}
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {t('companies.confirmDeleteMsg', { name: company.name })}
          </p>
          <Input
            label={t('companies.typeNameToDelete', 'Type the company name to confirm deletion')}
            value={deleteInput}
            onChange={(event) => setDeleteInput(event.target.value)}
            placeholder={company.name}
            disabled={deleteBusy}
          />
          <div style={{ fontSize: 12, color: deleteMatches ? '#166534' : 'var(--text-muted)' }}>
            {deleteMatches
              ? t('companies.deleteNameMatched', 'Name matches. Delete action is enabled.')
              : t('companies.deleteNameMismatch', 'Name must match exactly to continue.')}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ManagerAvatar({ employee }: { employee: Employee }) {
  const avatarUrl = getAvatarUrl(employee.avatarFilename);
  const initialsLabel = `${employee.name?.[0] ?? ''}${employee.surname?.[0] ?? ''}`.toUpperCase() || 'SM';
  return (
    <span style={{ width: 18, height: 18, borderRadius: '50%', overflow: 'hidden', background: '#8B6914', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={`${employee.name} ${employee.surname}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : initialsLabel}
    </span>
  );
}

function InfoChip({
  icon,
  label,
  value,
  avatarUrl,
  endSlot,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  avatarUrl?: string | null;
  endSlot?: React.ReactNode;
  variant?: 'stores' | 'employees' | 'owner' | 'since' | 'group' | 'country' | 'currency' | 'default';
}) {
  const iconBg = 'rgba(201, 151, 58, 0.12)';
  const cardBg = 'var(--surface-warm)';
  const borderColor = 'rgba(201, 151, 58, 0.28)';
  const shadowColor = 'rgba(13, 33, 55, 0.03)';

  const valueNode = typeof value === 'string' ? (
    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
  ) : (
    value
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .info-chip-card {
          transition: all 0.24s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .info-chip-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(13, 33, 55, 0.08), var(--shadow-md) !important;
          border-color: var(--accent) !important;
        }
      `}} />
      <div
        className="info-chip-card"
        style={{
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          padding: '10px 12px',
          background: cardBg,
          boxShadow: `0 4px 12px ${shadowColor}, var(--shadow-sm)`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 74,
          cursor: 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: iconBg, color: 'var(--accent)' }}>
            {icon}
          </span>
          {label}
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {avatarUrl ? (
              <span style={{ width: 18, height: 18, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                <img src={avatarUrl} alt={typeof value === 'string' ? value : label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
            ) : null}
            <span style={{ minWidth: 0 }}>{valueNode}</span>
          </div>
          {endSlot ? <div style={{ flexShrink: 0 }}>{endSlot}</div> : null}
        </div>
      </div>
    </>
  );
}

function EmployeeAvatarStack({ employees }: { employees: Employee[] }) {
  if (employees.length === 0) {
    return null;
  }

  const visible = employees.slice(0, 6);
  const remaining = Math.max(employees.length - visible.length, 0);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {visible.map((employee, index) => {
        const avatarUrl = getAvatarUrl(employee.avatarFilename);
        const initialsLabel = `${employee.name?.[0] ?? ''}${employee.surname?.[0] ?? ''}`.toUpperCase() || 'U';
        return (
          <span
            key={employee.id}
            title={`${employee.name} ${employee.surname}`}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1.5px solid var(--surface)',
              overflow: 'hidden',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#8B6914',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              marginLeft: index === 0 ? 0 : -6,
              boxShadow: '0 0 0 1px rgba(13,33,55,0.08)',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${employee.name} ${employee.surname}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : initialsLabel}
          </span>
        );
      })}
      {remaining > 0 ? (
        <span
          title={`${employees.length}`}
          style={{
            width: 24,
            height: 20,
            borderRadius: '50%',
            border: '1.5px solid var(--surface)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(13,33,55,0.85)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 800,
            marginLeft: -6,
          }}
        >
          7+
        </span>
      ) : null}
    </span>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const mediaActionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--surface-warm)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  padding: '9px 12px',
};

const mediaMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const mediaMetaPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  background: 'rgba(13,33,55,0.08)',
  border: '1px solid rgba(13,33,55,0.14)',
};
