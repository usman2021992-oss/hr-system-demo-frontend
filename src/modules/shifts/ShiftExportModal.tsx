import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

interface Props {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  exporting?: ExportFormat | null;
}

interface FormatOption {
  format: ExportFormat;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  iconBg: string;
}

export function ShiftExportModal({ open, onClose, onExport, exporting }: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  const options: FormatOption[] = [
    {
      format: 'csv',
      title: t('shifts.export', 'Export CSV'),
      description: t('shifts.exportDesc', 'Download as CSV file'),
      icon: 'ri-file-text-line',
      iconColor: 'var(--primary)',
      iconBg: 'rgba(30,74,122,0.12)',
    },
    {
      format: 'xlsx',
      title: t('shifts.exportExcel', 'Export Excel'),
      description: t('shifts.exportExcelDesc', 'Download as Excel file'),
      icon: 'ri-file-excel-line',
      iconColor: '#1D8A50',
      iconBg: 'rgba(29,138,80,0.12)',
    },
    {
      format: 'pdf',
      title: t('shifts.exportPdf', 'Export PDF'),
      description: t('shifts.exportPdfDesc', 'Download as PDF file'),
      icon: 'ri-file-pdf-line',
      iconColor: '#ef4444',
      iconBg: 'rgba(239,68,68,0.1)',
    },
  ];

  const isBusy = Boolean(exporting);

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
          width: 'min(440px, 92vw)',
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
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
                {t('shifts.exportTitle', 'Export Shifts')}
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                {t('shifts.exportSubtitle', 'Choose a format to download')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            style={{
              background: 'none',
              border: 'none',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)',
              fontSize: '22px',
              lineHeight: 1,
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              opacity: isBusy ? 0.5 : 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body: format options */}
        <div style={{ padding: '20px 24px', display: 'grid', gap: '12px' }}>
          {options.map((opt) => {
            const active = exporting === opt.format;
            return (
              <button
                key={opt.format}
                onClick={() => onExport(opt.format)}
                disabled={isBusy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '16px',
                  background: 'var(--surface-warm)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
                  opacity: isBusy && !active ? 0.55 : 1,
                }}
                onMouseEnter={(e) => {
                  if (isBusy) return;
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    background: opt.iconBg,
                    color: opt.iconColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  <i className={opt.icon}></i>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                    {opt.description}
                  </div>
                </div>
                {active ? (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      border: '2px solid var(--border)',
                      borderTopColor: 'var(--primary)',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: 'shift-export-spin 0.7s linear infinite',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            disabled={isBusy}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
              opacity: isBusy ? 0.5 : 1,
            }}
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
      <style>{`@keyframes shift-export-spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
}

export default ShiftExportModal;
