import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Percent, RefreshCw, AlertTriangle, CheckCircle2, Save, Info } from 'lucide-react';
import billingApi from '../../api/billing';
import { formatMoney } from '../../constants/currencies';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { taxWorkings } from './taxMath';
import type { BillingTaxRate } from '../../types';

/**
 * The tax rate every total on this page is built from.
 *
 * The rate itself is created once in the Stripe dashboard and Stripe is what
 * charges it - this panel is a mirror, not a control. It exists so an admin
 * can answer three questions without leaving the app and without opening
 * Stripe: what rate am I charging, is it the same rate on both providers, and
 * is what I am looking at current.
 *
 * That last one is why `source` and `syncedAt` are as prominent as the
 * percentage. A rate read from configuration because Stripe was unreachable
 * looks identical to one confirmed a minute ago, and only one of them is safe
 * to quote to a customer.
 */
export const BillingTaxCard: React.FC<{
  tax: BillingTaxRate | null;
  canSync: boolean;
  onSynced?: (tax: BillingTaxRate) => void;
  /**
   * The invoice lines this company is billed on, so the example below can show
   * the arithmetic instead of only its result. Taxed line by line because that
   * is how both providers build an invoice - taxing the rounded total instead
   * can land a cent away from what is actually charged.
   */
  lines?: { label: string; qty: number; unitPrice: number }[];
  currency?: string;
}> = ({ tax, canSync, onSynced, lines = [], currency = 'EUR' }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState(false);
  const [local, setLocal] = useState<BillingTaxRate | null>(null);
  const [editingId, setEditingId] = useState(false);
  const [rateIdDraft, setRateIdDraft] = useState('');

  const rate = local ?? tax;

  const handleSaveRateId = async () => {
    setSavingId(true);
    try {
      const fresh = await billingApi.setTaxRate(rateIdDraft.trim());
      setLocal(fresh);
      onSynced?.(fresh);
      setEditingId(false);
      if (fresh.ok) {
        showToast(
          t('billing.taxRateIdSaved', 'Aliquota collegata: {{percent}}%', { percent: fresh.percent }),
          'success'
        );
      } else {
        showToast(
          fresh.syncError ||
            t('billing.taxSyncNoRate', 'Stripe non ha restituito un’aliquota utilizzabile.'),
          'error'
        );
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.error ||
          t('billing.taxRateIdSaveFailed', 'Impossibile salvare l’ID aliquota'),
        'error'
      );
    } finally {
      setSavingId(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const fresh = await billingApi.syncTaxRate();
      setLocal(fresh);
      onSynced?.(fresh);
      if (fresh.ok) {
        showToast(
          t('billing.taxSyncOk', 'Aliquota aggiornata da Stripe: {{percent}}%', {
            percent: fresh.percent,
          }),
          'success'
        );
      } else {
        // Reaching Stripe and finding nothing usable is not an error the
        // browser should swallow: it is the answer, and it needs reading.
        showToast(
          fresh.syncError ||
            t('billing.taxSyncNoRate', 'Stripe non ha restituito un’aliquota utilizzabile.'),
          'error'
        );
      }
    } catch (err: any) {
      showToast(
        err?.response?.data?.error ||
          t('billing.taxSyncFailed', 'Impossibile leggere l’aliquota da Stripe'),
        'error'
      );
    } finally {
      setSyncing(false);
    }
  };

  const fromStripe = rate?.source === 'stripe';
  const syncedLabel = rate?.syncedAt
    ? new Date(rate.syncedAt).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Derived from the same quantities and prices the subscription is billed on,
  // rounded the way the server rounds. Nothing is passed in pre-computed, so
  // what the reader adds up by hand is what the code adds up.
  const sums = taxWorkings(lines, rate?.percent ?? 0);
  const workings = sums.lines;
  const monthlyNet = sums.net;
  const exampleTax = sums.tax;

  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '7px 0',
    fontSize: 12.5,
    borderBottom: '1px solid var(--border-light)',
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Percent size={16} style={{ color: 'var(--accent)' }} />
            {t('billing.taxCardTitle', 'Aliquota fiscale')}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {t(
              'billing.taxCardSubtitle',
              'Creata nel pannello Stripe e applicata dal gestore di pagamento. Qui è solo mostrata.'
            )}
          </p>
        </div>

        {canSync && (
          <Button size="sm" variant="secondary" onClick={handleSync} loading={syncing}>
            <RefreshCw size={13} /> {t('billing.taxSync', 'Sincronizza da Stripe')}
          </Button>
        )}
      </div>

      {!rate || (!rate.enabled && rate.source === 'env' && !rate.stripeTaxRateId) ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            fontSize: 12.5,
            color: 'var(--text-muted)',
          }}
        >
          <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
          {t(
            'billing.taxNotConfigured',
            'Nessuna aliquota configurata: gli abbonamenti vengono addebitati senza imposta.'
          )}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 30,
                fontWeight: 900,
                fontFamily: 'var(--font-display)',
                color: 'var(--accent)',
                lineHeight: 1,
              }}
            >
              {rate.percent}%
            </span>
            {rate.displayName && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {rate.displayName}
                {rate.jurisdiction ? ` · ${rate.jurisdiction}` : ''}
              </span>
            )}
            {fromStripe ? (
              <Badge variant="success">
                <CheckCircle2 size={11} /> {t('billing.taxFromStripe', 'Da Stripe')}
              </Badge>
            ) : (
              <Badge variant="warning">
                {t('billing.taxFromEnv', 'Da configurazione locale')}
              </Badge>
            )}
          </div>

          {/* The three ways this can be configured correctly and still bill
              wrongly. Each is silent at the provider, so each is called out. */}
          {rate.inclusive && (
            <div style={warnBox}>
              <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              {t(
                'billing.taxInclusiveWarning',
                'L’aliquota su Stripe è impostata come INCLUSIVA: l’imposta verrebbe scorporata dal prezzo delle licenze invece di essere aggiunta. Impostala come esclusiva.'
              )}
            </div>
          )}
          {!rate.active && (
            <div style={warnBox}>
              <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              {t(
                'billing.taxArchivedWarning',
                'L’aliquota è archiviata su Stripe: i nuovi abbonamenti verranno rifiutati.'
              )}
            </div>
          )}
          {rate.syncError && (
            <div style={warnBox}>
              <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
              {t('billing.taxSyncError', 'Ultima sincronizzazione non riuscita: {{error}}', {
                error: rate.syncError,
              })}
            </div>
          )}

          {/* Which Stripe feature this is, because the dashboard has two and
              only one of them is what the client asked for. Stripe Tax needs
              an account activation and calculates rates automatically; a Tax
              Rate is a fixed percentage created by hand and needs nothing
              activated. Getting this wrong costs an afternoon. */}
          <div style={syncNote}>
            <Info size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              {t(
                'billing.taxWhereInStripe',
                'Questa è un’aliquota fissa creata a mano in Stripe → Catalogo prodotti → Aliquote fiscali. NON è Stripe Tax: non serve attivare Stripe Tax né alcun account aggiuntivo. Imposta il tipo su “Esclusiva”.'
              )}{' '}
              <a
                href="https://dashboard.stripe.com/test/tax-rates"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                {t('billing.taxOpenStripeRates', 'Apri le aliquote fiscali su Stripe')}
              </a>
            </div>
          </div>

          {/* How the two providers actually get the rate. Asked often enough
              to be worth stating on the page: Stripe is read automatically,
              PayPal is written at plan creation and cannot be changed on a
              live subscription without the subscriber approving it. */}
          <div style={syncNote}>
            <RefreshCw size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              {t(
                'billing.taxSyncExplain',
                'Stripe è la fonte: l’aliquota viene riletta automaticamente all’avvio del server, una volta al giorno e ogni volta che premi Sincronizza. Gli abbonamenti Stripe già attivi vengono riallineati subito. Per PayPal la percentuale viene scritta sul piano: gli abbonamenti PayPal già attivi la aggiornano al prossimo cambio di licenze, perché PayPal richiede l’approvazione del cliente per cambiare piano.'
              )}
            </div>
          </div>

          {rate.realignment && rate.realignment.stripeChecked > 0 && (
            <div style={syncNote}>
              <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
              <div>
                {t(
                  'billing.taxRealignment',
                  'Abbonamenti Stripe aggiornati: {{updated}} su {{checked}}.',
                  {
                    updated: rate.realignment.stripeUpdated,
                    checked: rate.realignment.stripeChecked,
                  }
                )}
                {rate.realignment.paypalStale > 0 &&
                  ' ' +
                    t(
                      'billing.taxRealignmentPaypal',
                      '{{n}} abbonamenti PayPal manterranno la percentuale attuale fino al prossimo cambio di licenze.',
                      { n: rate.realignment.paypalStale }
                    )}
              </div>
            </div>
          )}

          <div style={{ marginTop: 6 }}>
            <div style={row}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('billing.taxStripeRateId', 'ID aliquota Stripe')}
              </span>
              {/* The one part of the arrangement that is genuinely a local
                  decision: which of the dashboard's tax rates this platform
                  charges. The rate itself is still created and owned in
                  Stripe - saving here re-reads it from Stripe immediately, so
                  the percentage shown is never the one somebody typed. */}
              {editingId ? (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Input
                    value={rateIdDraft}
                    onChange={(e) => setRateIdDraft(e.target.value)}
                    placeholder="txr_1AbC..."
                    style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 200 }}
                  />
                  <Button size="sm" onClick={handleSaveRateId} loading={savingId}>
                    <Save size={12} /> {t('common.save', 'Salva')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(false)}>
                    {t('common.cancel', 'Annulla')}
                  </Button>
                </span>
              ) : (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {rate.stripeTaxRateId || '—'}
                  </span>
                  {canSync && (
                    <button
                      type="button"
                      onClick={() => {
                        setRateIdDraft(rate.stripeTaxRateId || '');
                        setEditingId(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      {t('common.edit', 'Modifica')}
                    </button>
                  )}
                </span>
              )}
            </div>
            <div style={row}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('billing.taxType', 'Tipo')}
              </span>
              <span>
                {rate.inclusive
                  ? t('billing.taxInclusive', 'Inclusiva (scorporata)')
                  : t('billing.taxExclusive', 'Esclusiva (aggiunta al totale)')}
              </span>
            </div>
            {/* Both providers have to charge the same thing. Showing the PayPal
                figure beside the Stripe one makes that checkable at a glance
                instead of on an invoice. */}
            <div style={row}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('billing.taxPaypal', 'Percentuale applicata ai piani PayPal')}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    rate.paypalPercent === rate.percent ? 'var(--text-primary)' : '#dc2626',
                }}
              >
                {rate.paypalPercent}%
                {rate.paypalPercent === rate.percent
                  ? ` · ${t('billing.taxAligned', 'allineata')}`
                  : ` · ${t('billing.taxNotAligned', 'NON allineata')}`}
              </span>
            </div>
            <div style={{ ...row, borderBottom: 'none' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('billing.taxLastSync', 'Ultima sincronizzazione')}
              </span>
              <span>{syncedLabel || t('billing.taxNeverSynced', 'mai')}</span>
            </div>
          </div>

          {/* The arithmetic, on this company's real figures. A percentage on
              its own is not checkable; a subtotal, a tax line and a total that
              a person can reproduce with a calculator is. This is the number
              that will appear on the Stripe invoice. */}
          {monthlyNet > 0 && rate.percent > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--background)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                {t('billing.taxExampleTitle', 'Calcolo sul canone mensile attuale')}
              </div>

              {/* The working, not just the answer. Each line shows quantity x
                  unit price, and the tax on that line, so the total underneath
                  can be checked by hand - which is the only way anybody can be
                  sure the figure is right. */}
              {workings.map((line) => (
                <div key={line.label} style={{ marginBottom: 6 }}>
                  <div style={exampleRow}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {line.label}: {line.qty} × {formatMoney(line.unitPrice, currency)}
                    </span>
                    <span>{formatMoney(line.net, currency)}</span>
                  </div>
                  <div style={{ ...exampleRow, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    <span style={{ paddingLeft: 12 }}>
                      {t('billing.taxOnLine', 'IVA {{percent}}% su {{base}}', {
                        percent: rate.percent,
                        base: formatMoney(line.net, currency),
                      })}
                    </span>
                    <span>{formatMoney(line.tax, currency)}</span>
                  </div>
                </div>
              ))}

              <div style={{ ...exampleRow, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('billing.taxableAmount', 'Imponibile')}
                </span>
                <span>{formatMoney(monthlyNet, currency)}</span>
              </div>
              <div style={exampleRow}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('billing.taxLine', 'IVA {{percent}}%', { percent: rate.percent })}
                </span>
                <span>{formatMoney(exampleTax, currency)}</span>
              </div>
              <div
                style={{
                  ...exampleRow,
                  borderTop: '1px solid var(--border)',
                  marginTop: 4,
                  paddingTop: 7,
                  fontWeight: 800,
                }}
              >
                <span>{t('billing.totalCharged', 'Totale addebitato')}</span>
                <span style={{ color: 'var(--accent)' }}>
                  {formatMoney(monthlyNet + exampleTax, currency)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {t(
                  'billing.taxExampleNote',
                  'Stripe e PayPal addebitano questo totale e mostrano al cliente le stesse tre righe.'
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const warnBox: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '9px 11px',
  marginBottom: 10,
  borderRadius: 'var(--radius-md)',
  background: 'rgba(245,158,11,0.10)',
  border: '1px solid rgba(245,158,11,0.35)',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-primary)',
};

export default BillingTaxCard;

const exampleRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '3px 0',
  fontSize: 12.5,
};

const syncNote: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '9px 11px',
  marginBottom: 10,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--background)',
  border: '1px solid var(--border)',
  fontSize: 12,
  lineHeight: 1.55,
  color: 'var(--text-secondary)',
};
