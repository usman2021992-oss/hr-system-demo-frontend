import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, CreditCard } from 'lucide-react';
import { Button } from '../../components/ui/Button';

/**
 * Pages an unpaid company may still use: its own company record (where VAT /
 * SDI / PEC are filled in), billing, settings, access configuration, messages
 * and the profile. The overlay must stay out of the way on these, or the admin
 * can never reach the fields they need in order to pay.
 */
const ALLOWED_WHILE_UNPAID = [
  '/impostazioni',
  '/aziende',
  '/hr-chat',
  '/profilo',
  '/profile',
];

export const BillingBlockedOverlay: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [restrictionType, setRestrictionType] = useState<'blocked' | 'required' | null>(null);

  useEffect(() => {
    const handleRestriction = (event: CustomEvent<{ code?: string; type?: string; message?: string }>) => {
      // Never block on billing pages, for super admins, or for store terminals
      if (
        ALLOWED_WHILE_UNPAID.some((p) => location.pathname.startsWith(p)) ||
        user?.isSuperAdmin ||
        user?.role === 'store_terminal'
      ) {
        return;
      }
      // client.ts dispatches { code: 'SUBSCRIPTION_BLOCKED' | 'SUBSCRIPTION_REQUIRED' }
      const type = event.detail.type
        || (event.detail.code === 'SUBSCRIPTION_BLOCKED' ? 'blocked' : 'required');
      setRestrictionType(type as 'blocked' | 'required');
    };

    window.addEventListener('billing-restriction' as any, handleRestriction as any);
    return () => {
      window.removeEventListener('billing-restriction' as any, handleRestriction as any);
    };
  }, [location.pathname, user]);

  // Reset restriction if navigated to billing
  useEffect(() => {
    if (ALLOWED_WHILE_UNPAID.some((p) => location.pathname.startsWith(p))) {
      setRestrictionType(null);
    }
  }, [location.pathname]);

  if (!restrictionType) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 20px)',
        padding: '36px 28px',
        maxWidth: 480,
        width: '100%',
        textAlign: 'center',
        boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.3))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: restrictionType === 'blocked' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(201, 151, 58, 0.12)',
          color: restrictionType === 'blocked' ? '#ef4444' : 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <ShieldAlert size={34} />
        </div>

        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            {restrictionType === 'blocked'
              ? t('billing.blocked.title', 'Accesso sospeso')
              : t('billing.required.title', 'Abbonamento richiesto')}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {restrictionType === 'blocked'
              ? t(
                  'billing.blocked.description',
                  'Il pagamento dell’abbonamento non è andato a buon fine e il periodo di tolleranza è scaduto. Per ripristinare l’accesso completo a tutte le funzionalità della piattaforma, aggiorna il metodo di pagamento.'
                )
              : t(
                  'billing.required.description',
                  'Per accedere alle funzionalità aziendali di VeylOHR è necessario attivare l’abbonamento mensile aziendale.'
                )}
          </p>
        </div>

        <Button
          style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700 }}
          onClick={() => {
            setRestrictionType(null);
            navigate('/impostazioni/fatturazione');
          }}
        >
          <CreditCard size={18} />
          <span>
            {restrictionType === 'blocked'
              ? t('billing.blocked.action', 'Paga ora')
              : t('billing.required.action', 'Attiva abbonamento')}
          </span>
        </Button>
      </div>
    </div>
  );
};

export default BillingBlockedOverlay;
