import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, FileText, Calendar, Building, Users, Briefcase, ChevronRight, X } from 'lucide-react';
import { getAvatarUrl } from '../../api/client';

export type PlatformReferenceType = 'task' | 'document' | 'shift' | 'store' | 'employee' | 'job';

export interface PlatformReference {
  type: PlatformReferenceType;
  id: number;
  title: string;
  subtitle?: string;
  /** Employee avatar file, when the reference points at a person. */
  avatarFilename?: string | null;
  url: string;
}

/* ─── visuals ────────────────────────────────────────────────────────────── */

export interface ReferenceBadge {
  label: string;
  bg: string;
  color: string;
  border: string;
}

export function referenceBadge(type: PlatformReferenceType): ReferenceBadge {
  switch (type) {
    case 'task':
      return { label: 'TASK', bg: 'rgba(37,99,235,0.1)', color: '#2563eb', border: 'rgba(37,99,235,0.25)' };
    case 'document':
      return { label: 'DOCUMENT', bg: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: 'rgba(124,58,237,0.25)' };
    case 'shift':
      return { label: 'SHIFT', bg: 'rgba(22,163,74,0.1)', color: '#16a34a', border: 'rgba(22,163,74,0.25)' };
    case 'store':
      return { label: 'STORE', bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.25)' };
    case 'employee':
      return { label: 'EMPLOYEE', bg: 'rgba(2,132,199,0.1)', color: '#0284c7', border: 'rgba(2,132,199,0.25)' };
    case 'job':
      return { label: 'JOB', bg: 'rgba(225,29,72,0.1)', color: '#e11d48', border: 'rgba(225,29,72,0.25)' };
    default:
      return { label: 'REF', bg: 'rgba(201,151,58,0.1)', color: 'var(--accent)', border: 'rgba(201,151,58,0.25)' };
  }
}

export function referenceIcon(type: PlatformReferenceType, size = 16, color?: string): React.ReactNode {
  const c = color ?? referenceBadge(type).color;
  switch (type) {
    case 'task':
      return <CheckSquare size={size} color={c} />;
    case 'document':
      return <FileText size={size} color={c} />;
    case 'shift':
      return <Calendar size={size} color={c} />;
    case 'store':
      return <Building size={size} color={c} />;
    case 'employee':
      return <Users size={size} color={c} />;
    case 'job':
      return <Briefcase size={size} color={c} />;
    default:
      return <CheckSquare size={size} color={c} />;
  }
}

/* ─── token encoding ─────────────────────────────────────────────────────── */

const REF_TOKEN_RE = /\[ref:[^\]]+\]/g;

function safeDecode(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Deep link for a reference. Employees resolve to their detail page — early
 * messages encoded a `/dipendenti?search=<name>` list URL, which only pre-filled
 * the search box, so those are healed here at render time too.
 */
export function resolveReferenceUrl(type: PlatformReferenceType, id: number, url: string): string {
  if (type === 'employee' && id > 0) return `/dipendenti/${id}`;
  return url;
}

export function buildReferenceToken(ref: PlatformReference): string {
  const parts = [
    `type=${ref.type}`,
    `id=${ref.id}`,
    `title=${encodeURIComponent(ref.title)}`,
  ];
  if (ref.subtitle) parts.push(`subtitle=${encodeURIComponent(ref.subtitle)}`);
  if (ref.avatarFilename) parts.push(`avatar=${encodeURIComponent(ref.avatarFilename)}`);
  // `url` stays last: it may itself contain `&`, so the parser reads it as the tail.
  parts.push(`url=${resolveReferenceUrl(ref.type, ref.id, ref.url)}`);
  return `[ref:${parts.join('&')}]`;
}

export function parseReferenceToken(body: string | null | undefined): PlatformReference | null {
  const match = (body ?? '').match(/\[ref:([^\]]+)\]/);
  if (!match) return null;

  const raw = match[1];
  const urlIdx = raw.indexOf('&url=');
  const head = urlIdx >= 0 ? raw.slice(0, urlIdx) : raw;
  const url = urlIdx >= 0 ? raw.slice(urlIdx + '&url='.length) : '';

  const fields: Record<string, string> = {};
  for (const part of head.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }

  const type = (fields.type || 'task') as PlatformReferenceType;
  const id = Number(fields.id) || 0;
  return {
    type,
    id,
    title: safeDecode(fields.title),
    subtitle: fields.subtitle ? safeDecode(fields.subtitle) : undefined,
    avatarFilename: fields.avatar ? safeDecode(fields.avatar) : null,
    url: resolveReferenceUrl(type, id, url),
  };
}

