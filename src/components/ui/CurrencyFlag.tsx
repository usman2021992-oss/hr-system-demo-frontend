import React from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { findCurrency, normaliseCurrency } from '../../constants/currencies';

/**
 * The flag for a currency, as bundled SVG artwork.
 *
 * Emoji flags are not usable here: they are regional-indicator pairs and
 * Windows has no glyphs for them, so it renders the two letters instead.
 */
export const CurrencyFlag: React.FC<{ code: string | null | undefined; size?: number }> = ({
  code,
  size = 16,
}) => {
  const currency = findCurrency(normaliseCurrency(code));
  if (!currency) return null;

  const Flag = (Flags as Record<
    string,
    React.ComponentType<{ title?: string; style?: React.CSSProperties }>
  >)[currency.country];
  if (!Flag) return null;

  return (
    <Flag
      title={`${currency.code} — ${currency.name}`}
      style={{
        width: size + 6,
        height: size,
        borderRadius: 2,
        flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.10)',
      }}
    />
  );
};

export default CurrencyFlag;
