import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';
import { UnifiedUploadWizard } from '../modules/documents/UnifiedUploadModal';
import * as docsApi from '../api/documents';
import * as companiesApi from '../api/companies';
import * as employeesApi from '../api/employees';

// Mock useBreakpoint
vi.mock('../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ isMobile: false }),
}));

// Mock useAuth
const mockUser = { id: 1, role: 'admin', companyId: 1 };
const mockAllowedCompanyIds = [1, 2];
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    allowedCompanyIds: mockAllowedCompanyIds,
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

describe('UnifiedUploadWizard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Step 1 initially and handles file selection to Step 2', async () => {
    const getCompaniesSpy = vi.spyOn(companiesApi, 'getCompanies').mockResolvedValue([
      { id: 1, name: 'Company A' } as any,
      { id: 2, name: 'Company B' } as any
    ]);
    const getEmployeesSpy = vi.spyOn(employeesApi, 'getEmployees').mockResolvedValue({ employees: [] } as any);

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <UnifiedUploadWizard onClose={onClose} onSuccess={onSuccess} />
      </I18nextProvider>
    );

    // Initial step should be File Selection (Step 1)
    expect(screen.getByText(/Multiple files allowed/i)).toBeInTheDocument();

    // Mock file input selection
    const file = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    // Should transition to Step 2
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('GLOBAL SETTINGS'))).toBeInTheDocument();
    });

    // Check if Company dropdown is rendered
    expect(screen.getAllByText(/Company/i).length).toBeGreaterThan(0);

    // Check if Back button is rendered on Step 2
    const backBtn = screen.getByTestId('wizard-back-button');
    expect(backBtn).toBeInTheDocument();

    // Click Back to go back to Step 1
    fireEvent.click(backBtn);
    expect(screen.getByText(/Multiple files allowed/i)).toBeInTheDocument();
  });

  it('keeps unmatched file as Unassigned in Step 3 and Step 4', async () => {
    vi.spyOn(companiesApi, 'getCompanies').mockResolvedValue([
      { id: 1, name: 'Company A' } as any
    ]);
    vi.spyOn(employeesApi, 'getEmployees').mockResolvedValue({
      employees: [{ id: 99, name: 'Sara', surname: 'Ahmed', companyId: 1 }]
    } as any);

    // Mock upload response returning unmatched file (e.g. Ahmed.pdf)
    vi.spyOn(docsApi, 'uploadDocumentUnified').mockResolvedValue({
      documentId: 101,
      fileName: 'Ahmed.pdf',
      matched: false,
      employee: null
    });
    const updateSpy = vi.spyOn(docsApi, 'updateDocumentGeneric').mockResolvedValue();

    render(
      <I18nextProvider i18n={i18n}>
        <UnifiedUploadWizard onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nextProvider>
    );

    // Select Ahmed.pdf
    const file = new File(['pdf content'], 'Ahmed.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Step 2 -> Next
    await waitFor(() => expect(screen.getByTestId('wizard-submit-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('wizard-submit-button'));

    // Step 3 (Employee Matching): Should show UNASSIGNED DOCUMENTS (1)
    await waitFor(() => {
      expect(screen.getByText(/UNASSIGNED DOCUMENTS/i)).toBeInTheDocument();
    });

    // Save Step 3 -> Step 4 (Final Confirmation)
    const saveBtn = screen.getByRole('button', { name: /salva|save/i });
    fireEvent.click(saveBtn);

    // Step 4: Should display Unassigned badge for Ahmed.pdf
    await waitFor(() => {
      expect(screen.getByText(/Unassigned|Non assegnato/i)).toBeInTheDocument();
    });

    // Click Confirm
    const confirmBtn = screen.getByRole('button', { name: /conferma|confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(101, expect.objectContaining({
        employee_id: null,
        confirm: true,
        notify: true
      }));
    });
  });

  it('fetches server preview URL when clicking View for extracted or uploaded document', async () => {
    vi.spyOn(companiesApi, 'getCompanies').mockResolvedValue([{ id: 1, name: 'Company A' } as any]);
    vi.spyOn(employeesApi, 'getEmployees').mockResolvedValue({ employees: [] } as any);
    vi.spyOn(docsApi, 'uploadDocumentUnified').mockResolvedValue({
      documentId: 102,
      fileName: 'document.pdf',
      matched: false,
      employee: null
    });
    const previewSpy = vi.spyOn(docsApi, 'getDocumentPreviewUrlGeneric').mockResolvedValue('blob:http://localhost/test-blob');

    render(
      <I18nextProvider i18n={i18n}>
        <UnifiedUploadWizard onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nextProvider>
    );

    const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('wizard-submit-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('wizard-submit-button'));

    await waitFor(() => expect(screen.getByText(/UNASSIGNED DOCUMENTS/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /salva|save/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /visualizza|view/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /visualizza|view/i }));

    await waitFor(() => {
      expect(previewSpy).toHaveBeenCalledWith(102, 'application/pdf');
    });
  });

  it('auto-assigns matched extracted ZIP files in Step 3 Employee Matching', async () => {
    vi.spyOn(companiesApi, 'getCompanies').mockResolvedValue([{ id: 1, name: 'Company A' } as any]);
    vi.spyOn(employeesApi, 'getEmployees').mockResolvedValue({
      employees: [
        { id: 10, name: 'Zain', surname: 'Abbasi', companyId: 1 },
        { id: 20, name: 'Danish', surname: 'Akram', companyId: 1 }
      ]
    } as any);
    vi.spyOn(docsApi, 'updateDocumentGeneric').mockResolvedValue();

    vi.spyOn(docsApi, 'uploadDocumentUnified').mockResolvedValue({
      isZip: true,
      files: [
        { documentId: 201, fileName: 'Zain Abbasi.pdf', matched: true, employee: { id: 10, name: 'Zain', surname: 'Abbasi', companyId: 1 } },
        { documentId: 202, fileName: 'Danish Akram.pdf', matched: true, employee: { id: 20, name: 'Danish', surname: 'Akram', companyId: 1 } },
        { documentId: 203, fileName: 'Ahmed.pdf', matched: false, employee: null }
      ]
    });

    render(
      <I18nextProvider i18n={i18n}>
        <UnifiedUploadWizard onClose={vi.fn()} onSuccess={vi.fn()} />
      </I18nextProvider>
    );

    const archive = new File(['archive content'], 'documents.zip', { type: 'application/zip' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [archive] } });

    await waitFor(() => expect(screen.getByTestId('wizard-submit-button')).toBeInTheDocument());

    // Select Company A in Step 2 if company select is available
    fireEvent.click(screen.getByTestId('wizard-submit-button'));

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('Auto-matching completed: 2 document(s) auto-matched'))).toBeInTheDocument();
    });
  });
});
