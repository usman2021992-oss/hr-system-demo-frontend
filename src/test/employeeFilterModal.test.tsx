import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';

import {
  FilterModal,
  FilterValues,
  FilterCompanyOption,
  FilterStoreOption,
} from '../modules/employees/FilterModal';

const companyOptions: FilterCompanyOption[] = [
  { value: '1', label: 'Fusaro Uomo', employeeCount: 20 },
  { value: '3', label: 'Paradise Limited', employeeCount: 8 },
];

const storeOptions: FilterStoreOption[] = [
  { value: '10', label: 'Negozio Roma Centro', companyId: '1', companyName: 'Fusaro Uomo', employeeCount: 12 },
  { value: '11', label: 'Negozio Milano Duomo', companyId: '1', companyName: 'Fusaro Uomo', employeeCount: 8 },
  { value: '20', label: 'Downtown London', companyId: '3', companyName: 'Paradise Limited', employeeCount: 8 },
];

const emptyFilters: FilterValues = {
  company_ids: [],
  store_ids: [],
  department: '',
  status: '',
  role: '',
};

/**
 * Mirrors EmployeeList: the parent re-renders on its own (a permissions poll, a
 * finished request) while the modal is open.
 */
function Harness({ applied = emptyFilters }: { applied?: FilterValues }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setTick((n) => n + 1)}>rerender parent</button>
      <button onClick={() => setOpen(false)}>close modal</button>
      <button onClick={() => setOpen(true)}>open modal</button>
      <FilterModal
        open={open}
        onClose={() => setOpen(false)}
        onApply={() => {}}
        initialFilters={{ ...applied }}
        companyOptions={companyOptions}
        storeOptions={storeOptions}
        statusOptions={[{ value: 'active', label: 'Active' }]}
        roleOptions={[{ value: 'employee', label: 'Employee' }]}
        showCompanyFilter
      />
    </div>
  );
}

function renderModal(applied?: FilterValues) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Harness applied={applied} />
    </I18nextProvider>
  );
}

// The modal keeps its expanded sections between opens, so only toggle when collapsed.
function expandCompanies() {
  if (screen.queryAllByRole('checkbox', { hidden: true }).length === 0) {
    fireEvent.click(screen.getByRole('button', { name: /azienda|company/i }));
  }
}

function companyCheckboxes(): HTMLInputElement[] {
  return screen.getAllByRole('checkbox', { hidden: true }) as HTMLInputElement[];
}

describe('employees FilterModal', () => {
  it('keeps an unapplied selection when the parent re-renders', () => {
    renderModal();
    expandCompanies();

    const first = companyCheckboxes()[0];
    fireEvent.click(first);
    expect(companyCheckboxes()[0].checked).toBe(true);

    // A background re-render hands the modal a new initialFilters object.
    fireEvent.click(screen.getByRole('button', { name: /rerender parent/i }));
    fireEvent.click(screen.getByRole('button', { name: /rerender parent/i }));

    expect(companyCheckboxes()[0].checked).toBe(true);
  });

  it('re-seeds from the applied filters when reopened', () => {
    renderModal({ ...emptyFilters, company_ids: ['3'] });
    expandCompanies();

    // Draft change that is never applied.
    fireEvent.click(companyCheckboxes()[0]);
    expect(companyCheckboxes()[0].checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    fireEvent.click(screen.getByRole('button', { name: /open modal/i }));
    expandCompanies();

    const boxes = companyCheckboxes();
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
  });

  it('shows each company headcount and limits stores to the selected companies', () => {
    renderModal();
    expandCompanies();

    expect(screen.getByText('Fusaro Uomo')).toBeInTheDocument();
    expect(screen.getAllByText(/20 (employees|dipendenti)/i).length).toBeGreaterThan(0);

    // Select Paradise Limited, then open the store list.
    fireEvent.click(companyCheckboxes()[1]);
    fireEvent.click(screen.getByRole('button', { name: /negozio|store/i }));

    expect(screen.getByText('Downtown London')).toBeInTheDocument();
    expect(screen.queryByText('Negozio Roma Centro')).not.toBeInTheDocument();
    // The store row names its company underneath.
    expect(screen.getAllByText('Paradise Limited').length).toBeGreaterThan(1);
  });

  it('drops a store when its company is deselected', () => {
    renderModal();
    expandCompanies();
    fireEvent.click(companyCheckboxes()[1]); // Paradise Limited

    fireEvent.click(screen.getByRole('button', { name: /negozio|store/i }));
    const storeBox = screen.getByText('Downtown London').closest('label')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(storeBox);
    expect(
      (screen.getByText('Downtown London').closest('label')!
        .querySelector('input[type="checkbox"]') as HTMLInputElement).checked
    ).toBe(true);

    // Deselecting the company must clear the store it owned.
    fireEvent.click(companyCheckboxes()[1]);
    fireEvent.click(companyCheckboxes()[1]);

    expect(
      (screen.getByText('Downtown London').closest('label')!
        .querySelector('input[type="checkbox"]') as HTMLInputElement).checked
    ).toBe(false);
  });
});
