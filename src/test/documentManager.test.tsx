import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';
import { DocumentManager } from '../modules/documents/components/DocumentManager';
import * as docsApi from '../api/documents';
import * as companiesApi from '../api/companies';

// Mock useBreakpoint
vi.mock('../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ isMobile: false }),
}));

// Mock useAuth
const mockUser = { id: 1, role: 'admin' };
const mockPermissions = { team_documents: true };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    permissions: mockPermissions,
    loading: false,
    refreshPermissions: vi.fn(),
  }),
}));

// Mock useToast
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
}));

describe('DocumentManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads documents and does not call API continuously', async () => {
    const getCategoriesSpy = vi.spyOn(docsApi, 'getCategories').mockResolvedValue([]);
    const getCompaniesSpy = vi.spyOn(companiesApi, 'getCompanies').mockResolvedValue([]);
    const getDocumentsGenericSpy = vi.spyOn(docsApi, 'getDocumentsGeneric').mockResolvedValue([]);

    render(
      <I18nextProvider i18n={i18n}>
        <DocumentManager />
      </I18nextProvider>
    );

    // Wait for initial load to finish
    await waitFor(() => {
      expect(getCategoriesSpy).toHaveBeenCalled();
    });

    // Wait some time or check call counts
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('getCategories calls:', getCategoriesSpy.mock.calls.length);
    console.log('getCompanies calls:', getCompaniesSpy.mock.calls.length);
    console.log('getDocumentsGeneric calls:', getDocumentsGenericSpy.mock.calls.length);

    expect(getCategoriesSpy.mock.calls.length).toBe(1);
  });
});
