import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast, Toast, ToastVariant } from '../../context/ToastContext';

// ── Inject keyframe animation once ───────────────────────────────────────────

const STYLE_ID = 'toast-keyframes';

function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes toast-slide-in {
      from { transform: translateX(calc(100% + 32px)); opacity: 0; }
      to   { transform: translateX(0);                 opacity: 1; }
    }
    @keyframes toast-progress {
      from { width: 100%; }
      to   { width: 0%; }
    }
  `;
  document.head.appendChild(style);
}

// ── Variant config ────────────────────────────────────────────────────────────

interface VariantConfig {
  bg: string;
  border: string;
  iconColor: string;
  icon: React.ReactNode;
}

const VARIANTS: Record<ToastVariant, VariantConfig> = {
  success: {
    bg: '#F0FDF4',
    border: '#86EFAC',
    iconColor: '#15803D',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="#15803D" />
        <path d="M5.5 10.5L8.5 13.5L14.5 7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  error: {
    bg: '#FEF2F2',
    border: '#FCA5A5',
    iconColor: '#DC2626',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="#DC2626" />
        <path d="M7 7L13 13M13 7L7 13" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  warning: {
    bg: '#FFFBEB',
    border: '#FCD34D',
    iconColor: '#B45309',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2L18.66 17H1.34L10 2Z" fill="#B45309" />
        <path d="M10 8V11" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="14" r="1" fill="white" />
      </svg>
    ),
  },
  info: {
    bg: '#F0F9FF',
    border: '#7DD3FC',
    iconColor: '#0284C7',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="#0284C7" />
        <circle cx="10" cy="6.5" r="1" fill="white" />
        <path d="M10 9.5V14" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
};

// ── Single toast item ─────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const cfg = VARIANTS[toast.variant];
  const progressColor = cfg.iconColor;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: '10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        animation: 'toast-slide-in 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
        width: '360px',
        flexShrink: 0,
      }}
    >
      {/* Body */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px' }}>
        <span style={{ flexShrink: 0, marginTop: '1px' }}>{cfg.icon}</span>
        <span
          style={{
            flex: 1,
            fontSize: '14px',
            lineHeight: '1.5',
            color: '#1a1a1a',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            wordBreak: 'break-word',
          }}
        >
          {toast.message}
        </span>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Chiudi notifica"
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            lineHeight: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: '3px',
          backgroundColor: progressColor,
          animation: 'toast-progress 4s linear forwards',
          transformOrigin: 'left',
        }}
      />
    </div>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();
  const injected = useRef(false);

  useEffect(() => {
    if (!injected.current) {
      ensureKeyframes();
      injected.current = true;
    }
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-label="Notifiche"
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={toast} onDismiss={dismissToast} />
        </div>
      ))}
    </div>,
    document.body
  );
}
