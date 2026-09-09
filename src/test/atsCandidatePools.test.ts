import { describe, it, expect } from 'vitest';
import {
  SAVED_TAG,
  ARCHIVED_TAG,
  isSaved,
  isArchived,
  withPoolTag,
  visibleOnBoard,
  savedCandidates,
  archivedCandidates,
} from '../modules/ats/candidatePools';

const candidate = (id: number, tags: string[]) => ({ id, tags } as any);

describe('pool membership', () => {
  it('reads the saved and archived flags independently', () => {
    expect(isSaved(candidate(1, [SAVED_TAG]))).toBe(true);
    expect(isArchived(candidate(1, [SAVED_TAG]))).toBe(false);
    expect(isArchived(candidate(2, [ARCHIVED_TAG]))).toBe(true);
    expect(isSaved(candidate(2, [ARCHIVED_TAG]))).toBe(false);
  });

  it('supports a candidate being saved and archived at once', () => {
    const both = candidate(3, [SAVED_TAG, ARCHIVED_TAG]);

    // Archived for this position, saved for the next one — the whole point of
    // keeping these as two flags rather than one status.
    expect(isSaved(both)).toBe(true);
    expect(isArchived(both)).toBe(true);
  });

  it('tolerates missing, empty and differently-cased tags', () => {
    expect(isSaved(candidate(4, []))).toBe(false);
    expect(isSaved({ tags: undefined } as any)).toBe(false);
    expect(isSaved(candidate(5, ['POOL:SAVED']))).toBe(true);
    expect(isArchived(candidate(6, [' pool:archived ']))).toBe(true);
  });
});

describe('withPoolTag', () => {
  it('adds a flag without disturbing the other tags', () => {
    const result = withPoolTag(['indeed', 'locale:it', 'Milano'], SAVED_TAG, true);

    expect(result).toContain(SAVED_TAG);
    expect(result).toContain('indeed');
    expect(result).toContain('locale:it');
    expect(result).toContain('Milano');
  });

  it('removes a flag while keeping the rest', () => {
    const result = withPoolTag(['indeed', SAVED_TAG, ARCHIVED_TAG], SAVED_TAG, false);

    expect(result).not.toContain(SAVED_TAG);
    expect(result).toContain(ARCHIVED_TAG);
    expect(result).toContain('indeed');
  });

  it('does not duplicate a flag that is already set', () => {
    const result = withPoolTag([SAVED_TAG], SAVED_TAG, true);

    expect(result.filter((tag) => tag === SAVED_TAG)).toHaveLength(1);
  });

  it('never mutates the input array', () => {
    const original = ['indeed'];
    withPoolTag(original, SAVED_TAG, true);

    expect(original).toEqual(['indeed']);
  });

  it('handles a candidate with no tags', () => {
    expect(withPoolTag(undefined, ARCHIVED_TAG, true)).toEqual([ARCHIVED_TAG]);
  });
});

describe('pool partitioning', () => {
  const list = [
    candidate(1, []),
    candidate(2, [SAVED_TAG]),
    candidate(3, [ARCHIVED_TAG]),
    candidate(4, [SAVED_TAG, ARCHIVED_TAG]),
  ];

  it('keeps saved candidates on the board and drops archived ones', () => {
    const ids = visibleOnBoard(list).map((c) => c.id);

    // 2 is saved, so it stays visible. 3 and 4 are archived, so they leave.
    expect(ids).toEqual([1, 2]);
  });

  it('lists every saved candidate, archived or not', () => {
    expect(savedCandidates(list).map((c) => c.id)).toEqual([2, 4]);
  });

  it('lists every archived candidate, saved or not', () => {
    expect(archivedCandidates(list).map((c) => c.id)).toEqual([3, 4]);
  });

  it('leaves an untagged list untouched on the board', () => {
    const plain = [candidate(9, []), candidate(10, ['Milano'])];
    expect(visibleOnBoard(plain)).toHaveLength(2);
    expect(savedCandidates(plain)).toHaveLength(0);
    expect(archivedCandidates(plain)).toHaveLength(0);
  });
});
