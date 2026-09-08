import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicenses, LicenseNotice } from '../billing/useLicenses';
import {
  getTerminals,
  getTerminalOperationalState,
  Terminal,
  TerminalOperationalState,
} from '../../api/terminals';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { UserRole, Store } from '../../types';
import { Table, Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Pagination } from '../../components/ui/Pagination';
import { TerminalForm } from './TerminalForm';
import { Plus, ChevronRight, Filter, Search, X, CheckCircle2, Clock, RotateCcw, Ban } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import apiClient from '../../api/client';
import { getStores } from '../../api/stores';
import { TerminalFilterModal, FilterValues } from './TerminalFilterModal';
import { SelectOption } from '../../components/ui/CustomSelect';
import { getStoreTimezoneTag, resolveStoreTimezone } from '../../utils/timezone';

interface CompanyOption {
  id: number;
  name: string;
}

const truncateChars = (str: string, max: number) => {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max)}...` : str;
};

const truncateWords = (str: string, max: number) => {
  if (!str) return '';
  const words = str.split(' ').filter(Boolean);
  if (words.length > max) return `${words.slice(0, max).join(' ')}...`;
  return str;
};

type BadgeVariant = 'accent' | 'primary' | 'info' | 'success' | 'warning' | 'neutral' | 'danger';

const OPERATIONAL_BADGE: Record<TerminalOperationalState, {
  variant: BadgeVariant;
  labelKey: string;
  fallback: string;
  icon: typeof CheckCircle2;
}> = {
  operational: { variant: 'success', labelKey: 'terminals.stateOperational', fallback: 'Active', icon: CheckCircle2 },
  pending_registration: { variant: 'warning', labelKey: 'terminals.statePendingRegistration', fallback: 'Setup incomplete', icon: Clock },
  reset_pending: { variant: 'info', labelKey: 'terminals.stateResetPending', fallback: 'Reset pending', icon: RotateCcw },
  disabled: { variant: 'neutral', labelKey: 'terminals.stateDisabled', fallback: 'Disabled', icon: Ban },
};

const ROLE_BADGE_VARIANT: Record<UserRole | string, 'accent' | 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  admin: 'accent',
  hr: 'info',
  area_manager: 'success',
  store_manager: 'warning',
  employee: 'neutral',
  store_terminal: 'neutral',
};

export default function TerminalList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const { licenses, enforced, canAddTerminal, refresh: refreshLicenses } = useLicenses();
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [listReloadTick, setListReloadTick] = useState(0);

  // Filters state
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const search = searchParams.get('search') ?? '';
  
  const storeIds = useMemo(() => 
    searchParams.get('store_ids')?.split(',').filter(Boolean) ?? [],
    [searchParams]
  );
  
  const companyIds = useMemo(() => 
    searchParams.get('company_ids')?.split(',').filter(Boolean) ?? [],
    [searchParams]
  );
  
  const registrationStates = useMemo(() =>
    searchParams.get('registration')?.split(',').filter(Boolean) ?? [],
    [searchParams]
  );

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = 20;

  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'area_manager';
  const isSuperAdmin = user?.isSuperAdmin === true;
  const tRole = (roleKey: string) => (t as (k: string) => string)(`roles.${roleKey}`);

  const hasActiveFilters = !!(
    search ||
    storeIds.length > 0 ||
    companyIds.length > 0 ||
    registrationStates.length > 0
  );

  const activeFilterTagsCount = (storeIds.length + companyIds.length + registrationStates.length);

  // Load companies
  useEffect(() => {
    if (!isAdminOrHr && !isSuperAdmin) return;
    apiClient
      .get<{ data: CompanyOption[] }>('/companies')
      .then((res) => {
        const data = res.data?.data;
        if (Array.isArray(data)) {
          setCompanies(data.map((c) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});
  }, [isAdminOrHr, isSuperAdmin]);

  // Load stores based on selected companies
  useEffect(() => {
    // If single company selected, scope stores by it
    const targetId = companyIds.length === 1 ? parseInt(companyIds[0], 10) : undefined;
    getStores(targetId ? { targetCompanyId: targetId } : undefined)
      .then(setStores)
      .catch(() => {});
  }, [companyIds.join(',')]);

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

  const fetchTerminals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getTerminals({
        search,
        status: '',
        registration: registrationStates.join(','),
        store_id: storeIds.join(','),
        company_id: companyIds.join(','),
        page,
        limit,
      });
      setTerminals(response.data.data);
      setTotal(response.data.meta.total);
      setTotalPages(response.data.meta.totalPages);
    } catch (err) {
      console.error('Error loading terminals:', err);
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [search, storeIds.join(','), companyIds.join(','), registrationStates.join(','), page, limit, t]);

  useEffect(() => {
    fetchTerminals();
  }, [fetchTerminals, listReloadTick]);

  const updateParam = (key: string, val: string) => {
    setSearchParams(prev => {
      if (val) prev.set(key, val);
      else prev.delete(key);
      prev.set('page', '1');
      return prev;
    });
  };

  const handleApplyFilters = useCallback(
    (filters: FilterValues) => {
      setSearchParams(prev => {
        if (filters.company_ids.length > 0) {
          prev.set('company_ids', filters.company_ids.join(','));
        } else {
          prev.delete('company_ids');
        }

        if (filters.store_ids.length > 0) {
          prev.set('store_ids', filters.store_ids.join(','));
        } else {
          prev.delete('store_ids');
        }

        if (filters.registration_states.length > 0) {
          prev.set('registration', filters.registration_states.join(','));
        } else {
          prev.delete('registration');
        }

        prev.set('page', '1');
        return prev;
      });
    },
    [setSearchParams]
  );

  const handleOpenForm = (terminal: Terminal | null = null) => {
    setSelectedTerminal(terminal);
    setShowForm(true);
  };

  const columns: Column<Terminal>[] = [
    {
      key: 'name',
      label: t('common.name'),
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#0D2137',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 700,
            flexShrink: 0
          }}>
            {row.name.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.name}</span>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (row) => <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{truncateChars(row.email, 15)}</span>,
    },
    {
      key: 'storeName',
      label: t('employees.colStore'),
      render: (row) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>
            {truncateWords(row.storeName ?? '', 2)}
          </span>
          {/* Which clock this terminal enforces. Two shops can show the same
              opening time and still admit staff an hour apart. */}
          <span
            title={resolveStoreTimezone(row.storeTimezone)}
            style={{ color: 'var(--text-muted)', fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.02em' }}
          >
            {getStoreTimezoneTag(row.storeTimezone)}
          </span>
        </span>
      ),
    },
    {
      key: 'companyName',
      label: t('employees.colCompany'),
      render: (row) => <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{truncateWords(row.companyName ?? '', 2)}</span>,
    },
    {
      key: 'role',
      label: t('common.role'),
      render: (row) => <Badge variant={ROLE_BADGE_VARIANT[row.role]}>{tRole(row.role)}</Badge>,
    },
    {
      // A single badge for both signals. Account status and registration state
      // are stored separately, but showing them as two badges next to the role
      // badge was three tags in a row for one idea: can this terminal work?
      // The operational state already encodes both — an enabled-but-unregistered
      // terminal reads "Setup incomplete" rather than "Active".
      key: 'status',
      label: t('common.status'),
      render: (row) => {
        const state = getTerminalOperationalState(row);
        const meta = OPERATIONAL_BADGE[state];
        const Icon = meta.icon;
        return (
          <Badge variant={meta.variant}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon size={12} />
              {t(meta.labelKey, meta.fallback)}
            </span>
          </Badge>
        );
      },
    },
    {
      key: 'id',
      label: t('terminals.colActions'),
      align: 'right',
      render: (row) => (
        <button
          onClick={() => handleOpenForm(row)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600, color: 'var(--accent)',
            fontFamily: 'var(--font-body)', padding: '5px 10px',
            borderRadius: 'var(--radius-sm)', display: 'inline-flex',
            alignItems: 'center', gap: '3px', whiteSpace: 'nowrap',
          }}
        >
          {t('common.open')}
          <ChevronRight size={14} />
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top action row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
            {t('terminals.title', 'Store Terminals')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {t('terminals.subtitle', 'Management and monitoring of fixed QR terminals')}
          </p>
        </div>
        {(isAdminOrHr || isSuperAdmin) && (
          <Button
            onClick={() => handleOpenForm(null)}
            disabled={!canAddTerminal}
            title={
              canAddTerminal
                ? undefined
                : t(
                    'billing.terminalLicensesFullShort',
                    'Licenze terminali esaurite: acquistane altre da Fatturazione'
                  )
            }
            style={{ width: isMobile ? '100%' : 'auto' }}
          >
            <Plus size={15} />
            {t('terminals.newTerminal')}
          </Button>
        )}
      </div>

      {(isAdminOrHr || isSuperAdmin) && (
        <LicenseNotice resource="terminal" licenses={licenses} enforced={enforced} />
      )}

      {/* Filter bar - Search on left, Filter button on right */}
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
            placeholder={t("terminals.searchPlaceholder", "Search terminal or email...")}
            value={search}
            onChange={(e) => updateParam("search", e.target.value)}
            style={{
              paddingLeft: "40px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "14px",
            }}
          />
        </div>

        {/* Filter Button */}
        <button
          onClick={() => setShowFilterModal(true)}
          style={{
            background: hasActiveFilters && activeFilterTagsCount > 0
              ? "linear-gradient(135deg, var(--accent) 0%, #B48719 100%)"
              : "var(--surface)",
            color: hasActiveFilters && activeFilterTagsCount > 0 ? "#fff" : "var(--text-secondary)",
            border: hasActiveFilters && activeFilterTagsCount > 0 ? "none" : "1px solid var(--border)",
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
            boxShadow: hasActiveFilters && activeFilterTagsCount > 0 ? "0 2px 8px rgba(139,105,20,0.24)" : "none",
            position: "relative",
          }}
        >
          <Filter size={16} strokeWidth={2.5} />
          {t("employees.filters", "Filters")}
          {activeFilterTagsCount > 0 && (
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
              {activeFilterTagsCount}
            </span>
          )}
        </button>

        {/* Reset Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={() => setSearchParams(new URLSearchParams())}
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
            }}
            title={t("employees.resetFilters", "Reset all filters")}
          >
            <X size={16} />
            {!isMobile && t("employees.reset", "Reset")}
          </button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          data={terminals}
          loading={loading}
          onRowClick={(row) => handleOpenForm(row)}
          headerBackground="#0D2137"
          headerTextColor="#FFFFFF"
          headerBorderBottom="none"
        />
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
          <Pagination
            page={page}
            pages={totalPages}
            total={total}
            limit={limit}
            onPageChange={(p) => setSearchParams(prev => { prev.set('page', p.toString()); return prev; })}
          />
        </div>
      )}

      <TerminalForm
        open={showForm}
        terminal={selectedTerminal}
        onSuccess={() => {
          setShowForm(false);
          setListReloadTick(prev => prev + 1);
          showToast(selectedTerminal ? t('common.success') : t('terminals.terminalSaveSuccess'), 'success');
        }}
        onCancel={() => setShowForm(false)}
        onRefreshList={() => setListReloadTick(prev => prev + 1)}
      />

      <TerminalFilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApply={handleApplyFilters}
        initialFilters={{
          company_ids: companyIds,
          store_ids: storeIds,
          registration_states: registrationStates,
        }}
        companyOptions={companyOptions}
        storeOptions={storeOptions}
        showCompanyFilter={(isAdminOrHr || isSuperAdmin) && companies.length > 0}
      />
    </div>
  );
}
