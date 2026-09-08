/**
 * Shared building blocks for the documents module.
 *
 * These exist so the upload wizard, the categories manager, the documents table
 * and the edit dialog all present the same things the same way - a company is
 * always shown with its logo and owner, a file always gets the icon for its
 * real format, a person is always written first name then surname.
 */
import React from 'react';
import { Company, Employee } from '../../../types';
import { getAvatarUrl, getCompanyLogoUrl } from '../../../api/client';
import { formatEmployeeName } from '../../../utils/employeeName';
import { SelectOption } from '../../../components/ui/CustomSelect';

// ── Modal chrome ───────────────────────────────────────────────────────────

/**
 * The platform's dark gradient modal header, matching Attendance, Leave and
 * ATS. Takes an icon so each dialog is recognisable at a glance.
 */
export const GradientModalHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
}> = ({ title, subtitle, icon, onClose }) => (
  <div
    style={{
      padding: '18px 22px',
      background: 'linear-gradient(135deg, #0D2137 0%, #1e3a5f 100%)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexShrink: 0,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      {icon && (
        <div
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <h3
          style={{
            margin: 0, fontSize: 16, fontWeight: 700, color: '#fff',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
    </div>
    <button
      onClick={onClose}
      aria-label="Close"
      style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)',
        color: '#fff', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
    >
      ✕
    </button>
  </div>
);

// ── Icon buttons ───────────────────────────────────────────────────────────

const ICON_BUTTON_TONES = {
  muted: { fg: 'var(--text-muted)', hoverBg: 'var(--background)', hoverFg: 'var(--text-primary)' },
  danger: { fg: '#DC2626', hoverBg: 'rgba(220,38,38,0.1)', hoverFg: '#B91C1C' },
  success: { fg: '#15803D', hoverBg: 'rgba(16,185,129,0.12)', hoverFg: '#166534' },
  primary: { fg: 'var(--primary)', hoverBg: 'rgba(2,132,199,0.1)', hoverFg: 'var(--primary)' },
} as const;

/** Compact square action button used in list rows and table cells. */
export const IconButton: React.FC<{
  title: string;
  onClick: (e: React.MouseEvent) => void;
  tone?: keyof typeof ICON_BUTTON_TONES;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, tone = 'muted', disabled, children }) => {
  const c = ICON_BUTTON_TONES[tone];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        border: '1px solid transparent', background: 'transparent', color: c.fg,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = c.hoverBg;
        e.currentTarget.style.color = c.hoverFg;
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = c.fg;
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      {children}
    </button>
  );
};

// ── Avatars ────────────────────────────────────────────────────────────────

const initialsOf = (name?: string | null, surname?: string | null): string =>
  `${(name?.[0] ?? '').toUpperCase()}${(surname?.[0] ?? '').toUpperCase()}` || 'U';

export const PersonAvatar: React.FC<{
  name?: string | null;
  surname?: string | null;
  avatarFilename?: string | null;
  size?: number;
}> = ({ name, surname, avatarFilename, size = 26 }) => {
  const url = getAvatarUrl(avatarFilename ?? undefined);
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--primary), var(--accent))',
        color: '#fff', fontWeight: 700, fontSize: Math.max(9, size * 0.38),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initialsOf(name, surname)}
    </span>
  );
};

export const CompanyAvatar: React.FC<{ company?: Company | null; size?: number }> = ({ company, size = 24 }) => {
  const url = company?.logoFilename ? getCompanyLogoUrl(company.logoFilename) : null;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0D2137, #1e3a5f)',
        color: '#fff', fontWeight: 800, fontSize: Math.max(9, size * 0.4),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (company?.name?.[0] ?? '?').toUpperCase()}
    </span>
  );
};

// ── Role tags ──────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { bg: string; fg: string }> = {
  admin: { bg: 'rgba(220,38,38,0.12)', fg: '#B91C1C' },
  hr: { bg: 'rgba(147,51,234,0.12)', fg: '#7E22CE' },
  area_manager: { bg: 'rgba(2,132,199,0.12)', fg: '#0369A1' },
  store_manager: { bg: 'rgba(13,148,136,0.12)', fg: '#0F766E' },
  employee: { bg: 'rgba(100,116,139,0.14)', fg: '#475569' },
};

export const RoleTag: React.FC<{ role?: string | null; label?: string }> = ({ role, label }) => {
  if (!role) return null;
  const colors = ROLE_COLORS[role] ?? ROLE_COLORS.employee;
  return (
    <span
      style={{
        fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
        background: colors.bg, color: colors.fg, textTransform: 'uppercase',
        letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {label ?? role.replace(/_/g, ' ')}
    </span>
  );
};

// ── Status tags ────────────────────────────────────────────────────────────

export type TagTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TAG_TONES: Record<TagTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'var(--background)', fg: 'var(--text-muted)', border: 'var(--border)' },
  success: { bg: 'rgba(16,185,129,0.12)', fg: '#15803D', border: 'rgba(16,185,129,0.35)' },
  warning: { bg: 'rgba(245,158,11,0.12)', fg: '#B45309', border: 'rgba(245,158,11,0.4)' },
  danger: { bg: 'rgba(220,38,38,0.1)', fg: '#B91C1C', border: 'rgba(220,38,38,0.35)' },
  info: { bg: 'rgba(2,132,199,0.12)', fg: '#0369A1', border: 'rgba(2,132,199,0.35)' },
};

