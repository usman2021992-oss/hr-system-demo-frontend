import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import billingApi from '../../api/billing';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { BillingResetPreview } from '../../types';

/**
 * Clearing one company's billing history.
 *
 * Needed because provider credentials get swapped - test keys for the
 * client's, and later the client's for live ones - and every subscription and
 * payment recorded under the old account becomes a row referring to something
 * the provider no longer admits exists. It cannot be repaired, only removed.
 *
 * Everything here is arranged to make that removal deliberate: the counts are
 * fetched and shown before the button exists, the company's own name has to be
 * typed, and anything still live is called out first - because deleting our
 * record of a subscription that is still charging somebody is the one mistake
 * this panel could cause that would be worse than the problem it solves.
 */
export const BillingResetPanel: React.FC<{
  companyId: number;
  companyName: string;
  onReset?: () => void;
}> = ({ companyId, companyName, onReset }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [preview, setPreview] = useState<BillingResetPreview | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setPreview(await billingApi.previewBillingReset(companyId));
    } catch {
      // A panel that cannot count is a panel that should not offer to delete.
      setPreview(null);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total =
    (preview?.subscriptions ?? 0) + (preview?.transactions ?? 0) + (preview?.headcountEvents ?? 0);

  // Nothing to clear is not an error, and an empty danger zone is just noise.
  if (!preview || total === 0) return null;

  const handleReset = async () => {
    setWorking(true);
    try {
      const res = await billingApi.resetBillingData(companyId, confirmation);
      showToast(
        t(
          'companies.billingResetDone',
          'Dati di fatturazione rimossi: {{subs}} abbonamenti, {{tx}} transazioni.',
          { subs: res.deletedSubscriptions, tx: res.deletedTransactions }
        ),
        'success'
      );
      setOpen(false);
      setConfirmation('');
      await load();
      onReset?.();
    } catch (err: any) {
      showToast(
        err?.response?.data?.error ||
          t('companies.billingResetFailed', 'Impossibile rimuovere i dati di fatturazione'),
        'error'
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 20,
        padding: 16,
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(220,38,38,0.35)',
        background: 'rgba(220,38,38,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AlertTriangle size={15} style={{ color: '#dc2626' }} />
        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          {t('companies.billingResetTitle', 'Azzera i dati di fatturazione')}
        </strong>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
        {t(
          'companies.billingResetHelp',
          'Rimuove definitivamente abbonamenti, transazioni e storico risorse di questa azienda. Le impostazioni di fatturazione (prezzi, sconto, giorni di tolleranza) non vengono toccate. Serve quando si cambiano le credenziali Stripe o PayPal e i dati precedenti non sono più leggibili.'
        )}
      </p>

      <div style={{ fontSize: 12.5, color: 'var(--text-primary)', marginBottom: 10 }}>
        {t('companies.billingResetCounts', 'Verranno rimossi:')}{' '}
        <strong>
          {preview.subscriptions} {t('companies.billingResetSubs', 'abbonamenti')}
        </strong>
        {', '}
        <strong>
          {preview.transactions} {t('companies.billingResetTx', 'transazioni')}
        </strong>
        {', '}
        <strong>
          {preview.headcountEvents} {t('companies.billingResetEvents', 'eventi risorse')}
        </strong>
        .
      </div>

      {/* The warning that actually matters. A subscription opened under the
          current credentials may still be live at the provider, and deleting
          our record of it does not stop it billing. */}
      {preview.activeSubscriptions.filter((s) => !s.foreignAccount).length > 0 && (
        <div
          style={{
            padding: '9px 11px',
            marginBottom: 10,
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.40)',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {t(
            'companies.billingResetLiveWarning',
            'Attenzione: alcuni abbonamenti risultano ancora attivi con le credenziali in uso. Annullali prima dal pannello Stripe o PayPal, altrimenti continueranno ad addebitare il cliente anche dopo la rimozione.'
          )}
        </div>
      )}

      {preview.activeSubscriptions.some((s) => s.foreignAccount) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {t(
            'companies.billingResetForeign',
            'Alcuni abbonamenti sono stati creati con credenziali diverse da quelle attuali: non sono più raggiungibili dal gestore di pagamento.'
          )}
        </div>
      )}

      {!open ? (
        <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
          <Trash2 size={13} /> {t('companies.billingResetStart', 'Azzera i dati')}
        </Button>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <Input
            label={t('companies.billingResetConfirmLabel', 'Scrivi "{{name}}" per confermare', {
              name: companyName,
            })}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={companyName}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="sm"
              variant="danger"
              onClick={handleReset}
              loading={working}
              disabled={confirmation.trim().toLowerCase() !== companyName.trim().toLowerCase()}
            >
              {t('companies.billingResetConfirm', 'Rimuovi definitivamente')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setConfirmation('');
              }}
            >
              {t('common.cancel', 'Annulla')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingResetPanel;
