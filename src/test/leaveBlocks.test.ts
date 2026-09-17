import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
vi.mock('../api/client', () => ({
  default: { get: (...args: any[]) => mockGet(...args) },
}));

import { getLeaveBlocks, isLeaveGranted } from '../api/leave';

function request(id: number, status: string, currentApproverRole: string | null = null) {
  return {
    id,
    companyId: 1,
    userId: 100 + id,
    userName: `User${id}`,
    userSurname: 'Test',
    storeId: 2,
    leaveType: 'vacation',
    startDate: '2031-03-03',
    endDate: '2031-03-04',
    status,
    currentApproverRole,
  };
}

describe('isLeaveGranted', () => {
  it.each([
    ['approved', null, true],
    ['admin_approved', null, true],
    ['HR approved', null, true],
    // A chain that ends at the area manager grants leave on that step.
    ['area manager approved', null, true],
    // The same spelling half-way through a longer chain is still in progress.
    ['store manager approved', 'area_manager', false],
    ['pending', 'store_manager', false],
    ['pending', null, false],
    ['cancelled', null, false],
    ['rejected', null, false],
    ['HR rejected', null, false],
    ['store manager rejected', null, false],
  ])('%s waiting on %s → %s', (status, approver, expected) => {
    expect(isLeaveGranted({ status, currentApproverRole: approver })).toBe(expected);
  });
});

describe('getLeaveBlocks', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('reads every page, open and archived, and drops withdrawn or refused requests', async () => {
    mockGet.mockImplementation((_url: string, config: { params: Record<string, unknown> }) => {
      const { page, archived } = config.params;
      if (archived) {
        // An approved request HR archived, plus a duplicate of one already seen.
        return Promise.resolve({
          data: { data: { requests: [request(9, 'approved'), request(1, 'approved')], total: 2, pages: 1 } },
        });
      }
      if (page === 1) {
        return Promise.resolve({
          data: { data: { requests: [request(1, 'approved'), request(2, 'cancelled')], total: 4, pages: 2 } },
        });
      }
      return Promise.resolve({
        data: { data: { requests: [request(3, 'HR rejected'), request(4, 'pending', 'store_manager')], total: 4, pages: 2 } },
      });
    });

    const blocks = await getLeaveBlocks('2031-03-03', '2031-03-09');

    expect(blocks.map((b) => b.id).sort()).toEqual([1, 4, 9]);
    expect(blocks.find((b) => b.id === 4)?.currentApproverRole).toBe('store_manager');

    // Asked for the largest page the API allows, not its default of 20.
    for (const [, config] of mockGet.mock.calls) {
      expect(config.params.limit).toBe(100);
    }
    expect(mockGet.mock.calls.some(([, c]) => c.params.page === 2)).toBe(true);
  });
});
