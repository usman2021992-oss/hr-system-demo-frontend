import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApprovalConfig, updateApprovalConfig, ApprovalLevel } from '../../api/leave';
import { useAuth } from '../../context/AuthContext';
import { Company } from '../../types';
import { getCompanies } from '../../api/companies';

const ROLE_LABELS: Record<string, { en: string; it: string }> = {
  store_manager: { en: 'Store Manager', it: 'Store Manager' },
  area_manager:  { en: 'Area Manager',  it: 'Area Manager' },
  hr:            { en: 'HR',            it: 'HR' },
  admin:         { en: 'Admin',         it: 'Admin' },
};

const ROLE_COLORS: Record<string, string> = {
  store_manager: '#3b82f6',
  area_manager:  '#8b5cf6',
  hr:            '#059669',
  admin:         '#b45309',
};

export default function ApprovalConfigPanel() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang = i18n.language === 'it' ? 'it' : 'en';

  const [levels, setLevels] = useState<ApprovalLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>(user?.companyId ?? undefined);

  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin;

  useEffect(() => {
    if (user?.isSuperAdmin) {
      getCompanies()
        .then((data) => setCompanies(data))
        .catch(() => {});
    }
  }, [user]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApprovalConfig(selectedCompanyId);
      setLevels(data.map(l => l.role === 'admin' ? { ...l, enabled: true } : l));
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, t]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleToggle = (role: string) => {
    setSuccess(false);
    setLevels((prev) => prev.map((l) =>
      l.role === role ? { ...l, enabled: !l.enabled } : l
    ));
  };

  const handleSave = async () => {
    if (!selectedCompanyId) return;
    const enabledCount = levels.filter((l) => l.enabled).length;
    if (enabledCount === 0) {
      setError(t('leave.approval_config_min_one'));
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = levels.map((l) => ({
        role: l.role,
        enabled: l.role === 'admin' ? true : l.enabled,
        sort_order: l.sortOrder,
      }));
      const updated = await updateApprovalConfig(selectedCompanyId, payload);
      setLevels(updated.map(l => l.role === 'admin' ? { ...l, enabled: true } : l));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', margin: '0 auto 12px',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.7s linear infinite',
        }} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('common.loading')}</div>
      </div>
    );
  }

  const enabledLevels = levels.filter((l) => l.enabled);

  return (
    <div>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        width: '100%',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-warm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {t('leave.approval_config_title')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {t('leave.approval_config_desc')}
            </p>
          </div>
          {user?.isSuperAdmin && companies.length > 0 && (
            <div>
              <select
                value={selectedCompanyId ?? ''}
                onChange={(e) => setSelectedCompanyId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Levels */}
        <div style={{ padding: '12px 20px' }}>
          {levels
            .filter((l) => l.role !== 'admin')
            .map((level, idx, arr) => {
            const color = ROLE_COLORS[level.role] ?? '#64748b';
            const label = ROLE_LABELS[level.role]?.[lang] ?? level.role;
            return (
              <div key={level.role} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0',
                borderBottom: idx < arr.length - 1 ? '1px solid var(--border-light)' : 'none',
                opacity: level.enabled ? 1 : 0.5,
                transition: 'opacity 0.2s',
              }}>
                {/* Step number */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: level.enabled ? `${color}18` : 'var(--background)',
                  color: level.enabled ? color : 'var(--text-disabled)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, flexShrink: 0,
                  border: `1.5px solid ${level.enabled ? color : 'var(--border)'}`,
                }}>
                  {idx + 1}
                </div>

                {/* Role label */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {label}
                  </div>
                </div>

                {/* Toggle switch */}
                {isAdmin && (
                  <button
                    onClick={() => handleToggle(level.role)}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: level.enabled ? color : 'var(--border)',
                      border: 'none', cursor: 'pointer', position: 'relative',
                      transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      position: 'absolute', top: 3,
                      left: level.enabled ? 23 : 3,
                      transition: 'left 0.2s',
                    }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Flow preview */}
        {enabledLevels.length > 0 && (
          <div style={{
            padding: '24px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            width: '100%',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 20 }}>
              {t('leave.approval_flow_preview', 'Anteprima del Flusso di Approvazione')}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 12 }}>
              {/* Vertical line connector */}
              <div style={{
                position: 'absolute',
                left: 25,
                top: 15,
                bottom: 15,
                width: 2,
                background: 'linear-gradient(to bottom, #d1d5db, var(--accent))',
              }} />

              {/* Step 1: Submission */}
              <div style={{ display: 'flex', gap: 16, zIndex: 1, position: 'relative' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#fff', border: '2px solid #b68c56',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#b68c56', flexShrink: 0,
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  1
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('leave.flow_step1_title', '1. Richiesta Iniziale del Dipendente')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                    {t('leave.flow_step1_desc', "L'utente richiede il permesso. La richiesta viene registrata con data/ora e la disponibilità del saldo viene verificata. L'applicazione è consentita solo in caso di saldo residuo sufficiente.")}
                  </div>
                </div>
              </div>

              {/* Dynamic steps from config */}
              {enabledLevels.map((level, idx) => {
                const color = ROLE_COLORS[level.role] ?? '#64748b';
                const label = ROLE_LABELS[level.role]?.[lang] ?? level.role;
                
                let stepTitle = '';
                let stepDesc = '';
                
                // These descriptions are the only place the rules are explained
                // to the person configuring the chain, so they must match what
                // the code actually does: below HR the inactivity job may carry
                // a stage forward, at HR and above it never can, and nothing is
                // granted without a configured balance.
                if (level.role === 'store_manager') {
                  stepTitle = t('leave.flow_sm_title', 'Approvazione Store Manager');
                  stepDesc = t('leave.flow_sm_desc', 'Se questa fase è abilitata, la richiesta passa allo Store Manager del punto vendita. Se il responsabile è in ferie o assente, lo step viene saltato. Se non decide entro 2 giorni, la richiesta viene inoltrata automaticamente al livello successivo: la fase risulta superata, ma il permesso NON è approvato e nessun saldo viene scalato.');
                } else if (level.role === 'area_manager') {
                  stepTitle = t('leave.flow_am_title', 'Approvazione Area Manager');
                  stepDesc = t('leave.flow_am_desc', "Se abilitata, la richiesta passa all'Area Manager. Come per lo Store Manager, dopo 2 giorni di inattività viene inoltrata automaticamente al livello successivo senza essere approvata.");
                } else if (level.role === 'hr') {
                  stepTitle = t('leave.flow_hr_title', 'Approvazione HR (Risorse Umane)');
                  stepDesc = t('leave.flow_hr_desc', "Se abilitata, la richiesta passa alle Risorse Umane. Questa decisione non è mai automatica: in caso di inattività HR viene solo sollecitata, la richiesta resta in attesa. L'approvazione HR scala il saldo del dipendente ed è bloccata se il saldo non è ancora configurato. I turni programmati vengono annullati solo se si seleziona l'apposita opzione in fase di approvazione.");
                } else if (level.role === 'admin') {
                  stepTitle = t('leave.flow_admin_title', 'Approvazione Finale Amministratore');
                  stepDesc = t('leave.flow_admin_desc', "Se abilitata (sempre attiva come ultimo livello), l'Amministratore concede l'approvazione finale. Anche questa decisione non è mai automatica e richiede un saldo configurato.");
                }

                return (
                  <div key={level.role} style={{ display: 'flex', gap: 16, zIndex: 1, position: 'relative' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#fff', border: `2px solid ${color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800, color: color, flexShrink: 0,
                      boxShadow: 'var(--shadow-sm)',
                    }}>
                      {idx + 2}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {idx + 2}. {stepTitle}
                        </span>
                        <span style={{
                          padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                          background: `${color}14`, color: color, border: `1px solid ${color}24`,
                          textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}>
                          {label}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                        {stepDesc}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Step Final: Completion */}
              <div style={{ display: 'flex', gap: 16, zIndex: 1, position: 'relative' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#fff', border: '2px solid #16a34a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: '#16a34a', flexShrink: 0,
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {enabledLevels.length + 2}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {enabledLevels.length + 2}. {t('leave.flow_final_title', 'Approvazione Completata')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                    {t('leave.flow_final_desc', "La richiesta è ufficialmente approvata. Il saldo viene decrementato definitivamente e lo stato dell'utente viene aggiornato in 'In Ferie' o 'In Permesso'.")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error / Success */}
        {error && (
          <div style={{
            margin: '0 20px 12px', padding: '8px 12px', borderRadius: 8,
            background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 12, fontWeight: 600,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            margin: '0 20px 12px', padding: '8px 12px', borderRadius: 8,
            background: 'rgba(22,163,74,0.08)', color: '#16a34a', fontSize: 12, fontWeight: 600,
          }}>
            {t('leave.approval_config_saved')}
          </div>
        )}

        {/* Save button */}
        {isAdmin && (
          <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 28px', borderRadius: 8,
                border: 'none', background: '#b68c56', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
