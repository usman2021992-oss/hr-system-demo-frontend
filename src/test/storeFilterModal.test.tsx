import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import ReactCountryFlag from 'react-country-flag';
import i18n from '../i18n/config';

import { StoreFilterModal, StoreFilterValues } from '../modules/stores/StoreFilterModal';
import { SelectOption } from '../components/ui/CustomSelect';
import { EntityOptionRow, CountPill } from '../components/ui/EntityOption';

const companyOptions: SelectOption[] = [
  {
    value: '1',
    label: 'Fusaro Uomo',
    render: <EntityOptionRow title="Fusaro Uomo" trailing={<CountPill>4 stores</CountPill>} />,
  },
  {
    value: '3',
    label: 'Paradise Limited',
    render: <EntityOptionRow title="Paradise Limited" trailing={<CountPill>1 store</CountPill>} />,
  },
];

const countryRow = (code: string, name: string) => (
  <span>
    <ReactCountryFlag countryCode={code} svg title={name} style={{ width: '1.1em', height: '1.1em' }} />
    <span>{name}</span>
  </span>
);

const countryOptions: SelectOption[] = [
  { value: 'IT', label: 'Italia', render: countryRow('IT', 'Italia'), selectedRender: countryRow('IT', 'Italia') },
  { value: 'GB', label: 'Regno Unito', render: countryRow('GB', 'Regno Unito'), selectedRender: countryRow('GB', 'Regno Unito') },
];

const statusOptions: SelectOption[] = [{ value: 'active', label: 'Active' }];

const emptyFilters: StoreFilterValues = { company_id: '', status: '', country: '' };

function Harness({ applied = emptyFilters }: { applied?: StoreFilterValues }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setTick((n) => n + 1)}>rerender parent</button>
      <button onClick={() => setOpen(false)}>close modal</button>
      <button onClick={() => setOpen(true)}>open modal</button>
      <StoreFilterModal
        open={open}
        onClose={() => setOpen(false)}
        onApply={() => {}}
        initialFilters={{ ...applied }}
        companyOptions={companyOptions}
        statusOptions={statusOptions}
        countryOptions={countryOptions}
        showCompanyFilter
      />
    </div>
  );
}

function renderModal() {
  return render(
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>
  );
}

describe('stores StoreFilterModal', () => {
  it('shows each company with the number of stores it owns', () => {
    renderModal();
    fireEvent.click(screen.getByText(/tutte le aziende|all companies/i).closest('button')!);

    expect(screen.getByText('Fusaro Uomo')).toBeInTheDocument();
    expect(screen.getByText('4 stores')).toBeInTheDocument();
    expect(screen.getByText('1 store')).toBeInTheDocument();
  });

  it('shows a flag next to each country', () => {
    const { container } = renderModal();
    fireEvent.click(screen.getByText(/tutti i paesi|all countries/i).closest('button')!);

    expect(screen.getByText('Italia')).toBeInTheDocument();
    // react-country-flag renders an <img> per country in svg mode.
    const flags = container.ownerDocument.querySelectorAll('img.react-country-flag, img[title="Italia"]');
    expect(flags.length).toBeGreaterThan(0);
  });

  it('keeps an unapplied selection when the parent re-renders', () => {
    renderModal();
    fireEvent.click(screen.getByText(/tutte le aziende|all companies/i).closest('button')!);
    fireEvent.click(screen.getByText('Paradise Limited'));

    fireEvent.click(screen.getByRole('button', { name: /rerender parent/i }));
    fireEvent.click(screen.getByRole('button', { name: /rerender parent/i }));

    expect(screen.getByText('Paradise Limited')).toBeInTheDocument();
    expect(screen.queryByText(/tutte le aziende|all companies/i)).not.toBeInTheDocument();
  });
});
