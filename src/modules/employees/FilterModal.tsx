import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Filter, Check, ChevronDown, ChevronUp, Building2, Store as StoreIcon } from 'lucide-react';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { Input } from '../../components/ui/Input';

/** A company row: logo, name, and how many employees it holds. */
export interface FilterCompanyOption {
  value: string;
  label: string;
  logoUrl?: string | null;
  employeeCount?: number;
}

/** A store row: logo, name, its company (shown underneath), and its headcount. */
export interface FilterStoreOption {
  value: string;
  label: string;
  companyId: string;
  companyName?: string;
  logoUrl?: string | null;
  employeeCount?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (filters: FilterValues) => void;
  initialFilters: FilterValues;
  companyOptions: FilterCompanyOption[];
  storeOptions: FilterStoreOption[];
  statusOptions: SelectOption[];
  roleOptions: SelectOption[];
  showCompanyFilter: boolean;
}

export interface FilterValues {
  company_ids: string[]; // Changed to array
  store_ids: string[]; // Changed to array
  department: string;
  status: string;
  role: string;
}

/**
 * One selectable row: checkbox, logo, name (with an optional line underneath) and
 * the headcount on the right, so the size of a selection is readable before applying it.
 */
function OptionRow({
  checked,
  onToggle,
  logoUrl,
  fallback,
  title,
  subtitle,
  countLabel,
  isLast,
}: {
  checked: boolean;
  onToggle: () => void;
  logoUrl?: string | null;
  fallback: React.ReactNode;
  title: string;
  subtitle?: string;
  countLabel?: string;
  isLast: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 12px',
        cursor: 'pointer',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ display: 'none' }} />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '4px',
          border: `2px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
          background: checked ? 'var(--primary)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {checked && <Check size={12} color="#fff" strokeWidth={3} />}
      </div>

      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '6px',
          flexShrink: 0,
          overflow: 'hidden',
          background: 'var(--surface-warm)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          fallback
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {countLabel && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border)',
            borderRadius: '999px',
            padding: '2px 8px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {countLabel}
        </span>
      )}
    </label>
  );
}

export function FilterModal({
  open,
  onClose,
  onApply,
  initialFilters,
  companyOptions,
  storeOptions,
  statusOptions,
  roleOptions,
  showCompanyFilter,
}: Props) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterValues>(initialFilters);
  const [companiesExpanded, setCompaniesExpanded] = useState(false);
  const [storesExpanded, setStoresExpanded] = useState(false);
  const wasOpen = useRef(open);

  // Seed the draft only on the closed → open transition. Re-seeding on every render
  // would wipe in-progress selections whenever the page re-renders underneath the
  // modal (the permissions poll does exactly that every few seconds).
  useEffect(() => {
    if (open && !wasOpen.current) {
      setFilters(initialFilters);
    }
    wasOpen.current = open;
  }, [open, initialFilters]);

  // Stores are scoped by company id, never by parsing the label text.
  const filteredStoreOptions = useMemo(() => {
    if (filters.company_ids.length === 0) {
      return storeOptions;
    }
    return storeOptions.filter((store) => filters.company_ids.includes(store.companyId));
  }, [filters.company_ids, storeOptions]);

  const formatCount = (count: number) =>
    count === 1
      ? t('employees.filterEmployeeCountOne', '1 employee')
      : t('employees.filterEmployeeCount', '{{count}} employees', { count });

  const selectedCompanySummary = useMemo(() => {
    const selected = companyOptions.filter((c) => filters.company_ids.includes(c.value));
    return {
      count: selected.length,
      employees: selected.reduce((sum, c) => sum + (c.employeeCount ?? 0), 0),
    };
  }, [companyOptions, filters.company_ids]);

  const selectedStoreSummary = useMemo(() => {
    const selected = storeOptions.filter((s) => filters.store_ids.includes(s.value));
    return {
      count: selected.length,
      employees: selected.reduce((sum, s) => sum + (s.employeeCount ?? 0), 0),
    };
  }, [storeOptions, filters.store_ids]);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const emptyFilters: FilterValues = {
      company_ids: [],
      store_ids: [],
      department: '',
      status: '',
      role: '',
    };
    setFilters(emptyFilters);
  };

  const toggleCompany = (companyId: string) => {
    setFilters((prev) => {
      const newCompanyIds = prev.company_ids.includes(companyId)
        ? prev.company_ids.filter((id) => id !== companyId)
        : [...prev.company_ids, companyId];

      // Deselecting a company also drops the stores that belong to it, otherwise a
      // hidden store id would keep narrowing the list.
      if (!newCompanyIds.includes(companyId)) {
        const newStoreIds = prev.store_ids.filter((storeId) => {
          const store = storeOptions.find((s) => s.value === storeId);
          return !store || store.companyId !== companyId;
        });
        return { ...prev, company_ids: newCompanyIds, store_ids: newStoreIds };
      }

      return { ...prev, company_ids: newCompanyIds };
    });
  };

  const toggleStore = (storeId: string) => {
    setFilters((prev) => ({
      ...prev,
      store_ids: prev.store_ids.includes(storeId)
        ? prev.store_ids.filter((id) => id !== storeId)
        : [...prev.store_ids, storeId],
    }));
  };

  const hasActiveFilters = 
    filters.company_ids.length > 0 ||
    filters.store_ids.length > 0 ||
    filters.department !== '' ||
    filters.status !== '' ||
    filters.role !== '';

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(13,33,55,0.48)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          width: 'min(520px, 92vw)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%)' }} />

        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #8B6914 0%, #B48719 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Filter size={18} color="#fff" strokeWidth={2.5} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                {t('employees.filterTitle', 'Filter Employees')}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {t('employees.filterSubtitle', 'Refine your employee list')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '22px',
              lineHeight: 1,
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Company Filter - Collapsible checklist */}
            {showCompanyFilter && companyOptions.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setCompaniesExpanded(!companiesExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    outline: 'none',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span>{t('employees.filterCompany', 'Company')}</span>
                    {selectedCompanySummary.count > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>
                        {selectedCompanySummary.count === 1
                          ? t('employees.filterCompanyCountOne', '1 company')
                          : t('employees.filterCompanyCount', '{{count}} companies', {
                              count: selectedCompanySummary.count,
                            })}
                        {' · '}
                        {formatCount(selectedCompanySummary.employees)}
                      </span>
                    )}
                  </div>
                  {companiesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {companiesExpanded && (
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'var(--surface)',
                      boxShadow: 'var(--shadow-sm)',
                      marginBottom: '12px',
                    }}
                  >
                    {companyOptions.map((company, index) => (
                      <OptionRow
                        key={company.value}
                        checked={filters.company_ids.includes(company.value)}
                        onToggle={() => toggleCompany(company.value)}
                        logoUrl={company.logoUrl}
                        fallback={<Building2 size={14} />}
                        title={company.label}
                        countLabel={formatCount(company.employeeCount ?? 0)}
                        isLast={index === companyOptions.length - 1}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Store Filter - Collapsible checklist */}
            <div>
              <button
                type="button"
                onClick={() => setStoresExpanded(!storesExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span>{t('employees.filterStore', 'Store')}</span>
                  {selectedStoreSummary.count > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>
                      {selectedStoreSummary.count === 1
                        ? t('employees.filterStoreCountOne', '1 store')
                        : t('employees.filterStoreCount', '{{count}} stores', {
                            count: selectedStoreSummary.count,
                          })}
                      {' · '}
                      {formatCount(selectedStoreSummary.employees)}
                    </span>
                  )}
                </div>
                {storesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {storesExpanded && (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    background: 'var(--surface)',
                    boxShadow: 'var(--shadow-sm)',
                    marginBottom: '12px',
                  }}
                >
                  {filteredStoreOptions.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {filters.company_ids.length > 0
                        ? t('employees.noStoresForCompany', 'No stores found for selected companies')
                        : t('employees.noStores', 'No stores available')}
                    </div>
                  ) : (
                    filteredStoreOptions.map((store, index) => (
                      <OptionRow
                        key={store.value}
                        checked={filters.store_ids.includes(store.value)}
                        onToggle={() => toggleStore(store.value)}
                        logoUrl={store.logoUrl}
                        fallback={<StoreIcon size={14} />}
                        title={store.label}
                        subtitle={store.companyName || undefined}
                        countLabel={formatCount(store.employeeCount ?? 0)}
                        isLast={index === filteredStoreOptions.length - 1}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Status Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t('employees.filterStatus', 'Status')}
              </label>
              <CustomSelect
                value={filters.status || null}
                onChange={(value) => setFilters({ ...filters, status: value || '' })}
                options={statusOptions}
                placeholder={t('employees.allStatuses', 'All Statuses')}
                isClearable={true}
                searchable={false}
                highlightSelected={true}
                controlMinHeight={40}
              />
            </div>

            {/* Role Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t('employees.filterRole', 'Role')}
              </label>
              <CustomSelect
                value={filters.role || null}
                onChange={(value) => setFilters({ ...filters, role: value || '' })}
                options={roleOptions}
                placeholder={t('employees.allRoles', 'All Roles')}
                isClearable={true}
                searchable={false}
                highlightSelected={true}
                controlMinHeight={40}
              />
            </div>

            {/* Department Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t('employees.filterDepartment', 'Department')}
              </label>
              <Input
                placeholder={t('employees.departmentPlaceholder', 'Enter department name')}
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleReset}
            disabled={!hasActiveFilters}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: hasActiveFilters ? 'var(--text-secondary)' : 'var(--text-disabled)',
              transition: 'background 0.15s, border-color 0.15s',
              opacity: hasActiveFilters ? 1 : 0.5,
            }}
          >
            {t('employees.resetFilters', 'Reset All')}
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 20px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-secondary)',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleApply}
              style={{
                padding: '9px 20px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                border: 'none',
                background: 'linear-gradient(135deg, var(--accent) 0%, #B48719 100%)',
                color: '#fff',
                transition: 'transform 0.15s, box-shadow 0.15s',
                boxShadow: '0 2px 8px rgba(139,105,20,0.24)',
              }}
            >
              {t('employees.applyFilters', 'Apply Filters')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
