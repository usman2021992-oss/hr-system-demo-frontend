import React from 'react';
import { useTranslation } from 'react-i18next';
import CustomSelect from './CustomSelect';
import { CURRENCIES, normaliseCurrency, type CurrencyOption } from '../../constants/currencies';
import * as Flags from 'country-flag-icons/react/3x2';

/**
 * Currency picker with real flag artwork.
 *
 * Flag emoji were tried first and are the wrong tool: they are pairs of
 * regional-indicator characters, and Windows has no glyphs for them, so it
 * draws the two letters instead — "EU", "GB" — which is what showed up as
 * "initials". These are bundled SVGs, so they render identically everywhere
 * and need no network.
 *
 * A native <select> cannot draw an image inside an <option>, so this uses the
 * app's CustomSelect, which also gives a scrollable, searchable list.
 */
const FlagIcon: React.FC<{ country: string; title: string }> = ({ country, title }) => {
  const Flag = (Flags as Record<string, React.ComponentType<{ title?: string; style?: React.CSSProperties }>>)[country];
  if (!Flag) return null;
  return (
    <Flag
      title={title}
      style={{
        width: 22,
        height: 15,
        borderRadius: 2,
        flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.10)',
        objectFit: 'cover',
      }}
    />
  );
};

const Row: React.FC<{ c: CurrencyOption; compact?: boolean }> = ({ c, compact }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
    <FlagIcon country={c.country} title={c.name} />
    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.code}</span>
    {!compact && (
      <span
        style={{
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {c.name}
      </span>
    )}
    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{c.symbol}</span>
  </span>
);

interface Props {
  value: string | null | undefined;
  onChange: (code: string) => void;
  disabled?: boolean;
  label?: string;
}

export const CurrencySelect: React.FC<Props> = ({ value, onChange, disabled, label }) => {
  const { t } = useTranslation();
  const current = normaliseCurrency(value);

  return (
    <div>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: 4,
          }}
        >
          {label}
        </label>
      )}
      <CustomSelect
        value={current}
        onChange={(v) => onChange(v || 'EUR')}
        disabled={disabled}
        searchable
        placeholder={t('companies.currency', 'Currency')}
        options={CURRENCIES.map((c) => ({
          value: c.code,
          label: `${c.code} ${c.name}`,
          render: <Row c={c} />,
          selectedRender: <Row c={c} compact />,
        }))}
      />
    </div>
  );
};

export default CurrencySelect;