export const StatusTag: React.FC<{
  tone?: TagTone;
  icon?: string;
  children: React.ReactNode;
  title?: string;
}> = ({ tone = 'neutral', icon, children, title }) => {
  const c = TAG_TONES[tone];
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
        background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
};

// ── File formats ───────────────────────────────────────────────────────────

interface FormatStyle { icon: string; label: string; color: string; bg: string }

const FORMAT_STYLES: Record<string, FormatStyle> = {
  pdf: { icon: '📕', label: 'PDF', color: '#B91C1C', bg: 'rgba(220,38,38,0.1)' },
  doc: { icon: '📘', label: 'DOC', color: '#1D4ED8', bg: 'rgba(29,78,216,0.1)' },
  docx: { icon: '📘', label: 'DOCX', color: '#1D4ED8', bg: 'rgba(29,78,216,0.1)' },
  odt: { icon: '📘', label: 'ODT', color: '#1D4ED8', bg: 'rgba(29,78,216,0.1)' },
  xls: { icon: '📗', label: 'XLS', color: '#15803D', bg: 'rgba(21,128,61,0.1)' },
  xlsx: { icon: '📗', label: 'XLSX', color: '#15803D', bg: 'rgba(21,128,61,0.1)' },
  ods: { icon: '📗', label: 'ODS', color: '#15803D', bg: 'rgba(21,128,61,0.1)' },
  csv: { icon: '📗', label: 'CSV', color: '#15803D', bg: 'rgba(21,128,61,0.1)' },
  png: { icon: '🖼️', label: 'PNG', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  jpg: { icon: '🖼️', label: 'JPG', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  jpeg: { icon: '🖼️', label: 'JPEG', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  webp: { icon: '🖼️', label: 'WEBP', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  gif: { icon: '🖼️', label: 'GIF', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  tif: { icon: '🖼️', label: 'TIF', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  tiff: { icon: '🖼️', label: 'TIFF', color: '#7E22CE', bg: 'rgba(147,51,234,0.1)' },
  p7m: { icon: '🔏', label: 'P7M', color: '#0F766E', bg: 'rgba(13,148,136,0.1)' },
  zip: { icon: '🗜️', label: 'ZIP', color: '#B45309', bg: 'rgba(245,158,11,0.12)' },
  rar: { icon: '🗜️', label: 'RAR', color: '#B45309', bg: 'rgba(245,158,11,0.12)' },
  '7z': { icon: '🗜️', label: '7Z', color: '#B45309', bg: 'rgba(245,158,11,0.12)' },
  xml: { icon: '⚙️', label: 'XML', color: '#475569', bg: 'rgba(100,116,139,0.12)' },
};

const UNKNOWN_FORMAT: FormatStyle = { icon: '📄', label: 'FILE', color: '#475569', bg: 'rgba(100,116,139,0.12)' };

export const extensionOf = (filename: string): string => {
  const idx = (filename || '').lastIndexOf('.');
  return idx > 0 ? filename.slice(idx + 1).toLowerCase() : '';
};

export const formatStyleFor = (filename: string): FormatStyle =>
  FORMAT_STYLES[extensionOf(filename)] ?? UNKNOWN_FORMAT;

/** Square tile carrying the format's own icon and colour. */
export const FileTypeIcon: React.FC<{ filename: string; size?: number }> = ({ filename, size = 32 }) => {
  const style = formatStyleFor(filename);
  return (
    <span
      title={style.label}
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: style.bg, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', fontSize: Math.round(size * 0.5),
      }}
    >
      {style.icon}
    </span>
  );
};

/** Human-readable size; "—" when the size is genuinely unknown. */
export const formatFileSize = (bytes: number | undefined | null): string => {
  if (bytes == null || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// ── Category icons ─────────────────────────────────────────────────────────

/** Icons an operator can pick from when naming a category. */
export const CATEGORY_ICON_CHOICES = [
  '🏷️', '💶', '📝', '🪪', '🏥', '🎓', '🛡️', '🌴', '⚖️', '🧾',
  '📋', '📁', '🔒', '🚗', '🏆', '📊',
];

const CATEGORY_ICON_RULES: Array<{ icon: string; keywords: string[] }> = [
  { icon: '💶', keywords: ['payslip', 'cedolino', 'busta paga', 'salary', 'stipendio', 'paga'] },
  { icon: '📝', keywords: ['contract', 'contratto', 'assunzione'] },
  { icon: '🪪', keywords: ['identity', 'identita', 'identità', 'documento', 'carta', 'passport', 'passaporto'] },
  { icon: '🏥', keywords: ['medical', 'medico', 'sanitario', 'visita', 'salute'] },
  { icon: '🎓', keywords: ['training', 'formazione', 'corso', 'certificat'] },
  { icon: '🛡️', keywords: ['safety', 'sicurezza', 'prevenzione', 'antincendio'] },
  { icon: '🌴', keywords: ['leave', 'ferie', 'permesso', 'congedo'] },
  { icon: '⚖️', keywords: ['legal', 'legale', 'privacy', 'gdpr'] },
  { icon: '🧾', keywords: ['expense', 'nota spese', 'rimborso', 'fattura'] },
];

/**
 * Icon inferred from a category's name, in Italian or English. Used when the
 * operator has not chosen one explicitly - categories are free text, so a
 * sensible default beats a generic tag on every row.
 */
export const inferCategoryIcon = (name: string): string => {
  const normalized = (name || '').toLowerCase();
  const rule = CATEGORY_ICON_RULES.find(r => r.keywords.some(k => normalized.includes(k)));
  return rule ? rule.icon : '🏷️';
};

/**
 * Categories are stored as a plain name, so an explicitly chosen icon is
 * carried as a leading emoji in that name. These helpers keep the stored form
 * and the displayed form in step.
 */
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:️)?)\s*/u;

export const splitCategoryName = (stored: string): { icon: string; name: string } => {
  const match = (stored || '').match(LEADING_EMOJI);
  if (match) return { icon: match[1], name: stored.slice(match[0].length).trim() };
  return { icon: inferCategoryIcon(stored), name: (stored || '').trim() };
};

export const joinCategoryName = (icon: string, name: string): string => {
  const clean = name.trim();
  if (!clean) return clean;
  return icon && icon !== '🏷️' ? `${icon} ${clean}` : clean;
};

// ── Company select options ─────────────────────────────────────────────────

/**
 * Company rows for a dropdown: logo and name on the left, the company's owner
 * with their avatar on the right, so an operator picking a company can see at
 * a glance whose company it is.
 */
export function buildCompanyOptions(
  companies: Company[],
  opts?: { ownerLabel?: string },
): SelectOption[] {
  return companies.map(company => ({
    value: String(company.id),
    label: company.name,
    render: (
      // Company logo then name, left-aligned. Owner on the right, avatar first
      // so the two columns of avatars line up down the list.
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
        <CompanyAvatar company={company} size={24} />
        <span
          style={{
            flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, textAlign: 'left',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {company.name}
        </span>
        {(company.ownerName || company.ownerSurname) && (
          <span
            title={opts?.ownerLabel ? `${opts.ownerLabel}: ${formatEmployeeName({ name: company.ownerName, surname: company.ownerSurname })}` : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: '45%' }}
          >
            <PersonAvatar
              name={company.ownerName}
              surname={company.ownerSurname}
              avatarFilename={company.ownerAvatarFilename}
              size={20}
            />
            <span
              style={{
                fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {formatEmployeeName({ name: company.ownerName, surname: company.ownerSurname })}
            </span>
          </span>
        )}
      </div>
    ),
    selectedRender: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
        <CompanyAvatar company={company} size={24} />
        <span
          style={{
            flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, textAlign: 'left', color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {company.name}
        </span>
        {(company.ownerName || company.ownerSurname) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <PersonAvatar
              name={company.ownerName}
              surname={company.ownerSurname}
              avatarFilename={company.ownerAvatarFilename}
              size={22}
            />
            <span
              style={{
                fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {formatEmployeeName({ name: company.ownerName, surname: company.ownerSurname })}
            </span>
          </div>
        )}
      </div>
    ),
  }));
}

/**
 * Employee rows for a dropdown: avatar, name (first name first), then role and
 * company so homonyms across companies stay distinguishable.
 */
export function buildEmployeeOptions(
  employees: Employee[],
  opts?: { roleLabel?: (role: string) => string },
): SelectOption[] {
  return employees.map(emp => ({
    value: String(emp.id),
    label: `${formatEmployeeName(emp)} ${emp.uniqueId ?? ''}`.trim(),
    render: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
        <PersonAvatar name={emp.name} surname={emp.surname} avatarFilename={emp.avatarFilename} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600, fontSize: 13, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {formatEmployeeName(emp)}
          </div>
          <div
            style={{
              fontSize: 11, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {emp.companyName ?? ''}
          </div>
        </div>
        <RoleTag role={emp.role} label={opts?.roleLabel ? opts.roleLabel(emp.role) : undefined} />
      </div>
    ),
  }));
}
