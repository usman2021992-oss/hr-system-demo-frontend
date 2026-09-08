import React, { useEffect, useMemo, useState } from 'react';
import CurrencySelect from '../../components/ui/CurrencySelect';
import CurrencyFlag from '../../components/ui/CurrencyFlag';
import CompanyPaymentHistoryModal from './CompanyPaymentHistoryModal';
import { CURRENCIES, currencyLabel, normaliseCurrency } from '../../constants/currencies';
import { formatMoney } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ReactCountryFlag from 'react-country-flag';
import { ArrowRight, Building2, Users, Store, Plus, Layers, Smartphone, HardDrive, CalendarClock, Search, CreditCard, Receipt } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import { CompanyBillingConfigModal } from './CompanyBillingConfigModal';
import {
  createCompany,
  getCompanies,
  updateCompany,
  deactivateCompany,
  activateCompany,
  deleteCompanyPermanent,
  uploadCompanyLogo,
  uploadCompanyBanner,
  deleteCompanyBanner,
  transferCompanyOwnership,
} from '../../api/companies';
import { getCompanyGroups } from '../../api/companyGroups';
import { getEmployees } from '../../api/employees';
import { getCompanyLogoUrl, getCompanyBannerUrl, getAvatarUrl } from '../../api/client';
import { getApiErrorCode, translateApiError } from '../../utils/apiErrors';
import {
  EMPTY_FISCAL_ERRORS,
  FiscalFieldErrors,
  hasFiscalErrors,
  validateFiscalFields,
} from '../../utils/italianFiscal';
import { Company } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Select } from '../../components/ui/Select';
import { DatePicker } from '../../components/ui/DatePicker';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { Badge } from '../../components/ui/Badge';
import { LocationFieldGroup } from '../../components/location';
import { getCountryDisplayName } from '../../utils/country';

type ModalMode = 'create' | 'edit';

const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/Rome',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: string) => string[];
  DisplayNames?: new (
    locales?: string | string[],
    options?: { type: 'region' },
  ) => { of: (code: string) => string | undefined };
};

const intlWithSupportedValues = Intl as IntlWithSupportedValues;

const TIMEZONE_OPTIONS = typeof intlWithSupportedValues.supportedValuesOf === 'function'
  ? intlWithSupportedValues.supportedValuesOf('timeZone')
  : FALLBACK_TIMEZONES;

const TIMEZONE_SET = new Set(TIMEZONE_OPTIONS);

const COUNTRY_TIMEZONE_FALLBACKS: Record<string, string[]> = {
  IT: ['Europe/Rome'],
  GB: ['Europe/London'],
  IE: ['Europe/Dublin'],
  ES: ['Europe/Madrid'],
  FR: ['Europe/Paris'],
  DE: ['Europe/Berlin'],
  NL: ['Europe/Amsterdam'],
  BE: ['Europe/Brussels'],
  PT: ['Europe/Lisbon'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
  CA: ['America/Toronto', 'America/Vancouver'],
  BR: ['America/Sao_Paulo'],
  AE: ['Asia/Dubai'],
  SA: ['Asia/Riyadh'],
  IN: ['Asia/Kolkata'],
  CN: ['Asia/Shanghai'],
  JP: ['Asia/Tokyo'],
  SG: ['Asia/Singapore'],
  AU: ['Australia/Sydney', 'Australia/Perth'],
  NZ: ['Pacific/Auckland'],
};

function parseTimezones(value: string): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      list.push(item);
    });
  return list;
}

