import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Calendar,
  Copy as CopyIcon,
  Globe2,
  Languages,
  MapPin,
  Search,
  SlidersHorizontal,
  Store as StoreIcon,
  Wallet,
  X,
} from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import { getCompanyLogoUrl } from '../../api/client';
import { getPublicJobsCatalog, PublicCompany, PublicJob, PublicStoreOption } from '../../api/publicCareers';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import CareersFooter from '../../components/careers/CareersFooter';
import CookieConsentBanner from '../../components/legal/CookieConsentBanner';
import { useToast } from '../../context/ToastContext';
import './publicCareers.css';

type UiLanguage = 'it' | 'en';
type SortMode = 'latest' | 'oldest' | 'salary_high' | 'salary_low';

type CareersFilters = {
  search: string;
  companyId: string;
  storeId: string;
  jobType: string;
  remoteType: string;
  language: string;
  status: string;
  salaryMin: string;
  salaryMax: string;
  sort: SortMode;
};

const DEFAULT_FILTERS: CareersFilters = {
  search: '',
  companyId: 'all',
  storeId: 'all',
  jobType: 'all',
  remoteType: 'all',
  language: 'all',
  status: 'all',
  salaryMin: '',
  salaryMax: '',
  sort: 'latest',
};

const JOB_TYPE_LABEL: Record<UiLanguage, Record<string, string>> = {
  en: {
    fulltime: 'Full-time',
    parttime: 'Part-time',
    contract: 'Contract',
    internship: 'Internship',
  },
  it: {
    fulltime: 'Tempo pieno',
    parttime: 'Part-time',
    contract: 'Contratto',
    internship: 'Stage',
  },
};

const REMOTE_TYPE_LABEL: Record<UiLanguage, Record<string, string>> = {
  en: {
    onsite: 'On-site',
    hybrid: 'Hybrid',
    remote: 'Remote',
  },
  it: {
    onsite: 'In sede',
    hybrid: 'Ibrido',
    remote: 'Remoto',
  },
};

