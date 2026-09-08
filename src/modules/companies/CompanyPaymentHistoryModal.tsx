import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { ExternalLink, ArrowUpRight } from 'lucide-react';
import billingApi from '../../api/billing';
import { billingTransactionLabel } from '../billing/billingErrors';
import { formatMoney } from '../../constants/currencies';
import CurrencyFlag from '../../components/ui/CurrencyFlag';
import type { BillingOverview } from '../../types';

/**
 * Payment history for one company, opened from its card in the companies list.
 *
 * Read-only and deliberately short: it answers "has this company been paying?"
 * without leaving the list. "View all" hands over to the billing module with
 * this company already selected.
 */
export const CompanyPaymentHistoryModal: React.FC<{
  companyId: number | null;
  companyName?: string;
  currency?: string | null;
  onClose: () => void;
}> = ({ companyId, companyName, currency, onClose }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : 'it-IT';

  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    billingApi
      .getAdminCompanyBilling(companyId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const cur = data?.company?.currency || currency || 'EUR';
  const txs = data?.transactions ?? [];

  const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  return (
    <Modal
      open={!!companyId}
      onClose={onClose}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CurrencyFlag code={cur} />
          {t('companies.paymentHistoryFor', { name: companyName || '' })}
        </span>
      }
      maxWidth="560px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          <Button
            onClick={() => {
              onClose();
              navigate(`/impostazioni/fatturazione?companyId=${companyId}`);
            }}
          >
            {t('companies.viewAllPayments', 'View all')}
            <ArrowUpRight size={14} />
          </Button>
        </>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
          <Spinner size="md" color="var(--primary)" />
        </div>
      ) : txs.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {t('billing.noTransactions', 'No transactions recorded.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
          {txs.map((tx) => (
            <div
              key={tx.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-light)',
                background: 'var(--surface-warm)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {billingTransactionLabel(tx, t)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {fmtDate(tx.paidAt || tx.createdAt)}
                </span>
              </span>

              <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <strong style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney((tx.amountCents ?? 0) / 100, tx.currency || cur)}
                </strong>
                {tx.status === 'paid' ? (
                  <Badge variant="success">{t('billing.paid', 'Paid')}</Badge>
                ) : tx.status === 'failed' ? (
                  <Badge variant="danger">{t('billing.failed', 'Failed')}</Badge>
                ) : (
                  <Badge variant="neutral">{tx.status}</Badge>
                )}
                {tx.invoiceUrl && (
                  <a
                    href={tx.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', display: 'inline-flex' }}
                    title={t('billing.viewReceipt', 'View')}
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default CompanyPaymentHistoryModal;
