import React, { useEffect, useState } from 'react';
import { formatMoney } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Users,
  Smartphone,
  Calendar,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react';
import billingApi from '../../api/billing';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import type { BillingOverview } from '../../types';

/** "25 August 2026" / "25 agosto 2026" */
const fmtDay = (v: string | null | undefined, locale: string) =>
  v
    ? new Date(v).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

const daysUntil = (v?: string | null) =>
  v ? Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000)) : 0;

/**
 * Plan, licenses, billing period and recent receipts, condensed for the
 * Settings page. Read-only: everything actionable lives on the Billing page,
 * which this links to.
 */
export const BillingSummaryCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language?.startsWith('en') ? 'en' : 'it';

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    billingApi
      .getBillingOverview()
      .then((d) => { if (!cancelled) setOverview(d); })
      .catch(() => { if (!cancelled) setOverview(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sub = overview?.subscription;
  const lic = overview?.licenses;
  const company = overview?.company;
  const currency = company?.currency || 'EUR';

  const monthly =
    (lic?.employeesLicensed ?? 0) * (company?.pricePerEmployee ?? 0) +
    (lic?.terminalsLicensed ?? 0) * (company?.pricePerDevice ?? 0);

  const statusBadge = () => {
    if (!sub) return <Badge variant="neutral">{t('billing.noSubscription', 'Nessun abbonamento')}</Badge>;
    if (sub.status === 'active') return <Badge variant="success">{t('billing.status_active', 'attivo')}</Badge>;
    if (sub.status === 'past_due') return <Badge variant="warning">{t('billing.status_past_due', 'in sospeso')}</Badge>;
    if (sub.status === 'unpaid') return <Badge variant="danger">{t('billing.status_unpaid', 'non pagato')}</Badge>;
    return <Badge variant="neutral">{sub.status}</Badge>;
  };

  const cell: React.CSSProperties = {
    flex: 1,
    minWidth: 150,
    padding: '10px 12px',
    background: 'var(--surface-warm)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm)',
  };
  const cellLabel: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  };
  const cellValue: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '4px solid #15803d',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginBottom: 24,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CreditCard size={18} style={{ color: '#15803d' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('billing.planAndBilling', 'Piano, licenze e fatturazione')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('billing.planAndBillingSub', 'Licenze acquistate, utilizzo, periodo e ricevute')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusBadge()}
          <button
            type="button"
            onClick={() => navigate('/impostazioni/fatturazione')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-warm)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {t('billing.openBilling', 'Apri fatturazione')}
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <Spinner size="md" color="var(--primary)" />
          </div>
        ) : !overview ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('billing.summaryUnavailable', 'Dati di fatturazione non disponibili.')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Licenses */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={cell}>
                <div style={cellLabel}>
                  <Users size={12} /> {t('billing.employeeLicenses', 'Licenze dipendenti')}
                </div>
                <div style={cellValue}>
                  {lic ? `${lic.employeesInUse} / ${lic.employeesLicensed}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('billing.usedOfPurchased', 'utilizzate su acquistate')}
                </div>
              </div>

              <div style={cell}>
                <div style={cellLabel}>
                  <Smartphone size={12} /> {t('billing.terminalLicenses', 'Licenze terminali')}
                </div>
                <div style={cellValue}>
                  {lic ? `${lic.terminalsInUse} / ${lic.terminalsLicensed}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('billing.usedOfPurchased', 'utilizzate su acquistate')}
                </div>
              </div>

              <div style={cell}>
                <div style={cellLabel}>
                  <CreditCard size={12} /> {t('billing.totalMonthly', 'Totale mensile')}
                </div>
                <div style={{ ...cellValue, color: 'var(--accent)' }}>
                  {formatMoney(monthly, currency)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {currency}
                </div>
              </div>
            </div>

            {/* Period */}
            {sub && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={cell}>
                  <div style={cellLabel}>
                    <Calendar size={12} /> {t('billing.currentPeriod', 'Periodo corrente')}
                  </div>
                  <div style={{ ...cellValue, fontSize: 13 }}>
                    {fmtDay(sub.currentPeriodStart, locale)} — {fmtDay(sub.currentPeriodEnd, locale)}
                  </div>
                </div>
                <div style={cell}>
                  <div style={cellLabel}>{t('billing.daysLeft', 'Giorni rimanenti')}</div>
                  <div style={cellValue}>{daysUntil(sub.currentPeriodEnd)}</div>
                </div>
                <div style={cell}>
                  <div style={cellLabel}>{t('billing.paymentMethod', 'Metodo di pagamento')}</div>
                  <div style={{ ...cellValue, fontSize: 13 }}>
                    {overview.paymentMethod
                      ? `${overview.paymentMethod.brand.toUpperCase()} •••• ${overview.paymentMethod.last4}`
                      : sub.provider === 'paypal'
                        ? 'PayPal'
                        : '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Receipts */}
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                {t('billing.recentReceipts', 'Ricevute recenti')}
              </div>

              {overview.transactions && overview.transactions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {overview.transactions.slice(0, 4).map((tx) => (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-light)',
                        background: 'var(--surface-warm)',
                        fontSize: 12.5,
                      }}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {fmtDay(tx.paidAt || tx.createdAt, locale)}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatMoney((tx.amountCents ?? 0) / 100, tx.currency || currency)}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {tx.status === 'paid' ? (
                          <Badge variant="success">{t('billing.paid', 'Pagato')}</Badge>
                        ) : tx.status === 'failed' ? (
                          <Badge variant="danger">{t('billing.failed', 'Fallito')}</Badge>
                        ) : (
                          <Badge variant="neutral">{tx.status}</Badge>
                        )}
                        {tx.invoiceUrl && (
                          <a
                            href={tx.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent)', display: 'inline-flex' }}
                            title={t('billing.viewReceipt', 'Vedi')}
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {t('billing.noTransactions', 'Nessuna transazione registrata.')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingSummaryCard;
