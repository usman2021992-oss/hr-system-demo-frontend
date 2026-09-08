import React from 'react';
import { useTranslation } from 'react-i18next';
import { LeaveBalance } from '../../api/leave';

interface Props {
  balances: LeaveBalance[];
  loading?: boolean;
}

function BalancePill({ balance }: { balance: LeaveBalance }) {
  const { t } = useTranslation();
  const isVacation = balance.leaveType === 'vacation';
  const color = isVacation ? 'var(--accent)' : 'var(--info)';
  const usedPct = balance.totalDays > 0
    ? Math.min(100, (balance.usedDays / balance.totalDays) * 100)
    : 0;

  return (
    <div
      style={{
        background: isVacation ? 'var(--accent-light)' : 'var(--info-bg)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        minWidth: 140,
        flex: '1 1 140px',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {t(`leave.type_${balance.leaveType}`)}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
        {balance.remainingDays}
        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>
          {t('leave.days_remaining')}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
        {t('leave.balance_used_of', { used: balance.usedDays, total: balance.totalDays })}
      </div>
      {/* Nothing left to spend. Said plainly here, because the employee would
          otherwise only discover it when a new request is refused. */}
      {balance.remainingDays <= 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 8,
          padding: '6px 8px', borderRadius: 6,
          background: 'rgba(180,83,9,0.10)', border: '1px solid rgba(180,83,9,0.22)',
          fontSize: 11, fontWeight: 600, color: '#92400e', lineHeight: 1.4,
        }}>
          <span aria-hidden>⚠</span>
          <span>{t('leave.balance_exhausted_employee')}</span>
        </div>
      )}
      {/* Progress bar */}
      <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)' }}>
        <div
          style={{
            width: `${usedPct}%`, height: '100%',
            background: color, borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

export function LeaveBalanceCard({ balances, loading }: Props) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
        marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {t('leave.balance_title')}
      </div>
      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t('common.loading')}</div>
      ) : balances.length === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 20px',
          background: 'var(--surface-warm)',
          borderRadius: 8,
          border: '1.5px dashed var(--border)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(245,158,11,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
            border: '1px solid rgba(245,158,11,0.25)',
          }}>
            ⚠️
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('leave.no_balance_configured_title', 'Saldo Non Configurato')}
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {t('leave.no_balance_configured_desc', "Non è stato ancora configurato un saldo ferie/permessi per quest'anno. Si prega di contattare le Risorse Umane (HR) della propria azienda per l'allocazione dei giorni spettanti.")}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {balances.map((b) => (
            <BalancePill key={`${b.leaveType}-${b.year}`} balance={b} />
          ))}
        </div>
      )}
    </div>
  );
}
