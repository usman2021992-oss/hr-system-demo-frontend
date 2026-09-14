import React from 'react';

/**
 * The option row shared by the Employees and Transfers filters: a logo, the name
 * (with an optional line underneath) and a trailing slot for a count or a tag.
 * Both modules render the same shape so a company reads the same everywhere.
 */
export function EntityOptionRow({
  logoUrl,
  fallback,
  title,
  subtitle,
  trailing,
  size = 28,
  compact = false,
}: {
  logoUrl?: string | null;
  fallback?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Logo edge length. */
  size?: number;
  /** Drops the vertical padding — used inside a select's closed control. */
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        width: '100%',
        padding: compact ? 0 : '1px 0',
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '6px',
          flexShrink: 0,
          overflow: 'hidden',
          background: 'var(--surface-warm)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          fallback
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {trailing && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{trailing}</div>}
    </div>
  );
}

/** The neutral "12 employees" pill that sits at the right edge of an option row. */
export function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        background: 'var(--surface-warm)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