const COPY: Record<UiLanguage, {
  kicker: string;
  title: string;
  subtitle: string;
  openRoles: string;
  activeCompanies: string;
  stores: string;
  fullyRemoteRoles: string;
  findYourMatch: string;
  searchHint: string;
  searchLabel: string;
  searchPlaceholder: string;
  companyLabel: string;
  allCompanies: string;
  loadingOpenPositions: string;
  loadError: string;
  noPositions: string;
  independentCompany: string;
  generalHiring: string;
  flexible: string;
  posted: string;
  salary: string;
  language: string;
  notSpecified: string;
  upTo: string;
  italian: string;
  english: string;
  viewDetails: string;
  filters: string;
  filtersHint: string;
  applyFilters: string;
  resetFilters: string;
  clearAllFilters: string;
  sortLabel: string;
  latestJobs: string;
  oldestJobs: string;
  salaryHigh: string;
  salaryLow: string;
  storeLabel: string;
  allStores: string;
  statusLabel: string;
  allStatuses: string;
  statusPublished: string;
  statusClosed: string;
  salaryMinLabel: string;
  salaryMaxLabel: string;
  candidatesApplied: string;
  postedAgo: string;
  actions: string;
  activeFilters: string;
  jobType: string;
  remoteType: string;
  appliedShort: string;
  location: string;
  copyJobLink: string;
  linkCopied: string;
  linkCopyError: string;
}> = {
  en: {
    kicker: 'Public Careers',
    title: 'Find your career opportunity in our team',
    subtitle: 'Explore open positions and apply in a few clicks to become part of our team.',
    openRoles: 'Open roles',
    activeCompanies: 'Active companies',
    stores: 'Stores',
    fullyRemoteRoles: 'Fully remote roles',
    findYourMatch: 'Find Your Match',
    searchHint: 'Search by role title, company, and keyword.',
    searchLabel: 'Search',
    searchPlaceholder: 'Role, keyword, department',
    companyLabel: 'Company',
    allCompanies: 'All companies',
    loadingOpenPositions: 'Loading open positions...',
    loadError: 'Unable to load careers at the moment. Please try again in a few minutes.',
    noPositions: 'No positions match this filter right now.',
    independentCompany: 'Independent company',
    generalHiring: 'General hiring',
    flexible: 'Flexible',
    posted: 'Posted',
    salary: 'Salary',
    language: 'Language',
    notSpecified: '-',
    upTo: 'Up to',
    italian: 'Italian',
    english: 'English',
    viewDetails: 'View details',
    filters: 'Filters',
    filtersHint: 'Use advanced filters to find the right role faster.',
    applyFilters: 'Apply filters',
    resetFilters: 'Reset',
    clearAllFilters: 'Clear all',
    sortLabel: 'Sort by',
    latestJobs: 'Latest jobs',
    oldestJobs: 'Oldest jobs',
    salaryHigh: 'Salary high to low',
    salaryLow: 'Salary low to high',
    storeLabel: 'Store',
    allStores: 'All stores',
    statusLabel: 'Status',
    allStatuses: 'All statuses',
    statusPublished: 'Published',
    statusClosed: 'Closed',
    salaryMinLabel: 'Salary min',
    salaryMaxLabel: 'Salary max',
    candidatesApplied: 'candidates applied',
    postedAgo: 'ago',
    actions: 'Actions',
    activeFilters: 'active filters',
    jobType: 'Job type',
    remoteType: 'Remote type',
    appliedShort: 'applied',
    location: 'Location',
    copyJobLink: 'Copy Job Link',
    linkCopied: 'Link copied!',
    linkCopyError: 'Failed to copy link',
  },
  it: {
    kicker: 'Careers Pubbliche',
    title: 'Trova la tua opportunità di carriera nel nostro team',
    subtitle: 'Esplora le posizioni aperte e candidati in pochi clic per entrare a far parte della nostra realtà.',
    openRoles: 'Posizioni aperte',
    activeCompanies: 'Aziende attive',
    stores: 'Negozi',
    fullyRemoteRoles: 'Ruoli completamente remoti',
    findYourMatch: 'Trova Il Ruolo Giusto',
    searchHint: 'Cerca per titolo ruolo, azienda e parola chiave.',
    searchLabel: 'Cerca',
    searchPlaceholder: 'Ruolo, parola chiave, dipartimento',
    companyLabel: 'Azienda',
    allCompanies: 'Tutte le aziende',
    loadingOpenPositions: 'Caricamento posizioni aperte...',
    loadError: 'Impossibile caricare le careers al momento. Riprova tra pochi minuti.',
    noPositions: 'Nessuna posizione corrisponde ai filtri attuali.',
    independentCompany: 'Azienda indipendente',
    generalHiring: 'Assunzione generale',
    flexible: 'Flessibile',
    posted: 'Pubblicato',
    salary: 'Retribuzione',
    language: 'Lingua',
    notSpecified: '-',
    upTo: 'Fino a',
    italian: 'Italiano',
    english: 'Inglese',
    viewDetails: 'Vedi dettagli',
    filters: 'Filtri',
    filtersHint: 'Usa i filtri avanzati per trovare rapidamente il ruolo giusto.',
    applyFilters: 'Applica filtri',
    resetFilters: 'Reset',
    clearAllFilters: 'Rimuovi tutti',
    sortLabel: 'Ordina per',
    latestJobs: 'Annunci piu recenti',
    oldestJobs: 'Annunci meno recenti',
    salaryHigh: 'Stipendio dal piu alto',
    salaryLow: 'Stipendio dal piu basso',
    storeLabel: 'Negozio',
    allStores: 'Tutti i negozi',
    statusLabel: 'Stato',
    allStatuses: 'Tutti gli stati',
    statusPublished: 'Pubblicata',
    statusClosed: 'Chiusa',
    salaryMinLabel: 'Stipendio minimo',
    salaryMaxLabel: 'Stipendio massimo',
    candidatesApplied: 'candidati hanno applicato',
    postedAgo: 'fa',
    actions: 'Azioni',
    activeFilters: 'filtri attivi',
    jobType: 'Tipo contratto',
    remoteType: 'Modalita lavoro',
    appliedShort: 'candidature',
    location: 'Posizione',
    copyJobLink: 'Copia link annuncio',
    linkCopied: 'Link copiato!',
    linkCopyError: 'Impossibile copiare il link',
  },
};

