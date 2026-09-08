import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption<T = any> {
  value: string;
  label: string;
  render?: React.ReactNode;
  /** Compact form shown once selected; falls back to `render`, then `label`. */
  selectedRender?: React.ReactNode;
  data?: T;
}

interface CustomSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  isClearable?: boolean;
  searchable?: boolean;
  highlightSelected?: boolean;
  /** Hide the trailing check on the selected row (the row is already tinted). */
  showCheck?: boolean;
  searchPlaceholder?: string;
  noOptionsMessage?: string;
  menuMaxHeight?: number;
  controlMinHeight?: number;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  error,
  isClearable = true,
  searchable = true,
  highlightSelected = false,
  showCheck = true,
  searchPlaceholder = 'Search...',
  noOptionsMessage = 'No options found',
  menuMaxHeight = 280,
  controlMinHeight = 40,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const selectedOption = useMemo(() => options.find(opt => opt.value === value), [options, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      if (searchable && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, searchable]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !query) return options;
    const lowerQ = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(lowerQ));
  }, [options, query, searchable]);

  // For massive lists to prevent UI freezes
  const visibleOptions = filteredOptions.slice(0, 300);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          width: '100%',
          minHeight: controlMinHeight,
          background: disabled
            ? 'var(--background-muted)'
            : (highlightSelected && selectedOption ? 'rgba(201,151,58,0.14)' : '#ffffff'),
          border: error
            ? '1px solid var(--danger)'
            : (isOpen
              ? '1px solid var(--primary)'
              : (highlightSelected && selectedOption
                ? '1px solid rgba(201,151,58,0.45)'
                : '1px solid var(--border)')),
          borderRadius: 'var(--radius)',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: selectedOption ? 'var(--text-primary)' : (disabled ? 'var(--text-muted)' : 'var(--text-secondary)'),
          fontFamily: 'inherit',
          fontSize: 14,
          boxShadow: isOpen ? '0 0 0 2px rgba(201,151,58,0.1)' : 'none',
          transition: 'all 0.2s',
          outline: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? (selectedOption.selectedRender ?? selectedOption.render ?? selectedOption.label) : placeholder}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {isClearable && selectedOption && !disabled ? (
            <span 
              onPointerDown={(e) => { e.stopPropagation(); onChange(null); setIsOpen(false); }}
              style={{ padding: '0 4px', cursor: 'pointer', zIndex: 10, marginRight: 4, color: 'var(--text-muted)', fontSize: 16 }}
              title="Clear"
            >
              ×
            </span>
          ) : null}
          <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: menuMaxHeight,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 5000,
          }}
        >
          {searchable && (
             <div style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', borderTopLeftRadius: 'var(--radius)', borderTopRightRadius: 'var(--radius)' }}>
               <Search size={14} color="var(--text-muted)" />
               <input
                 ref={searchInputRef}
                 value={query}
                 onChange={e => setQuery(e.target.value)}
                 placeholder={searchPlaceholder}
                 style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', color: 'var(--text-primary)', fontSize: 13 }}
               />
             </div>
          )}
          <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
            {visibleOptions.length === 0 ? (
              <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                {noOptionsMessage}
              </div>
            ) : (
              visibleOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    background: opt.value === value
                      ? (highlightSelected ? 'rgba(201,151,58,0.14)' : 'rgba(13,33,55,0.06)')
                      : 'transparent',
                    color: opt.value === value ? '#7a5715' : 'var(--text-primary)',
                    fontWeight: opt.value === value ? 700 : 500,
                    fontSize: 14,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,151,58,0.12)'; }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = opt.value === value
                      ? (highlightSelected ? 'rgba(201,151,58,0.14)' : 'rgba(13,33,55,0.06)')
                      : 'transparent';
                  }}
                >
                  {/* min-width:0 — a flex child defaults to min-width:auto, which
                      refuses to shrink below its content and pushed long option
                      text past the menu, scrolling it sideways. Renders that ask
                      for an ellipsis can only honour it once this is set. */}
                  <div style={{ flex: 1, minWidth: 0 }}>{opt.render || opt.label}</div>
                  {showCheck && opt.value === value && <Check size={16} color="#9A6808" />}
                </div>
              ))
            )}
            {filteredOptions.length > visibleOptions.length && (
               <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                 Type to filter more results...
               </div>
            )}
          </div>
        </div>
      )}
      
      {error && <span style={{ marginTop: 4, fontSize: 12, color: 'var(--danger)', display: 'block' }}>{error}</span>}
    </div>
  );
}