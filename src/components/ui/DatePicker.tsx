import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// ── Locale data ───────────────────────────────────────────────────────────────
const MONTHS: Record<string, string[]> = {
  it: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MONTHS_SHORT: Record<string, string[]> = {
  it: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const DAYS: Record<string, string[]> = {
  it: ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
};
const TODAY_LABEL: Record<string, string> = { it: 'Oggi', en: 'Today' };
const PLACEHOLDER: Record<string, string> = { it: 'GG/MM/AAAA', en: 'MM/DD/YYYY' };

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseISO(str: string): Date | null {
  if (!str) return null;
  const [y, m, d] = str.split('T')[0].split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(isoStr: string, lang: string): string {
  const date = parseISO(isoStr);
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return lang === 'it' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

// Calendar grid: 6 rows × 7 cols, Mon-first
function buildCalendar(year: number, month: number): { date: Date; current: boolean }[] {
  const days: { date: Date; current: boolean }[] = [];
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--)
    days.push({ date: new Date(year, month, -i), current: false });
  for (let i = 1; i <= daysInMonth; i++)
    days.push({ date: new Date(year, month, i), current: true });
  while (days.length < 42)
    days.push({ date: new Date(year, month + 1, days.length - startOffset - daysInMonth + 1), current: false });
  return days;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// ── Component ─────────────────────────────────────────────────────────────────
interface DatePickerProps {
  label?: string;
  value: string;           // ISO 'YYYY-MM-DD' or ''
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  initialViewYear?: number; // Override starting year when no value is set (e.g. for date-of-birth)
  placement?: 'top' | 'bottom';
  disableFlip?: boolean;
  disablePortal?: boolean;
  align?: 'left' | 'right' | 'auto';
}

type PickerView = 'calendar' | 'month' | 'year';

export function DatePicker({ label, value, onChange, error, placeholder, disabled, initialViewYear, placement, disableFlip, disablePortal, align = 'auto' }: DatePickerProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('it') ? 'it' : 'en';

  const today = new Date();
  const selected = parseISO(value);

  const defaultYear = selected?.getFullYear() ?? initialViewYear ?? today.getFullYear();
  const defaultMonth = selected?.getMonth() ?? (initialViewYear ? 0 : today.getMonth());

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PickerView>('calendar');
  const [viewYear, setViewYear] = useState(defaultYear);
  const [viewMonth, setViewMonth] = useState(defaultMonth);
  // Year grid start — shows YEAR_PAGE years starting from this
  const YEAR_PAGE = 16;
  const [yearStart, setYearStart] = useState(() => {
    return defaultYear - (defaultYear % YEAR_PAGE);
  });
  const [hovered, setHovered] = useState<number | null>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobileView, setIsMobileView] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Sync view when value changes from outside
  useEffect(() => {
    const d = parseISO(value);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setYearStart(d.getFullYear() - (d.getFullYear() % YEAR_PAGE));
    }
  }, [value]);

  // Portaling & Positioning
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const updatePosition = () => {
      const isMobile = window.innerWidth < 500;
      setIsMobileView(isMobile);

      if (isMobile) return; // Position handled by CSS for mobile modal

      if (disablePortal) return;

      const rect = containerRef.current!.getBoundingClientRect();
      const popupWidth = 272;
      const popupHeight = 310;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let left = rect.left;
      if (left + popupWidth > viewportWidth - 10) {
        left = viewportWidth - popupWidth - 10;
      }
      if (left < 10) left = 10;

      let top = rect.bottom + 4;
      if (top + popupHeight > viewportHeight - 10) {
        top = rect.top - popupHeight - 4;
      }
      if (top < 10) top = 10;
      
      setCoords({
        top: top,
        left: left,
        width: rect.width
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, disablePortal]);

  // --- Direction logic ---
  // If absolute within a scrollable panel, we just respect the placement prop.
  const finalPlacement = placement || 'bottom';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !containerRef.current?.contains(e.target as Node) &&
        !popupRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setView('calendar');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Body Scroll Lock (Mobile Only)
  useEffect(() => {
    if (open && isMobileView) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [open, isMobileView]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setView('calendar'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // ── Calendar nav ────────────────────────────────────────────────────────────
  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const pick = (date: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(toISO(date));
    setOpen(false);
    setView('calendar');
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // ── Year picker ─────────────────────────────────────────────────────────────
  const openYearView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setYearStart(viewYear - (viewYear % YEAR_PAGE));
    setView(v => v === 'year' ? 'calendar' : 'year');
  };

  const pickYear = (year: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear(year);
    setYearStart(year - (year % YEAR_PAGE));
    setView('calendar');
  };

  const pickMonth = (month: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewMonth(month);
    setView('calendar');
  };

  const calDays = buildCalendar(viewYear, viewMonth);
  const display = formatDisplay(value, lang);
  const years = Array.from({ length: YEAR_PAGE }, (_, i) => yearStart + i);

  // ── Sub-components ───────────────────────────────────────────────────────────
  const NavBtn = ({ onClick, children }: { onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer',
        color: '#fff', width: '26px', height: '26px', borderRadius: '5px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', fontWeight: 700, lineHeight: 1,
        transition: 'background 0.15s', flexShrink: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
    >
      {children}
    </button>
  );

  // ── Calendar popup inner content ───────────────────────────
  const popupContent = (
    <>
      {/* ─ Header ─ */}
      <div style={{
        background: 'var(--primary)', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {view === 'year' ? (
          <>
            <NavBtn onClick={(e) => { e.stopPropagation(); setYearStart(y => y - YEAR_PAGE); }}>«</NavBtn>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setView('calendar'); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#fff', fontFamily: 'var(--font-display)',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '0.01em',
                  padding: '2px 8px', borderRadius: '4px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {yearStart} – {yearStart + YEAR_PAGE - 1}
              </button>
            </div>
            <NavBtn onClick={(e) => { e.stopPropagation(); setYearStart(y => y + YEAR_PAGE); }}>»</NavBtn>
          </>
        ) : view === 'month' ? (
          <>
            <NavBtn onClick={(e) => { e.stopPropagation(); setViewYear(y => y - 1); }}>«</NavBtn>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setView('calendar'); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#fff', fontFamily: 'var(--font-display)',
                  fontSize: '13px', fontWeight: 700,
                  padding: '2px 8px', borderRadius: '4px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                {viewYear}
              </button>
            </div>
            <NavBtn onClick={(e) => { e.stopPropagation(); setViewYear(y => y + 1); }}>»</NavBtn>
          </>
        ) : (
          <>
            <NavBtn onClick={prevMonth}>‹</NavBtn>
            <div style={{ flex: 1, textAlign: 'center' }}>
              {/* Clickable month → month view */}
              <button
                onClick={(e) => { e.stopPropagation(); setView('month'); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#fff', fontFamily: 'var(--font-display)',
                  fontSize: '13px', fontWeight: 700, letterSpacing: '0.01em',
                  padding: '2px 6px', borderRadius: '4px',
                  transition: 'background 0.15s', lineHeight: 1.2,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                title={lang === 'it' ? 'Seleziona mese' : 'Select month'}
              >
                {MONTHS[lang][viewMonth]}
              </button>
              {/* Clickable year → year view */}
              <button
                onClick={openYearView}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.70)',
                  fontFamily: 'var(--font-body)', fontSize: '11px',
                  padding: '1px 6px', borderRadius: '4px', display: 'block',
                  margin: '1px auto 0', width: 'fit-content',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.70)';
                }}
                title={lang === 'it' ? 'Seleziona anno' : 'Select year'}
              >
                {viewYear} ▾
              </button>
            </div>
            <NavBtn onClick={nextMonth}>›</NavBtn>
          </>
        )}
      </div>

      {/* ─ Year grid ─ */}
      {view === 'year' && (
        <div style={{ padding: '10px 10px 12px', background: 'var(--surface-warm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
            {years.map((yr) => {
              const isSelected = yr === viewYear;
              const isCurrent = yr === today.getFullYear();
              return (
                <button
                  key={yr}
                  onClick={(e) => pickYear(yr, e)}
                  style={{
                    padding: '8px 4px',
                    border: isCurrent && !isSelected ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    borderRadius: '6px',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-primary)',
                    fontSize: '12px', fontWeight: isSelected ? 700 : isCurrent ? 700 : 500,
                    fontFamily: 'var(--font-body)', cursor: 'pointer',
                    transition: 'background 0.1s, color 0.1s',
                    boxShadow: isSelected ? '0 2px 8px rgba(201,151,58,0.35)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--accent-light)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {yr}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─ Month grid ─ */}
      {view === 'month' && (
        <div style={{ padding: '10px 10px 12px', background: 'var(--surface-warm)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {MONTHS_SHORT[lang].map((mon, idx) => {
              const isSelected = idx === viewMonth;
              const isCurrent = idx === today.getMonth() && viewYear === today.getFullYear();
              return (
                <button
                  key={idx}
                  onClick={(e) => pickMonth(idx, e)}
                  style={{
                    padding: '10px 4px',
                    border: isCurrent && !isSelected ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    borderRadius: '6px',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-primary)',
                    fontSize: '12px', fontWeight: isSelected ? 700 : 500,
                    fontFamily: 'var(--font-body)', cursor: 'pointer',
                    transition: 'background 0.1s, color 0.1s',
                    boxShadow: isSelected ? '0 2px 8px rgba(201,151,58,0.35)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--accent-light)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {mon}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─ Calendar grid ─ */}
      {view === 'calendar' && (
        <div style={{ padding: '10px 8px 0px', background: 'var(--surface-warm)' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
            {DAYS[lang].map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: '9.5px', fontWeight: 700,
                color: 'var(--text-muted)', fontFamily: 'var(--font-display)',
                textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 0',
              }}>
                {d}
              </div>
            ))}
          </div>
          {/* Days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', paddingBottom: '8px' }}>
            {calDays.map(({ date, current }, idx) => {
              const sel = selected && sameDay(date, selected);
              const tod = sameDay(date, today);
              const isHov = hovered === idx;
              return (
                <button
                  key={idx}
                  onClick={(e) => pick(date, e)}
                  onMouseEnter={() => setHovered(idx)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: '100%', aspectRatio: '1',
                    border: tod && !sel ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    borderRadius: '6px',
                    background: sel ? 'var(--accent)' : isHov && !sel ? 'var(--accent-light)' : 'transparent',
                    color: sel ? '#fff' : !current ? 'var(--text-disabled)' : tod ? 'var(--primary)' : 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: sel ? 700 : tod ? 700 : current ? 500 : 400,
                    fontFamily: 'var(--font-body)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.1s, color 0.1s',
                    boxShadow: sel ? '0 2px 8px rgba(201,151,58,0.35)' : 'none',
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─ Footer ─ */}
      {view === 'calendar' && (
        <div style={{
          borderTop: '1px solid var(--border-light)', padding: '6px 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {value ? (
            <button onClick={clear} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '11px', color: 'var(--danger)', fontFamily: 'var(--font-body)',
              fontWeight: 500, padding: '3px 6px', borderRadius: 'var(--radius-sm)',
            }}>
              {lang === 'it' ? 'Cancella' : 'Clear'}
            </button>
          ) : <span />}
          <button onClick={(e) => pick(today, e)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'var(--font-body)', padding: '3px 8px',
            borderRadius: 'var(--radius-sm)', letterSpacing: '0.02em',
          }}>
            {TODAY_LABEL[lang]}
          </button>
        </div>
      )}
    </>
  );

  // ── Calendar popup (Portaled or inline absolute) ─────────
  const popup = open ? (
    disablePortal ? (
      <div
        ref={popupRef}
        className="pop-in"
        style={{
          position: 'absolute',
          zIndex: 1000,
          top: 'calc(100% + 4px)',
          left: align === 'right' ? 'auto' : 0,
          right: align === 'right' ? 0 : 'auto',
          width: '272px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {popupContent}
      </div>
    ) : createPortal(
      <>
        {/* Backdrop for mobile */}
        {isMobileView && (
          <div 
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(13,33,55,0.45)',
              backdropFilter: 'blur(3px)',
              zIndex: 99998,
            }}
            onClick={() => setOpen(false)}
          />
        )}
        <div
          ref={popupRef}
          className="pop-in"
          style={{
            position: 'fixed',
            zIndex: 99999,
            top: isMobileView ? '50%' : coords.top,
            left: isMobileView ? '50%' : coords.left,
            transform: isMobileView ? 'translate(-50%, -50%)' : 'none',
            width: isMobileView ? 'min(300px, 92vw)' : '272px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.1)',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {popupContent}
        </div>
      </>,
      document.body
    )
  ) : null;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Label */}
      {label && (
        <label style={{
          display: 'block', fontSize: '12px', fontWeight: 600,
          color: error ? 'var(--danger)' : 'var(--text-secondary)',
          fontFamily: 'var(--font-body)', marginBottom: '5px', letterSpacing: '0.01em',
        }}>
          {label}
        </label>
      )}

      {/* Trigger */}
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '38px', padding: '0 10px',
          border: `1px solid ${error ? 'var(--danger)' : open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          background: disabled ? 'var(--surface-warm)' : 'var(--surface)',
          boxShadow: open ? '0 0 0 3px var(--accent-light)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          userSelect: 'none', opacity: disabled ? 0.6 : 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={open ? 'var(--accent)' : 'var(--text-muted)'}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke 0.15s' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span style={{ flex: 1, fontSize: '13.5px', fontFamily: 'var(--font-body)', color: display ? 'var(--text-primary)' : 'var(--text-disabled)' }}>
          {display || placeholder || PLACEHOLDER[lang]}
        </span>
        {value && !disabled && (
          <span onClick={clear} style={{ color: 'var(--text-muted)', fontSize: '17px', lineHeight: 1, cursor: 'pointer', padding: '0 2px' }}>×</span>
        )}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {error && (
        <p style={{ fontSize: '11px', color: 'var(--danger)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
          {error}
        </p>
      )}

      {popup}
    </div>
  );
}

export default DatePicker;