function summarize(text: string | null, max = 170): string {
  if (!text) return '';
  // 1. Strip HTML comments (e.g. <!--StartFragment-->)
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, '');
  // 2. Strip HTML tags, replacing them with spaces to prevent merging adjacent text
  const cleanText = withoutComments.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  if (cleanText.length <= max) return cleanText;
  return `${cleanText.slice(0, max).trim()}...`;
}

function initials(value: string): string {
  return value
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Simple country list for normalization
const COUNTRY_ROWS: Array<{ isoCode: string; name: string }> = [];

function normalizeCountryCode(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  // If it's already a 2-letter code, return it
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  // Otherwise return null (we don't have a full country list in frontend)
  return null;
}

function formatTimeAgo(isoDate: string | null | undefined, uiLanguage: UiLanguage, agoLabel: string): string {
  if (!isoDate) return '-';

  const now = Date.now();
  const target = new Date(isoDate).getTime();
  if (!Number.isFinite(target)) return '-';

  const diffMs = Math.max(0, now - target);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diffMs < hour) {
    const value = Math.max(1, Math.floor(diffMs / minute));
    return `${value}m ${agoLabel}`;
  }
  if (diffMs < day) {
    const value = Math.max(1, Math.floor(diffMs / hour));
    return `${value}h ${agoLabel}`;
  }
  if (diffMs < week) {
    const value = Math.max(1, Math.floor(diffMs / day));
    return `${value}d ${agoLabel}`;
  }
  if (diffMs < month) {
    const value = Math.max(1, Math.floor(diffMs / week));
    return `${value}w ${agoLabel}`;
  }
  const value = Math.max(1, Math.floor(diffMs / month));
  return `${value}${uiLanguage === 'it' ? ' mesi' : 'mo'} ${agoLabel}`;
}

function formatLanguageWithFlag(language: string, italianLabel: string, englishLabel: string): string {
  if (language === 'it') return `🇮🇹 ${italianLabel}`;
  if (language === 'en') return `🇬🇧 ${englishLabel}`;
  return `🇮🇹 🇬🇧 ${italianLabel} + ${englishLabel}`;
}

function formatSalary(job: PublicJob, locale: string, notSpecified: string, upTo: string): string {
  if (job.salaryMin == null && job.salaryMax == null) return notSpecified;

  const formatMoney = (value: number) => (
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value)
  );

  if (job.salaryMin != null && job.salaryMax != null) {
    return `${formatMoney(job.salaryMin)} - ${formatMoney(job.salaryMax)}`;
  }
  if (job.salaryMin != null) return `${formatMoney(job.salaryMin)}+`;
  return `${upTo} ${formatMoney(job.salaryMax as number)}`;
}