const AVATAR_PALETTE = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function toCompanySlug(company: Company): string {
  const base = company.name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${company.id}-${base || 'company'}`;
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
  timezones: string;
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

const EMPTY_COMPANY_PROFILE_FORM: CompanyProfileForm = {
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
  timezones: '',
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
  if (!company) return { ...EMPTY_COMPANY_PROFILE_FORM };
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
    timezones: company.timezones ?? '',
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

function payloadFromProfileForm(profile: CompanyProfileForm) {
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
    timezones: normalizeProfileValue(profile.timezones),
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

function StatBox({ value, label, icon }: { value: number | string; label: string; icon: React.ReactNode }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--surface-warm)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius)',
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(201,151,58,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--accent)',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 3 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function TimezoneOption({ timezone }: { timezone: string }) {
  const formattedTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date());
    } catch {
      return '';
    }
  }, [timezone]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
      <div style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{timezone}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{timezone.split('/')[0]}</span>
      </div>
      {formattedTime && (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {formattedTime}
        </span>
      )}
    </div>
  );
}

export default function SystemCompanyManagement() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const { user } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [companyGroups, setCompanyGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type ConfirmMode = 'deactivate' | 'activate' | 'delete';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('deactivate');
  const [confirmCompany, setConfirmCompany] = useState<Company | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [billingConfigCompany, setBillingConfigCompany] = useState<Company | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);

  const [formName, setFormName] = useState('');
  const [formNameError, setFormNameError] = useState<string | undefined>();
  const [formFiscalErrors, setFormFiscalErrors] = useState<FiscalFieldErrors>(EMPTY_FISCAL_ERRORS);
  const [formGroupId, setFormGroupId] = useState<number | null>(null);
  const [formOwnerUserId, setFormOwnerUserId] = useState<number | null>(null);
  const [formProfile, setFormProfile] = useState<CompanyProfileForm>({ ...EMPTY_COMPANY_PROFILE_FORM });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  // Company whose payment history is open, from the card's receipt button.
  const [historyCompany, setHistoryCompany] = useState<Company | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [ownerCandidates, setOwnerCandidates] = useState<Array<{ id: number; name: string; surname: string; avatarFilename?: string | null; companyCount: number }>>([]);
  const [ownerCandidatesLoading, setOwnerCandidatesLoading] = useState(false);
  const [timezoneDraft, setTimezoneDraft] = useState<string | null>(null);

  const timezoneValues = useMemo(
    () => parseTimezones(formProfile.timezones),
    [formProfile.timezones],
  );

  const detectedTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || '', []);

  const timezoneSelectOptions = useMemo<SelectOption[]>(() => {
    const selected = new Set(timezoneValues);
    return TIMEZONE_OPTIONS
      .filter((timezone) => !selected.has(timezone))
      .map((timezone) => ({
        value: timezone,
        label: timezone,
        render: <TimezoneOption timezone={timezone} />,
      }));
  }, [timezoneValues]);

  const groupOptions = useMemo<SelectOption[]>(() => {
    return [
      { value: 'standalone', label: t('companies.optionStandalone') },
      ...companyGroups.map((g) => ({
        value: String(g.id),
        label: g.name,
      })),
    ];
  }, [companyGroups, t]);

  const countryTimezoneSuggestions = useMemo(() => {
    const code = formProfile.country.trim().toUpperCase();
    if (!code) return [] as string[];
    return (COUNTRY_TIMEZONE_FALLBACKS[code] ?? [])
      .filter((timezone) => TIMEZONE_SET.has(timezone))
      .filter((timezone) => !timezoneValues.includes(timezone));
  }, [formProfile.country, timezoneValues]);

  const locale = i18n.language?.startsWith('it') ? 'it-IT' : 'en-GB';

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const query = search.toLowerCase().trim();
      const matchesSearch = !query ||
        c.name.toLowerCase().includes(query) ||
        (c.companyEmail && c.companyEmail.toLowerCase().includes(query)) ||
        (c.registrationNumber && c.registrationNumber.toLowerCase().includes(query)) ||
        (c.vatNumber && c.vatNumber.toLowerCase().includes(query)) ||
        (c.pecEmail && c.pecEmail.toLowerCase().includes(query)) ||
        (c.city && c.city.toLowerCase().includes(query));

      const matchesGroup = selectedGroupId === 'all' ||
        (selectedGroupId === 'standalone' && c.groupId == null) ||
        (selectedGroupId !== 'standalone' && String(c.groupId) === selectedGroupId);

      const matchesStatus = selectedStatus === 'all' ||
        (selectedStatus === 'active' && c.isActive === true) ||
        (selectedStatus === 'inactive' && c.isActive === false);

      return matchesSearch && matchesGroup && matchesStatus;
    });
  }, [companies, search, selectedGroupId, selectedStatus]);

  const countryLabel = useMemo(() => {
    const code = formProfile.country.trim().toUpperCase();
    if (!code) return '';
    const DisplayNamesCtor = intlWithSupportedValues.DisplayNames;
    if (typeof DisplayNamesCtor !== 'function') return code;
    try {
      return new DisplayNamesCtor([locale], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  }, [formProfile.country, locale]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCompanies();
      setCompanies(data);
    } catch {
      setError(t('companies.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void (async () => {
      try {
        const groups = await getCompanyGroups();
        setCompanyGroups(groups);
      } catch {
        setCompanyGroups([]);
      }
    })();
  }, []);

  const openCreate = () => {
    setModalMode('create');
    setEditingCompanyId(null);
    setFormName('');
    setFormNameError(undefined);
    setFormFiscalErrors(EMPTY_FISCAL_ERRORS);
    setFormGroupId(null);
    setFormOwnerUserId(null);
    setFormProfile({ ...EMPTY_COMPANY_PROFILE_FORM });
    setFormError(null);
    setLogoError(null);
    setBannerError(null);
    setOwnerCandidates([]);
    setTimezoneDraft(null);
    setCurrentStep(1);
    setModalOpen(true);
  };

  const openEdit = (company: Company) => {
    setModalMode('edit');
    setEditingCompanyId(company.id);
    setFormName(company.name);
    setFormNameError(undefined);
    setFormFiscalErrors(EMPTY_FISCAL_ERRORS);
    setFormGroupId(company.groupId ?? null);
    setFormOwnerUserId(company.ownerUserId ?? null);
    setFormProfile(profileFromCompany(company));
    setFormError(null);
    setLogoError(null);
    setBannerError(null);
    setTimezoneDraft(null);
    setCurrentStep(1);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormSaving(false);
    setFormError(null);
    setFormNameError(undefined);
    setFormFiscalErrors(EMPTY_FISCAL_ERRORS);
    setLogoUploading(false);
    setLogoError(null);
    setFormProfile({ ...EMPTY_COMPANY_PROFILE_FORM });
    setBannerUploading(false);
    setBannerError(null);
    setOwnerCandidates([]);
    setOwnerCandidatesLoading(false);
    setTimezoneDraft(null);
  };

  const setTimezoneValues = (items: string[]) => {
    const normalized = items
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');
    setFormProfile((prev) => ({ ...prev, timezones: normalized }));
  };

  const addTimezone = (raw: string | null | undefined) => {
    const timezone = (raw ?? '').trim();
    if (!timezone) return;
    if (!TIMEZONE_SET.has(timezone)) {
      showToast(t('companies.invalidTimezone', 'Invalid timezone. Use IANA timezone values like Europe/Rome.'), 'error');
      return;
    }
    if (timezoneValues.includes(timezone)) {
      setTimezoneDraft(null);
      return;
    }
    setTimezoneValues([...timezoneValues, timezone]);
    setTimezoneDraft(null);
  };

  const removeTimezone = (timezone: string) => {
    setTimezoneValues(timezoneValues.filter((item) => item !== timezone));
  };

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    let mounted = true;
    setOwnerCandidatesLoading(true);
    const targetId = modalMode === 'edit' ? (editingCompanyId ?? undefined) : undefined;
    getEmployees({ role: 'admin', limit: 200, targetCompanyId: targetId })
      .then((res) => {
        if (!mounted) return;
        setOwnerCandidates(
          res.employees.map((emp) => ({ id: emp.id, name: emp.name, surname: emp.surname, avatarFilename: emp.avatarFilename ?? null, companyCount: companies.filter((company) => company.ownerUserId === emp.id).length }))
            .sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)),
        );
      })
      .catch(() => {
        if (!mounted) return;
        setOwnerCandidates([]);
      })
      .finally(() => {
        if (!mounted) return;
        setOwnerCandidatesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companies, modalOpen, modalMode, editingCompanyId]);

  const ownerSelectOptions = useMemo<SelectOption[]>(() => {
    return ownerCandidates.map((candidate) => {
      const fullName = `${candidate.name} ${candidate.surname}`.trim();
      const avatarUrl = candidate.avatarFilename ? getAvatarUrl(candidate.avatarFilename) : null;
      return {
        value: String(candidate.id),
        label: fullName,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: avatarUrl ? 'transparent' : 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
              {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : `${candidate.name?.[0] ?? ''}${candidate.surname?.[0] ?? ''}`.toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fullName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {candidate.companyCount} {t('companies.ownedCompanies', { defaultValue: 'companies owned', count: candidate.companyCount })}
              </div>
            </div>
          </div>
        ),
      };
    });
  }, [ownerCandidates, t]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editingCompanyId === null) return;

    setLogoUploading(true);
    setLogoError(null);
    try {
      await uploadCompanyLogo(editingCompanyId, file);
      showToast(t('companies.logoUpdated'), 'success');
      await load();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('companies.logoError')) ?? t('companies.logoError');
      if (getApiErrorCode(err) === 'INVALID_FILE_TYPE') {
        showToast(message, 'warning');
      }
      setLogoError(message);
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editingCompanyId === null) return;

    setBannerUploading(true);
    setBannerError(null);
    try {
      await uploadCompanyBanner(editingCompanyId, file);
      showToast(t('companies.bannerUpdated', 'Banner aziendale aggiornato'), 'success');
      await load();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('companies.bannerError', 'Errore durante aggiornamento banner')) ?? t('companies.bannerError', 'Errore durante aggiornamento banner');
      if (getApiErrorCode(err) === 'INVALID_FILE_TYPE') {
        showToast(message, 'warning');
      }
      setBannerError(message);
    } finally {
      setBannerUploading(false);
      e.target.value = '';
    }
  };

  const handleBannerDelete = async () => {
    if (editingCompanyId === null) return;
    setBannerUploading(true);
    setBannerError(null);
    try {
      await deleteCompanyBanner(editingCompanyId);
      showToast(t('companies.bannerRemoved', 'Banner aziendale rimosso'), 'success');
      await load();
    } catch (err: unknown) {
      setBannerError(translateApiError(err, t, t('companies.bannerDeleteError', 'Errore durante rimozione banner')) ?? t('companies.bannerDeleteError', 'Errore durante rimozione banner'));
    } finally {
      setBannerUploading(false);
    }
  };

  const openConfirm = (mode: ConfirmMode, company: Company) => {
    setConfirmMode(mode);
    setConfirmCompany(company);
    setConfirmError(null);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmCompany(null);
    setConfirmBusy(false);
    setConfirmError(null);
  };

  const handleConfirm = async () => {
    if (!confirmCompany) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (confirmMode === 'deactivate') {
        await deactivateCompany(confirmCompany.id);
        showToast(t('companies.deactivatedSuccess'), 'success');
      } else if (confirmMode === 'activate') {
        await activateCompany(confirmCompany.id);
        showToast(t('companies.activatedSuccess'), 'success');
      } else {
        await deleteCompanyPermanent(confirmCompany.id);
        showToast(t('companies.deletedSuccess'), 'success');
      }
      closeConfirm();
      await load();
    } catch (err: unknown) {
      const msgKey = confirmMode === 'deactivate'
        ? 'companies.errorDeactivate'
        : confirmMode === 'activate' ? 'companies.errorActivate' : 'companies.errorDelete';
      setConfirmError(translateApiError(err, t, t(msgKey)) ?? t(msgKey));
    } finally {
      setConfirmBusy(false);
    }
  };

  const submit = async () => {
    if (!formName.trim()) { setFormNameError(t('companies.validationName')); return; }

    // Optional fields: only a malformed value blocks the save, so companies
    // created before these existed can still be edited with them left blank.
    const fiscalErrors = validateFiscalFields(formProfile, t);
    setFormFiscalErrors(fiscalErrors);
    if (hasFiscalErrors(fiscalErrors)) {
      setFormError(t('companies.validationFiscal', 'Check the electronic invoicing fields'));
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await createCompany({
          name: formName.trim(),
          groupId: formGroupId,
          ownerUserId: formOwnerUserId,
          ...payloadFromProfileForm(formProfile),
        });
        showToast(t('companies.createdSuccess'), 'success');
      } else {
        if (editingCompanyId === null) throw new Error('Missing company id');
        await updateCompany(editingCompanyId, {
          name: formName.trim(),
          groupId: formGroupId,
          ...payloadFromProfileForm(formProfile),
        });
        const current = companies.find((company) => company.id === editingCompanyId);
        if (formOwnerUserId != null && formOwnerUserId !== (current?.ownerUserId ?? null)) {
          await transferCompanyOwnership(editingCompanyId, formOwnerUserId);
        }
        showToast(t('companies.updatedSuccess'), 'success');
      }
      closeModal();
      await load();
    } catch (err: unknown) {
      setFormError(translateApiError(err, t, t('companies.errorSave')));
    } finally {
      setFormSaving(false);
    }
  };

  const activeCount = companies.filter((c) => c.isActive).length;
  const totalStores = companies.reduce((s, c) => s + c.storeCount, 0);
  const totalEmployees = companies.reduce((s, c) => s + c.employeeCount, 0);
  const editingCompany = editingCompanyId !== null ? companies.find((c) => c.id === editingCompanyId) ?? null : null;

  if (loading) {
    return (
      <div className="page-enter" style={{ width: '100%' }}>
        {[1, 2].map((i) => (
          <div key={i} style={{ height: 160, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', opacity: 0.5, marginBottom: 14 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-enter" style={{ width: '100%' }}>
        <Alert variant="danger" title={t('common.error')} onClose={() => setError(null)}>{error}</Alert>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 20 : 24, margin: 0, color: 'var(--text-primary)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('nav.companies')}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            {t('companies.systemSubtitle')}
          </p>
        </div>
        {user?.isSuperAdmin && (
          <Button variant="primary" onClick={openCreate}>
            <Plus size={15} style={{ marginRight: 6 }} />
            {t('companies.new')}
          </Button>
        )}
      </div>

      {/* ── Summary strip ── */}
      {companies.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: 12,
        }}>
          {[
            { label: t('companies.statEmployees').replace('Attivi', '').replace('Active', ''), icon: <Building2 size={16} />, value: activeCount, sublabel: i18n.language?.startsWith('it') ? 'Aziende attive' : 'Active companies' },
            { label: '', icon: <Store size={16} />, value: totalStores, sublabel: t('companies.statStores') },
            { label: '', icon: <Users size={16} />, value: totalEmployees, sublabel: t('companies.statEmployees') },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 16px',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius)',
                background: 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 3 }}>{s.sublabel}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Search and Filter Bar ── */}
      {companies.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px',
          boxShadow: 'var(--shadow-sm)',
          flexWrap: 'wrap',
          marginTop: -4,
        }}>
          {/* Universal Search Input */}
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={18} style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }} />
            <Input
              placeholder={t('companies.searchPlaceholder', 'Cerca per nome, email, p.iva o città...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: '40px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Group Filter */}
          <div style={{ minWidth: 160 }}>
            <Select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                width: '100%',
              }}
            >
              <option value="all">{t('companies.filterAllGroups', 'Tutti i gruppi')}</option>
              <option value="standalone">{t('companies.optionStandalone', 'Autonoma')}</option>
              {companyGroups.map(g => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </Select>
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: 140 }}>
            <Select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                width: '100%',
              }}
            >
              <option value="all">{t('companies.filterAllStatuses', 'Tutti gli stati')}</option>
              <option value="active">{t('companies.filterActive', 'Attive')}</option>
              <option value="inactive">{t('companies.filterDeactivated', 'Disattivate')}</option>
            </Select>
          </div>
        </div>
      )}

      {/* ── Company cards ── */}
      {companies.length === 0 ? (
        <Alert variant="info" title={t('common.noData')}>{t('companies.errorLoad')}</Alert>
      ) : filteredCompanies.length === 0 ? (
        <Alert variant="info" title={t('common.noResults', 'Nessun risultato')}>{t('companies.noResultsMatchingFilters', 'Nessuna azienda corrisponde ai filtri selezionati.')}</Alert>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          {filteredCompanies.map((c) => {
            const avatarColor = getAvatarColor(c.name);
            const initials = getInitials(c.name);
            const groupName = companyGroups.find((g) => g.id === c.groupId)?.name;
            const createdDate = new Date(c.createdAt).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
            const logoUrl = getCompanyLogoUrl(c.logoFilename);
            const bannerUrl = getCompanyBannerUrl(c.bannerFilename);
            const ownerLabel = c.ownerName ? `${c.ownerName} ${c.ownerSurname ?? ''}`.trim() : null;
            const countryLabel = getCountryDisplayName(c.country);

            return (
              <div
                key={c.id}
                className="card-lift"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: `3px solid ${c.isActive ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {bannerUrl && (
                  <div
                    style={{
                      height: 72,
                      backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.18) 100%), url(${bannerUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                )}

                {/* Card header */}
                <div style={{ padding: '18px 20px 14px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 'var(--radius)',
                    background: logoUrl ? 'transparent' : avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 16,
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                    overflow: 'hidden',
                  }}>
                    {logoUrl ? (
                      <img src={logoUrl} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : initials}
                  </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      {c.country ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                          <ReactCountryFlag countryCode={c.country} svg style={{ width: '0.9em', height: '0.9em' }} />
                          {countryLabel}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      {groupName && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--accent)',
                          background: 'var(--accent-light)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          letterSpacing: '0.01em',
                        }}>
                          <Layers size={10} />
                          {groupName}
                        </span>
                      )}
                      {c.isActive ? (
                        <Badge variant="success" size="sm">{t('common.active')}</Badge>
                      ) : (
                        <Badge variant="danger" size="sm">{t('common.inactive')}</Badge>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{createdDate}</span>
                    </div>
                    {ownerLabel && (
                      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Users size={10} />
                        {ownerLabel}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {user?.isSuperAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBillingConfigCompany(c);
                        }}
                        title={t('companies.billingRates', 'Tariffe & Parametri di Fatturazione')}
                        style={{
                          height: 32,
                          padding: '0 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(201,151,58,0.3)',
                          background: 'rgba(201,151,58,0.08)',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          transition: 'all 0.15s',
                        }}
                      >
                        <CreditCard size={12} /> {t('companies.billingRatesShort', 'Tariffe')}
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/aziende/${c.id}`)}
                      title={t('common.open')}
                      style={{
                        height: 32,
                        padding: '0 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        fontWeight: 700,
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-warm)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
                    >
                      {t('common.open')} <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'var(--border-light)', margin: '0 20px' }} />

                {/* Stats */}
                <div style={{ padding: '14px 20px 18px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatBox value={c.storeCount} label={t('companies.statStores')} icon={<Store size={16} />} />
                  <StatBox value={c.employeeCount} label={t('companies.statEmployees')} icon={<Users size={16} />} />
                  <StatBox value={c.activeDevicesCount || 0} label={t('companies.statDevices', 'Active devices')} icon={<Smartphone size={16} />} />
                  <StatBox value={`${((c.storageUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(2)}/${c.storageLimitGb || 500} GB`} label={t('companies.statStorage', 'Storage')} icon={<HardDrive size={16} />} />
                </div>

                {/* Access Control & Discount Validity Dates */}
                {(() => {
                  const formatDate = (dateStr?: string | null) => {
                    if (!dateStr) return '';
                    const dObj = new Date(dateStr);
                    if (isNaN(dObj.getTime())) return dateStr;
                    return dObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
                  };

                  const hasAccessFrom = !!c.accessValidFrom;
                  const hasAccessTo = !!c.accessValidTo;
                  const hasDiscount = c.discountPercent && c.discountPercent > 0;

                  if (!hasAccessFrom && !hasAccessTo && !hasDiscount) return null;

                  return (
                    <div style={{
                      margin: '0 20px 18px',
                      padding: '12px 16px',
                      background: 'var(--surface-warm)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                      {/* Access Valid Dates */}
                      {(hasAccessFrom || hasAccessTo) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CalendarClock size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {t('companies.accessRange', 'Access Period')}:
                            </span>{' '}
                            {c.accessValidFrom ? formatDate(c.accessValidFrom) : 'N/A'}{' '}
                            —{' '}
                            {c.accessValidTo ? formatDate(c.accessValidTo) : 'N/A'}
                          </div>
                        </div>
                      )}

                      {/* Discount Dates Badge */}
                      {hasDiscount && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {t('companies.appliedDiscount', 'Discount Period')}:
                          </span>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            background: 'rgba(201,151,58,0.12)',
                            color: 'var(--accent)',
                            border: '1px solid rgba(201,151,58,0.22)',
                            borderRadius: 4,
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}>
                            {c.discountValidFrom ? formatDate(c.discountValidFrom) : 'N/A'}
                            {' — '}
                            {c.discountValidTo ? formatDate(c.discountValidTo) : 'N/A'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {/* Total Price */}
                <div style={{
                  // marginTop:auto pins this to the bottom of the flex column,
                  // so it lines up across cards of differing heights.
                  marginTop: 'auto',
                  padding: '14px 20px',
                  background: 'var(--surface-warm)',
                  borderTop: '1px solid var(--border-light)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <button
                      type="button"
                      title={t('companies.viewPaymentHistory')}
                      aria-label={t('companies.viewPaymentHistory')}
                      onClick={(e) => { e.stopPropagation(); setHistoryCompany(c); }}
                      style={{
                        width: 28, height: 28, flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--accent)', cursor: 'pointer',
                      }}
                    >
                      <Receipt size={14} />
                    </button>
                    <CurrencyFlag code={c.currency} />
                    {t('companies.totalPrice', 'Total Price')}
                    {(() => {
                      if (c.discountPercent && c.discountPercent > 0) {
                        const now = new Date();
                        const fromOk = !c.discountValidFrom || now >= new Date(c.discountValidFrom);
                        const toOk = !c.discountValidTo || now <= (() => {
                          const to = new Date(c.discountValidTo);
                          to.setHours(23, 59, 59, 999);
                          return to;
                        })();
                        if (fromOk && toOk) {
                          return (
                            <span style={{
                              fontSize: 10,
                              background: 'rgba(22,163,74,0.12)',
                              color: '#16a34a',
                              border: '1px solid rgba(22,163,74,0.22)',
                              borderRadius: 4,
                              padding: '1px 6px',
                              fontWeight: 700
                            }}>
                              -{c.discountPercent}%
                            </span>
                          );
                        }
                      }
                      return null;
                    })()}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {(() => {
                      const totalBill = ((c.employeeCount * (c.pricePerEmployee || 0)) +
                        ((c.activeDevicesCount || 0) * (c.pricePerDevice || 0)) +
                        (Math.max(0, ((c.storageUsedBytes || 0) / (1024 * 1024 * 1024)) - (c.storageLimitGb || 500)) * (c.extraStoragePricePerGb || 0)));

                      let finalBill = totalBill;
                      if (c.discountPercent && c.discountPercent > 0) {
                        const now = new Date();
                        const fromOk = !c.discountValidFrom || now >= new Date(c.discountValidFrom);
                        const toOk = !c.discountValidTo || now <= (() => {
                          const to = new Date(c.discountValidTo);
                          to.setHours(23, 59, 59, 999);
                          return to;
                        })();
                        if (fromOk && toOk) {
                          finalBill = totalBill - (totalBill * c.discountPercent / 100);
                        }
                      }

                      return (
                        <>
                          {finalBill < totalBill && (
                            <span style={{ fontSize: 12, textDecoration: 'line-through', color: 'var(--text-muted)', marginRight: 6, fontWeight: 500 }}>
                              {formatMoney(totalBill, c.currency)}
                            </span>
                          )}
                          {formatMoney(finalBill, c.currency)}
                        </>
                      );
                    })()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? t('companies.createCompany') : t('companies.editCompany')}
        footer={
          <>
            {modalMode === 'create' && currentStep === 2 ? (
              <Button variant="secondary" onClick={() => setCurrentStep(1)} disabled={formSaving}>{t('common.back', 'Back')}</Button>
            ) : (
              <Button variant="secondary" onClick={closeModal} disabled={formSaving}>{t('common.cancel')}</Button>
            )}
            {modalMode === 'create' && currentStep === 1 ? (
              <Button onClick={() => {
                if (!formName.trim()) { setFormNameError(t('companies.validationName')); return; }
                setCurrentStep(2);
              }}>{t('common.next', 'Next')}</Button>
            ) : (
              <Button onClick={submit} loading={formSaving}>
                {modalMode === 'create' ? t('common.create') : t('common.save')}
              </Button>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {formError && <Alert variant="danger" onClose={() => setFormError(null)}>{formError}</Alert>}
          {(modalMode === 'edit' || currentStep === 1) && (
            <>
              <Input
                label={t('companies.fieldName')}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            error={formNameError}
            placeholder={t('companies.placeholderName')}
            disabled={formSaving}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {t('companies.fieldGroup')}
            </label>
            <CustomSelect
              options={groupOptions}
              value={formGroupId != null ? String(formGroupId) : 'standalone'}
              onChange={(val) => setFormGroupId(val === 'standalone' || !val ? null : parseInt(val, 10))}
              placeholder={t('companies.optionStandalone')}
              disabled={formSaving}
              isClearable
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {t('companies.ownerField', 'Owner')}
            </label>
            <CustomSelect
              options={ownerSelectOptions}
              value={formOwnerUserId != null ? String(formOwnerUserId) : null}
              onChange={(val) => setFormOwnerUserId(val ? parseInt(val, 10) : null)}
              placeholder={t('companies.ownerSearchPlaceholder', 'Search admin...')}
              disabled={formSaving || ownerCandidatesLoading}
              searchable
              isClearable
              searchPlaceholder={t('companies.ownerSearchPlaceholder', 'Search admin...')}
              noOptionsMessage={t('companies.ownerNoResults', 'No admin users found')}
            />
            {ownerCandidatesLoading && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {t('companies.ownerLoading', 'Caricamento amministratori in corso...')}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <Input
              label={t('companies.registrationNumber', 'Registration Number')}
              value={formProfile.registrationNumber}
              onChange={(e) => setFormProfile((prev) => ({ ...prev, registrationNumber: e.target.value }))}
              disabled={formSaving}
            />
            <Input
              label={t('companies.companyEmail', 'Company Email')}
              value={formProfile.companyEmail}
              onChange={(e) => setFormProfile((prev) => ({ ...prev, companyEmail: e.target.value }))}
              disabled={formSaving}
            />
            <Input
              label={t('companies.officesLocations', 'Offices Locations')}
              value={formProfile.officesLocations}
              onChange={(e) => setFormProfile((prev) => ({ ...prev, officesLocations: e.target.value }))}
              disabled={formSaving}
            />
            <CurrencySelect
              label={t('companies.currency', 'Currency')}
              value={formProfile.currency}
              onChange={(code) => setFormProfile((prev) => ({ ...prev, currency: code }))}
              disabled={formSaving}
            />
          </div>

          {/* Italian e-invoicing block — kept together and mirrored from the
              company detail modal so both entry points look the same. */}
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <Input
                label={t('companies.vatNumber', 'VAT number')}
                value={formProfile.vatNumber}
                onChange={(e) => setFormProfile((prev) => ({ ...prev, vatNumber: e.target.value }))}
                disabled={formSaving}
                error={formFiscalErrors.vatNumber}
                hint={t('companies.vatNumberHint', '11 digits, e.g. 12345678903')}
                placeholder="12345678903"
                inputMode="numeric"
              />
              <Input
                label={t('companies.sdiRecipientCode', 'SDI recipient code')}
                value={formProfile.sdiRecipientCode}
                onChange={(e) =>
                  setFormProfile((prev) => ({ ...prev, sdiRecipientCode: e.target.value.toUpperCase() }))
                }
                disabled={formSaving}
                error={formFiscalErrors.sdiRecipientCode}
                hint={t('companies.sdiRecipientCodeHint', '7 characters, or 0000000 if invoiced via PEC')}
                placeholder="0000000"
                maxLength={7}
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <Input
              label={t('companies.pecEmail', 'Certified email (PEC)')}
              type="email"
              value={formProfile.pecEmail}
              onChange={(e) => setFormProfile((prev) => ({ ...prev, pecEmail: e.target.value }))}
              disabled={formSaving}
              error={formFiscalErrors.pecEmail}
              hint={t('companies.pecEmailHint', 'Certified mailbox used for electronic invoices')}
              placeholder="azienda@pec.it"
            />
          </div>

          <LocationFieldGroup
            value={{
              country: formProfile.country,
              state: formProfile.state,
              city: formProfile.city,
              address: formProfile.address,
              postalCode: '',
              phone: formProfile.companyPhoneNumbers,
            }}
            onChange={(location) => {
              setFormProfile((prev) => ({
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
            disabled={formSaving}
            labels={{
              country: t('companies.country', 'Country'),
              state: t('companies.state', 'State'),
              city: t('companies.city', 'City'),
              address: t('companies.address', 'Address'),
              phone: t('companies.companyPhoneNumbers', 'Company Phone Numbers'),
            }}
          />
          </>
          )}

          {(modalMode === 'edit' || currentStep === 2) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Input
                type="number"
                label={t('companies.pricePerEmployee', 'Set price per employee')}
                value={formProfile.pricePerEmployee}
                onChange={(e) => setFormProfile(p => ({ ...p, pricePerEmployee: e.target.value ? Number(e.target.value) : '' }))}
                disabled={formSaving}
              />
              <Input
                type="number"
                label={t('companies.pricePerDevice', 'Set price per device')}
                value={formProfile.pricePerDevice}
                onChange={(e) => setFormProfile(p => ({ ...p, pricePerDevice: e.target.value ? Number(e.target.value) : '' }))}
                disabled={formSaving}
              />
              <Input
                type="number"
                label={t('companies.extraStoragePrice', 'Set extra storage price (per GB)')}
                value={formProfile.extraStoragePricePerGb}
                onChange={(e) => setFormProfile(p => ({ ...p, extraStoragePricePerGb: e.target.value ? Number(e.target.value) : '' }))}
                disabled={formSaving}
              />
              <Input
                type="number"
                label={t('companies.storageLimit', 'Set Storage Limit (GB)')}
                value={formProfile.storageLimitGb}
                onChange={(e) => setFormProfile(p => ({ ...p, storageLimitGb: e.target.value ? Number(e.target.value) : '' }))}
                disabled={formSaving}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DatePicker
                  label={t('companies.accessValidFrom', 'From Date')}
                  value={formProfile.accessValidFrom}
                  onChange={(val) => setFormProfile(p => ({ ...p, accessValidFrom: val }))}
                  disabled={formSaving}
                />
                <DatePicker
                  label={t('companies.accessValidTo', 'To Date')}
                  value={formProfile.accessValidTo}
                  onChange={(val) => setFormProfile(p => ({ ...p, accessValidTo: val }))}
                  disabled={formSaving}
                />
              </div>
              <Input
                type="number"
                label={t('companies.discountPercent', 'Discount (%)')}
                value={formProfile.discountPercent}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setFormProfile(p => ({ ...p, discountPercent: '' }));
                  } else {
                    const num = Number(val);
                    if (num >= 0 && num <= 100) {
                      setFormProfile(p => ({ ...p, discountPercent: num }));
                    }
                  }
                }}
                disabled={formSaving}
                min={0}
                max={100}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DatePicker
                  label={t('companies.discountValidFrom', 'Discount From Date')}
                  value={formProfile.discountValidFrom}
                  onChange={(val) => setFormProfile(p => ({ ...p, discountValidFrom: val }))}
                  disabled={formSaving}
                />
                <DatePicker
                  label={t('companies.discountValidTo', 'Discount To Date')}
                  value={formProfile.discountValidTo}
                  onChange={(val) => setFormProfile(p => ({ ...p, discountValidTo: val }))}
                  disabled={formSaving}
                />
              </div>
            </div>
          )}



          {modalMode === 'edit' && editingCompany && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('companies.logoField')}
                </span>

                {logoError && <Alert variant="danger" onClose={() => setLogoError(null)}>{logoError}</Alert>}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    background: editingCompany.logoFilename ? 'transparent' : getAvatarColor(editingCompany.name),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                  }}>
                    {editingCompany.logoFilename ? (
                      <img src={getCompanyLogoUrl(editingCompany.logoFilename) ?? ''} alt={editingCompany.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : getInitials(editingCompany.name)}
                  </div>

                  <input
                    id="company-logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleLogoUpload}
                    disabled={logoUploading || formSaving}
                  />
                  <label
                    htmlFor="company-logo-upload"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-warm)',
                      cursor: logoUploading || formSaving ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      opacity: logoUploading || formSaving ? 0.7 : 1,
                    }}
                  >
                    {logoUploading ? t('companies.logoUploading') : t('companies.uploadLogo')}
                  </label>
                </div>

                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('companies.logoHint')}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('companies.bannerField', 'Banner aziendale')}
                </span>

                {bannerError && <Alert variant="danger" onClose={() => setBannerError(null)}>{bannerError}</Alert>}

                {editingCompany.bannerFilename ? (
                  <img
                    src={getCompanyBannerUrl(editingCompany.bannerFilename) ?? ''}
                    alt={editingCompany.name}
                    style={{ width: '100%', maxHeight: 130, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div style={{ padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('companies.bannerEmpty', 'Nessun banner impostato')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    id="company-banner-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleBannerUpload}
                    disabled={bannerUploading || formSaving}
                  />
                  <label
                    htmlFor="company-banner-upload"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-warm)',
                      cursor: bannerUploading || formSaving ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      opacity: bannerUploading || formSaving ? 0.7 : 1,
                    }}
                  >
                    {bannerUploading ? t('companies.bannerUploading', 'Caricamento banner...') : t('companies.uploadBanner', 'Carica banner')}
                  </label>

                  {editingCompany.bannerFilename && (
                    <Button variant="danger" onClick={handleBannerDelete} disabled={bannerUploading || formSaving}>
                      {t('companies.removeBanner', 'Rimuovi banner')}
                    </Button>
                  )}
                </div>

                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('companies.bannerHint', 'Consigliato formato panoramico; massimo 12MB')}
                </span>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Confirm Modal ── */}
      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title={
          confirmMode === 'deactivate' ? t('companies.confirmDeactivateTitle')
            : confirmMode === 'activate' ? t('companies.confirmActivateTitle')
              : t('companies.confirmDeleteTitle')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={confirmBusy}>{t('common.cancel')}</Button>
            {confirmMode === 'activate' ? (
              <Button onClick={handleConfirm} loading={confirmBusy}>{t('common.activate')}</Button>
            ) : confirmMode === 'deactivate' ? (
              <Button variant="danger" onClick={handleConfirm} loading={confirmBusy}>{t('common.deactivate')}</Button>
            ) : (
              <Button variant="danger" onClick={handleConfirm} loading={confirmBusy}>{t('common.delete')}</Button>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {confirmError && <Alert variant="danger" onClose={() => setConfirmError(null)}>{confirmError}</Alert>}
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            {confirmMode === 'deactivate' ? t('companies.confirmDeactivateMsg', { name: confirmCompany?.name ?? '' })
              : confirmMode === 'activate' ? t('companies.confirmActivateMsg', { name: confirmCompany?.name ?? '' })
                : t('companies.confirmDeleteMsg', { name: confirmCompany?.name ?? '' })}
          </p>
        </div>
      </Modal>

      {/* ── Super Admin Dedicated Billing Config Modal ── */}
      {billingConfigCompany && (
        <CompanyBillingConfigModal
          company={billingConfigCompany}
          isOpen={!!billingConfigCompany}
          onClose={() => setBillingConfigCompany(null)}
          onSuccess={(updated) => {
            setCompanies((prev) =>
              prev.map((comp) => (comp.id === updated.id ? { ...comp, ...updated } : comp))
            );
          }}
        />
      )}

      <CompanyPaymentHistoryModal
        companyId={historyCompany?.id ?? null}
        companyName={historyCompany?.name}
        currency={historyCompany?.currency}
        onClose={() => setHistoryCompany(null)}
      />
    </div>
  );
}
