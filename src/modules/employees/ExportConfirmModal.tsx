import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Download, X, Users, HardDrive } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  employeeCount: number;
  estimatedSize: string;
  exporting: boolean;
}

export function ExportConfirmModal({ open, onClose, onConfirm, employeeCount, estimatedSize, exporting }: Props) {
  const { t } = useTranslation();

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
          width: 'min(420px, 92vw)',
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
                background: 'linear-gradient(135deg, #0D7C66 0%, #0F9D7E 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={20} color="#fff" strokeWidth={2.5} />
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
                {t('employees.exportConfirmTitle', 'Export Employees')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={exporting}
            style={{
              background: 'none',
              border: 'none',
              cursor: exporting ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)',
              fontSize: '22px',
              lineHeight: 1,
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              opacity: exporting ? 0.5 : 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 24px' }}>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: '0 0 24px',
              lineHeight: 1.6,
            }}
          >
            {t('employees.exportConfirmMessage', 'You are about to export employee data to an Excel file.')}
          </p>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
            {/* Employee Count */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px',
                background: 'var(--surface-warm)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, rgba(13,124,102,0.12) 0%, rgba(15,157,126,0.12) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Users size={20} color="var(--primary)" strokeWidth={2.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 500 }}>
                  {t('employees.exportTotalEmployees', 'Total Employees')}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  {employeeCount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Estimated Size */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px',
                background: 'var(--surface-warm)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, rgba(139,105,20,0.12) 0%, rgba(180,135,25,0.12) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <HardDrive size={20} color="var(--accent)" strokeWidth={2.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 500 }}>
                  {t('employees.exportEstimatedSize', 'Estimated File Size')}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  {estimatedSize}
                </div>
              </div>
            </div>
          </div>

          {/* Info note */}
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(13,124,102,0.06)',
              border: '1px solid rgba(13,124,102,0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--primary)' }}>
              {t('employees.exportNote', 'Note:')}
            </strong>{' '}
            {t('employees.exportNoteMessage', 'The file will include all employee data based on your current filters.')}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button
            onClick={onClose}
            disabled={exporting}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: exporting ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
              transition: 'background 0.15s, border-color 0.15s',
              opacity: exporting ? 0.5 : 1,
            }}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={exporting}
            style={{
              padding: '9px 20px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: exporting ? 'not-allowed' : 'pointer',
              border: 'none',
              background: exporting ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--primary) 0%, #0F9D7E 100%)',
              color: '#fff',
              transition: 'transform 0.15s, box-shadow 0.15s',
              boxShadow: '0 2px 8px rgba(13,124,102,0.24)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <Download size={16} strokeWidth={2.5} />
            {exporting ? t('common.loading', 'Exporting…') : t('employees.exportConfirmBtn', 'Export to Excel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