export default function PublicCareersPage() {
  const { companySlug } = useParams<{ companySlug?: string }>();
  const { i18n } = useTranslation();
  const { showToast } = useToast();
  const uiLanguage: UiLanguage = i18n.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
  const copy = COPY[uiLanguage];
  const locale = uiLanguage === 'it' ? 'it-IT' : 'en-US';

  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [stores, setStores] = useState<PublicStoreOption[]>([]);
  const [filters, setFilters] = useState<CareersFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CareersFilters>(DEFAULT_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setFilters(DEFAULT_FILTERS);
    setDraftFilters(DEFAULT_FILTERS);
    setSelectedTag(null);
    setVisibleCount(12);
  }, [companySlug]);

  useEffect(() => {
    setVisibleCount(12);
  }, [filters, selectedTag]);

  const uniqueTags = useMemo(() => {
    return Array.from(new Set(jobs.flatMap((j) => j.tags || []))).filter(Boolean);
  }, [jobs]);

  const locationCount = useMemo(() => {
    return new Set(jobs.map((job) => job.location.city || job.storeName).filter(Boolean)).size;
  }, [jobs]);

  const jobTypesCount = useMemo(() => {
    return new Set(jobs.map((job) => job.jobType).filter(Boolean)).size;
  }, [jobs]);

  useEffect(() => {
    setLoading(true);
    setHasError(false);
    getPublicJobsCatalog(companySlug)
      .then((data) => {
        const publicJobs = (data.jobs ?? []).filter((job) => job.status !== 'draft');
        setJobs(publicJobs);

        const companyIds = new Set(publicJobs.map((job) => job.companyId));
        const storeIds = new Set(publicJobs.filter((job) => job.storeId !== null).map((job) => job.storeId as number));

        setCompanies((data.companies ?? []).filter((company) => companyIds.has(company.id)));
        setStores((data.stores ?? []).filter((store) => storeIds.has(store.id)));
      })
      .catch(() => {
        setHasError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [companySlug]);

  const companyById = useMemo(() => {
    return new Map(companies.map((company) => [company.id, company]));
  }, [companies]);

  const currentCompany = useMemo(() => {
    if (!companySlug) return null;
    return companies[0] ?? null;
  }, [companySlug, companies]);

  const filteredJobs = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const salaryMin = filters.salaryMin.trim() === '' ? null : Number.parseInt(filters.salaryMin, 10);
    const salaryMax = filters.salaryMax.trim() === '' ? null : Number.parseInt(filters.salaryMax, 10);

    const list = jobs.filter((job) => {
      if (filters.companyId !== 'all' && String(job.companyId) !== filters.companyId) return false;
      if (filters.storeId !== 'all' && String(job.storeId ?? '') !== filters.storeId) return false;
      if (filters.jobType !== 'all' && job.jobType !== filters.jobType) return false;
      if (filters.remoteType !== 'all' && job.remoteType !== filters.remoteType) return false;
      if (filters.language !== 'all' && job.language !== filters.language) return false;
      if (filters.status !== 'all' && job.status !== filters.status) return false;
      if (selectedTag && (!job.tags || !job.tags.includes(selectedTag))) return false;

      if (salaryMin !== null && Number.isFinite(salaryMin)) {
        const compare = job.salaryMin ?? job.salaryMax;
        if (compare === null || compare < salaryMin) return false;
      }

      if (salaryMax !== null && Number.isFinite(salaryMax)) {
        const compare = job.salaryMax ?? job.salaryMin;
        if (compare === null || compare > salaryMax) return false;
      }

      if (!query) return true;
      const haystack = [job.title, job.description ?? '', job.companyName, job.storeName ?? '', job.tags.join(' ')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    return list.sort((a, b) => {
      if (filters.sort === 'salary_high') {
        const aSalary = a.salaryMax ?? a.salaryMin ?? -1;
        const bSalary = b.salaryMax ?? b.salaryMin ?? -1;
        return bSalary - aSalary;
      }

      if (filters.sort === 'salary_low') {
        const aSalary = a.salaryMin ?? a.salaryMax ?? Number.MAX_SAFE_INTEGER;
        const bSalary = b.salaryMin ?? b.salaryMax ?? Number.MAX_SAFE_INTEGER;
        return aSalary - bSalary;
      }

      const bTime = new Date(b.publishedAt ?? b.createdAt).getTime();
      const aTime = new Date(a.publishedAt ?? a.createdAt).getTime();
      if (filters.sort === 'oldest') return aTime - bTime;
      return bTime - aTime;
    });
  }, [jobs, filters, selectedTag]);

  const displayedJobs = useMemo(() => {
    return filteredJobs.slice(0, visibleCount);
  }, [filteredJobs, visibleCount]);

  const remoteRoles = useMemo(() => jobs.filter((job) => job.remoteType === 'remote').length, [jobs]);

  const activeFiltersCount = useMemo(() => {
    return Object.entries(filters).reduce((count, [key, value]) => {
      const defaultValue = DEFAULT_FILTERS[key as keyof CareersFilters];
      return value !== defaultValue ? count + 1 : count;
    }, 0);
  }, [filters]);

  const sortOptions = useMemo<SelectOption[]>(() => [
    { value: 'latest', label: copy.latestJobs },
    { value: 'oldest', label: copy.oldestJobs },
    { value: 'salary_high', label: copy.salaryHigh },
    { value: 'salary_low', label: copy.salaryLow },
  ], [copy]);

  const companyOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: copy.allCompanies },
    ...companies.map((company) => ({
      value: String(company.id),
      label: company.name,
    })),
  ], [copy, companies]);

  const storeOptions = useMemo<SelectOption[]>(() => {
    const list = stores.filter(
      (store) => draftFilters.companyId === 'all' || String(store.companyId) === draftFilters.companyId
    );
    return [
      { value: 'all', label: copy.allStores },
      ...list.map((store) => ({
        value: String(store.id),
        label: store.name,
      })),
    ];
  }, [copy, stores, draftFilters.companyId]);

  const statusOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: copy.allStatuses },
    { value: 'published', label: copy.statusPublished },
    { value: 'closed', label: copy.statusClosed },
  ], [copy]);

  const jobTypeOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: copy.allStatuses },
    { value: 'fulltime', label: JOB_TYPE_LABEL[uiLanguage].fulltime },
    { value: 'parttime', label: JOB_TYPE_LABEL[uiLanguage].parttime },
    { value: 'contract', label: JOB_TYPE_LABEL[uiLanguage].contract },
    { value: 'internship', label: JOB_TYPE_LABEL[uiLanguage].internship },
  ], [copy, uiLanguage]);

  const remoteTypeOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: copy.allStatuses },
    { value: 'onsite', label: REMOTE_TYPE_LABEL[uiLanguage].onsite },
    { value: 'hybrid', label: REMOTE_TYPE_LABEL[uiLanguage].hybrid },
    { value: 'remote', label: REMOTE_TYPE_LABEL[uiLanguage].remote },
  ], [copy, uiLanguage]);

  const languageOptions = useMemo<SelectOption[]>(() => [
    { value: 'all', label: copy.allStatuses },
    { value: 'it', label: copy.italian },
    { value: 'en', label: copy.english },
    { value: 'both', label: 'IT + EN' },
  ], [copy]);

  const resetDraftFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
  };

  const applyDraftFilters = () => {
    setFilters(draftFilters);
    setShowFilterModal(false);
  };

  const buildAbsoluteJobUrl = (detailUrl: string) => {
    if (typeof window === 'undefined') return detailUrl;
    return new URL(detailUrl, window.location.origin).toString();
  };

  const fallbackCopyToClipboard = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      const copied = document.execCommand('copy');
      if (copied) {
        showToast(copy.linkCopied, 'success');
      } else {
        showToast(copy.linkCopyError, 'error');
      }
    } catch {
      showToast(copy.linkCopyError, 'error');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleCopyJobLink = async (detailUrl: string) => {
    const jobUrl = buildAbsoluteJobUrl(detailUrl);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jobUrl);
        showToast(copy.linkCopied, 'success');
        return;
      }
    } catch {
      // Some browsers only allow clipboard access in secure contexts.
    }

    fallbackCopyToClipboard(jobUrl);
  };

  return (
    <div className="careers-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flex: 1 }}>
        <section className="careers-hero">
        <div className="careers-hero-inner">
          <div className="careers-top-actions">
            <span className="careers-kicker">{copy.kicker}</span>
            <div className="careers-top-actions-right" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <a
                href="https://it.indeed.com"
                target="_blank"
                rel="noopener noreferrer"
                title={uiLanguage === 'it' ? 'Candidati facilmente tramite Indeed' : 'Apply easily via Indeed'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(13, 33, 55, 0.15)',
                  background: '#ffffff',
                  textDecoration: 'none',
                  color: '#4b5563',
                  fontSize: '11px',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                  height: '24px',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(201, 151, 58, 0.45)';
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(201, 151, 58, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(13, 33, 55, 0.15)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.03)';
                }}
              >
                <span>
                  {uiLanguage === 'it' ? 'Candidati facilmente tramite' : 'Apply easily via'}
                </span>
                <img
                  src="https://www.indeed.com/images/indeed-logo.svg"
                  alt="Indeed"
                  style={{ height: '12px', width: 'auto', display: 'block', verticalAlign: 'middle' }}
                />
              </a>
              <LanguageSwitcher />
            </div>
          </div>

          {currentCompany ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '14px 0 10px' }}>
              {currentCompany.logoFilename && (
                <div className="careers-company-logo" style={{ width: 64, height: 64, borderRadius: 16, border: '2px solid rgba(201,151,58,0.3)', flexShrink: 0 }}>
                  <img src={getCompanyLogoUrl(currentCompany.logoFilename) ?? undefined} alt={currentCompany.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div>
                <h1 className="careers-title" style={{ margin: 0, fontSize: 'clamp(1.8rem, 3.5vw, 3rem)' }}>
                  <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400, fontSize: '0.65em' }}>
                    {uiLanguage === 'it' ? 'Lavora con noi in' : 'Careers at'}
                  </span>
                  {' '}
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                    {currentCompany.name}
                  </span>
                </h1>
                <p className="careers-subtitle" style={{ marginTop: 4 }}>
                  {(currentCompany as any).description || (uiLanguage === 'it' ? 'Scopri le opportunità di carriera disponibili nel nostro team.' : 'Discover the career opportunities available in our team.')}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="careers-title">{copy.title}</h1>
              <p className="careers-subtitle">{copy.subtitle}</p>
            </>
          )}

          {currentCompany ? (
            <div className="careers-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <article className="careers-stat-card">
                <BriefcaseBusiness size={18} />
                <div>
                  <strong>{jobs.length}</strong>
                  <span>{uiLanguage === 'it' ? 'posizioni aperte' : 'open positions'}</span>
                </div>
              </article>
              <article className="careers-stat-card">
                <StoreIcon size={18} />
                <div>
                  <strong>{stores.length}</strong>
                  <span>{uiLanguage === 'it' ? 'stores' : 'stores'}</span>
                </div>
              </article>
            </div>
          ) : (
            <div className="careers-stat-grid">
              <article className="careers-stat-card"><BriefcaseBusiness size={18} /><div><strong>{jobs.length}</strong><span>{copy.openRoles}</span></div></article>
              <article className="careers-stat-card"><Building2 size={18} /><div><strong>{companies.length}</strong><span>{copy.activeCompanies}</span></div></article>
              <article className="careers-stat-card"><StoreIcon size={18} /><div><strong>{stores.length}</strong><span>{copy.stores}</span></div></article>
              <article className="careers-stat-card"><Globe2 size={18} /><div><strong>{remoteRoles}</strong><span>{copy.fullyRemoteRoles}</span></div></article>
              <article className="careers-stat-card"><MapPin size={18} /><div><strong>{locationCount}</strong><span>{uiLanguage === 'it' ? 'Sedi' : 'Locations'}</span></div></article>
              <article className="careers-stat-card"><SlidersHorizontal size={18} /><div><strong>{jobTypesCount}</strong><span>{uiLanguage === 'it' ? 'Tipi contratto' : 'Job types'}</span></div></article>
            </div>
          )}

          <div className="careers-search-toolbar inline-hero-search">
            <label className="careers-search-inline">
              <Search size={15} />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder={copy.searchPlaceholder}
              />
            </label>
            <button className="careers-filter-open-btn" type="button" onClick={() => { setDraftFilters(filters); setShowFilterModal(true); }}>
              <SlidersHorizontal size={15} /> {copy.filters}
              {activeFiltersCount > 0 && <span>{activeFiltersCount}</span>}
            </button>
          </div>
        </div>
      </section>

      <section className="careers-content">
        {uniqueTags.length > 0 && (
          <div className="careers-tag-pills-row">
            {uniqueTags.map((tag) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  className={`careers-tag-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                >
                  {tag}
                  {isSelected && <X size={12} style={{ marginLeft: 6 }} />}
                </button>
              );
            })}
          </div>
        )}

        {loading && <div className="careers-empty">{copy.loadingOpenPositions}</div>}
        {!loading && hasError && <div className="careers-empty error">{copy.loadError}</div>}

        {!loading && !hasError && filteredJobs.length === 0 && (
          <div className="careers-empty">{copy.noPositions}</div>
        )}

        {!loading && !hasError && filteredJobs.length > 0 && (
          <div className="careers-jobs-grid">
            {displayedJobs.map((job) => {
              const company = companyById.get(job.companyId);
              const logoUrl = getCompanyLogoUrl(company?.logoFilename ?? job.companyLogoFilename);
              const companyCountryCode = normalizeCountryCode(company?.country ?? job.companyCountry ?? job.location.country);
              const groupLabel = (company?.groupName ?? job.companyGroupName ?? '').trim() || null;
              const city = job.location.city ?? job.storeName ?? copy.flexible;
              const detailUrl = job.companySlug
                ? `/careers/${encodeURIComponent(job.companySlug)}/jobs/${job.id}`
                : `/careers/jobs/${job.id}`;
              const typeLabel = JOB_TYPE_LABEL[uiLanguage][job.jobType] ?? job.jobType;
              const remoteTypeLabel = REMOTE_TYPE_LABEL[uiLanguage][job.remoteType] ?? job.remoteType;
              const postedDate = job.publishedAt ?? job.createdAt;
              const postedLabel = formatTimeAgo(postedDate, uiLanguage, copy.postedAgo);
              const jobLocationDisplay = [job.location.city || job.storeName, job.location.state, job.location.country].filter(Boolean).join(', ') || city;
              const salaryLabel = formatSalary(job, locale, copy.notSpecified, copy.upTo);
              const statusLabel = job.status === 'closed' ? copy.statusClosed : copy.statusPublished;

              return (
                <article key={job.id} className="careers-job-card">
                  <div className="careers-job-head-row">
                    {!companySlug && (
                      <div className="careers-company-pill">
                        <div className="careers-company-logo">
                          {logoUrl ? <img src={logoUrl} alt={job.companyName} /> : <span>{initials(job.companyName)}</span>}
                        </div>
                        <div>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.companyName}</span>
                            {companyCountryCode ? (
                              <ReactCountryFlag countryCode={companyCountryCode} svg style={{ width: '0.95em', height: '0.95em', borderRadius: 2 }} />
                            ) : null}
                          </strong>
                          {groupLabel ? <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{groupLabel}</span> : null}
                        </div>
                      </div>
                    )}
                    <div className="careers-job-head-right">
                      <div className="careers-job-time-badge">
                        <CalendarClock size={12} />
                        {postedLabel}
                      </div>
                      <div className="careers-job-applied-badge">{job.applicantsCount ?? 0} {copy.appliedShort}</div>
                    </div>
                  </div>

                  <h3>{job.title}</h3>
                  <p className="careers-job-description">{summarize(job.description)}</p>

                  <div className="careers-job-meta">
                    <span>{typeLabel}</span>
                    <span>{remoteTypeLabel}</span>
                    <span><MapPin size={12} style={{ marginRight: 4 }} />{city}</span>
                    <span className={job.status === 'closed' ? 'careers-status-chip closed' : 'careers-status-chip'}>{statusLabel}</span>
                  </div>

                  <div className="careers-job-extra-grid">
                    <div>
                      <strong><Calendar size={11} /> {copy.posted}</strong>
                      <span>{postedLabel}</span>
                    </div>
                    <div>
                      <strong><Wallet size={11} /> {copy.salary}</strong>
                      <span>{salaryLabel}</span>
                    </div>
                    <div>
                      <strong><Languages size={11} /> {copy.language}</strong>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {job.language === 'it' && <ReactCountryFlag countryCode="IT" svg style={{ width: '1em', height: '1em', borderRadius: 2 }} />}
                        {job.language === 'en' && <ReactCountryFlag countryCode="GB" svg style={{ width: '1em', height: '1em', borderRadius: 2 }} />}
                        {job.language === 'both' && (
                          <>
                            <ReactCountryFlag countryCode="IT" svg style={{ width: '1em', height: '1em', borderRadius: 2 }} />
                            <ReactCountryFlag countryCode="GB" svg style={{ width: '1em', height: '1em', borderRadius: 2 }} />
                          </>
                        )}
                        {job.language === 'it' ? copy.italian : job.language === 'en' ? copy.english : `${copy.italian} + ${copy.english}`}
                      </span>
                    </div>
                    <div>
                      <strong><MapPin size={11} /> {copy.location}</strong>
                      <span>{jobLocationDisplay}</span>
                    </div>
                  </div>

                  <div className="careers-job-footer">
                    <div className="careers-job-tags">
                      {job.tags.slice(0, 3).map((tag) => <span key={`${job.id}-${tag}`}>{tag}</span>)}
                      {job.tags.length === 0 && <span>{job.department ?? copy.generalHiring}</span>}
                    </div>
                    <div className="careers-job-actions">
                      <button
                        type="button"
                        className="careers-icon-btn"
                        onClick={() => void handleCopyJobLink(detailUrl)}
                        title={copy.copyJobLink}
                        aria-label={copy.copyJobLink}
                      >
                        <CopyIcon size={15} />
                      </button>
                      <Link to={detailUrl} className="careers-view-details-link">{copy.viewDetails} <ArrowRight size={15} /></Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {filteredJobs.length > visibleCount && (
          <div className="careers-pagination-row" style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
            <button
              type="button"
              className="careers-show-more-btn"
              onClick={() => setVisibleCount((prev) => prev + 8)}
            >
              {uiLanguage === 'it' ? 'Mostra altri' : 'Show more'}
            </button>
          </div>
        )}
      </section>

      {showFilterModal && (
        <div className="careers-filter-modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="careers-filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="careers-filter-modal-header">
              <div>
                <h3>{copy.filters}</h3>
                <p>{copy.searchHint}</p>
              </div>
              <button type="button" onClick={() => setShowFilterModal(false)} aria-label="Close filters">
                <X size={18} />
              </button>
            </div>

            <div className="careers-filter-modal-grid">
              <label className="careers-filter-field">
                <span>{copy.searchLabel}</span>
                <input
                  value={draftFilters.search}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder={copy.searchPlaceholder}
                />
              </label>

              <div className="careers-filter-field">
                <span>{copy.sortLabel}</span>
                <CustomSelect
                  value={draftFilters.sort}
                  onChange={(value) => setDraftFilters((prev) => ({ ...prev, sort: (value || 'latest') as SortMode }))}
                  options={sortOptions}
                  isClearable={false}
                  searchable={false}
                />
              </div>

              <div className="careers-filter-field">
                <span>{copy.companyLabel}</span>
                <CustomSelect
                  value={draftFilters.companyId}
                  onChange={(value) => {
                    setDraftFilters((prev) => ({ 
                      ...prev, 
                      companyId: value || 'all',
                      storeId: 'all' // Reset store when company changes to prevent mismatched states
                    }));
                  }}
                  options={companyOptions}
                  isClearable={false}
                  searchable={companies.length > 5}
                />
              </div>

              <div className="careers-filter-field">
                <span>{copy.storeLabel}</span>
                <CustomSelect
                  value={draftFilters.storeId}
                  onChange={(value) => setDraftFilters((prev) => ({ ...prev, storeId: value || 'all' }))}
                  options={storeOptions}
                  isClearable={false}
                  searchable={storeOptions.length > 5}
                />
              </div>

              <div className="careers-filter-field">
                <span>{copy.statusLabel}</span>
                <CustomSelect
                  value={draftFilters.status}
                  onChange={(value) => setDraftFilters((prev) => ({ ...prev, status: value || 'all' }))}
                  options={statusOptions}
                  isClearable={false}
                  searchable={false}
                />
              </div>

              <div className="careers-filter-field">
                <span>{copy.jobType}</span>
                <CustomSelect
                  value={draftFilters.jobType}
                  onChange={(value) => setDraftFilters((prev) => ({ ...prev, jobType: value || 'all' }))}
                  options={jobTypeOptions}
                  isClearable={false}
                  searchable={false}
                />
              </div>

              <div className="careers-filter-field">
                <span>{copy.remoteType}</span>
                <CustomSelect
                  value={draftFilters.remoteType}
                  onChange={(value) => setDraftFilters((prev) => ({ ...prev, remoteType: value || 'all' }))}
                  options={remoteTypeOptions}
                  isClearable={false}
                  searchable={false}
                />
              </div>

              <div className="careers-filter-field">
                <span>{copy.language}</span>
                <CustomSelect
                  value={draftFilters.language}
                  onChange={(value) => setDraftFilters((prev) => ({ ...prev, language: value || 'all' }))}
                  options={languageOptions}
                  isClearable={false}
                  searchable={false}
                />
              </div>

              <label className="careers-filter-field">
                <span>{copy.salaryMinLabel}</span>
                <input
                  type="number"
                  value={draftFilters.salaryMin}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, salaryMin: event.target.value }))}
                  placeholder="1200"
                />
              </label>

              <label className="careers-filter-field">
                <span>{copy.salaryMaxLabel}</span>
                <input
                  type="number"
                  value={draftFilters.salaryMax}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, salaryMax: event.target.value }))}
                  placeholder="2800"
                />
              </label>
            </div>

            <div className="careers-filter-modal-footer">
              <button type="button" className="careers-reset-btn" onClick={resetDraftFilters}>{copy.resetFilters}</button>
              <button type="button" className="careers-apply-btn" onClick={applyDraftFilters}>
                <BadgeCheck size={14} /> {copy.applyFilters}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      <CareersFooter companyName={currentCompany?.name} companyEmail={currentCompany?.companyEmail || undefined} companySlug={companySlug} />
      <CookieConsentBanner />
    </div>
  );
}
