import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Users, Smartphone, Minus, Plus, AlertTriangle, Info } from 'lucide-react';
import billingApi from '../../api/billing';
import type { LicenseQuote, LicenseSnapshot, PaymentProvider } from '../../types';
import { billingErrorMessage } from './billingErrors';

/**
 * "25 August 2026" / "25 agosto 2026" — day as a number, month spelled out in
 * full, in whatever language the interface is using.
 */
const fmtDay = (v: string | null | undefined, locale: string) =>
  v
    ? new Date(v).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

/** Whole days from now until the given date, never negative. */
const daysUntil = (v?: string | null) =>
  v ? Math.max(0, Math.ceil((new Date(v).getTime() - Date.now()) / 86_400_000)) : 0;

/* ------------------------------------------------------------------ */
/* Capacity bar                                                        */
/* ------------------------------------------------------------------ */

const CapacityBar: React.FC<{
  icon: React.ReactNode;
  label: string;
  inUse: number;
  licensed: number;
  /** Extra licenses being added in this session, drawn as a lighter segment. */
  adding?: number;
  unitPrice: number;
  currency: string;
}> = ({ icon, label, inUse, licensed, adding = 0, unitPrice, currency }) => {
  const { t } = useTranslation();
  const total = Math.max(licensed + adding, 1);
  const usedPct = Math.min(100, (inUse / total) * 100);
  const freePct = Math.min(100 - usedPct, (Math.max(0, licensed - inUse) / total) * 100);
  const addPct = Math.min(100 - usedPct - freePct, (adding / total) * 100);

  const full = inUse >= licensed + adding;
  const usedColor = full ? '#dc2626' : inUse / total > 0.85 ? '#d97706' : 'var(--accent)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {icon}
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>{inUse}</strong>
          {' / '}
          {licensed + adding}
          {adding > 0 && (
            <span style={{ color: '#16a34a', fontWeight: 700 }}> (+{adding})</span>
          )}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'var(--surface-warm)',
          border: '1px solid var(--border-light)',
        }}
        role="progressbar"
        aria-valuenow={inUse}
        aria-valuemin={0}
        aria-valuemax={licensed + adding}
        aria-label={label}
      >
        <div style={{ width: `${usedPct}%`, background: usedColor, transition: 'width .25s' }} />
        <div style={{ width: `${freePct}%`, background: 'rgba(120,120,120,0.22)', transition: 'width .25s' }} />
        <div
          style={{
            width: `${addPct}%`,
            background: 'repeating-linear-gradient(45deg, #16a34a, #16a34a 5px, #22c55e 5px, #22c55e 10px)',
            transition: 'width .25s',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>
          {full
            ? t('billing.capacityFull', 'Nessuna licenza libera')
            : t('billing.capacityFree', '{{n}} libere', { n: licensed + adding - inUse })}
        </span>
        <span>{formatMoney(unitPrice, currency)} {t('billing.perUnitMonth', 'cad./mese')}</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Stepper                                                             */
/* ------------------------------------------------------------------ */

const Stepper: React.FC<{
  value: number;
  min: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ value, min, onChange, disabled }) => {
  const btn = (enabled: boolean): React.CSSProperties => ({
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        style={btn(!disabled && value > min)}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="-1"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        disabled={disabled}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isNaN(n) ? min : Math.max(min, n));
        }}
        style={{
          width: 68,
          textAlign: 'center',
          padding: '7px 6px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--background)',
          color: 'var(--text-primary)',
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      <button
        type="button"
        style={btn(!disabled)}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        aria-label="+1"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* License modal                                                       */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number | null;
  licenses: LicenseSnapshot | null | undefined;
  unitPriceEmployee: number;
  /** Set when the company holds a discount, so the modal can say so. */
  discountPercent?: number;
  discountActive?: boolean;
  listPriceEmployee?: number;
  unitPriceDevice: number;
  currency: string;
  /** First purchase goes through hosted checkout; later changes do not. */
  mode: 'activate' | 'manage';
  onActivate?: (provider: PaymentProvider, employees: number, terminals: number) => void;
  activateDisabled?: boolean;
  activateBlockedReason?: string | null;
  checkoutLoading?: PaymentProvider | null;
  /** Provider of the active subscription, when there is one. */
  provider?: PaymentProvider | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  /** Provider the admin picked on the billing page, highlighted here. */
  preferredProvider?: PaymentProvider | null;
  /** The card the upgrade will be charged to. */
  paymentMethod?: { brand: string; last4: string } | null;
  onChangePaymentMethod?: () => void;
  onChanged: () => void;
  showToast: (msg: string, kind?: 'success' | 'error') => void;
}

export const LicenseModal: React.FC<Props> = ({
  open,
  onClose,
  companyId,
  licenses,
  unitPriceEmployee,
  discountPercent,
  discountActive,
  listPriceEmployee,
  unitPriceDevice,
  currency,
  mode,
  onActivate,
  activateDisabled,
  activateBlockedReason,
  checkoutLoading,
  provider,
  periodStart,
  periodEnd,
  preferredProvider,
  paymentMethod,
  onChangePaymentMethod,
  onChanged,
  showToast,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en' : 'it';

  // Server truth for the allowance, refreshed every time the modal opens.
  const [liveLicenses, setLiveLicenses] = useState<LicenseSnapshot | null>(null);
  const effective = liveLicenses ?? licenses ?? null;

  const minEmployees = effective?.employeesInUse ?? 0;
  const minTerminals = effective?.terminalsInUse ?? 0;
  const currentEmployees = effective?.employeesLicensed ?? 0;
  const currentTerminals = effective?.terminalsLicensed ?? 0;

  const [employees, setEmployees] = useState(0);
  const [terminals, setTerminals] = useState(0);
  const [quote, setQuote] = useState<LicenseQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  /** Asks the provider directly, so a pending state is never a dead end. */
  const handleVerify = async () => {
    try {
      setVerifying(true);
      const res = await billingApi.verifyPendingUpgrade(companyId || undefined);
      if (res.outcome === 'paid') {
        showToast(t('billing.verifyPaid'), 'success');
      } else if (res.outcome === 'failed') {
        showToast(t('billing.verifyFailed'), 'error');
      } else {
        showToast(t('billing.verifyStillPending'), 'info' as any);
      }
      onChanged();
      onClose();
    } catch (err: any) {
      showToast(billingErrorMessage(err, t), 'error');
    } finally {
      setVerifying(false);
    }
  };

  // Pull the current allowance first, so the steppers start from what the
  // server actually holds rather than from a possibly stale prop.
  useEffect(() => {
    if (!open) {
      setLiveLicenses(null);
      return;
    }
    let cancelled = false;
    billingApi
      .getLicenses(companyId || undefined)
      .then((snap) => { if (!cancelled) setLiveLicenses(snap); })
      .catch(() => { /* fall back to the prop */ });
    return () => { cancelled = true; };
  }, [open, companyId]);

  useEffect(() => {
    if (!open) return;
    setEmployees(Math.max(currentEmployees, minEmployees, mode === 'activate' ? 1 : 0));
    setTerminals(Math.max(currentTerminals, minTerminals));
    setQuote(null);
  }, [open, currentEmployees, currentTerminals, minEmployees, minTerminals, mode]);

  const dirty = employees !== currentEmployees || terminals !== currentTerminals;

  const refreshQuote = useCallback(async () => {
    if (!open) return;
    try {
      setQuoting(true);
      setQuoteError(null);
      const q = await billingApi.quoteLicenses(employees, terminals, companyId || undefined);
      setQuote(q);
    } catch (err: any) {
      setQuote(null);
      setQuoteError(billingErrorMessage(err, t));
    } finally {
      setQuoting(false);
    }
  }, [open, employees, terminals, companyId, t]);

  useEffect(() => {
    const id = setTimeout(refreshQuote, 250);
    return () => clearTimeout(id);
  }, [refreshQuote]);

  // Taken from the quote whenever there is one: the server priced the change,
  // so it decides how much is actually being added. Falling back to the local
  // difference only while the first quote is still in flight.
  const addingEmployees = quote ? quote.extraEmployees : Math.max(0, employees - currentEmployees);
  const addingTerminals = quote ? quote.extraTerminals : Math.max(0, terminals - currentTerminals);

  const monthlyTotal = useMemo(
    () => employees * unitPriceEmployee + terminals * unitPriceDevice,
    [employees, terminals, unitPriceEmployee, unitPriceDevice]
  );

  const isReduction =
    employees < currentEmployees || terminals < currentTerminals;

  // PayPal can only change what the next cycle bills, so an increase there is
  // scheduled rather than charged now.
  const isPayPal = effective?.hasSubscription === true && provider === 'paypal';

  const handleApply = async () => {
    if (!dirty) return;
    try {
      setSubmitting(true);
      const res = await billingApi.changeLicenses(employees, terminals, companyId || undefined);

      if (res.approveUrl) {
        window.location.href = res.approveUrl;
        return;
      }

      if (res.status === 'scheduled') {
        showToast(
          res.deferredReason === 'PAYPAL_NO_MIDCYCLE_CHARGE'
            ? t(
                'billing.licenseDeferredPaypal',
                'PayPal non consente addebiti a metà periodo: le licenze aggiuntive saranno attive dal prossimo rinnovo. Per averle subito, paga con carta.'
              )
            : t(
                'billing.licenseReductionScheduled',
                'Riduzione programmata: sarà attiva dal prossimo rinnovo. Nessun rimborso.'
              ),
          'success'
        );
      } else if (res.status === 'applied') {
        showToast(
          t('billing.licensePaymentConfirmed', {
            amount: (res.totalDueNow ?? res.amountDueNow).toFixed(2),
            employees: res.newEmployees,
            terminals: res.newTerminals,
          }),
          'success'
        );
      } else {
        showToast(
          t('billing.licensePaymentStarted', {
            amount: (res.totalDueNow ?? res.amountDueNow).toFixed(2),
          }),
          'success'
        );
      }
      onChanged();
      onClose();
    } catch (err: any) {
      showToast(billingErrorMessage(err, t), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingUpgrade = effective?.pendingUpgrade;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === 'activate'
          ? t('billing.chooseLicenses', 'Scegli le licenze')
          : t('billing.manageLicenses', 'Gestisci licenze')
      }
      maxWidth="560px"
      footer={
        mode === 'manage' ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t('common.cancel', 'Annulla')}
            </Button>
            <Button
              onClick={handleApply}
              disabled={
                !dirty ||
                submitting ||
                !!pendingUpgrade ||
                quoting ||
                (!isReduction && (!!quoteError || !quote || quote.amountDueNowCents <= 0))
              }
            >
              {submitting
                ? t('common.saving', 'Elaborazione...')
                : isReduction
                  ? t('billing.scheduleReduction', 'Programma riduzione')
                  : isPayPal
                    ? t('billing.scheduleIncrease', 'Programma aumento')
                    : quoting
                    ? t('billing.calculating', 'Calcolo...')
                    : t('billing.payAndAdd', {
                        amount: formatMoney(quote?.amountDueNow ?? 0, currency),
                      })}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('common.close', 'Chiudi')}
          </Button>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {mode === 'manage' && periodEnd && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 12px',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
          }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {t('billing.currentPeriod', 'Periodo corrente')}
              </div>
              <strong style={{ color: 'var(--text-primary)' }}>
                {fmtDay(periodStart, locale)} — {fmtDay(periodEnd, locale)}
              </strong>
            </div>
            <div style={{ minWidth: 110 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {t('billing.daysLeft', 'Giorni rimanenti')}
              </div>
              <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {quote?.daysRemaining ?? daysUntil(periodEnd)}
                {quote?.totalDays ? ' / ' + quote.totalDays : ''}
              </strong>
            </div>
            <div style={{ minWidth: 120 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {t('billing.nextRenewal', 'Prossimo rinnovo')}
              </div>
              <strong style={{ color: 'var(--text-primary)' }}>{fmtDay(periodEnd, locale)}</strong>
            </div>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t(
            'billing.licensesIntro',
            'Paghi un numero di licenze, non i dipendenti creati. Non è possibile creare più dipendenti o terminali delle licenze acquistate: per superare il limite, acquista prima le licenze.'
          )}
        </p>

        {mode === 'manage' && isPayPal && !isReduction && dirty && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '12px 14px',
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--text-primary)',
          }}>
            <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <div>
              {t(
                'billing.paypalDeferredWarning',
                'PayPal non consente addebiti a metà periodo: le licenze aggiuntive saranno attive dal prossimo rinnovo, non subito.'
              )}
            </div>
          </div>
        )}

        {pendingUpgrade && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '12px 14px',
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--text-primary)', flex: 1 }}>
              {t('billing.upgradeAwaitingPayment', {
                emp: pendingUpgrade.employees,
                term: pendingUpgrade.terminals,
              })}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    cursor: verifying ? 'not-allowed' : 'pointer',
                  }}
                >
                  {verifying
                    ? t('billing.verifying', 'Verifica in corso...')
                    : t('billing.verifyPayment', 'Verifica pagamento ora')}
                </button>
              </div>
            </div>
          </div>
        )}

        <CapacityBar
          icon={<Users size={15} style={{ color: 'var(--accent)' }} />}
          label={t('billing.employeeLicenses', 'Licenze dipendenti')}
          inUse={minEmployees}
          licensed={currentEmployees}
          adding={addingEmployees}
          unitPrice={unitPriceEmployee}
          currency={currency}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('billing.setEmployeeLicenses', 'Licenze dipendenti totali')}
          </span>
          <Stepper value={employees} min={minEmployees} onChange={setEmployees} disabled={submitting} />
        </div>

        <div style={{ height: 1, background: 'var(--border-light)' }} />

        <CapacityBar
          icon={<Smartphone size={15} style={{ color: 'var(--accent)' }} />}
          label={t('billing.terminalLicenses', 'Licenze terminali')}
          inUse={minTerminals}
          licensed={currentTerminals}
          adding={addingTerminals}
          unitPrice={unitPriceDevice}
          currency={currency}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('billing.setTerminalLicenses', 'Licenze terminali totali')}
          </span>
          <Stepper value={terminals} min={minTerminals} onChange={setTerminals} disabled={submitting} />
        </div>

        {/* Cost summary */}
        <div style={{
          background: 'var(--surface-warm)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-sm)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {employees} × {formatMoney(unitPriceEmployee, currency)} + {terminals} × {formatMoney(unitPriceDevice, currency)}
            </span>
            <strong>{formatMoney(monthlyTotal, currency)} / {t('billing.month', 'mese')}</strong>
          </div>
          {discountActive && (discountPercent ?? 0) > 0 && (
            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
              {t('billing.discountApplied', 'Sconto applicato')}: −{discountPercent}%
              {(listPriceEmployee ?? 0) > 0 && (
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                  {' '}({formatMoney(listPriceEmployee!, currency)}{' → '}
                  {formatMoney(unitPriceEmployee, currency)})
                </span>
              )}
            </div>
          )}

          {mode === 'manage' && dirty && (
            <>
              <div style={{ height: 1, background: 'var(--border-light)' }} />
              {quoting ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 6 }}>
                  <Spinner size="sm" color="var(--primary)" />
                </div>
              ) : isReduction ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-muted)' }}>
                  <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {t(
                    'billing.reductionNote',
                    'Le riduzioni non prevedono rimborsi: il nuovo importo si applica dal prossimo rinnovo.'
                  )}
                </div>
              ) : quoteError ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#dc2626' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {quoteError}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {t('billing.addingNow', 'Aggiunte ora')}: +{addingEmployees} {t('billing.employeesShort', 'dipendenti')}
                      {addingTerminals > 0 ? `, +${addingTerminals} ${t('billing.terminalsShort', 'terminali')}` : ''}
                    </span>
                  </div>

                  {/* A prorated figure that appears without its working looks
                      arbitrary. Showing the full monthly cost of what is being
                      added, and the fraction of the period being charged for,
                      lets the admin arrive at the same number with a
                      calculator. */}
                  {(quote?.additionalMonthly ?? 0) > 0 && (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', gap: 8,
                      fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap',
                    }}>
                      <span>
                        {t('billing.prorationBasis', {
                          amount: formatMoney(quote!.additionalMonthly, currency),
                          days: quote?.daysRemaining ?? 0,
                          total: quote?.totalDays ?? 0,
                        })}
                      </span>
                    </div>
                  )}
                  {/* The provider charges tax on top of the prorated licence
                      cost, so the figure the admin approves has to be the one
                      that leaves their account. The net line stays visible
                      above it: an invoice nobody can reconstruct is an invoice
                      nobody trusts. */}
                  {(quote?.taxPercent ?? 0) > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {t('billing.taxableAmount', 'Imponibile')}
                        </span>
                        <span>{formatMoney(quote?.amountDueNow ?? 0, currency)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {t('billing.taxLine', 'IVA {{percent}}%', { percent: quote!.taxPercent })}
                        </span>
                        <span>{formatMoney(quote?.taxDueNow ?? 0, currency)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700 }}>
                      {t('billing.payNowProrated', 'Da pagare ora (rateo {{days}} gg)', {
                        days: quote?.daysRemaining ?? 0,
                      })}
                    </span>
                    <strong style={{ fontSize: 18, color: 'var(--accent)' }}>
                      {formatMoney(quote?.totalDueNow ?? quote?.amountDueNow ?? 0, currency)}
                    </strong>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t(
                      'billing.alreadyPaidUnaffected',
                      {
                        total: formatMoney(
                          quote?.newMonthlyTotalWithTax ?? quote?.newMonthlyTotal ?? monthlyTotal,
                          currency
                        ),
                      }
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Which method the increase will be charged to. There is no provider
            choice here on purpose: charging a second provider would create a
            second subscription and bill the company twice. */}
        {mode === 'manage' && !isReduction && dirty && !isPayPal && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border-light)',
            fontSize: 12,
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {t('billing.willBeChargedTo', 'Verrà addebitato su')}{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {paymentMethod
                  ? paymentMethod.brand.toUpperCase() + ' •••• ' + paymentMethod.last4
                  : t('billing.savedCard', 'Metodo di pagamento salvato')}
              </strong>
            </span>
            {onChangePaymentMethod && (
              <button
                type="button"
                onClick={onChangePaymentMethod}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 2,
                }}
              >
                {t('billing.changePaymentMethod', 'Cambia metodo')}
              </button>
            )}
          </div>
        )}

        {/* First purchase: pick a provider right here */}
        {mode === 'activate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activateBlockedReason && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '12px 14px',
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                color: 'var(--text-primary)',
              }}>
                <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div>{activateBlockedReason}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button
                onClick={() => onActivate?.('stripe', employees, terminals)}
                disabled={activateDisabled || !!checkoutLoading || monthlyTotal <= 0}
                style={{
                  flex: 1,
                  minWidth: 160,
                  outline: preferredProvider === 'stripe' ? '2px solid var(--accent)' : undefined,
                  outlineOffset: 2,
                }}
              >
                {checkoutLoading === 'stripe'
                  ? t('common.loading', 'Attendere...')
                  : t('billing.payWithStripe', 'Carta di credito')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => onActivate?.('paypal', employees, terminals)}
                disabled={activateDisabled || !!checkoutLoading || monthlyTotal <= 0}
                style={{
                  flex: 1,
                  minWidth: 160,
                  outline: preferredProvider === 'paypal' ? '2px solid var(--accent)' : undefined,
                  outlineOffset: 2,
                }}
              >
                {checkoutLoading === 'paypal'
                  ? t('common.loading', 'Attendere...')
                  : t('billing.payWithPaypal', 'PayPal')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default LicenseModal;
