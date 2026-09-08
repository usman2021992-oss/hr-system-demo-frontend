import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Filter, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { SelectOption } from '../../components/ui/CustomSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (filters: FilterValues) => void;
  initialFilters: FilterValues;
  companyOptions: SelectOption[];
  storeOptions: SelectOption[];
  showCompanyFilter: boolean;
}

export interface FilterValues {
  company_ids: string[];
  store_ids: string[];
  registration_states: string[];
}

const REGISTRATION_FILTER_OPTIONS: { value: string; labelKey: string; fallback: string }[] = [
  { value: 'registered', labelKey: 'terminals.regRegistered', fallback: 'Registered' },
  { value: 'pending', labelKey: 'terminals.regPending', fallback: 'Not registered' },
  { value: 'reset_pending', labelKey: 'terminals.regResetPending', fallback: 'Awaiting re-registration' },
];

export function TerminalFilterModal({
  open,
  onClose,
  onApply,
  initialFilters,
  companyOptions,
  storeOptions,
  showCompanyFilter,
}: Props) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterValues>(initialFilters);
  const [companiesExpanded, setCompaniesExpanded] = useState(false);
  const [storesExpanded, setStoresExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setFilters(initialFilters);
    }
  }, [open, initialFilters]);

  // Filter stores based on selected companies
  const filteredStoreOptions = useMemo(() => {
    if (filters.company_ids.length === 0) {
      return storeOptions;
    }
    
    return storeOptions.filter((store) => {
      return filters.company_ids.some((companyId) => {
        const company = companyOptions.find((c) => c.value === companyId);
        if (!company) return false;
        return store.label.includes(`(${company.label})`);
      });
    });
  }, [filters.company_ids, storeOptions, companyOptions]);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const emptyFilters: FilterValues = {
      company_ids: [],
      store_ids: [],
      registration_states: [],
    };
    setFilters(emptyFilters);
  };

  const toggleRegistrationState = (state: string) => {
    setFilters((prev) => ({
      ...prev,
      registration_states: prev.registration_states.includes(state)
        ? prev.registration_states.filter((s) => s !== state)
        : [...prev.registration_states, state],
    }));
  };

  const toggleCompany = (companyId: string) => {
    setFilters((prev) => {
      const newCompanyIds = prev.company_ids.includes(companyId)
        ? prev.company_ids.filter((id) => id !== companyId)
        : [...prev.company_ids, companyId];
      
      // If deselecting a company, also deselect its stores
      if (!newCompanyIds.includes(companyId)) {
        const company = companyOptions.find((c) => c.value === companyId);
        if (company) {
          const newStoreIds = prev.store_ids.filter((storeId) => {
            const store = storeOptions.find((s) => s.value === storeId);
            return store && !store.label.includes(`(${company.label})`);
          });
          return { ...prev, company_ids: newCompanyIds, store_ids: newStoreIds };
        }
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
    filters.registration_states.length > 0;

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
                {t('terminals.filterTitle', 'Filter Terminals')}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {t('terminals.filterSubtitle', 'Refine your terminal list')}
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
            {/* Company Filter */}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('employees.filterCompany', 'Company')}</span>
                    {filters.company_ids.length > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>
                        ({filters.company_ids.length})
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
                      <label
                        key={company.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderBottom: index < companyOptions.length - 1 ? '1px solid var(--border)' : 'none',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={filters.company_ids.includes(company.value)}
                          onChange={() => toggleCompany(company.value)}
                          style={{ display: 'none' }}
                        />
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '4px',
                            border: `2px solid ${filters.company_ids.includes(company.value) ? 'var(--primary)' : 'var(--border)'}`,
                            background: filters.company_ids.includes(company.value) ? 'var(--primary)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: '10px',
                            flexShrink: 0,
                            transition: 'all 0.15s',
                          }}
                        >
                          {filters.company_ids.includes(company.value) && (
                            <Check size={12} color="#fff" strokeWidth={3} />
                          )}
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                          {company.label}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Store Filter */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{t('employees.filterStore', 'Store')}</span>
                  {filters.store_ids.length > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>
                      ({filters.store_ids.length})
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
                      <label
                        key={store.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderBottom: index < filteredStoreOptions.length - 1 ? '1px solid var(--border)' : 'none',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <input
                          type="checkbox"
                          checked={filters.store_ids.includes(store.value)}
                          onChange={() => toggleStore(store.value)}
                          style={{ display: 'none' }}
                        />
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '4px',
                            border: `2px solid ${filters.store_ids.includes(store.value) ? 'var(--primary)' : 'var(--border)'}`,
                            background: filters.store_ids.includes(store.value) ? 'var(--primary)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: '10px',
                            flexShrink: 0,
                            transition: 'all 0.15s',
                          }}
                        >
                          {filters.store_ids.includes(store.value) && (
                            <Check size={12} color="#fff" strokeWidth={3} />
                          )}
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                          {store.label}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Registration state — the fastest way to find terminals that were
                set up but never completed registration. */}
            <div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                }}
              >
                {t('terminals.colRegistration', 'Registration')}
                {filters.registration_states.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, marginLeft: 6 }}>
                    ({filters.registration_states.length})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {REGISTRATION_FILTER_OPTIONS.map((option) => {
                  const selected = filters.registration_states.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleRegistrationState(option.value)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: '999px',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                        background: selected ? 'var(--primary)' : 'var(--surface)',
                        color: selected ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {selected && <Check size={12} strokeWidth={3} />}
                      {t(option.labelKey, option.fallback)}
                    </button>
                  );
                })}
              </div>
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
