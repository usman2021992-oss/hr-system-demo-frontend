/**
 * Dropdown with a styled option list.
 *
 * A native `<select>` renders its options with the operating system's own
 * widget: unstyled, differently sized on every platform, and — on a dark
 * toolbar — often white text on a white sheet. This replaces the popup with a
 * real element we control, while keeping the parts of a native select that
 * matter: keyboard navigation, click-outside to dismiss, and Escape to close.
 *
 * The menu is portalled to the body and positioned fixed, so it is never
 * clipped by, and never forces a scrollbar on, whatever container it sits in.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary text shown to the right, e.g. a company name. */
  hint?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** 'dark' sits on a navy toolbar; 'light' on a normal surface. */
  tone?: 'light' | 'dark';
  disabled?: boolean;
  minWidth?: number;
  ariaLabel?: string;
}

const MENU_MAX_HEIGHT = 320;

export function SelectMenu({
  value,
  options,
  onChange,
  tone = 'light',
  disabled = false,
  minWidth = 180,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find(o => o.value === value);
  const dark = tone === 'dark';

  // Re-measure on open, and on scroll/resize while open, so the menu tracks
  // its trigger instead of drifting away from it.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, options.findIndex(o => o.value === value)));

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, options.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[activeIndex];
        if (opt) { onChange(opt.value); setOpen(false); triggerRef.current?.focus(); }
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, options, value, activeIndex, onChange]);

  const triggerStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    minWidth,
    padding: '9px 12px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    textAlign: 'left',
    background: dark ? 'rgba(255,255,255,0.12)' : 'var(--surface)',
    color: dark ? '#fff' : 'var(--text-primary)',
    border: dark ? '1px solid rgba(255,255,255,0.20)' : '1.5px solid var(--border)',
    boxShadow: dark ? 'none' : 'var(--shadow-xs)',
    transition: 'border-color 0.15s, background 0.15s',
  };

  // Flip above the trigger when there is not enough room below.
  const menuHeight = Math.min(MENU_MAX_HEIGHT, options.length * 38 + 12);
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 12 : 0;
  const flipUp = rect ? spaceBelow < menuHeight && rect.top > spaceBelow : false;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen(o => !o)}
        style={triggerStyle}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? ''}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={dark ? '#fff' : '#6b7280'} strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: flipUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
            left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, minWidth) - 12),
            width: Math.max(rect.width, minWidth),
            maxHeight: MENU_MAX_HEIGHT,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            zIndex: 1400,
            padding: 6,
            borderRadius: 12,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border)',
            boxShadow: '0 18px 44px rgba(15,23,42,0.22), 0 2px 6px rgba(15,23,42,0.08)',
          }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '9px 11px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  background: isActive ? 'var(--surface-warm)' : 'transparent',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {opt.hint && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                      {opt.hint}
                    </span>
                  )}
                  {isSelected && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                      stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
