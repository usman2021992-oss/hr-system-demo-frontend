import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Info,
  Send,
  ShieldCheck,
  Building2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Server,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  getPlatformEmailConfig,
  savePlatformEmailConfig,
  sendPlatformTestEmail,
  verifyPlatformEmailConfig,
  PlatformSmtpConfig,
} from '../../api/email';
import billingApi, { NoticeRecipients } from '../../api/billing';
import { getCompanies } from '../../api/companies';
import { Company } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { SmtpErrorNotice } from './SmtpErrorNotice';
import { smtpErrorSummary } from './smtpErrors';

/**
 * The platform's own mailbox.
 *
 * Every other email in this product is sent *as a company*, through that
 * company's SMTP server. Billing mail is not: "your subscription payment
 * failed, settle it by Friday" is VeylOHR writing to its customer. Routing
 * that through the customer's own mail server fails in exactly the case that
 * matters - a customer who never configured SMTP is a customer who never
 * receives the one warning that their service is about to stop - and it cannot
 * deliver the operator copy at all.
 *
 * So this page exists to be filled in once. Everything on it is arranged
 * around one question an operator has to be able to answer before a real
 * customer depends on it: *if a payment failed right now, would anyone
 * actually be told?* Hence the delivery diagram, the Verify button that
 * records that it was proved, and the real test send.
 */
