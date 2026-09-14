import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';

import { TransferFilterModal, TransferFilterValues } from '../modules/transfers/TransferFilterModal';
import { SelectOption } from '../components/ui/CustomSelect';
import { EntityOptionRow, CountPill } from '../components/ui/EntityOption';

const companyOptions: SelectOption[] = [
  {
    value: '1',
    label: 'Fusaro Uomo',
    render: <EntityOptionRow title="Fusaro Uomo" trailing={<CountPill>20 employees</CountPill>} />,
  },
  {
    value: '3',
    label: 'Paradise Limited',
    render: <EntityOptionRow title="Paradise Limited" trailing={<CountPill>8 employees</CountPill>} />,
  },
];

const storeOptions: SelectOption[] = [
  {
    value: '10',
    label: 'Negozio Roma Centro (Fusaro Uomo)',
    render: (
      <EntityOptionRow
        title="Negozio Roma Centro"
        subtitle="Fusaro Uomo"
        trailing={<CountPill>12 employees</CountPill>}
      />
    ),
  },
];

const statusOptions: SelectOption[] = [{ value: 'active', label: 'Active' }];

const emptyFilters: TransferFilterValues = { company_id: '', store_id: '', status: '' };

function Harness({ applied = emptyFilters }: { applied?: TransferFilterValues }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setTick((n) => n + 1)}>rerender parent</button>
      <button onClick={() => setOpen(false)}>close modal</button>
      <button onClick={() => setOpen(true)}>open modal</button>
      <TransferFilterModal
        open={open}
        onClose={() => setOpen(false)}
        onApply={() => {}}
        initialFilters={{ ...applied }}
        companyOptions={companyOptions}
        storeOptions={storeOptions}
        statusOptions={statusOptions}
        showCompanyFilter
      />
    </div>
  );
}

function renderModal(applied?: TransferFilterValues) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Harness applied={applied} />
    </I18nextProvider>
  );
}

/** Opens the company select and picks the named company. */
function pickCompany(name: string) {
  const control = screen.getByText(/tutte le aziende|all companies/i).closest('button')!;
  fireEvent.click(control);
  fireEvent.click(screen.getByText(name));
}

describe('transfers TransferFilterModal', () => {
  it('keeps an unapplied selection when the parent re-renders', () => {
    renderModal();
    pickCompany('Paradise Limited');
    expect(screen.getByText('Paradise Limited')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /rerender parent/i }));
    fireEvent.click(screen.getByRole('button', { name: /rerender parent/i }));

    expect(screen.getByText('Paradise Limited')).toBeInTheDocument();
    expect(screen.queryByText(/tutte le aziende|all companies/i)).not.toBeInTheDocument();
  });

  it('re-seeds from the applied filters when reopened', () => {
    renderModal();
    pickCompany('Paradise Limited');
    expect(screen.getByText('Paradise Limited')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    fireEvent.click(screen.getByRole('button', { name: /open modal/i }));

    // Nothing was applied, so the draft is discarded and the placeholder is back.
    expect(screen.getByText(/tutte le aziende|all companies/i)).toBeInTheDocument();
  });

  it('shows the headcount and the company under the store name', () => {
    renderModal();

    const storeControl = screen.getByText(/tutti i negozi|all stores/i).closest('button')!;
    fireEvent.click(storeControl);

    expect(screen.getByText('Negozio Roma Centro')).toBeInTheDocument();
    expect(screen.getByText('Fusaro Uomo')).toBeInTheDocument();
    expect(screen.getByText('12 employees')).toBeInTheDocument();
  });
});
