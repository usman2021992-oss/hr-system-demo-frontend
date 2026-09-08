import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { diagnoseSmtpError } from './smtpErrors';

/**
 * A mail server rejection, made readable.
 *
 * Three lines, in this order, because that is the order the reader needs them:
 * what went wrong, what to do, and then the server's own words for the person
 * who will be asked to fix it. The raw text is kept because it is the only
 * part that is authoritative - everything above it is our interpretation.
 */
export const SmtpErrorNotice: React.FC<{ error: string | null | undefined }> = ({ error }) => {
  const { t } = useTranslation();
  const diagnosis = diagnoseSmtpError(error, t);
  if (!diagnosis) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 9,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(220,38,38,0.07)',
        border: '1px solid rgba(220,38,38,0.30)',
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <AlertTriangle size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{diagnosis.summary}</div>
        <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{diagnosis.action}</div>
        {/* Named separately because it is the line that ends a wasted hour:
            some of these are decided by whoever runs the mail server, not by
            anything on this page. */}
        {diagnosis.contact && (
          <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            <strong>{t('email.smtpErrWhoLabel', 'Chi può risolverlo')}:</strong> {diagnosis.contact}
          </div>
        )}
        <div
          style={{
            marginTop: 6,
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'var(--text-muted)',
            wordBreak: 'break-word',
          }}
        >
          {t('email.smtpErrRawLabel', 'Risposta del server')}: {diagnosis.raw}
        </div>
      </div>
    </div>
  );
};

export default SmtpErrorNotice;