export const PlatformEmailSettings: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<PlatformSmtpConfig | null>(null);
  const [form, setForm] = useState({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    billingAlertEmail: '',
  });

  const [testTo, setTestTo] = useState('');
  // The last rejection from a Verify or a test send, kept on screen. A toast
  // scrolls away after a few seconds, and this is the thing the operator has
  // to read carefully and act on.
  const [lastFailure, setLastFailure] = useState<string | null>(null);

  // The delivery preview: which company's people would be written to.
  const [companies, setCompanies] = useState<Company[]>([]);
  const [previewCompanyId, setPreviewCompanyId] = useState<number | undefined>();
  const [recipients, setRecipients] = useState<NoticeRecipients | null>(null);

  const applyConfig = (cfg: PlatformSmtpConfig) => {
    setConfig(cfg);
    setForm({
      smtpHost: cfg.smtpHost || '',
      smtpPort: cfg.smtpPort || 587,
      smtpUser: cfg.smtpUser || '',
      // Never populated from the server: the password is not sent to the
      // browser. Left blank means "keep the stored one".
      smtpPass: '',
      smtpFrom: cfg.smtpFrom || '',
      billingAlertEmail: cfg.billingAlertEmail || '',
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, list] = await Promise.all([getPlatformEmailConfig(), getCompanies()]);
        if (cancelled) return;
        applyConfig(cfg);
        setCompanies(list);
        if (list.length > 0) setPreviewCompanyId(list[0].id);
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.error ||
              t('email.platformLoadFailed', 'Impossibile caricare la configurazione della piattaforma')
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Resolve the recipients exactly as a real alert would, so the diagram below
  // shows what would happen rather than what ought to.
  useEffect(() => {
    if (!previewCompanyId) return;
    let cancelled = false;
    billingApi
      .getNoticeRecipients(previewCompanyId)
      .then((r) => {
        if (!cancelled) setRecipients(r);
      })
      .catch(() => {
        if (!cancelled) setRecipients(null);
      });
    return () => {
      cancelled = true;
    };
  }, [previewCompanyId, config?.updatedAt]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await savePlatformEmailConfig(form);
      applyConfig(saved);
      showToast(
        t('email.platformSaved', 'Configurazione email della piattaforma salvata'),
        'success'
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        t('email.platformSaveFailed', 'Impossibile salvare la configurazione');
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await verifyPlatformEmailConfig();
      applyConfig(res.config);
      if (res.ok) {
        setLastFailure(null);
        showToast(
          t('email.platformVerifyOk', 'Credenziali verificate: il server accetta l’accesso'),
          'success'
        );
      } else {
        // The raw SMTP text is precise and unreadable. The toast carries the
        // plain explanation; the panel below keeps both, including the
        // server's own words for whoever has to fix the mailbox.
        setLastFailure(res.error);
        showToast(
          smtpErrorSummary(res.error, t) ||
            t('email.platformVerifyFailed', 'Verifica non riuscita'),
          'error'
        );
      }
    } catch (err: any) {
      const raw = err?.response?.data?.error ?? null;
      setLastFailure(raw);
      showToast(
        smtpErrorSummary(raw, t) || t('email.platformVerifyFailed', 'Verifica non riuscita'),
        'error'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleTestSend = async () => {
    if (!testTo.trim()) {
      showToast(t('email.platformTestNeedAddress', 'Inserisci un indirizzo di destinazione'), 'error');
      return;
    }
    setTesting(true);
    try {
      const res = await sendPlatformTestEmail(testTo.trim());
      if (res.sent) {
        setLastFailure(null);
        showToast(
          t('email.platformTestSent', 'Email di prova inviata a {{to}}', { to: testTo.trim() }),
          'success'
        );
      } else {
        setLastFailure(res.error);
        showToast(
          smtpErrorSummary(res.error, t) ||
            t('email.platformTestFailed', 'Invio della email di prova non riuscito'),
          'error'
        );
      }
    } catch (err: any) {
      const raw = err?.response?.data?.error ?? null;
      setLastFailure(raw);
      showToast(
        smtpErrorSummary(raw, t) ||
          t('email.platformTestFailed', 'Invio della email di prova non riuscito'),
        'error'
      );
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', display: 'grid', gap: 20 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 40, borderRadius: 8, background: 'var(--border)', opacity: 0.3 }} />
        ))}
      </div>
    );
  }

  const configured = config?.configured === true;
  const verified = !!config?.verifiedAt;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <Alert variant="danger" onClose={() => setError(null)}>{error}</Alert>}

      {/* What this mailbox is for. Written out because the distinction between
          this and the per-company SMTP is the whole reason the tab exists. */}
      <section style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Server size={18} color="var(--accent)" />
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
            {t('email.platformTitle', 'Casella email della piattaforma')}
          </h3>
          {configured ? (
            verified ? (
              <Badge variant="success">
                <CheckCircle2 size={11} /> {t('email.platformVerified', 'Verificata')}
              </Badge>
            ) : (
              <Badge variant="warning">{t('email.platformNotVerified', 'Da verificare')}</Badge>
            )
          ) : (
            <Badge variant="danger">{t('email.platformNotConfigured', 'Non configurata')}</Badge>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {t(
            'email.platformExplain',
            'Queste credenziali vengono usate per le email che la piattaforma invia ai propri clienti: l’avviso di pagamento non riuscito al titolare dell’azienda e la copia al gestore. Non sostituiscono l’SMTP delle aziende, che continua a inviare le email interne di ciascuna azienda (permessi, turni, documenti).'
          )}
        </p>

        {!configured && (
          <div style={{ ...warnBox, marginTop: 12 }}>
            <AlertTriangle size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
            {t(
              'email.platformMissingWarning',
              'Finché questa casella non è configurata, la copia al gestore non può essere inviata e l’avviso al titolare viene inviato tramite l’SMTP dell’azienda (se configurato).'
            )}
          </div>
        )}

        {/* Whatever went wrong most recently, explained rather than quoted. */}
        {(lastFailure || config?.lastError) && (
          <div style={{ marginTop: 12 }}>
            <SmtpErrorNotice error={lastFailure ?? config?.lastError} />
          </div>
        )}
      </section>

      {/* The credentials themselves. */}
      <section style={panel}>
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 20 }}>
          <div style={twoCol}>
            <Input
              label={t('email.smtpHost', 'SMTP Host')}
              placeholder="es. smtp.veylo.it"
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              required
            />
            <Input
              label={t('email.smtpPort', 'SMTP Port')}
              type="number"
              placeholder="587"
              value={form.smtpPort}
              onChange={(e) => setForm({ ...form, smtpPort: parseInt(e.target.value, 10) || 0 })}
              required
            />
          </div>

          <div style={twoCol}>
            <Input
              label={t('email.smtpUser', 'SMTP User / Username')}
              placeholder="es. billing@veylo.it"
              value={form.smtpUser}
              onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
              required
            />
            <div style={{ position: 'relative' }}>
              <Input
                label={t('email.smtpPass', 'SMTP Password')}
                type={showPass ? 'text' : 'password'}
                placeholder={
                  config?.hasPassword
                    ? t('email.platformPassKeep', '•••••••• (lascia vuoto per non modificarla)')
                    : '••••••••'
                }
                value={form.smtpPass}
                onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={eyeBtn}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Input
            label={t('email.platformFrom', 'Mittente (From)')}
            placeholder="es. VeylOHR <billing@veylo.it>"
            value={form.smtpFrom}
            onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
          />

          <div>
            <Input
              label={t('email.platformAlertEmail', 'Copia al gestore per pagamenti falliti')}
              placeholder="es. francesco@veylo.it"
              value={form.billingAlertEmail}
              onChange={(e) => setForm({ ...form, billingAlertEmail: e.target.value })}
            />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {t(
                'email.platformAlertEmailHelp',
                'Ogni volta che il pagamento di un cliente non va a buon fine, una copia dell’avviso viene inviata a questo indirizzo, così è possibile contattare il cliente prima del blocco. Più indirizzi separati da virgola.'
              )}
            </p>
          </div>

          <div style={infoBox}>
            <Info size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {t(
                'email.platformSecurityNote',
                'La password non viene mai restituita al browser. Salva, poi usa “Verifica credenziali” per confermare che il server le accetti e “Invia email di prova” per confermare che un messaggio arrivi davvero.'
              )}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" onClick={handleVerify} loading={verifying} disabled={!configured}>
              <ShieldCheck size={14} /> {t('email.platformVerifyBtn', 'Verifica credenziali')}
            </Button>
            <Button type="submit" loading={saving} style={{ minWidth: 140 }}>
              {t('common.save', 'Salva configurazione')}
            </Button>
          </div>
        </form>
      </section>

      {/* A real send. Verifying only proves the server accepts a login; it does
          not prove a message arrives, which is the thing that actually has to
          be true before a customer's dunning notice depends on it. */}
      <section style={panel}>
        <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
          {t('email.platformTestTitle', 'Invia email di prova')}
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {t(
            'email.platformTestHelp',
            'Invia un messaggio reale dalla casella della piattaforma all’indirizzo indicato. La verifica controlla solo l’accesso al server; questo conferma che una email arrivi davvero.'
          )}
        </p>
        {/* There are two test buttons in the product and they answer different
            questions. Saying so here stops the wrong one being used to draw a
            conclusion about the other. */}
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {t(
            'email.platformTestScope',
            'Questa prova verifica solo la casella email. Per provare l’intero avviso di pagamento non riuscito (email al titolare + copia al gestore + notifica in-app) usa “Invia avviso di prova” in Impostazioni → Fatturazione.'
          )}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <Input
              label={t('email.platformTestTo', 'Destinatario')}
              placeholder="es. francesco@veylo.it"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={handleTestSend} loading={testing} disabled={!configured}>
            <Send size={14} /> {t('email.platformTestBtn', 'Invia prova')}
          </Button>
        </div>
      </section>

      {/* Who a real failed-payment alert would reach, for a company you pick.
          Resolved by the same code the alert uses, so this is a rehearsal of
          the actual routing rather than a drawing of the intended one. */}
      <section style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Building2 size={17} color="var(--accent)" />
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
            {t('email.platformFlowTitle', 'Chi riceve gli avvisi')}
          </h3>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
          {t(
            'email.platformFlowHelp',
            'Seleziona un’azienda per vedere esattamente chi verrebbe avvisato se un suo pagamento non andasse a buon fine.'
          )}
        </p>

        <select
          value={previewCompanyId || ''}
          onChange={(e) => setPreviewCompanyId(Number(e.target.value))}
          style={selectStyle}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {recipients && (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <FlowRow
              from={{
                label: t('email.flowPlatform', 'Piattaforma VeylOHR'),
                value:
                  recipients.platform.from ||
                  t('email.flowNoSender', 'nessun mittente configurato'),
                ok: recipients.platform.configured,
              }}
              purpose={t('email.flowPurposeOwner', 'Avviso di pagamento non riuscito')}
              to={{
                label: t('email.flowOwner', 'Titolare account · {{company}}', {
                  company: recipients.companyName ?? '',
                }),
                value:
                  recipients.ownerEmail ||
                  t('email.flowNoOwner', 'nessun titolare o admin con email'),
                ok: !!recipients.ownerEmail,
              }}
            />

            <FlowRow
              from={{
                label: t('email.flowPlatform', 'Piattaforma VeylOHR'),
                value:
                  recipients.platform.from ||
                  t('email.flowNoSender', 'nessun mittente configurato'),
                ok: recipients.platform.configured,
              }}
              purpose={t('email.flowPurposeCopy', 'Copia al gestore, per contattare il cliente')}
              to={{
                label: t('email.flowOperator', 'Gestore della piattaforma'),
                value:
                  recipients.platform.alertEmail ||
                  t('email.flowNoAlert', 'nessun indirizzo configurato'),
                ok: !!recipients.platform.alertEmail,
              }}
            />

            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t(
                'email.flowInApp',
                'In più, {{n}} utenti di questa azienda ricevono la notifica dentro la piattaforma (titolare e amministratori). Questa non dipende dall’email e non può fallire.',
                { n: recipients.inAppRecipients }
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

/** One "sender → purpose → recipient" line of the delivery diagram. */
const FlowRow: React.FC<{
  from: { label: string; value: string; ok: boolean };
  purpose: string;
  to: { label: string; value: string; ok: boolean };
}> = ({ from, purpose, to }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'stretch',
      gap: 10,
      flexWrap: 'wrap',
      padding: 12,
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      background: 'var(--background)',
    }}
  >
    <FlowNode {...from} />
    <div style={arrowCol}>
      <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 150 }}>
        {purpose}
      </span>
      <ArrowRight size={15} style={{ color: 'var(--text-muted)' }} />
    </div>
    <FlowNode {...to} />
  </div>
);

const FlowNode: React.FC<{ label: string; value: string; ok: boolean }> = ({ label, value, ok }) => (
  <div style={{ flex: 1, minWidth: 180 }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
      {label}
    </div>
    <div
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        wordBreak: 'break-all',
        color: ok ? 'var(--text-primary)' : '#dc2626',
      }}
    >
      {value}
    </div>
  </div>
);

const panel: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 14,
  border: '1px solid var(--border)',
  padding: 20,
};

const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 20,
};

const infoBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 10,
  borderRadius: 8,
  background: 'rgba(201,151,58,0.05)',
  border: '1px solid rgba(201,151,58,0.1)',
};

const warnBox: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  padding: '9px 11px',
  borderRadius: 'var(--radius-sm)',
  background: 'rgba(245,158,11,0.10)',
  border: '1px solid rgba(245,158,11,0.35)',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-primary)',
};

const eyeBtn: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: 36,
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  zIndex: 10,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 400,
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--background)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  cursor: 'pointer',
};

const arrowCol: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'nowrap',
};

export default PlatformEmailSettings;
