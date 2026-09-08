import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../../api/billing';
import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

export const PaymentProcessingPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const provider = searchParams.get('provider') || 'stripe';
  const [status, setStatus] = useState<'polling' | 'success' | 'timeout' | 'error'>('polling');
  const pollCountRef = useRef(0);
  const maxPolls = 10; // 10 * 1.5s = ~15 seconds total window

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const checkStatus = async () => {
      try {
        pollCountRef.current += 1;
        const overview = await billingApi.getBillingOverview();

        if (overview.subscription?.status === 'active') {
          setStatus('success');
          showToast(t('billing.activationSuccess', 'Abbonamento attivato con successo!'), 'success');
          setTimeout(() => {
            navigate('/impostazioni/fatturazione');
          }, 1500);
          return;
        }

        if (pollCountRef.current >= maxPolls) {
          setStatus('timeout');
          return;
        }

        timer = setTimeout(checkStatus, 1500);
      } catch (err) {
        console.error('Error polling billing status:', err);
        if (pollCountRef.current >= maxPolls) {
          setStatus('error');
        } else {
          timer = setTimeout(checkStatus, 1500);
        }
      }
    };

    // Initial check after 1.0s
    timer = setTimeout(checkStatus, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [navigate, showToast, t]);

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 20px)',
        padding: '40px 32px',
        maxWidth: 500,
        width: '100%',
        textAlign: 'center',
        boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1))',
      }}>
        {status === 'polling' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: 'rgba(201,151,58,0.12)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Spinner size="lg" color="var(--accent)" />
            </div>

            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {t('billing.processing.title', 'Verifica pagamento in corso')}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {t(
                  'billing.processing.desc',
                  'Stiamo verificando la conferma del pagamento con il gateway ({{provider}}). L’abbonamento verrà attivato automaticamente alla ricezione del webhook di conferma.',
                  { provider: provider === 'paypal' ? 'PayPal' : 'Stripe' }
                )}
              </p>
            </div>

            <div style={{ width: '100%', height: 6, background: 'var(--border-light)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 3,
                  width: `${Math.min(95, (pollCountRef.current / maxPolls) * 100 + 15)}%`,
                  transition: 'width 0.8s ease',
                }}
              />
            </div>

            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              {t('billing.processing.waitNote', 'Non chiudere questa finestra. L’operazione potrebbe richiedere alcuni secondi.')}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: 'rgba(22, 163, 74, 0.12)',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CheckCircle2 size={40} />
            </div>

            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {t('billing.processing.successTitle', 'Pagamento confermato!')}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {t(
                  'billing.processing.successDesc',
                  'Il tuo abbonamento è ora attivo. Tutte le funzionalità della piattaforma sono disponibili.'
                )}
              </p>
            </div>

            <Button
              style={{ width: '100%', padding: '12px' }}
              onClick={() => navigate('/impostazioni/fatturazione')}
            >
              <span>{t('billing.processing.goToBilling', 'Vai alla gestione abbonamento')}</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        )}

        {(status === 'timeout' || status === 'error') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: 'rgba(201, 151, 58, 0.12)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <AlertCircle size={40} />
            </div>

            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {t('billing.processing.pendingTitle', 'Elaborazione in corso')}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {t(
                  'billing.processing.pendingDesc',
                  'Il gateway sta elaborando la transazione. Il tuo abbonamento si attiverà automaticamente non appena la notifica sarà elaborata.'
                )}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <Button onClick={() => navigate('/impostazioni/fatturazione')}>
                {t('billing.processing.checkStatus', 'Controlla stato abbonamento')}
              </Button>
              <Button variant="secondary" onClick={() => navigate('/')}>
                {t('billing.processing.goToDashboard', 'Torna alla Dashboard')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentProcessingPage;
