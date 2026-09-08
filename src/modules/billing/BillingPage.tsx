import React, { useEffect, useState, useCallback } from 'react';
import { formatMoney } from '../../constants/currencies';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { billingApi } from '../../api/billing';
import { getCompanies } from '../../api/companies';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import {
  BillingOverview,
  BillingTransaction,
  PaymentProvider,
  Company,
  SuperAdminBillingCompanyRow,
} from '../../types';
import {
  FiscalDataModal,
  ReceiptModal,
  HeadcountHistoryModal,
} from './BillingModals';
import { billingErrorMessage, billingTransactionLabel } from './billingErrors';
import { LicenseModal } from './LicenseModal';
import { BillingTaxCard } from './BillingTaxCard';
import { NoticeDeliveryLine } from './NoticeDelivery';
import {
  CreditCard,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Calendar,
  Users,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  FileText,
  XCircle,
  ArrowUpRight,
  Pencil,
  Wallet,
  History as HistoryIcon,
  Info,
  Building2,
  Send,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../../components/ui/Spinner';
import CustomSelect from '../../components/ui/CustomSelect';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

/**
 * One licensed resource line: how many of the paid licenses are in use, with a
 * bar that turns amber as it fills and red once nothing is left.
 */
/** Colour and wording for a subscription's state, used in the selector. */
function statusTag(status: string | null, t: (k: string, d?: any) => string) {
  switch (status) {
    case 'active':
      return { label: t('billing.status_active', 'active'), bg: 'rgba(22,163,74,0.12)', fg: '#16a34a' };
    case 'past_due':
      return { label: t('billing.status_past_due', 'past due'), bg: 'rgba(217,119,6,0.14)', fg: '#b45309' };
    case 'unpaid':
      return { label: t('billing.status_unpaid', 'unpaid'), bg: 'rgba(220,38,38,0.12)', fg: '#dc2626' };
    case 'canceled':
      return { label: t('billing.status_canceled', 'canceled'), bg: 'rgba(120,120,120,0.16)', fg: 'var(--text-muted)' };
    case 'pending':
    case 'incomplete':
      return { label: t('billing.status_pending', 'pending'), bg: 'rgba(59,130,246,0.12)', fg: '#2563eb' };
    default:
      return { label: t('billing.noSubscription', 'No subscription'), bg: 'rgba(120,120,120,0.12)', fg: 'var(--text-muted)' };
  }
}

const UsageRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  inUse: number;
  licensed: number;
  unitPrice: number;
  /** The company's currency, so figures never show a foreign symbol. */
  currency: string;
}> = ({ icon, label, inUse, licensed, unitPrice, currency }) => {
  const pct = licensed > 0 ? Math.min(100, (inUse / licensed) * 100) : 0;
  const full = licensed > 0 && inUse >= licensed;
  const color = full ? '#dc2626' : pct > 85 ? '#d97706' : 'var(--accent)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
          {icon}
          {label}
        </span>
        <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {inUse} / {licensed} · {formatMoney(licensed * unitPrice, currency)}
        </strong>
      </div>
      <div style={{
        height: 6,
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .25s' }} />
      </div>
    </div>
  );
};

export const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user, allowedCompanyIds } = useAuth();
  const { socket } = useSocket();

  const isSuperAdmin = !!user?.isSuperAdmin;

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<PaymentProvider | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [fiscalModalOpen, setFiscalModalOpen] = useState(false);
  const [headcountModalOpen, setHeadcountModalOpen] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  // Which provider the admin clicked, pre-selected inside the license chooser.
  const [preferredProvider, setPreferredProvider] = useState<PaymentProvider | null>(null);
  const [receiptTx, setReceiptTx] = useState<BillingTransaction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [testNoticeSending, setTestNoticeSending] = useState(false);

  // Multi-company support for Super Admin & Multi-company managers
  const [companiesList, setCompaniesList] = useState<Company[]>([]);
  const [companyBilling, setCompanyBilling] = useState<Record<number, SuperAdminBillingCompanyRow>>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const companyIdFromUrl = (() => {
    const raw = searchParams.get('companyId');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? null : n;
  })();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    companyIdFromUrl ?? user?.companyId ?? null
  );

  // Mirror the selection into the URL, replacing rather than pushing so the
  // back button still leaves the page instead of walking company by company.
  useEffect(() => {
    if (!selectedCompanyId) return;
    if (companyIdFromUrl === selectedCompanyId) return;
    const next = new URLSearchParams(searchParams);
    next.set('companyId', String(selectedCompanyId));
    setSearchParams(next, { replace: true });
  }, [selectedCompanyId, companyIdFromUrl, searchParams, setSearchParams]);

  // Load companies if user can manage multiple
  useEffect(() => {
    if (isSuperAdmin) {
      // Per-company billing rows, so each option can show its payment status
      // and licenses in use. Best-effort: the selector still lists companies
      // if this call fails.
      billingApi
        .getSuperAdminOverview()
        .then((rows) => {
          const byId: Record<number, SuperAdminBillingCompanyRow> = {};
          for (const r of rows) byId[r.id] = r;
          setCompanyBilling(byId);
        })
        .catch(() => setCompanyBilling({}));

      getCompanies()
        .then((comps) => {
          if (Array.isArray(comps) && comps.length > 0) {
            setCompaniesList(comps);
            if (!selectedCompanyId) {
              const defaultComp = comps.find((c) => c.id === user?.companyId) || comps[0];
              setSelectedCompanyId(defaultComp.id);
            }
          }
        })
        .catch((err) => console.error('Error fetching companies list:', err));
    }
  }, [isSuperAdmin, allowedCompanyIds, user?.companyId]);

  // Pagination for transactions
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchOverview = useCallback(async (targetCompanyId?: number | null) => {
    try {
      setLoading(true);
      const data = await billingApi.getBillingOverview(targetCompanyId || undefined);
      setOverview(data);
    } catch (err: any) {
      console.error('Error loading billing overview:', err);
      showToast(t('billing.errorLoading', 'Errore durante il caricamento dei dati di fatturazione'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    // Clear first: keeping the previous company's numbers visible while the
    // next ones load is how someone reads the wrong company's bill.
    setOverview(null);
    setLoading(true);
    fetchOverview(selectedCompanyId);
  }, [fetchOverview, selectedCompanyId]);

  // Billing state changes when the provider's webhook lands, not when the user
  // does anything, so the page has to be told. The server announces it on the
  // company's existing socket room and the page refetches — no polling, and no
  // manual refresh to see a payment confirm.
  useEffect(() => {
    if (!socket) return;
    // The failed-payment toast is raised once for the whole app by
    // BillingStatusProvider, not here, so it reaches an admin who is anywhere
    // in the product rather than only one who happens to be on this page.
    const onBillingUpdated = () => {
      fetchOverview(selectedCompanyId);
    };
    socket.on('billing:updated', onBillingUpdated);
    return () => {
      socket.off('billing:updated', onBillingUpdated);
    };
  }, [socket, fetchOverview, selectedCompanyId]);

  // The provider buttons only appear while something is unpaid, so an already
  // paying company needs its own route to the card form.
  const handleChangePaymentMethod = async () => {
    try {
      setPmLoading(true);
      const res = await billingApi.updatePaymentMethod(selectedCompanyId || undefined);
      if (res.url) window.location.href = res.url;
    } catch (err: any) {
      showToast(billingErrorMessage(err, t), 'error');
    } finally {
      setPmLoading(false);
    }
  };

  const handleStartCheckout = async (
    provider: PaymentProvider,
    employeeLicenses?: number,
    terminalLicenses?: number
  ) => {
    try {
      setCheckoutLoading(provider);
      const res = await billingApi.createCheckoutSession(
        provider,
        selectedCompanyId || undefined,
        employeeLicenses !== undefined && terminalLicenses !== undefined
          ? { employeeLicenses, terminalLicenses }
          : undefined
      );
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      showToast(billingErrorMessage(err, t), 'error');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setActionLoading(true);
      await billingApi.cancelSubscription(selectedCompanyId || undefined);
      showToast(t('billing.cancelScheduled', 'La cancellazione dell’abbonamento è stata programmata per la fine del periodo'), 'info');
      setCancelModalOpen(false);
      await fetchOverview(selectedCompanyId);
    } catch (err: any) {
      console.error('Cancel error:', err);
      showToast(err.response?.data?.error || t('billing.cancelFailed', 'Errore durante la cancellazione'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Rehearses the failed-payment alert.
   *
   * The result is reported channel by channel rather than as "sent": the
   * useful answer is usually the specific one - the owner was emailed but the
   * operator copy bounced, or nothing was emailed at all because the company
   * has no SMTP configured. A toast saying "sent" over a company that mails
   * nothing would be the exact failure this button exists to catch.
   */
  const handleSendTestNotice = async () => {
    try {
      setTestNoticeSending(true);
      const res = await billingApi.sendTestFailureNotice(selectedCompanyId || undefined);

      const parts: string[] = [];
      if (res.ownerStatus === 'sent') {
        parts.push(
          t('billing.testNoticeOwnerSent', 'email al titolare inviata a {{email}}', {
            email: res.ownerEmail,
          })
        );
      } else if (res.ownerStatus === 'skipped') {
        parts.push(
          t('billing.testNoticeOwnerSkipped', 'email NON inviata: SMTP non configurato per questa azienda')
        );
      } else if (res.ownerStatus === 'no_recipient') {
        parts.push(
          t('billing.testNoticeNoOwner', 'nessun titolare o admin con indirizzo email')
        );
      } else {
        parts.push(
          t('billing.testNoticeOwnerFailed', 'email al titolare non riuscita: {{error}}', {
            error: res.ownerError || '',
          })
        );
      }

      if (res.copyStatus) {
        parts.push(
          res.copyStatus === 'sent'
            ? t('billing.testNoticeCopySent', 'copia al gestore inviata')
            : t('billing.testNoticeCopyFailed', 'copia al gestore non inviata')
        );
      }
      parts.push(
        t('billing.testNoticeInApp', '{{n}} notifiche in-app create', {
          n: res.inAppCount,
        })
      );

      showToast(
        `${t('billing.testNoticeDone', 'Avviso di prova')} — ${parts.join(' · ')}`,
        res.ownerStatus === 'sent' ? 'success' : 'error'
      );
      await fetchOverview(selectedCompanyId);
    } catch (err: any) {
      showToast(
        err.response?.data?.error ||
          t('billing.testNoticeFailed', 'Impossibile inviare l’avviso di prova'),
        'error'
      );
    } finally {
      setTestNoticeSending(false);
    }
  };

  const handleReactivateSubscription = async () => {
    try {
      setActionLoading(true);
      await billingApi.reactivateSubscription(selectedCompanyId || undefined);
      showToast(t('billing.reactivateSuccess', 'Abbonamento riattivato con successo!'), 'success');
      await fetchOverview(selectedCompanyId);
    } catch (err: any) {
      console.error('Reactivate error:', err);
      showToast(err.response?.data?.error || t('billing.reactivateFailed', 'Errore durante la riattivazione'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Payments are dated by when the money moved (paid_at), not by when the row
  // was written (created_at). The two normally match, because a webhook writes
  // the row as the payment happens — but they diverge whenever history is
  // rebuilt from the provider, and then created_at is simply the import date.
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading && !overview) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Spinner size="lg" color="var(--primary)" />
      </div>
    );
  }

  const sub = overview?.subscription;
  const company = overview?.company;
  const live = overview?.liveUsage;

  const readiness = overview?.readiness;
  // Mirrors the backend preflight guards so activation is blocked with an
  // explanation instead of failing after the user has clicked.
  const canCheckout = readiness ? readiness.canCheckout : true;
  const missingFields = readiness?.missingFields || [];
  const activeProvider = readiness?.activeProvider ?? null;
  const fieldLabels: Record<string, string> = {
    vat_number: t('billing.vatNumber', 'Partita IVA'),
    sdi_recipient_code: t('billing.sdiCode', 'Codice SDI'),
    pec_email: t('billing.pecEmail', 'PEC'),
  };
  // Hosted checkout is for settling an unpaid subscription — first activation,
  // or re-paying after a failed charge. While a subscription is active and
  // fully paid there is nothing to check out for: resources added mid-cycle are
  // charged on the existing subscription (prorated) by the daily sweep or the
  // "Sync now" button, not by paying the whole bill again.
  const isActive = sub?.status === 'active';
  const isPastDue = sub?.status === 'past_due';

  const hasOutstandingBalance = !isActive;

  const isProviderDisabled = (p: PaymentProvider) =>
    !!checkoutLoading ||
    !canCheckout ||
    !hasOutstandingBalance ||
    activeProvider === p;
  const isCanceled = sub?.status === 'canceled' || sub?.cancelAtPeriodEnd;
  const hasSubscription = !!sub && sub.status !== 'incomplete';

  const employeePrice = company?.pricePerEmployee || 0;
  const devicePrice = company?.pricePerDevice || 0;
  const liveEmployees = live?.employeeCount || 0;
  const liveDevices = live?.deviceCount || 0;

  const employeesSubtotal = liveEmployees * employeePrice;
  const devicesSubtotal = liveDevices * devicePrice;
  const monthlyTotal = employeesSubtotal + devicesSubtotal;

  // Licenses are what the company bought. Usage can never exceed them —
  // creation is refused server-side once they are full.
  const licenses = overview?.licenses ?? null;

  // The monthly fee is licenses x price. Usage never drives the amount — it
  // only shows how much of the paid allowance is consumed.
  const licensedEmployees = licenses?.employeesLicensed ?? 0;
  const licensedTerminals = licenses?.terminalsLicensed ?? 0;
  // Before a subscription exists there are no licences, so licences x price is
  // zero - and a card headed "estimated monthly total" showing 0.00 reads as a
  // fault rather than as "nothing bought yet". Until the company subscribes the
  // estimate is based on the people and terminals it actually has, which is
  // what it would pay; afterwards the figure is the real fee for what it holds.
  const licensedMonthlyTotal = hasSubscription
    ? licensedEmployees * employeePrice + licensedTerminals * devicePrice
    : liveEmployees * employeePrice + liveDevices * devicePrice;

  // The provider charges tax on top of that figure, so the card has to show
  // what will actually be taken. Worked out per line - employees, terminals -
  // because that is how the invoice is built, and taxing the rounded sum
  // instead can land a cent away from what the provider collects.
  const taxPercent = overview?.taxPercent ?? 0;
  const taxOnCents = (cents: number) =>
    taxPercent > 0 ? Math.round((cents * taxPercent) / 100) : 0;
  const billedMonthlyTaxTotal =
    (taxOnCents(
      Math.round((hasSubscription ? licensedEmployees : liveEmployees) * employeePrice * 100)
    ) +
      taxOnCents(
        Math.round((hasSubscription ? licensedTerminals : liveDevices) * devicePrice * 100)
      )) /
    100;

  // Every amount on this page is shown in the company's own currency.
  const companyCurrency = company?.currency || 'EUR';

  // Whole days left in the paid period, shown beside the cancel action.
  const daysUntilRenewal = sub?.currentPeriodEnd
    ? Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 0. Company selector — Super Admin only.
           A user record belongs to exactly one company, so a normal company
           admin never manages more than one and must not see this control. */}
      {isSuperAdmin && companiesList.length > 1 && (
        <div style={{
          padding: '12px 18px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(201,151,58,0.12)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Building2 size={16} />
            </span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('companies.selectCompany', 'Azienda')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {t('billing.selectCompanyDesc', 'Seleziona l’azienda per gestirne l’abbonamento e visualizzare lo storico fatture')}
              </div>
            </div>
          </div>
          <div style={{ minWidth: 300, flex: '0 1 420px' }}>
            <CustomSelect
              value={selectedCompanyId ? String(selectedCompanyId) : null}
              onChange={(v) => {
                const next = v ? parseInt(v, 10) : NaN;
                if (!Number.isNaN(next) && next !== selectedCompanyId) {
                  setSelectedCompanyId(next);
                }
              }}
              searchable
              placeholder={t('companies.selectCompany', 'Azienda')}
              options={companiesList.map((c) => {
                const b = companyBilling[c.id];
                const status = b?.subscriptionStatus ?? null;
                const tag = statusTag(status, t);
                return {
                  value: String(c.id),
                  label: `${c.name} ${c.id}`,
                  render: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                        }}>
                          <span style={{
                            fontWeight: 600, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {c.name}
                          </span>
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 700,
                            padding: '1px 7px', borderRadius: 20,
                            background: tag.bg, color: tag.fg,
                          }}>
                            {tag.label}
                          </span>
                        </span>
                        <span style={{
                          display: 'flex', gap: 10, marginTop: 2,
                          fontSize: 11, color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          <span>
                            {t('billing.employeesShort', 'dipendenti')}:{' '}
                            {b ? `${b.employeeCount}/${b.seatQuantity ?? '—'}` : '—'}
                          </span>
                          <span>
                            {t('billing.terminalsShort', 'terminali')}:{' '}
                            {b ? `${b.activeDevicesCount}/${b.deviceQuantity ?? '—'}` : '—'}
                          </span>
                        </span>
                      </span>
                      <span style={{
                        flexShrink: 0, fontSize: 11, fontWeight: 700,
                        color: 'var(--text-muted)',
                        background: 'var(--surface-warm)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 20, padding: '1px 8px',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        ID {c.id}
                      </span>
                    </span>
                  ),
                  selectedRender: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
                      <span style={{
                        fontWeight: 600, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.name}
                      </span>
                      <span style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 700,
                        padding: '1px 7px', borderRadius: 20,
                        background: tag.bg, color: tag.fg,
                      }}>
                        {tag.label}
                      </span>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                        ID {c.id}
                      </span>
                    </span>
                  ),
                };
              })}
            />
          </div>
        </div>
      )}

      {/* 1. Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid var(--border-light)', paddingBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CreditCard size={26} style={{ color: 'var(--accent)' }} />
            {t('billing.title', 'Fatturazione & Abbonamento')}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {t('billing.subtitle', 'Gestisci la sottoscrizione mensile, i metodi di pagamento e visualizza lo storico delle transazioni')}
          </p>
        </div>

        {/* Always available: on an active subscription it manages licenses, and
            on a company that has not subscribed yet it is how the admin picks
            the quantities to buy. Hiding it left new companies with no visible
            way in. */}
        {!loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setLicenseModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 600,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <Users size={13} />
              {isActive
                ? t('billing.manageLicenses', 'Gestisci licenze')
                : t('billing.chooseLicenses', 'Scegli le licenze')}
            </button>
          </div>
        )}
      </div>

      {/* 2. Critical Alert Banners */}
      {(() => {
        // The provider settled an invoice without taking money because the
        // total was under its minimum charge. Say so plainly: the company is
        // active but nothing was paid, and the amount rolls forward.
        const carried = overview?.transactions?.find((tx) => tx.kind === 'carried_over');
        if (!carried) return null;
        return (
          <Alert variant="warning">
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{t('billing.carriedOverTitle')}</div>
            <div style={{ fontSize: 13 }}>
              {t('billing.carriedOverBody', {
                amount: formatMoney((carried.amountCents ?? 0) / 100, carried.currency || companyCurrency),
              })}
            </div>
          </Alert>
        );
      })()}

      {isPastDue && (
        <Alert variant="danger">
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{t('billing.pastDueTitle', 'Pagamento in sospeso')}</div>
          <div>
            {t(
              'billing.pastDueDesc',
              'Il tentativo di rinnovo automatico non è andato a buon fine. Aggiorna il metodo di pagamento entro il {{date}} per evitare la sospensione dell’accesso.',
              { date: formatDate(sub?.gracePeriodEndsAt) }
            )}
          </div>
        </Alert>
      )}

      {sub?.cancelAtPeriodEnd && (
        <Alert variant="warning">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, width: '100%' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{t('billing.cancelingTitle', 'Cancellazione programmata')}</div>
              <div>
                {t(
                  'billing.cancelingDesc',
                  'L’abbonamento resterà attivo fino al {{date}}. Successivamente l’accesso sarà limitato.',
                  { date: formatDate(sub?.currentPeriodEnd) }
                )}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={handleReactivateSubscription} loading={actionLoading}>
              {t('billing.reactivate', 'Riattiva abbonamento')}
            </Button>
          </div>
        </Alert>
      )}

      {/* 3. Main Billing Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Subscription Plan Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 20,
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>
                {t('billing.planType', 'Abbonamento Piattaforma')}
              </span>
              {isActive ? (
                <Badge variant="success">{t('billing.statusActive', 'Attivo')}</Badge>
              ) : isPastDue ? (
                <Badge variant="danger">{t('billing.statusPastDue', 'In sospeso')}</Badge>
              ) : isCanceled ? (
                <Badge variant="warning">{t('billing.statusCanceled', 'Cancellato')}</Badge>
              ) : (
                <Badge variant="neutral">{t('billing.statusNoSubscription', 'Da attivare')}</Badge>
              )}
            </div>

            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              VeylOHR Corporate Suite
            </h2>
            <p style={{ margin: '4px 0 18px', fontSize: 12, color: 'var(--text-muted)' }}>
              {company?.name || 'Azienda'}
            </p>

            {/* Monthly breakdown */}
            <div style={{ background: 'var(--surface-warm)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                {t('billing.monthlyBreakdown', 'Composizione canone mensile')}
              </div>

              {/* Employee licenses */}
              <UsageRow
                icon={<Users size={14} style={{ color: 'var(--accent)' }} />}
                label={t('billing.employeeLicenses', 'Licenze dipendenti')}
                inUse={licenses?.employeesInUse ?? liveEmployees}
                licensed={licenses?.employeesLicensed ?? 0}
                unitPrice={employeePrice}
                currency={companyCurrency}
              />

              {/* Terminal licenses */}
              <UsageRow
                icon={<Smartphone size={14} style={{ color: 'var(--accent)' }} />}
                label={t('billing.terminalLicenses', 'Licenze terminali')}
                inUse={licenses?.terminalsInUse ?? liveDevices}
                licensed={licenses?.terminalsLicensed ?? 0}
                unitPrice={devicePrice}
                currency={companyCurrency}
              />

              {/* Total Divider */}
              <div style={{ height: 1, background: 'var(--border-light)', margin: '4px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('billing.totalMonthly', 'Totale mensile')}
                </span>
                <span style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
                  {formatMoney(licensedMonthlyTotal, companyCurrency)}
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}> / {t('billing.month', 'mese')}</span>
                </span>
              </div>

              {taxPercent > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  fontSize: 11, color: 'var(--text-muted)',
                }}>
                  <span>{t('billing.taxLine', 'IVA {{percent}}%', { percent: taxPercent })}</span>
                  <span>
                    +{formatMoney(billedMonthlyTaxTotal, companyCurrency)}
                    {' · '}
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {t('billing.totalCharged', 'Totale addebitato')}{' '}
                      {formatMoney(licensedMonthlyTotal + billedMonthlyTaxTotal, companyCurrency)}
                    </strong>
                  </span>
                </div>
              )}

              {company?.discountActive && (company?.discountPercent ?? 0) > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 11, color: 'var(--text-muted)',
                }}>
                  <span>
                    {t('billing.discountApplied', 'Sconto applicato')}
                  </span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>
                    −{company.discountPercent}%
                    {(company.listPricePerEmployee ?? 0) > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                        {' '}({formatMoney(company.listPricePerEmployee!, companyCurrency)}
                        {' → '}
                        {formatMoney(employeePrice, companyCurrency)})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Renewal / Expiry Details */}
          {hasSubscription && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, borderTop: '1px solid var(--border-light)', paddingTop: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                <Calendar size={14} />
                {t('billing.nextRenewal', 'Prossimo rinnovo')}: <strong style={{ color: 'var(--text-primary)' }}>{formatDate(sub?.currentPeriodEnd)}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {t('billing.paymentMethod', 'Metodo')}: <strong style={{ textTransform: 'uppercase', color: 'var(--text-primary)' }}>{sub?.provider}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Payment & Subscription Activation / Manage Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 24,
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 20,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} style={{ color: '#16a34a' }} />
              {hasSubscription && isActive
                ? t('billing.paymentMethod', 'Gestione Pagamento')
                : t('billing.chooseProvider', 'Attiva Abbonamento')}
            </h3>

            <p style={{ margin: '6px 0 20px', fontSize: 12, color: 'var(--text-muted)' }}>
              {hasSubscription && isActive
                ? t('billing.activeMethodDesc', 'Il tuo abbonamento è attivo e si rinnova automaticamente ogni mese.')
                : t('billing.chooseProviderDesc', 'Scegli il metodo di pagamento preferito per completare l’attivazione in totale sicurezza:')}
            </p>

            {isActive && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                padding: '12px 14px',
                marginBottom: 16,
                background: 'var(--surface-warm)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CreditCard size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {overview?.paymentMethod
                        ? `${overview.paymentMethod.brand.toUpperCase()} •••• ${overview.paymentMethod.last4}`
                        : sub?.provider === 'paypal'
                          ? 'PayPal'
                          : t('billing.savedCard', 'Metodo di pagamento salvato')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {overview?.paymentMethod
                        ? t('billing.cardExpires', 'Scade {{m}}/{{y}}', {
                            m: String(overview.paymentMethod.expMonth).padStart(2, '0'),
                            y: overview.paymentMethod.expYear,
                          })
                        : t('billing.chargedAutomatically', 'Addebito automatico ad ogni rinnovo')}
                    </div>
                  </div>
                </div>

                {sub?.provider === 'stripe' && (
                  <button
                    type="button"
                    onClick={handleChangePaymentMethod}
                    disabled={pmLoading}
                    style={{
                      padding: '7px 13px',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      cursor: pmLoading ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pmLoading
                      ? t('common.loading', 'Attendere...')
                      : t('billing.changePaymentMethod', 'Cambia metodo')}
                  </button>
                )}
              </div>
            )}

            {canCheckout && !hasOutstandingBalance && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '12px 14px', marginBottom: 16,
                background: 'rgba(22,163,74,0.10)',
                border: '1px solid rgba(22,163,74,0.30)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <ShieldCheck size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {t(
                    'billing.settledNothingDue',
                    'Nessun importo da pagare: l’abbonamento è attivo e si rinnova automaticamente. Per aggiungere dipendenti o terminali, acquista altre licenze.'
                  )}
                </div>
              </div>
            )}

            {!canCheckout && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '12px 14px', marginBottom: 16,
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {missingFields.length > 0
                    ? t('billing.blockedMissingFields', 'Completa i dati aziendali obbligatori prima di attivare l’abbonamento:') +
                      ' ' + missingFields.map((f) => fieldLabels[f] || f).join(', ')
                    : readiness && !readiness.pricingConfigured
                      ? t('billing.blockedNoPricing', 'Le tariffe non sono ancora state configurate dall’amministratore di sistema.')
                      : t('billing.blockedNoQuantity', 'Non ci sono dipendenti o terminali attivi da fatturare.')}
                </div>
              </div>
            )}

            {/* Both providers stay visible so it is obvious the company can pay
                by card or with PayPal. Each opens the license chooser, where the
                quantities are picked before the amount is committed. */}
            {hasOutstandingBalance && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['stripe', 'paypal'] as PaymentProvider[]).map((p) => {
                  const isStripe = p === 'stripe';
                  const disabled = !!checkoutLoading || !canCheckout;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPreferredProvider(p);
                        setLicenseModalOpen(true);
                      }}
                      disabled={disabled}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        background: 'var(--surface-warm)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{
                          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                          background: isStripe ? 'rgba(99,102,241,0.12)' : 'rgba(0,112,186,0.12)',
                          color: isStripe ? '#6366f1' : '#0070ba',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isStripe ? <CreditCard size={19} /> : <Wallet size={19} />}
                        </span>
                        <span>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {isStripe
                              ? t('billing.payWithStripe', 'Carta di Credito')
                              : t('billing.payWithPaypal', 'PayPal')}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
                            {isStripe
                              ? t('billing.stripeSubtext', 'Visa, Mastercard, Amex tramite Stripe')
                              : t('billing.paypalSubtext', 'Paga con il tuo account PayPal')}
                          </span>
                        </span>
                      </span>
                      {checkoutLoading === p
                        ? <Spinner size="sm" color="var(--primary)" />
                        : <ArrowUpRight size={17} style={{ color: 'var(--text-muted)' }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cancellation Option for Active Subscriptions */}
          {hasSubscription && isActive && !sub.cancelAtPeriodEnd && (
            <div style={{
              borderTop: '1px solid var(--border-light)',
              paddingTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}>
                <Calendar size={13} />
                {t('billing.daysUntilRenewal', {
                  days: daysUntilRenewal,
                })}
              </span>
              <button
                type="button"
                onClick={() => setCancelModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 12,
                  color: 'var(--danger, #ef4444)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <XCircle size={14} />
                {t('billing.cancelSubscription', 'Annulla rinnovo automatico')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Fiscal Details & Legal Compliance Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Fiscal Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 14px' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={16} style={{ color: 'var(--accent)' }} />
              {t('billing.fiscalData', 'Dati Fiscali Aziendali')}
            </h3>
            <button
              type="button"
              onClick={() => setFiscalModalOpen(true)}
              title={t('billing.editFiscalData', 'Modifica dati fiscali')}
              aria-label={t('billing.editFiscalData', 'Modifica dati fiscali')}
              style={{
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-warm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Pencil size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('billing.vatNumber', 'Partita IVA')}:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{company?.vatNumber || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('billing.sdiCode', 'Codice SDI')}:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{company?.sdiRecipientCode || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('billing.pecEmail', 'Email PEC')}:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{company?.pecEmail || '—'}</strong>
            </div>
          </div>
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-light)', paddingTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            {t('billing.fiscalNoteEditable', 'Obbligatori per attivare l’abbonamento. Solo salvataggio, nessun invio a SDI/PEC.')}
          </div>
        </div>

        {/* Security Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} style={{ color: '#16a34a' }} />
            {t('billing.guaranteeTitle', 'Pagamenti Sicuri & Conformità')}
          </h3>

          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>{t('billing.guarantee1', 'Crittografia bancaria TLS a 256-bit certificata PCI-DSS Livello 1.')}</li>
            <li>{t('billing.guarantee2', 'Proroga automatica e calcolo proporzionale delle licenze aggiunte.')}</li>
            <li>{t('billing.guarantee3', 'Nessun addebito su carte personali: emissione ricevute aziendali.')}</li>
          </ul>

          <button
            type="button"
            onClick={() => setHeadcountModalOpen(true)}
            style={{
              marginTop: 14,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-warm)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
              <HistoryIcon size={14} style={{ color: 'var(--accent)' }} />
              {t('billing.headcountHistory', 'Storico risorse fatturabili')}
            </span>
            <ArrowUpRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>
        </div>
      </div>

      {/* 4b. The tax rate every total above was built from.
             Super admin only: the rate is a platform-wide setting owned by the
             operator. A company admin still sees the tax lines on their own
             invoice above - that is their money - but not the configuration
             behind it. The server enforces this too; this only avoids
             rendering a panel that would arrive empty. */}
      {isSuperAdmin && (
        <BillingTaxCard
          tax={overview?.tax ?? null}
          canSync
          monthlyNet={licensedMonthlyTotal}
          monthlyTax={billedMonthlyTaxTotal}
          currency={companyCurrency}
          onSynced={() => fetchOverview(selectedCompanyId)}
        />
      )}

      {/* 5. Transactions History */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 24,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 18,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              {t('billing.transactionHistory', 'Storico Pagamenti & Ricevute')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {t('billing.transactionHistorySubtitle', 'Tutte le transazioni, addebiti e rinnovi eseguiti')}
            </p>
          </div>

          {/* The only way to prove the dunning path works, short of letting a
              real customer's renewal fail. Same recipients, same mail server,
              same in-app notification - marked as a test and changing nothing
              about the subscription. Super admin only: it sends real email. */}
          {isSuperAdmin && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSendTestNotice}
              loading={testNoticeSending}
            >
              <Send size={13} /> {t('billing.sendTestNotice', 'Invia avviso di prova')}
            </Button>
          )}
        </div>

        {overview?.transactions && overview.transactions.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('billing.txDate', 'Data')}</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('billing.txDescription', 'Descrizione')}</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('billing.txMethod', 'Metodo')}</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('billing.txAmount', 'Importo')}</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('billing.txStatus', 'Stato')}</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>{t('billing.txReceipt', 'Ricevuta')}</th>
                </tr>
              </thead>
              <tbody>
                {overview.transactions.map((tx: any) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {formatDate(tx.paidAt || tx.createdAt)}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                      {billingTransactionLabel(tx, t)}
                      {/* A failed payment is only half the story; what matters
                          next is whether anyone was told. */}
                      <NoticeDeliveryLine notice={tx.notice} compact />
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {tx.provider}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatMoney((tx.amountCents || 0) / 100, tx.currency || companyCurrency)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {tx.status === 'paid' ? (
                        <Badge variant="success">{t('billing.paid', 'Pagato')}</Badge>
                      ) : tx.status === 'failed' ? (
                        <Badge variant="danger">{t('billing.failed', 'Fallito')}</Badge>
                      ) : tx.status === 'refunded' ? (
                        <Badge variant="neutral">{t('billing.refunded', 'Rimborsato')}</Badge>
                      ) : (
                        <Badge variant="neutral">{t('billing.pending', 'In attesa')}</Badge>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {/* Always openable: the receipt is rebuilt from the
                          stored transaction, and links out to the provider's
                          own receipt when one exists. */}
                      <button
                        type="button"
                        onClick={() => setReceiptTx(tx)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          color: 'var(--accent)',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {t('billing.viewReceipt', 'Vedi')}
                        {tx.invoiceUrl && <ExternalLink size={12} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('billing.noTransactions', 'Nessuna transazione registrata finora.')}
          </div>
        )}
      </div>

      {/* 6. Cancel Subscription Confirmation Modal */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title={t('billing.confirmCancelTitle', 'Annullare l’abbonamento?')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelModalOpen(false)} disabled={actionLoading}>
              {t('common.cancel', 'Indietro')}
            </Button>
            <Button variant="danger" onClick={handleCancelSubscription} loading={actionLoading}>
              {t('billing.confirmCancel', 'Conferma annullamento')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--text-primary)', fontSize: 13 }}>
          <p style={{ margin: 0 }}>
            {t(
              'billing.confirmCancelDesc',
              'L’abbonamento rimarrà valido fino alla fine del periodo corrente ({{date}}). Dopo tale data, le funzionalità della piattaforma saranno limitate.',
              { date: formatDate(sub?.currentPeriodEnd) }
            )}
          </p>
        </div>
      </Modal>

      <FiscalDataModal
        open={fiscalModalOpen}
        onClose={() => setFiscalModalOpen(false)}
        companyId={selectedCompanyId ?? company?.id ?? null}
        company={company}
        onSaved={() => fetchOverview(selectedCompanyId)}
        showToast={showToast}
      />

      <ReceiptModal
        open={!!receiptTx}
        onClose={() => setReceiptTx(null)}
        tx={receiptTx}
        companyName={company?.name}
        fiscal={{
          vatNumber: company?.vatNumber,
          sdiRecipientCode: company?.sdiRecipientCode,
          pecEmail: company?.pecEmail,
        }}
      />

      <HeadcountHistoryModal
        open={headcountModalOpen}
        onClose={() => setHeadcountModalOpen(false)}
        companyId={selectedCompanyId ?? company?.id ?? null}
        licenses={licenses}
        subscriptionStatus={sub?.status ?? null}
      />

      <LicenseModal
        open={licenseModalOpen}
        onClose={() => setLicenseModalOpen(false)}
        companyId={selectedCompanyId ?? company?.id ?? null}
        licenses={licenses}
        unitPriceEmployee={employeePrice}
        discountPercent={company?.discountPercent}
        discountActive={company?.discountActive}
        listPriceEmployee={company?.listPricePerEmployee}
        unitPriceDevice={devicePrice}
        currency={company?.currency || 'EUR'}
        mode={isActive ? 'manage' : 'activate'}
        preferredProvider={preferredProvider}
        provider={sub?.provider ?? null}
        periodStart={sub?.currentPeriodStart ?? null}
        periodEnd={sub?.currentPeriodEnd ?? null}
        paymentMethod={overview?.paymentMethod ?? null}
        onChangePaymentMethod={
          sub?.provider === 'stripe' ? handleChangePaymentMethod : undefined
        }
        onActivate={(provider, employees, terminals) => {
          handleStartCheckout(provider, employees, terminals);
        }}
        activateDisabled={!canCheckout}
        activateBlockedReason={
          canCheckout
            ? null
            : missingFields.length > 0
              ? t('billing.blockedMissingFields', 'Completa i dati aziendali obbligatori prima di attivare l’abbonamento:') +
                ' ' + missingFields.map((f) => fieldLabels[f] || f).join(', ')
              : t('billing.blockedNoPricing', 'Le tariffe non sono ancora state configurate dall’amministratore di sistema.')
        }
        checkoutLoading={checkoutLoading}
        onChanged={() => fetchOverview(selectedCompanyId)}
        showToast={showToast}
      />
    </div>
  );
};

export default BillingPage;
