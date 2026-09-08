import React from 'react';
import { createPortal } from 'react-dom';

export const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
export const IconEye = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconUpload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
export const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
export const IconPen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);
export const IconTag = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);
export const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
export const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/>
  </svg>
);
export const IconRestore = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

export const IconFolder = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 10C4 8.89543 4.89543 8 6 8H18L22 12H42C43.1046 12 44 12.8954 44 14V38C44 39.1046 43.1046 40 42 40H6C4.89543 40 4 39.1046 4 38V10Z" fill="url(#folder_grad_back)" />
    <path d="M4 16C4 14.8954 4.89543 14 6 14H42C43.1046 14 44 14.8954 44 16V38C44 39.1046 43.1046 40 42 40H6C4.89543 40 4 39.1046 4 38V16Z" fill="url(#folder_grad_front)" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
    <defs>
      <linearGradient id="folder_grad_back" x1="24" y1="8" x2="24" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#E2B15B" />
        <stop offset="1" stopColor="#D4A044" />
      </linearGradient>
      <linearGradient id="folder_grad_front" x1="24" y1="14" x2="24" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F4D393" />
        <stop offset="1" stopColor="#E2B15B" />
      </linearGradient>
    </defs>
  </svg>
);

export const IconFolderSelected = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 10C4 8.89543 4.89543 8 6 8H18L22 12H42C43.1046 12 44 12.8954 44 14V38C44 39.1046 43.1046 40 42 40H6C4.89543 40 4 39.1046 4 38V10Z" fill="url(#folder_grad_back_sel)" />
    <path d="M4 16C4 14.8954 4.89543 14 6 14H42C43.1046 14 44 14.8954 44 16V38C44 39.1046 43.1046 40 42 40H6C4.89543 40 4 39.1046 4 38V16Z" fill="url(#folder_grad_front_sel)" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
    <defs>
      <linearGradient id="folder_grad_back_sel" x1="24" y1="8" x2="24" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#D4A044" />
        <stop offset="1" stopColor="#B6852D" />
      </linearGradient>
      <linearGradient id="folder_grad_front_sel" x1="24" y1="14" x2="24" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#E2B15B" />
        <stop offset="1" stopColor="#D4A044" />
      </linearGradient>
    </defs>
  </svg>
);

export const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export const IconChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
export const IconDots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
  </svg>
);

export function mimeIcon(mime: string | null): string {
  if (mime === 'application/pdf') return '📄';
  if (mime?.startsWith('image/')) return '🖼️';
  return '📁';
}

export function getCompanyAvatarColor(name: string = ''): string {
  const colors = [
    '#002D5B', '#007AFF', '#5856D6', '#AF52DE',
    '#FF2D55', '#FF9500', '#10B981', '#059669',
    '#0891B2', '#4F46E5', '#D97706'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}


export const ModalBackdrop: React.FC<{ onClose: () => void; width?: number; children: React.ReactNode }> = ({ onClose, width = 460, children }) => {
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(13,33,55,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16,
          width: '100%', maxWidth: width, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          animation: 'popIn 0.2s cubic-bezier(0.16,1,0.3,1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export const ModalHeader: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => (
  <div style={{
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--surface)',
    flexShrink: 0
  }}>
    <h3 style={{
      margin: 0,
      fontWeight: 700,
      fontSize: 16,
      fontFamily: 'var(--font-display)',
      color: 'var(--text-primary)',
      letterSpacing: '-0.01em'
    }}>
      {title}
    </h3>
    <button
      onClick={onClose}
      style={{
        width: 30, height: 30, borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--background)',
        color: 'var(--text-muted)', fontSize: 13,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--background)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      <IconClose />
    </button>
  </div>
);

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  outline: 'none',
};

export const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
  display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em'
};
