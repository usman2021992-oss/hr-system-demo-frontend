import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Users, Smartphone } from 'lucide-react';
import billingApi from '../../api/billing';
import type { LicenseSnapshot } from '../../types';

/**
 * Reads the company's paid allowance.
 *
 * Pages that create employees or terminals use this to say "no licenses left"
 * up front, instead of letting someone fill in a whole form and then meet a
 * 402 on save. The backend is still the authority — this is only so the UI can
 * be honest before the work is wasted.
 */
export function useLicenses() {
  const [licenses, setLicenses] = useState<LicenseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const snap = await billingApi.getLicenses();
      setLicenses(snap);
    } catch {
      // Never block a page because billing could not be read.
      setLicenses(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enforced = licenses?.billingEnforced === true && licenses?.hasSubscription === true;

  return {
    licenses,
    loading,
    refresh,
    enforced,
    employeesLeft: enforced ? licenses!.employeesRemaining : Infinity,
    terminalsLeft: enforced ? licenses!.terminalsRemaining : Infinity,
    canAddEmployee: !enforced || licenses!.employeesRemaining > 0,
    canAddTerminal: !enforced || licenses!.terminalsRemaining > 0,
  };
}

/**
 * Banner shown above a create action when the allowance is exhausted, or
 * nearly so.
 */
export const LicenseNotice: React.FC<{
  resource: 'employee' | 'terminal';
  licenses: LicenseSnapshot | null;
  enforced: boolean;
}> = ({ resource, licenses, enforced }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!enforced || !licenses) return null;

  const used = resource === 'employee' ? licenses.employeesInUse : licenses.terminalsInUse;
  const total =
    resource === 'employee' ? licenses.employeesLicensed : licenses.terminalsLicensed;
  const left = Math.max(0, total - used);

  // Quiet while there is comfortable headroom.
  if (left > 2) return null;

  const full = left === 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        marginBottom: 14,
        borderRadius: 'var(--radius-sm)',
        background: full ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.10)',
        border: `1px solid ${full ? 'rgba(220,38,38,0.30)' : 'rgba(245,158,11,0.35)'}`,
      }}
    >
      {full ? (
        <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
      ) : resource === 'employee' ? (
        <Users size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
      ) : (
        <Smartphone size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
      )}

      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>
        <strong>
          {full
            ? resource === 'employee'
              ? t('billing.employeeLicensesFull', 'Licenze dipendenti esaurite ({{used}}/{{total}})', {
                  used,
                  total,
                })
              : t('billing.terminalLicensesFull', 'Licenze terminali esaurite ({{used}}/{{total}})', {
                  used,
                  total,
                })
            : t('billing.licensesAlmostFull', 'Restano {{left}} licenze ({{used}}/{{total}})', {
                left,
                used,
                total,
              })}
        </strong>
        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
          {full
            ? t(
                'billing.buyMoreToContinue',
                'Acquista altre licenze dalla pagina Fatturazione per aggiungerne altri.'
              )
            : t('billing.buyMoreSoon', 'Acquista altre licenze prima di esaurirle.')}
        </div>
      </div>

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
        {t('billing.manageLicenses', 'Gestisci licenze')}
      </button>
    </div>
  );
};
