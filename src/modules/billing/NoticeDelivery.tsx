import React from 'react';
import { useTranslation } from 'react-i18next';
import { MailCheck, MailX, MailWarning, Bell } from 'lucide-react';
import type { BillingNoticeDelivery, BillingNoticeStatus } from '../../types';

/**
 * Who was warned about a failed payment, and whether the warning arrived.
 *
 * The client's requirement was "send an email to the owner". Sending it is
 * half of it; being able to *show* that it was sent is the half that gets
 * asked about when a customer says they were never told. So the outcome the
 * mail server reported is stored on the failed transaction and surfaced here,
 * rather than the app claiming success because it called a function.
 *
 * The three outcomes are deliberately distinct:
 *   sent    - the SMTP server accepted it
 *   skipped - the company has no SMTP configured, so nothing was attempted
 *   failed  - it was attempted and refused
 *
 * "Skipped" is the one that matters most: it looks like nothing went wrong,
 * and it means the customer was never emailed.
 */

function statusColor(status: BillingNoticeStatus | null | undefined): string {
  if (status === 'sent') return '#16a34a';
  if (status === 'failed' || status === 'no_recipient') return '#dc2626';
  return '#d97706';
}

function StatusIcon({ status, size = 12 }: { status: BillingNoticeStatus | null | undefined; size?: number }) {
  const color = statusColor(status);
  if (status === 'sent') return <MailCheck size={size} style={{ color, flexShrink: 0 }} />;
  if (status === 'failed' || status === 'no_recipient')
    return <MailX size={size} style={{ color, flexShrink: 0 }} />;
  return <MailWarning size={size} style={{ color, flexShrink: 0 }} />;
}

export function useNoticeStatusLabel() {
  const { t } = useTranslation();
  return (status: BillingNoticeStatus | null | undefined): string => {
    switch (status) {
      case 'sent':
        return t('billing.noticeSent', 'inviata');
      case 'skipped':
        return t('billing.noticeSkipped', 'non inviata (SMTP non configurato)');
      case 'failed':
        return t('billing.noticeFailed', 'invio fallito');
      case 'no_recipient':
        return t('billing.noticeNoRecipient', 'nessun destinatario');
      default:
        return t('billing.noticeUnknown', 'sconosciuto');
    }
  };
}

/** One compact line for the payment-history table. */
export const NoticeDeliveryLine: React.FC<{
  notice?: BillingNoticeDelivery | null;
  compact?: boolean;
}> = ({ notice, compact }) => {
  const { t } = useTranslation();
  const label = useNoticeStatusLabel();

  if (!notice) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 3,
        fontSize: compact ? 11 : 12,
        color: 'var(--text-muted)',
      }}
    >
      <StatusIcon status={notice.emailStatus} />
      <span style={{ color: statusColor(notice.emailStatus) }}>
        {t('billing.noticeEmailShort', 'Avviso al titolare')}: {label(notice.emailStatus)}
      </span>
      {notice.inAppCount > 0 && (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
          title={t('billing.noticeInAppTitle', 'Notifiche in-app inviate')}
        >
          <Bell size={11} />
          {notice.inAppCount}
        </span>
      )}
    </div>
  );
};

/** The full breakdown, for the receipt modal. */
export const NoticeDeliveryDetail: React.FC<{ notice?: BillingNoticeDelivery | null }> = ({
  notice,
}) => {
  const { t, i18n } = useTranslation();
  const label = useNoticeStatusLabel();

  if (!notice) return null;

  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    padding: '5px 0',
    fontSize: 12,
  };

  const when = notice.emailAt
    ? new Date(notice.emailAt).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}
      >
        {t('billing.noticeSectionTitle', 'Avvisi inviati')}
      </div>

      <div style={row}>
        <span style={{ color: 'var(--text-muted)' }}>
          {t('billing.noticeOwner', 'Titolare account')}
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: statusColor(notice.emailStatus),
            fontWeight: 600,
            textAlign: 'right',
          }}
        >
          <StatusIcon status={notice.emailStatus} />
          {label(notice.emailStatus)}
        </span>
      </div>

      {notice.emailTo && (
        <div style={row}>
          <span style={{ color: 'var(--text-muted)' }}>{t('billing.noticeTo', 'Inviato a')}</span>
          <span style={{ wordBreak: 'break-all', textAlign: 'right' }}>{notice.emailTo}</span>
        </div>
      )}

      {when && (
        <div style={row}>
          <span style={{ color: 'var(--text-muted)' }}>{t('billing.noticeWhen', 'Quando')}</span>
          <span>{when}</span>
        </div>
      )}

      {/* Shown verbatim: an SMTP rejection reason is the whole diagnostic, and
          paraphrasing it would cost the person reading it the answer. */}
      {notice.emailError && (
        <div style={{ ...row, color: '#dc2626' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('billing.noticeError', 'Errore')}</span>
          <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{notice.emailError}</span>
        </div>
      )}

      {notice.copyTo && (
        <div style={row}>
          <span style={{ color: 'var(--text-muted)' }}>
            {t('billing.noticeOperatorCopy', 'Copia al gestore')}
          </span>
          <span style={{ color: statusColor(notice.copyStatus), textAlign: 'right' }}>
            {notice.copyTo} · {label(notice.copyStatus)}
          </span>
        </div>
      )}

      <div style={row}>
        <span style={{ color: 'var(--text-muted)' }}>
          {t('billing.noticeInApp', 'Notifiche in-app')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Bell size={12} />
          {notice.inAppCount}
        </span>
      </div>
    </div>
  );
};
