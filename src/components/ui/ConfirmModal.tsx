import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  const variantColor = variant === 'danger'
    ? 'var(--danger)'
    : variant === 'warning'
    ? 'var(--accent)'
    : 'var(--primary)';

  const confirmBtnClass = variant === 'danger'
    ? 'btn btn-danger'
    : variant === 'warning'
    ? 'btn btn-accent'
    : 'btn btn-primary';

  return createPortal(
    <>
      <style>{`
        @keyframes modal-icon-pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(220,53,69,0.2); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(220,53,69,0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(220,53,69,0); }
        }
        @keyframes modal-icon-pulse-warning {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(201,151,58,0.2); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(201,151,58,0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(201,151,58,0); }
        }
      `}</style>
      {/* Backdrop + Dialog Container */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(13,33,55,0.45)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.2s ease forwards'
        }}
      >
        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(320px, 100%)',
            background: 'var(--surface)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            animation: 'popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          {/* Icon + title */}
          <div style={{ padding: '24px 24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
            <div style={{
              width: 54, height: 54, borderRadius: 16,
              background: variant === 'danger' ? 'rgba(220,53,69,0.08)' : variant === 'warning' ? 'rgba(201,151,58,0.08)' : 'rgba(13,33,55,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              animation: variant === 'danger' ? 'modal-icon-pulse 2s infinite' : variant === 'warning' ? 'modal-icon-pulse-warning 2s infinite' : 'none'
            }}>
              {variant === 'danger' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={variantColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={variantColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <div>
              <h3 id="confirm-modal-title" style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: '1.15rem', color: 'var(--primary)', margin: '0 0 8px',
                letterSpacing: '-0.02em'
              }}>
                {title}
              </h3>
              <p style={{
                fontSize: '0.875rem', color: 'var(--text-secondary)',
                margin: 0, lineHeight: 1.5, fontWeight: 500
              }}>
                {message}
              </p>
            </div>
          </div>

          {children && (
            <div style={{ padding: '0 24px 12px' }}>
              {children}
            </div>
          )}

          {/* Footer */}
          <div style={{
            padding: '12px 24px 24px',
            display: 'flex', justifyContent: 'stretch', gap: 10,
          }}>
            <button 
              className="btn btn-secondary" 
              onClick={onCancel} 
              style={{ flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 700 }}
            >
              {cancelLabel ?? t('common.cancel', 'Cancel')}
            </button>
            <button 
              className={confirmBtnClass} 
              onClick={onConfirm} 
              style={{ flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 700 }}
            >
              {confirmLabel ?? t('common.confirm', 'Confirm')}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
