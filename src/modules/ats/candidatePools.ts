import type { Candidate } from '../../api/ats';

// ---------------------------------------------------------------------------
// Saved and archived candidate pools
//
// Two independent flags, deliberately not one status:
//
//   saved    — a profile worth keeping for a future position. The candidate
//              STAYS on the board and also appears in the Saved pool.
//   archived — done with, for now. The candidate LEAVES the board and appears
//              only in the Archived pool.
//
// A candidate can be both: archived for this position, saved for the next one.
// That combination is the whole point of a talent pool, and it is why these are
// flags rather than extra pipeline stages.
//
// Stored as system tags in the existing candidates.tags TEXT[] column, written
// through the existing PATCH /candidates/:id/tags endpoint. No schema change,
// and nothing to run against the live database. The "pool:" prefix is
// registered as a system tag prefix so these never surface as user tags.
// ---------------------------------------------------------------------------

export const POOL_TAG_PREFIX = 'pool:';
export const SAVED_TAG = 'pool:saved';
export const ARCHIVED_TAG = 'pool:archived';

export type PoolView = 'board' | 'saved' | 'archived';

function hasTag(tags: string[] | null | undefined, tag: string): boolean {
  return (tags ?? []).some((t) => t.trim().toLowerCase() === tag);
}

export function isSaved(candidate: Pick<Candidate, 'tags'>): boolean {
  return hasTag(candidate.tags, SAVED_TAG);
}

export function isArchived(candidate: Pick<Candidate, 'tags'>): boolean {
  return hasTag(candidate.tags, ARCHIVED_TAG);
}

/**
 * Add or remove a pool tag, preserving every other tag and its original
 * casing. Returns a new array; never mutates the input.
 */
export function withPoolTag(tags: string[] | null | undefined, tag: string, enabled: boolean): string[] {
  const current = tags ?? [];
  const without = current.filter((t) => t.trim().toLowerCase() !== tag);
  return enabled ? [...without, tag] : without;
}

/**
 * The candidates the main board should show. Archived profiles are hidden here
 * and nowhere else — they are still counted, still searchable, still reachable
 * from the Archived pool.
 */
export function visibleOnBoard<T extends Pick<Candidate, 'tags'>>(candidates: T[]): T[] {
  return candidates.filter((c) => !isArchived(c));
}

export function savedCandidates<T extends Pick<Candidate, 'tags'>>(candidates: T[]): T[] {
  return candidates.filter(isSaved);
}

export function archivedCandidates<T extends Pick<Candidate, 'tags'>>(candidates: T[]): T[] {
  return candidates.filter(isArchived);
}
