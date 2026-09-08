import React, { useState } from 'react';
import { DatePicker } from '../../components/ui/DatePicker';
import CurrencySelect from '../../components/ui/CurrencySelect';
import { normaliseCurrency, currencySymbol } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import { Company } from '../../types';
import { updateCompany } from '../../api/companies';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface Props {
  company: Company;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: Company) => void;
}

export const CompanyBillingConfigModal: React.FC<Props> = ({
  company,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState(normaliseCurrency(company.currency));
  const [pricePerEmployee, setPricePerEmployee] = useState<string>(
    company.pricePerEmployee !== null && company.pricePerEmployee !== undefined
      ? String(company.pricePerEmployee)
      : '10.00'
  );
  const [pricePerDevice, setPricePerDevice] = useState<string>(
    company.pricePerDevice !== null && company.pricePerDevice !== undefined
      ? String(company.pricePerDevice)
      : '15.00'
  );
  const [storageLimitGb, setStorageLimitGb] = useState<string>(
    company.storageLimitGb !== null && company.storageLimitGb !== undefined
      ? String(company.storageLimitGb)
      : '1'
  );
  const [extraStoragePricePerGb, setExtraStoragePricePerGb] = useState<string>(
    company.extraStoragePricePerGb !== null && company.extraStoragePricePerGb !== undefined
      ? String(company.extraStoragePricePerGb)
      : '5.00'
  );
  const [discountPercent, setDiscountPercent] = useState<string>(
    company.discountPercent !== null && company.discountPercent !== undefined
      ? String(company.discountPercent)
      : '0'
  );
  const [discountValidFrom, setDiscountValidFrom] = useState<string>(
    company.discountValidFrom ? company.discountValidFrom.slice(0, 10) : ''
  );
  const [discountValidTo, setDiscountValidTo] = useState<string>(
    company.discountValidTo ? company.discountValidTo.slice(0, 10) : ''
  );
  const [billReminderDaysBefore, setBillReminderDaysBefore] = useState<string>(
    company.billReminderDaysBefore !== null && company.billReminderDaysBefore !== undefined
      ? String(company.billReminderDaysBefore)
      : '3'
  );
  const [billingEnforced, setBillingEnforced] = useState<boolean>(
    (company as any).billingEnforced === true
  );
  const [gracePeriodDays, setGracePeriodDays] = useState<string>(
    company.gracePeriodDays !== null && company.gracePeriodDays !== undefined
      ? String(company.gracePeriodDays)
      : '3'
  );

  const handleSubmit = async () => {
    try {
      setSaving(true);
      const payload = {
        name: company.name,
        currency,
        pricePerEmployee: pricePerEmployee ? parseFloat(pricePerEmployee) : 0,
        pricePerDevice: pricePerDevice ? parseFloat(pricePerDevice) : 0,
        storageLimitGb: storageLimitGb ? parseFloat(storageLimitGb) : 500,
        extraStoragePricePerGb: extraStoragePricePerGb ? parseFloat(extraStoragePricePerGb) : 0,
        discountPercent: discountPercent ? parseFloat(discountPercent) : 0,
        discountValidFrom: discountValidFrom ? new Date(discountValidFrom).toISOString() : null,
        discountValidTo: discountValidTo ? new Date(discountValidTo).toISOString() : null,
        billReminderDaysBefore: billReminderDaysBefore ? parseInt(billReminderDaysBefore, 10) : 3,
        gracePeriodDays: gracePeriodDays ? parseInt(gracePeriodDays, 10) : 3,
        billingEnforced,
      };

      const updated = await updateCompany(company.id, payload);
      showToast(t('companies.billingConfigUpdated', 'Configurazione tariffaria aggiornata con successo'), 'success');
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      console.error('Error updating billing config:', err);
      showToast(err.response?.data?.error || t('common.errorOccurred', 'Si è verificato un errore'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`${t('companies.billingConfigTitle', 'Tariffe & Parametri di Fatturazione')} — ${company.name}`}
      maxWidth="680px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', 'Annulla')}
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {t('common.saveChanges', 'Salva configurazione')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Section 1: Prezzi Unitari */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 12 }}>
            {t('companies.unitPrices', 'Prezzi Unitari Licenze')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <CurrencySelect
              label={t('companies.currency', 'Valuta')}
              value={currency}
              onChange={setCurrency}
              disabled={saving}
            />

            <Input
              label={t('companies.pricePerEmployee', { cur: currencySymbol(currency) })}
              type="number"
              step="0.01"
              min="0"
              value={pricePerEmployee}
              onChange={(e) => setPricePerEmployee(e.target.value)}
              required
            />

            <Input
              label={t('companies.pricePerDevice', { cur: currencySymbol(currency) })}
              type="number"
              step="0.01"
              min="0"
              value={pricePerDevice}
              onChange={(e) => setPricePerDevice(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Section 2: Automazione & Tolleranza */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 12 }}>
            {t('companies.automationTiming', 'Ciclo di Fatturazione & Tolleranza')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <Input
              label={t('companies.billReminderDays')}
              type="number"
              min="1"
              max="30"
              value={billReminderDaysBefore}
              onChange={(e) => setBillReminderDaysBefore(e.target.value)}
              hint={t('companies.billReminderHelp', 'Giorni prima del rinnovo per inviare email')}
              required
            />

            <Input
              label={t('companies.gracePeriodDays')}
              type="number"
              min="0"
              max="30"
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(e.target.value)}
              hint={t('companies.gracePeriodHelp', 'Accesso mantenuto dopo fallimento prima del blocco')}
              required
            />
          </div>

          {/* The master switch. Companies created before the billing module
              stay off until an administrator turns them on, so enabling it is
              a deliberate act rather than something a deploy does silently. */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              marginTop: 14,
              padding: '12px 14px',
              background: billingEnforced ? 'rgba(22,163,74,0.08)' : 'var(--surface-warm)',
              border: '1px solid ' + (billingEnforced ? 'rgba(22,163,74,0.30)' : 'var(--border-light)'),
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={billingEnforced}
              onChange={(e) => setBillingEnforced(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('companies.billingEnforced', 'Abbonamento obbligatorio per questa azienda')}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                {t(
                  'companies.billingEnforcedHelp',
                  'Se attivo, l’azienda deve avere un abbonamento pagato per usare la piattaforma e non può superare le licenze acquistate. Se disattivo, l’azienda continua a funzionare senza fatturazione.'
                )}
              </span>
            </span>
          </label>
        </div>

        {/* Section 3: Archiviazione & Storage */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 12 }}>
            {t('companies.storageLimits', 'Archiviazione & Storage Documentale')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <Input
              label={t('companies.storageLimitGb')}
              type="number"
              step="1"
              min="0"
              value={storageLimitGb}
              onChange={(e) => setStorageLimitGb(e.target.value)}
            />

            <Input
              label={t('companies.extraStoragePricePerGb', { cur: currencySymbol(currency) })}
              type="number"
              step="0.01"
              min="0"
              value={extraStoragePricePerGb}
              onChange={(e) => setExtraStoragePricePerGb(e.target.value)}
            />
          </div>
        </div>

        {/* Section 4: Sconti Speciali */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 12 }}>
            {t('companies.discounts', 'Sconti & Promozioni')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <Input
              label={t('companies.discountPercent', 'Percentuale Sconto (%)')}
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />

            <DatePicker
              label={t('companies.discountValidFrom')}
              value={discountValidFrom}
              onChange={setDiscountValidFrom}
              disabled={saving}
            />

            <DatePicker
              label={t('companies.discountValidTo')}
              value={discountValidTo}
              onChange={setDiscountValidTo}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CompanyBillingConfigModal;
