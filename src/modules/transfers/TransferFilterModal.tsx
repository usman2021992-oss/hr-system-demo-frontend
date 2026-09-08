import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Filter } from 'lucide-react';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (filters: TransferFilterValues) => void;
  initialFilters: TransferFilterValues;
  companyOptions: SelectOption[];
  storeOptions: SelectOption[];
  statusOptions: SelectOption[];
  showCompanyFilter: boolean;
}

export interface TransferFilterValues {
  company_id: string;
  store_id: string;
  status: string;
}

export function TransferFilterModal({
  open,
  onClose,
  onApply,
  initialFilters,
  companyOptions,
  storeOptions,
  statusOptions,
  showCompanyFilter,
}: Props) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<TransferFilterValues>(initialFilters);

  useEffect(() => {
    if (open) {
      setFilters(initialFilters);
    }
  }, [open, initialFilters]);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const emptyFilters: TransferFilterValues = {
      company_id: '',
      store_id: '',
      status: '',
    };
    setFilters(emptyFilters);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

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
          width: 'min(480px, 92vw)',
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
                {t('transfers.filterTitle', 'Filter Transfers')}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {t('transfers.filterSubtitle', 'Refine your transfer list')}
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
          <div style={{ display: 'grid', gap: '18px' }}>
            {/* Company Filter */}
            {showCompanyFilter && companyOptions.length > 0 && (
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
                  {t('transfers.filterCompany', 'Company')}
                </label>
                <CustomSelect
                  value={filters.company_id || null}
                  onChange={(value) => setFilters({ ...filters, company_id: value || '' })}
                  options={companyOptions}
                  placeholder={t('transfers.allCompanies', 'All Companies')}
                  isClearable={true}
                  searchable={companyOptions.length > 5}
                  highlightSelected={true}
                  controlMinHeight={40}
                />
              </div>
            )}

            {/* Store Filter */}
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
                {t('transfers.filterStore', 'Store')}
              </label>
              <CustomSelect
                value={filters.store_id || null}
                onChange={(value) => setFilters({ ...filters, store_id: value || '' })}
                options={storeOptions}
                placeholder={t('transfers.allStores', 'All Stores')}
                isClearable={true}
                searchable={storeOptions.length > 5}
                highlightSelected={true}
                controlMinHeight={40}
              />
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
                {t('transfers.filterStatus', 'Status')}
              </label>
              <CustomSelect
                value={filters.status || null}
                onChange={(value) => setFilters({ ...filters, status: value || '' })}
                options={statusOptions}
                placeholder={t('transfers.allStatuses', 'All Statuses')}
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
            {t('transfers.resetFilters', 'Reset All')}
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
              {t('transfers.applyFilters', 'Apply Filters')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
