import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicenses, LicenseNotice } from '../billing/useLicenses';
import {
  getTerminals,
  getDeletedTerminals,
  restoreTerminal,
  permanentlyDeleteTerminal,
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
import { Plus, ChevronRight, Filter, Search, X, CheckCircle2, Clock, RotateCcw, Ban, Trash2 } from 'lucide-react';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { translateApiError } from '../../utils/apiErrors';
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

// Columns trim themselves with an ellipsis and keep the full value in a
// tooltip, so nothing is cut at a fixed number of words or characters.

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
  // Area and store managers see terminals; only admin and hr change them, and
  // only an admin moves one to the deleted list.
  const canManageTerminals = isSuperAdmin || user?.role === 'admin' || user?.role === 'hr';
  const canDeleteTerminals = isSuperAdmin || user?.role === 'admin';

  // The deleted list is the Super Admin's, and holds what admins have removed.
  const [view, setView] = useState<'live' | 'deleted'>('live');
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Terminal | null>(null);
  const [purging, setPurging] = useState(false);
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
      const response = view === 'deleted'
        ? await getDeletedTerminals({ search, company_id: companyIds.join(','), page, limit })
        : await getTerminals({
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
  }, [search, storeIds.join(','), companyIds.join(','), registrationStates.join(','), page, limit, t, view]);

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
    // Nothing to edit in the deleted list: restore it first.
    if (view === 'deleted') return;
    setSelectedTerminal(terminal);
    setShowForm(true);
  };

  const handleRestore = async (terminal: Terminal) => {
    setRestoringId(terminal.id);
    try {
      const res = await restoreTerminal(terminal.id);
      showToast(
        res.message ?? t('terminals.restored', 'Terminal restored. It is inactive until you activate it.'),
        'success',
      );
      setListReloadTick((prev) => prev + 1);
      void refreshLicenses();
    } catch (err) {
      showToast(translateApiError(err, t, t('common.error')) ?? t('common.error'), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!purgeTarget) return;
    setPurging(true);
    try {
      await permanentlyDeleteTerminal(purgeTarget.id);
      showToast(t('terminals.permanentlyDeleted', 'Terminal permanently deleted'), 'success');
      setPurgeTarget(null);
      setListReloadTick((prev) => prev + 1);
    } catch (err) {
      showToast(translateApiError(err, t, t('common.error')) ?? t('common.error'), 'error');
    } finally {
      setPurging(false);
    }
  };

  const columns: Column<Terminal>[] = [
    {
      key: 'name',
      label: t('common.name'),
      width: '26%',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
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
          {/* Long store names used to push the store and company columns into
              ellipsis. The name gets a fixed share and trims itself instead. */}
          <span
            title={row.name}
            style={{
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {row.name}
          </span>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      width: '18%',
      render: (row) => (
        <span
          title={row.email}
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.email}
        </span>
      ),
    },
    {
      key: 'storeName',
      label: t('employees.colStore'),
      width: '22%',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
          <span
            title={row.storeName ?? ''}
            style={{
              color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {row.storeName ?? ''}
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
      width: '20%',
      render: (row) => (
        <span
          title={row.companyName ?? ''}
          style={{
            color: 'var(--text-muted)', fontSize: '13px', display: 'block',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {row.companyName ?? ''}
        </span>
      ),
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
      render: (row) =>
        view === 'deleted' ? (
          <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={(e) => { e.stopPropagation(); void handleRestore(row); }}
              disabled={restoringId === row.id}
              style={{
                background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600, color: 'var(--primary)',
                fontFamily: 'var(--font-body)', padding: '5px 10px',
                borderRadius: 'var(--radius-sm)', display: 'inline-flex',
                alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
              }}
            >
              <RotateCcw size={13} />
              {t('terminals.restore', 'Restore')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setPurgeTarget(row); }}
              style={{
                background: 'none', border: '1px solid var(--danger-border)', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600, color: 'var(--danger)',
                fontFamily: 'var(--font-body)', padding: '5px 10px',
                borderRadius: 'var(--radius-sm)', display: 'inline-flex',
                alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
              }}
            >
              <Trash2 size={13} />
              {t('terminals.deleteForever', 'Delete forever')}
            </button>
          </span>
        ) : (
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
            {canManageTerminals ? t('common.open') : t('common.view', 'View')}
            <ChevronRight size={14} />
          </button>
        ),
    },
  ];

  // In the deleted list, when it was removed and by whom replaces the status.
  const deletedColumns: Column<Terminal>[] = columns.map((col) =>
    col.key === 'status'
      ? {
          key: 'deletedAt',
          label: t('terminals.deletedOn', 'Deleted'),
          render: (row: Terminal) => (
            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600 }}>
                {row.deletedAt ? new Date(row.deletedAt).toLocaleDateString() : '—'}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                {row.deletedByName || '—'}
              </span>
            </span>
          ),
        }
      : col,
  );

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
        {canManageTerminals && view === 'live' && (
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

      {canManageTerminals && view === 'live' && (
        <LicenseNotice resource="terminal" licenses={licenses} enforced={enforced} />
      )}

      {/* The deleted list belongs to the Super Admin: what admins removed, kept
          until it is restored or removed for good. */}
      {isSuperAdmin && (
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--surface-warm)', border: '1px solid var(--border)', borderRadius: 999, padding: 4, alignSelf: 'flex-start' }}>
          {(['live', 'deleted'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setView(mode);
                setSearchParams((prev) => { prev.set('page', '1'); return prev; });
              }}
              style={{
                border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 999,
                fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-body)',
                background: view === mode ? 'var(--primary)' : 'transparent',
                color: view === mode ? '#fff' : 'var(--text-secondary)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {mode === 'live' ? <CheckCircle2 size={13} /> : <Trash2 size={13} />}
              {mode === 'live'
                ? t('terminals.viewActive', 'Active')
                : t('terminals.viewDeleted', 'Deleted')}
            </button>
          ))}
        </div>
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
          columns={view === 'deleted' ? deletedColumns : columns}
          data={terminals}
          loading={loading}
          onRowClick={view === 'deleted' ? undefined : (row) => handleOpenForm(row)}
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

      <ConfirmModal
        open={purgeTarget !== null}
        title={t('terminals.deleteForever', 'Delete forever')}
        message={t(
          'terminals.deleteForeverMsg',
          'This removes {{name}} and its credentials for good. The record of what was done stays in the audit trail. This cannot be undone.',
          { name: purgeTarget?.name ?? '' },
        )}
        confirmLabel={purging ? t('common.loading') : t('terminals.deleteForever', 'Delete forever')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={() => void handlePermanentDelete()}
        onCancel={() => setPurgeTarget(null)}
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
