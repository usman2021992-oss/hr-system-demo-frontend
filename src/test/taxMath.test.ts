import { describe, it, expect } from 'vitest';
import { taxWorkings } from '../modules/billing/taxMath';

/**
 * The screen and the server must agree to the cent.
 *
 * These are the same cases asserted in the backend's `tax.test.ts`
 * (`taxCentsOn` / `taxCentsOnLines`). If either side is changed alone, one of
 * these fails - which is the point: a customer comparing the estimate on
 * screen with the invoice they were charged must not find a difference.
 */
describe('tax workings shown on screen', () => {
  it('matches the backend on a normal bill', () => {
    // 12 employee licences at €4.00 and 2 terminals at €4.00, IVA 22%.
    const sums = taxWorkings(
      [
        { label: 'Dipendenti', qty: 12, unitPrice: 4 },
        { label: 'Terminali', qty: 2, unitPrice: 4 },
      ],
      22
    );

    expect(sums.net).toBe(56);
    expect(sums.tax).toBe(12.32);
    expect(sums.total).toBe(68.32);

    // The lines have to add up to the totals, or the breakdown is decoration.
    expect(sums.lines.map((l) => l.net)).toEqual([48, 8]);
    expect(sums.lines.map((l) => l.tax)).toEqual([10.56, 1.76]);
    expect(sums.lines.reduce((s, l) => s + l.tax, 0)).toBeCloseTo(sums.tax, 10);
  });

  it('taxes each line separately, as the providers do', () => {
    // 22% of €0.25 is €0.055 -> €0.06 per line, €0.12 for two.
    // 22% of their €0.50 total would be €0.11. The provider charges €0.12,
    // so the screen has to show €0.12.
    const sums = taxWorkings(
      [
        { label: 'A', qty: 1, unitPrice: 0.25 },
        { label: 'B', qty: 1, unitPrice: 0.25 },
      ],
      22
    );
    expect(sums.tax).toBe(0.12);
    expect(Math.round(sums.net * 22) / 100).toBe(0.11);
  });

  it('drops lines that are not billed at all', () => {
    // A company with no terminals must not see a €0.00 terminal line in a
    // breakdown whose purpose is to be checkable.
    const sums = taxWorkings(
      [
        { label: 'Dipendenti', qty: 10, unitPrice: 5 },
        { label: 'Terminali', qty: 0, unitPrice: 4 },
        { label: 'Gratuito', qty: 3, unitPrice: 0 },
      ],
      22
    );
    expect(sums.lines).toHaveLength(1);
    expect(sums.net).toBe(50);
    expect(sums.tax).toBe(11);
  });

  it('charges nothing when no rate is configured', () => {
    const sums = taxWorkings([{ label: 'Dipendenti', qty: 10, unitPrice: 5 }], 0);
    expect(sums.tax).toBe(0);
    expect(sums.total).toBe(sums.net);
  });

  it('keeps cents exact on prices that do not divide cleanly', () => {
    // 7 x €3.33 = €23.31; 22% of that is €5.1282 -> €5.13.
    const sums = taxWorkings([{ label: 'Dipendenti', qty: 7, unitPrice: 3.33 }], 22);
    expect(sums.net).toBe(23.31);
    expect(sums.tax).toBe(5.13);
    expect(sums.total).toBe(28.44);
  });
});
