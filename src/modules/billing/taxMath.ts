/**
 * The tax arithmetic, in one place.
 *
 * The same sum is worked out in three codebases at once: here for what the
 * screen shows, in the backend for what is quoted and charged, and at the
 * provider for what actually appears on the invoice. They agree only if all
 * three round the same way, so this mirrors the server's rule exactly:
 *
 *   tax is computed **per invoice line** and rounded to whole cents, then the
 *   lines are added up.
 *
 * Taxing the rounded total instead is not the same operation. 22% of €0.25 is
 * €0.055, which rounds to €0.06; two such lines are €0.12, while 22% of their
 * €0.50 total is €0.11. A cent, every month, on a figure the customer can
 * check - and the provider does it per line, so per line is what is correct.
 */

export interface TaxableLine {
  label: string;
  qty: number;
  unitPrice: number;
}

export interface TaxedLine extends TaxableLine {
  /** qty x unitPrice, to whole cents. */
  net: number;
  /** The tax on this line alone, to whole cents. */
  tax: number;
}

export interface TaxWorkings {
  lines: TaxedLine[];
  net: number;
  tax: number;
  total: number;
}

/** Rounds a euro amount to whole cents. */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function taxWorkings(lines: TaxableLine[], percent: number): TaxWorkings {
  const taxed = lines
    // A line with no quantity or no price is not billed at all, so it does not
    // belong in a breakdown that has to add up to the invoice.
    .filter((l) => l.qty > 0 && l.unitPrice > 0)
    .map((l) => {
      const net = toCents(l.qty * l.unitPrice);
      return { ...l, net, tax: percent > 0 ? toCents((net * percent) / 100) : 0 };
    });

  const net = toCents(taxed.reduce((sum, l) => sum + l.net, 0));
  const tax = toCents(taxed.reduce((sum, l) => sum + l.tax, 0));

  return { lines: taxed, net, tax, total: toCents(net + tax) };
}
