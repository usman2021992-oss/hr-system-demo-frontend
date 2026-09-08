import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import billingApi from '../../api/billing';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';

export interface BillingStatus {
  isBlocked: boolean;
  restricted: boolean;
  reason?: string | null;
  gracePeriodEndsAt?: string | null;
  enforced?: boolean;
}

interface BillingStatusValue {
  status: BillingStatus | null;
  /**
   * Whether this user is one of the people who can do anything about it.
   *
   * The navigation restriction applies to everyone - an employee of a blocked
   * company cannot use the product either - but the grace-period warning and
   * the failed-payment toast are aimed at the person who can pay. Showing "your
   * access will be suspended on Friday" to a shop assistant is alarming and
   * unactionable in equal measure.
   */
  canActOnBilling: boolean;
  refresh: () => void;
}

/**
 * The app shell's view of billing: is the company restricted, and is it inside
 * a grace period.
 *
 * Read once for the whole shell rather than per component - the sidebar and
 * the grace banner both need it, and two probes on every navigation would be
 * two requests for one answer. A failure leaves the status null, which reads
 * everywhere as "nothing to warn about": billing must never be the reason a
 * page cannot render.
 */
const BillingStatusContext = createContext<BillingStatusValue>({
  status: null,
  canActOnBilling: false,
  refresh: () => {},
});

export const BillingStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const location = useLocation();
  const [status, setStatus] = useState<BillingStatus | null>(null);

  // Super admins are never billed by the company they are inspecting, and a
  // terminal has no billing UI to send anyone to.
  const applies = !!user && user.isSuperAdmin !== true && user.role !== 'store_terminal';

  // Only an admin can open the billing page and settle the payment, so only an
  // admin is warned about it.
  const canActOnBilling = applies && user?.role === 'admin';

  const refresh = useCallback(() => {
    if (!applies) {
      setStatus(null);
      return;
    }
    billingApi
      .getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [applies]);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id, location.pathname]);

  // A renewal fails while nobody is clicking anything, so the state change
  // arrives on the socket rather than from a user action. Without this the
  // warning would appear only on the next navigation.
  useEffect(() => {
    if (!socket || !applies) return;
    const onBillingUpdated = (payload?: { reason?: string }) => {
      refresh();
      // A renewal fails while nobody is doing anything. The banner and the
      // notification both persist; this is the interruption that makes someone
      // look at them today rather than on their next login. Raised here, in
      // the shell, so it reaches an admin anywhere in the product - not only
      // one who happens to have the billing page open.
      if (payload?.reason === 'payment_failed' && canActOnBilling) {
        showToast(
          t(
            'billing.paymentFailedToast',
            'Pagamento non riuscito. Regolarizza il pagamento per non perdere l’accesso alla piattaforma.'
          ),
          'error'
        );
      }
    };
    socket.on('billing:updated', onBillingUpdated);
    return () => {
      socket.off('billing:updated', onBillingUpdated);
    };
  }, [socket, applies, canActOnBilling, refresh, showToast, t]);

  const value = useMemo(
    () => ({ status, canActOnBilling, refresh }),
    [status, canActOnBilling, refresh]
  );

  return (
    <BillingStatusContext.Provider value={value}>{children}</BillingStatusContext.Provider>
  );
};

export function useBillingStatus(): BillingStatusValue {
  return useContext(BillingStatusContext);
}

/** Whole days left before access is blocked. Never negative. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/**
 * The warning carried across the whole application while a company is inside
 * its grace period.
 *
 * A failed renewal suspends the subscription and starts a countdown, but until
 * it runs out nothing is blocked - so without this the first thing the customer
 * notices is the door already shut. It sits under the header on every page,
 * for the whole of the grace period, and says how long is left.
 *
 * It is deliberately not dismissible: the window is a few days, after which
 * the company loses access, and a banner someone closed on Monday would not be
 * there to warn them on Wednesday.
 */
export const BillingGraceBanner: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status, canActOnBilling } = useBillingStatus();

  // Re-render as the deadline approaches, so a banner left open overnight does
  // not still claim three days remain.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const graceEnd = status?.gracePeriodEndsAt ?? null;
  const left = daysUntil(graceEnd, now);

  // Only while the countdown is running. Once access is blocked the app shows
  // its own blocking screen, and repeating the warning above it says nothing.
  if (!canActOnBilling) return null;
  if (!status || status.isBlocked || status.reason !== 'PAST_DUE' || left === null) return null;

  const onBillingPage = location.pathname.startsWith('/impostazioni/fatturazione');
  const critical = left <= 1;

  const deadline = new Date(graceEnd as string).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: critical ? 'rgba(220,38,38,0.10)' : 'rgba(245,158,11,0.12)',
        borderBottom: `1px solid ${critical ? 'rgba(220,38,38,0.35)' : 'rgba(245,158,11,0.40)'}`,
      }}
    >
      <AlertTriangle
        size={16}
        style={{ color: critical ? '#dc2626' : '#d97706', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-primary)' }}>
        <strong>
          {left <= 0
            ? t('billing.graceLastDayTitle', 'Pagamento non riuscito: ultimo giorno')
            : left === 1
              ? t('billing.graceTitleOne', 'Pagamento non riuscito: 1 giorno rimanente')
              : t('billing.graceTitle', 'Pagamento non riuscito: {{days}} giorni rimanenti', {
                  days: left,
                })}
        </strong>
        <span style={{ color: 'var(--text-muted)' }}>
          {' — '}
          {t(
            'billing.graceBody',
            'Regolarizza il pagamento entro il {{date}} per evitare la sospensione dell’accesso.',
            { date: deadline }
          )}
        </span>
      </div>

      {!onBillingPage && (
        <button
          type="button"
          onClick={() => navigate('/impostazioni/fatturazione')}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {t('billing.goToBilling', 'Vai a Fatturazione')}
        </button>
      )}
    </div>
  );
};
