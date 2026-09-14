import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';

// ── API mocks ─────────────────────────────────────────────────────────────────
const mockGetEmployees = vi.fn();
const mockGetStores = vi.fn();
const mockGetCompanies = vi.fn();
const mockListTransfers = vi.fn();

vi.mock('../api/employees', () => ({
  getEmployees: (...args: any[]) => mockGetEmployees(...args),
}));
vi.mock('../api/stores', () => ({
  getStores: (...args: any[]) => mockGetStores(...args),
}));
vi.mock('../api/companies', () => ({
  getCompanies: (...args: any[]) => mockGetCompanies(...args),
}));
vi.mock('../api/transfers', () => ({
  listTransfers: (...args: any[]) => mockListTransfers(...args),
  listTransferShifts: vi.fn().mockResolvedValue({ transferId: 0, shifts: [] }),
  createTransfer: vi.fn(),
  updateTransfer: vi.fn(),
  cancelTransfer: vi.fn(),
  deleteTransfer: vi.fn(),
  completeTransfer: vi.fn(),
}));
vi.mock('../api/client', () => ({
  getAvatarUrl: () => null,
  getStoreLogoUrl: () => null,
  getCompanyLogoUrl: () => null,
}));

const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import TransfersPage from '../modules/transfers/TransfersPage';

function makeUser(id: number, name: string, surname: string, role: string) {
  return {
    id,
    companyId: 1,
    storeId: 2,
    name,
    surname,
    email: `${name.toLowerCase()}@test.com`,
    role,
    status: 'active' as const,
    storeName: 'Negozio Roma Centro',
    companyName: 'Fusaro Uomo',
    avatarFilename: null,
    uniqueId: `EMP-${id}`,
  };
}

const people = [
  makeUser(1, 'Anna', 'Verdi', 'employee'),
  makeUser(2, 'Marco', 'Gialli', 'store_manager'),
  makeUser(3, 'Sara', 'Blu', 'area_manager'),
  makeUser(4, 'Luca', 'Rosa', 'hr'),
  makeUser(5, 'Root', 'Admin', 'admin'),
];

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TransfersPage />
    </I18nextProvider>
  );
}

describe('transfers employee picker', () => {
  beforeEach(() => {
    mockGetEmployees.mockReset();
    mockGetStores.mockReset();
    mockGetCompanies.mockReset();
    mockListTransfers.mockReset();

    mockUseAuth.mockReturnValue({
      user: { id: 99, name: 'Admin', surname: 'User', role: 'admin', companyId: 1, isSuperAdmin: false },
    });
    mockGetEmployees.mockResolvedValue({ employees: people, total: people.length, page: 1, pages: 1 });
    mockGetStores.mockResolvedValue([
      { id: 2, companyId: 1, name: 'Negozio Roma Centro', code: 'ROM', isActive: true, employeeCount: 12, companyName: 'Fusaro Uomo' },
      { id: 3, companyId: 1, name: 'Negozio Milano Duomo', code: 'MIL', isActive: true, employeeCount: 8, companyName: 'Fusaro Uomo' },
    ]);
    mockGetCompanies.mockResolvedValue([
      { id: 1, name: 'Fusaro Uomo', isActive: true, employeeCount: 20, storeCount: 2 },
    ]);
    mockListTransfers.mockResolvedValue({ transfers: [] });
  });

  async function openPicker() {
    renderPage();
    const newButton = await screen.findByRole('button', { name: /nuovo trasferimento|new transfer/i });
    fireEvent.click(newButton);

    const pickerButton = await screen.findByText(/seleziona dipendente|select employee/i);
    await waitFor(() => expect(mockGetEmployees).toHaveBeenCalled());
    fireEvent.click(pickerButton.closest('button')!);
  }

  it('offers every store role, each with its role tag', async () => {
    await openPicker();

    for (const name of ['Anna Verdi', 'Marco Gialli', 'Sara Blu', 'Luca Rosa']) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }

    // The role rides in a tag on the row, not in the grey subtitle.
    const managerRow = screen.getByText('Marco Gialli').closest('button')!;
    expect(within(managerRow).getByText(i18n.t('roles.store_manager'))).toBeInTheDocument();

    const areaRow = screen.getByText('Sara Blu').closest('button')!;
    expect(within(areaRow).getByText(i18n.t('roles.area_manager'))).toBeInTheDocument();

    const hrRow = screen.getByText('Luca Rosa').closest('button')!;
    expect(within(hrRow).getByText(i18n.t('roles.hr'))).toBeInTheDocument();
  });

  it('never offers an admin', async () => {
    await openPicker();

    await screen.findByText('Anna Verdi');
    expect(screen.queryByText('Root Admin')).not.toBeInTheDocument();
  });
});
