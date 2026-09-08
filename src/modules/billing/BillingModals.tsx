import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { ExternalLink, UserPlus, UserMinus, Smartphone, Users } from 'lucide-react';
import billingApi from '../../api/billing';
import { getAvatarUrl, getStoreLogoUrl } from '../../api/client';
import { billingErrorMessage, billingTransactionLabel } from './billingErrors';
import { NoticeDeliveryDetail } from './NoticeDelivery';
import { updateCompany } from '../../api/companies';
import type { BillingOverview, BillingTransaction, LicenseSnapshot } from '../../types';

/** Resolves the active language to a date locale. */
const dateLocale = (lang: string | undefined) => (lang?.startsWith('en') ? 'en-GB' : 'it-IT');

const fmtDate = (v: string | null | undefined, lang?: string) =>
  v
    ? new Date(v).toLocaleDateString(dateLocale(lang), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

const fmtDateTime = (v: string | null | undefined, lang?: string) =>
  v
    ? new Date(v).toLocaleString(dateLocale(lang), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  fontSize: 12.5,
  padding: '5px 0',
  borderBottom: '1px solid var(--border-light)',
};

/* ------------------------------------------------------------------ */
/* Fiscal data — editable directly from the Billing page              */
/* ------------------------------------------------------------------ */

interface FiscalModalProps {
  open: boolean;
  onClose: () => void;
  companyId: number | null;
  company: BillingOverview['company'] | undefined;
  onSaved: () => void;
  showToast: (msg: string, kind?: 'success' | 'error') => void;
}

export const FiscalDataModal: React.FC<FiscalModalProps> = ({
  open,
  onClose,
  companyId,
  company,
  onSaved,
  showToast,
}) => {
  const { t, i18n } = useTranslation();
  const [vat, setVat] = useState('');
  const [sdi, setSdi] = useState('');
  const [pec, setPec] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setVat(company?.vatNumber || '');
      setSdi(company?.sdiRecipientCode || '');
      setPec(company?.pecEmail || '');
    }
  }, [open, company]);

  const handleSave = async () => {
    if (!companyId) return;
    try {
      setSaving(true);
      // updateCompany requires the company name in its payload; sending the
      // current one keeps this a fiscal-fields-only edit.
      await updateCompany(companyId, {
        name: company?.name || '',
        vat_number: vat.trim() || null,
        sdi_recipient_code: sdi.trim() || null,
        pec_email: pec.trim() || null,
      } as any);
      showToast(t('billing.fiscalSaved', 'Dati fiscali aggiornati'), 'success');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(billingErrorMessage(err, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billing.editFiscalData', 'Modifica dati fiscali')}
      maxWidth="480px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel', 'Annulla')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving', 'Salvataggio...') : t('common.save', 'Salva')}
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
        {t(
          'billing.fiscalModalHint',
          'Questi tre campi sono obbligatori per attivare l’abbonamento. Vengono solo salvati: nessuna trasmissione a SDI o PEC.'
        )}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          label={t('billing.vatNumber', 'Partita IVA')}
          value={vat}
          onChange={(e) => setVat(e.target.value)}
          placeholder="12345678903"
          hint={t(
            'billing.vatHint',
            '11 cifre con codice di controllo valido. Il prefisso IT e gli spazi sono facoltativi.'
          )}
        />
        <Input
          label={t('billing.sdiCode', 'Codice Destinatario SDI')}
          value={sdi}
          onChange={(e) => setSdi(e.target.value)}
          placeholder="ABC1234"
        />
        <Input
          label={t('billing.pecEmail', 'Indirizzo PEC')}
          type="email"
          value={pec}
          onChange={(e) => setPec(e.target.value)}
          placeholder="azienda@pec.it"
        />
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Receipt — built from what is stored locally for every transaction   */
/* ------------------------------------------------------------------ */

/** Small colour chip naming a card brand, drawn rather than imported. */
const CardBrand: React.FC<{ brand: string }> = ({ brand }) => {
  const tone: Record<string, string> = {
    visa: '#1a1f71',
    mastercard: '#eb001b',
    amex: '#2e77bb',
    discover: '#ff6000',
    paypal: '#003087',
  };
  const colour = tone[brand.toLowerCase()] ?? 'var(--text-muted)';
  return (
    <span
      aria-hidden
      style={{
        width: 26,
        height: 16,
        borderRadius: 3,
        background: colour,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
};

export const ReceiptModal: React.FC<{
  open: boolean;
  onClose: () => void;
  tx: BillingTransaction | null;
  companyName?: string;
  fiscal?: { vatNumber?: string | null; sdiRecipientCode?: string | null; pecEmail?: string | null };
}> = ({ open, onClose, tx, companyName, fiscal }) => {
  const { t, i18n } = useTranslation();
  if (!tx) return null;

  // Each receipt is shown in the currency it was actually charged in.
  const money = (cents?: number | null) => formatMoney((cents ?? 0) / 100, tx.currency);
  const empCents = tx.unitPriceEmployeeCents ?? null;
  const devCents = tx.unitPriceDeviceCents ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billing.receiptTitle', 'Ricevuta di pagamento')}
      maxWidth="380px"
      footer={
        <>
          {tx.invoiceUrl && (
            <a href={tx.invoiceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Button variant="secondary">
                {t('billing.openProviderReceipt', 'Ricevuta del gestore')} <ExternalLink size={13} />
              </Button>
            </a>
          )}
          <Button onClick={onClose}>{t('common.close', 'Chiudi')}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 15 }}>{companyName || '—'}</strong>
          {tx.status === 'paid' ? (
            <Badge variant="success">{t('billing.paid', 'Pagato')}</Badge>
          ) : tx.status === 'failed' ? (
            <Badge variant="danger">{t('billing.failed', 'Fallito')}</Badge>
          ) : (
            <Badge variant="neutral">{tx.status}</Badge>
          )}
        </div>

        <div style={row}>
          <span style={{ color: 'var(--text-muted)' }}>{t('billing.receiptNumber', 'Riferimento')}</span>
          <strong>#{tx.id}</strong>
        </div>
        <div style={row}>
          <span style={{ color: 'var(--text-muted)' }}>{t('billing.date', 'Data')}</span>
          <strong>{fmtDateTime(tx.paidAt || tx.createdAt, i18n.language)}</strong>
        </div>
        {tx.periodStart && tx.periodEnd && (
          <div style={row}>
            <span style={{ color: 'var(--text-muted)' }}>{t('billing.periodCovered', 'Periodo coperto')}</span>
            <strong>
              {fmtDate(tx.periodStart, i18n.language)} – {fmtDate(tx.periodEnd, i18n.language)}
            </strong>
          </div>
        )}
        <div style={row}>
          <span style={{ color: 'var(--text-muted)' }}>{t('billing.method', 'Metodo')}</span>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {tx.paymentMethodBrand ? (
              <>
                <CardBrand brand={tx.paymentMethodBrand} />
                <span style={{ textTransform: 'capitalize' }}>{tx.paymentMethodBrand}</span>
                {tx.paymentMethodLast4 ? <span style={{ color: 'var(--text-muted)' }}>•••• {tx.paymentMethodLast4}</span> : null}
              </>
            ) : (
              <span style={{ textTransform: 'capitalize' }}>{tx.provider}</span>
            )}
          </strong>
        </div>

        {(tx.seatQuantity != null || tx.deviceQuantity != null) && (
          <>
            <div style={{ ...row, marginTop: 8, borderBottom: 'none', paddingBottom: 0 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                {t('billing.receiptLines', 'Dettaglio')}
              </span>
            </div>
            {tx.seatQuantity != null && (
              <div style={row}>
                <span>
                  {t('billing.activeEmployees', 'Dipendenti attivi')} × {tx.seatQuantity}
                  {empCents ? ` @ ${money(empCents)}` : ''}
                </span>
                <strong>{empCents ? money(empCents * (tx.seatQuantity || 0)) : '—'}</strong>
              </div>
            )}
            {tx.deviceQuantity != null && (
              <div style={row}>
                <span>
                  {t('billing.activeTerminals', 'Terminali attivi')} × {tx.deviceQuantity}
                  {devCents ? ` @ ${money(devCents)}` : ''}
                </span>
                <strong>{devCents ? money(devCents * (tx.deviceQuantity || 0)) : '—'}</strong>
              </div>
            )}
          </>
        )}

        {/* Without these two lines the licence rows above do not add up to the
            total, because the provider charged tax on them. Shown only when
            the provider reported the split: an older payment has none, and a
            split worked out here could disagree with the real invoice. */}
        {tx.taxCents != null && (
          <>
            <div style={{ ...row, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('billing.taxableAmount', 'Imponibile')}</span>
              <strong>{money(tx.subtotalCents ?? tx.amountCents - tx.taxCents)}</strong>
            </div>
            <div style={row}>
              <span style={{ color: 'var(--text-muted)' }}>
                {tx.taxPercent != null
                  ? t('billing.taxLine', 'IVA {{percent}}%', { percent: tx.taxPercent })
                  : t('billing.taxLineNoRate', 'IVA')}
              </span>
              <strong>{money(tx.taxCents)}</strong>
            </div>
          </>
        )}

        <div style={{ ...row, borderBottom: 'none', marginTop: 8, paddingTop: 12, borderTop: '2px solid var(--border)' }}>
          <strong style={{ fontSize: 14 }}>{t('billing.total', 'Totale')}</strong>
          <strong style={{ fontSize: 18, color: 'var(--accent)' }}>
            {money(tx.amountCents)} {tx.currency}
          </strong>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {billingTransactionLabel(tx, t)}
        </div>

        {/* For a failed payment: who was warned, when, and whether the mail
            server actually took it. Absent on anything that did not fail. */}
        <NoticeDeliveryDetail notice={tx.notice} />
        {tx.failureMessage && (
          <div style={{ fontSize: 12, color: 'var(--danger, #dc2626)', marginTop: 6 }}>{tx.failureMessage}</div>
        )}

        {(fiscal?.vatNumber || fiscal?.sdiRecipientCode || fiscal?.pecEmail) && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            {fiscal?.vatNumber && <div>{t('billing.vatNumber', 'Partita IVA')}: {fiscal.vatNumber}</div>}
            {fiscal?.sdiRecipientCode && <div>{t('billing.sdiCode', 'Codice SDI')}: {fiscal.sdiRecipientCode}</div>}
            {fiscal?.pecEmail && <div>{t('billing.pecEmail', 'PEC')}: {fiscal.pecEmail}</div>}
          </div>
        )}

        {!tx.invoiceUrl && (
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            {t(
              'billing.noProviderReceipt',
              'La ricevuta del gestore non è disponibile per questa transazione. I dati sopra sono conservati nel sistema.'
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

/**
 * Picture for a ledger row: the employee's photo, or the store's logo for a
 * terminal. Falls back to initials so a row without a picture still reads.
 */
const Avatar: React.FC<{
  src: string | null;
  label: string;
  icon: React.ReactNode;
  tone: { fg: string; bg: string; ring: string };
}> = ({ src, label, icon, tone }) => {
  const [broken, setBroken] = useState(false);
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const base: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    boxShadow: `0 0 0 1.5px ${tone.ring}`,
  };

  if (src && !broken) {
    return <img src={src} alt="" style={base} onError={() => setBroken(true)} />;
  }

  return (
    <span style={{
      ...base,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: tone.bg,
      color: tone.fg,
      fontSize: 9.5,
      fontWeight: 800,
    }}>
      {icon ?? (initials || '?')}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Headcount ledger — why the billed quantities are what they are      */
/* ------------------------------------------------------------------ */

export const HeadcountHistoryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  companyId: number | null;
  licenses?: LicenseSnapshot | null;
  subscriptionStatus?: string | null;
}> = ({ open, onClose, companyId, licenses, subscriptionStatus }) => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof billingApi.getHeadcountHistory>> | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    billingApi
      .getHeadcountHistory(companyId || undefined, 200)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, companyId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billing.headcountHistory', 'Storico risorse fatturabili')}
      maxWidth="640px"
      footer={<Button onClick={onClose}>{t('common.close', 'Chiudi')}</Button>}
    >
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
        {t(
          'billing.headcountHistoryHint',
          'Ogni variazione delle quantità fatturate: chi è stato aggiunto o rimosso, quando, e il totale risultante.'
        )}
      </p>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <Spinner size="md" color="var(--primary)" />
        </div>
      ) : !data || data.events.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {t('billing.headcountEmpty', 'Nessuna variazione registrata.')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150, padding: '10px 12px', background: 'var(--surface-warm)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Users size={12} /> {t('billing.employeeLicenses', 'Licenze dipendenti')}
              </div>
              <strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {licenses ? `${licenses.employeesInUse} / ${licenses.employeesLicensed}` : data.totals.employeeCount}
              </strong>
            </div>
            <div style={{ flex: 1, minWidth: 150, padding: '10px 12px', background: 'var(--surface-warm)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Smartphone size={12} /> {t('billing.terminalLicenses', 'Licenze terminali')}
              </div>
              <strong style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
                {licenses ? `${licenses.terminalsInUse} / ${licenses.terminalsLicensed}` : data.totals.deviceCount}
              </strong>
            </div>
          </div>

          {!licenses?.hasSubscription && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              {t(
                'billing.historyNoSubscription',
                'Nessun abbonamento attivo: le risorse elencate non sono ancora coperte da licenze pagate.'
              )}
            </div>
          )}

          {subscriptionStatus && subscriptionStatus !== 'active' && licenses?.hasSubscription && (
            <div style={{ marginBottom: 12, fontSize: 12, color: '#b45309' }}>
              {t('billing.historyStatusNote', 'Stato abbonamento: {{status}}', {
                status: t(`billing.status_${subscriptionStatus}`, subscriptionStatus),
              })}
            </div>
          )}

          <div style={{ maxHeight: 340, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('billing.date', 'Data')}</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('billing.change', 'Variazione')}</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('billing.who', 'Risorsa')}</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>{t('billing.totalAfter', 'Totale')}</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>{t('billing.billedQ', 'Fatturato')}</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => {
                  const isTerminal = e.resourceType === 'terminal';
                  // Employees green, terminals blue, so the two billed
                  // quantities are separable at a glance.
                  const tone = isTerminal
                    ? { fg: '#2563eb', bg: 'rgba(37,99,235,0.10)', ring: 'rgba(37,99,235,0.25)' }
                    : { fg: '#16a34a', bg: 'rgba(22,163,74,0.10)', ring: 'rgba(22,163,74,0.25)' };
                  const removed = e.changeType === 'removed';
                  const picture = isTerminal
                    ? getStoreLogoUrl(e.storeLogoFilename)
                    : getAvatarUrl(e.avatarFilename);
                  const label = e.userLabel || (isTerminal ? e.storeName : null) || '—';

                  return (
                    <tr key={e.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {fmtDate(e.occurredAt, i18n.language)}
                      </td>

                      <td style={{ padding: '8px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '2px 8px', borderRadius: 20,
                          background: removed ? 'rgba(220,38,38,0.10)' : tone.bg,
                          color: removed ? '#dc2626' : tone.fg,
                          fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
                        }}>
                          {removed ? <UserMinus size={11} /> : <UserPlus size={11} />}
                          {e.delta > 0 ? `+${e.delta}` : e.delta}{' '}
                          {isTerminal
                            ? t('billing.terminalsShort', 'terminali')
                            : t('billing.employeesShort', 'dipendenti')}
                        </span>
                      </td>

                      <td style={{ padding: '8px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <Avatar
                            src={picture}
                            label={label}
                            icon={isTerminal ? <Smartphone size={12} /> : null}
                            tone={tone}
                          />
                          <span style={{
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', color: 'var(--text-secondary)',
                          }}>
                            {label}
                          </span>
                        </span>
                      </td>

                      <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {e.resultingCount}
                      </td>

                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        {e.billedAt ? (
                          <Badge variant="success">{t('billing.billedYes', 'Sì')}</Badge>
                        ) : (
                          <span title={t('billing.billedNoHint')}>
                            <Badge variant="neutral">{t('billing.billedNo', 'In attesa')}</Badge>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
};
