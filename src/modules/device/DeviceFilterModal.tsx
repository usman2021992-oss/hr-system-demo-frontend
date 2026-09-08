import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Filter, Check, ChevronDown, ChevronUp } from 'lucide-react';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (filters: DeviceFilterValues) => void;
  initialFilters: DeviceFilterValues;
  companyOptions: SelectOption[];
  storeOptions: SelectOption[];
  statusOptions: SelectOption[];
  roleOptions: SelectOption[];
  showCompanyFilter: boolean;
}

export interface DeviceFilterValues {
  company_ids: string[];
  store_ids: string[];
  status: string;
  role: string;
}

export function DeviceFilterModal({
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
  const [filters, setFilters] = useState<DeviceFilterValues>(initialFilters);
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
    
    // Extract company IDs from store labels (format: "Store Name (Company Name)")
    return storeOptions.filter((store) => {
      // Check if any selected company is in the store's label
      return filters.company_ids.some((companyId) => {
        const company = companyOptions.find((c) => c.value === companyId);
        if (!company) return false;
        // Check if store label contains the company name
        return store.label.includes(`(${company.label})`);
      });
    });
  }, [filters.company_ids, storeOptions, companyOptions]);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const emptyFilters: DeviceFilterValues = {
      company_ids: [],
      store_ids: [],
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
                {t('deviceReset.filterTitle', 'Filtra Dispositivi')}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {t('deviceReset.filterSubtitle', 'Affina l\'elenco dei dispositivi')}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('deviceReset.filterCompany', 'Company')}</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{t('deviceReset.filterStore', 'Store')}</span>
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
                        ? t('employees.noStoresForCompany', 'Nessun negozio trovato per le aziende selezionate')
                        : t('employees.noStores', 'Nessun negozio disponibile')}
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
                {t('deviceReset.filterStatus', 'Stato Registrazione')}
              </label>
              <CustomSelect
                value={filters.status || null}
                onChange={(value) => setFilters({ ...filters, status: value || '' })}
                options={statusOptions}
                placeholder={t('deviceReset.filterAllStatus', 'Tutti gli stati')}
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
                {t('deviceReset.filterRole', 'Ruolo')}
              </label>
              <CustomSelect
                value={filters.role || null}
                onChange={(value) => setFilters({ ...filters, role: value || '' })}
                options={roleOptions}
                placeholder={t('deviceReset.filterAllRoles', 'Tutti i ruoli')}
                isClearable={true}
                searchable={false}
                highlightSelected={true}
                controlMinHeight={40}
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
            {t('deviceReset.resetFilters', 'Azzera Tutto')}
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
              {t('common.cancel', 'Annulla')}
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
              {t('deviceReset.applyFilters', 'Applica Filtri')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