export function stripReferenceTokens(body: string | null | undefined): string {
  return (body ?? '').replace(REF_TOKEN_RE, '').trim();
}

/* ─── compact chip ───────────────────────────────────────────────────────── */

function initialsOf(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

interface ReferenceChipProps {
  reference: PlatformReference;
  /** `message` renders inside a chat bubble and navigates on click; `draft` is the composer preview. */
  variant?: 'message' | 'draft';
  /** True when sitting on the dark "sent" bubble, which needs translucent styling. */
  onDarkBubble?: boolean;
  onRemove?: () => void;
  removeDisabled?: boolean;
}

/**
 * One-line reference card: avatar (or type icon) + title + type/subtitle meta.
 * Deliberately compact so an attached reference never dominates the bubble.
 */
export const ReferenceChip: React.FC<ReferenceChipProps> = ({
  reference,
  variant = 'message',
  onDarkBubble = false,
  onRemove,
  removeDisabled = false,
}) => {
  const navigate = useNavigate();
  const badge = referenceBadge(reference.type);
  const avatarUrl = reference.type === 'employee' ? getAvatarUrl(reference.avatarFilename) : null;
  const isPerson = reference.type === 'employee';
  const clickable = variant === 'message';

  const surface = onDarkBubble
    ? { bg: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.28)', text: '#fff', meta: 'rgba(255,255,255,0.75)' }
    : { bg: 'var(--surface-warm)', border: 'var(--border)', text: 'var(--text-primary)', meta: 'var(--text-muted)' };

  const meta = reference.subtitle
    ? `${badge.label} · ${reference.subtitle}`
    : reference.id > 0
      ? `${badge.label} · #${reference.id}`
      : badge.label;

  return (
    <div
      onClick={clickable ? () => navigate(reference.url) : undefined}
      title={reference.subtitle ? `${reference.title} — ${reference.subtitle}` : reference.title}
      style={{
        marginTop: variant === 'message' ? 6 : 0,
        padding: '4px 6px',
        borderRadius: 9,
        background: surface.bg,
        border: `1px solid ${surface.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        minWidth: 0,
        maxWidth: '100%',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (clickable && !onDarkBubble) e.currentTarget.style.background = 'var(--surface)';
      }}
      onMouseLeave={(e) => {
        if (clickable && !onDarkBubble) e.currentTarget.style.background = surface.bg;
      }}
    >
      <div style={{
        width: 24,
        height: 24,
        borderRadius: isPerson ? '50%' : 7,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: avatarUrl
          ? 'transparent'
          : isPerson
            ? 'linear-gradient(135deg,var(--primary),var(--accent))'
            : onDarkBubble ? 'rgba(255,255,255,0.2)' : badge.bg,
        border: avatarUrl || isPerson ? 'none' : `1px solid ${onDarkBubble ? 'rgba(255,255,255,0.25)' : badge.border}`,
        color: '#fff',
        fontSize: 9,
        fontWeight: 800,
      }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={reference.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : isPerson ? (
          initialsOf(reference.title)
        ) : (
          referenceIcon(reference.type, 13, onDarkBubble ? '#fff' : badge.color)
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          color: surface.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {reference.title}
        </div>
        <div style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.3px',
          color: onDarkBubble ? surface.meta : badge.color,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {meta}
        </div>
      </div>

      {onRemove ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          disabled={removeDisabled}
          style={{
            background: 'none',
            border: 'none',
            cursor: removeDisabled ? 'default' : 'pointer',
            color: onDarkBubble ? '#fff' : 'var(--text-muted)',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <X size={13} />
        </button>
      ) : clickable ? (
        <ChevronRight size={14} color={onDarkBubble ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
      ) : null}
    </div>
  );
};
