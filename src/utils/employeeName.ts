/**
 * Single place that decides how a person's name is written in the UI.
 *
 * The rule is: first name first, surname second - always, everywhere. A few
 * screens had drifted into "Surname Name" order, which reads as a different
 * person to anyone scanning a list. Route every display through here so the
 * order cannot drift again.
 *
 * Search matching is a separate concern: `employeeNameSearchKeys` returns both
 * orders, because an operator typing "rossi mario" should still find the row
 * displayed as "Mario Rossi".
 */

export interface NameLike {
  name?: string | null;
  surname?: string | null;
}

/** "Mario Rossi". Falls back gracefully when one part is missing. */
export function formatEmployeeName(person: NameLike | null | undefined): string {
  if (!person) return '';
  return `${person.name ?? ''} ${person.surname ?? ''}`.trim().replace(/\s+/g, ' ');
}

/**
 * Display name with a guaranteed non-empty result, for rows where a blank cell
 * would be confusing.
 */
export function formatEmployeeNameOr(person: NameLike | null | undefined, fallback: string): string {
  return formatEmployeeName(person) || fallback;
}

/**
 * Lowercased strings to test a search query against: both name orders, so
 * either way of typing a person finds them.
 */
export function employeeNameSearchKeys(person: NameLike | null | undefined): string[] {
  if (!person) return [];
  const first = (person.name ?? '').trim();
  const last = (person.surname ?? '').trim();
  const keys = [`${first} ${last}`, `${last} ${first}`]
    .map(k => k.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

/** True when `query` matches the person's name written in either order. */
export function matchesEmployeeName(person: NameLike | null | undefined, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return employeeNameSearchKeys(person).some(key => key.includes(needle));
}
