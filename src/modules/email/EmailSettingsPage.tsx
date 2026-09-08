import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../context/ToastContext';
import { getEmailConfig, saveEmailConfig, verifyEmailConfig, SmtpConfig } from '../../api/email';
import { getCompanies } from '../../api/companies';
import { useAuth } from '../../context/AuthContext';
import { Company } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Eye, EyeOff, Mail, ShieldCheck, Info, RefreshCw, Server, Building2 } from 'lucide-react';
import { PlatformEmailSettings } from './PlatformEmailSettings';

export default function EmailSettingsPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isUserSuperAdmin = !!user?.isSuperAdmin;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>(undefined);
  
  const [validationState, setValidationState] = useState<'idle' | 'checking' | 'success' | 'failed'>('idle');

  const [formData, setFormData] = useState<SmtpConfig>({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
  });

  const [showPass, setShowPass] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);

  /**
   * Two kinds of mailbox live on this page and they are not interchangeable.
   *
   * 'platform' is VeylOHR's own: it sends billing warnings to a customer's
   * account owner and the copy to the operator. 'companies' is each tenant's,
   * sending that tenant's internal mail. Platform is the default tab because
   * it is the one that has to be filled in before the first real customer is
   * activated, and the one an operator is most likely to have overlooked.
   *
   * Only a super admin sees the choice. A company admin has exactly one
   * mailbox to configure and gets the page as it always was.
   */
  const [tab, setTab] = useState<'platform' | 'companies'>('platform');

  // Everything below the tab strip belongs to the per-company mailbox. A
  // company admin has no tabs and always sees it.
  const showCompanyTab = !isUserSuperAdmin || tab === 'companies';

  // Helper to update form fields and reset validation status to idle
  function handleFormChange(fields: Partial<SmtpConfig>) {
    setFormData((prev) => ({ ...prev, ...fields }));
    setValidationState('idle');
  }

  // Fetch companies list if the logged-in user is a super admin
  useEffect(() => {
    if (!isUserSuperAdmin) return;
    async function fetchCompanies() {
      try {
        const list = await getCompanies();
        setCompanies(list);
        if (list.length > 0) {
          setSelectedCompanyId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch companies:', err);
      }
    }
    void fetchCompanies();
  }, [isUserSuperAdmin]);

  // Load configuration for either the standard company or the selected company if Super Admin
  useEffect(() => {
    if (isUserSuperAdmin && selectedCompanyId === undefined) {
      return;
    }

    async function loadConfig() {
      try {
        setLoading(true);
        setError(null);
        setValidationState('idle');
        const data = await getEmailConfig(selectedCompanyId);
        
        if (data.company) {
          setCompanyName(data.company.name);
        } else {
          setCompanyName(null);
        }

        if (data.config && data.config.smtpHost) {
          setFormData({
            smtpHost: data.config.smtpHost || '',
            smtpPort: data.config.smtpPort || 587,
            smtpUser: data.config.smtpUser || '',
            smtpPass: data.config.smtpPass || '',
            smtpFrom: data.config.smtpFrom || '',
          });
          setHasSavedConfig(true);
          setIsEditing(false);
        } else {
          // Reset form to defaults if no config has been set for this company yet
          setFormData({
            smtpHost: '',
            smtpPort: 587,
            smtpUser: '',
            smtpPass: '',
            smtpFrom: '',
          });
          setHasSavedConfig(false);
          setIsEditing(true);
        }
      } catch (err) {
        console.error('Failed to load email config:', err);
        setError(t('email.errorLoad', 'Failed to load email configuration'));
      } finally {
        setLoading(false);
      }
    }
    void loadConfig();
  }, [t, isUserSuperAdmin, selectedCompanyId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setValidationState('idle');
    try {
      await saveEmailConfig(formData, selectedCompanyId);
      showToast(t('email.saveSuccess', 'SMTP configuration saved successfully'), 'success');

      setHasSavedConfig(true);
      setIsEditing(false);
    } catch (err: any) {
      console.error('Failed to save email config:', err);
      const backendError = err.response?.data?.error;
      setError(backendError || t('email.errorSave', 'Failed to save email configuration'));
      showToast(backendError || t('email.errorSave', 'Failed to save email configuration'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setValidationState('checking');
    try {
      const isValid = await verifyEmailConfig(selectedCompanyId);
      if (isValid) {
        setValidationState('success');
      } else {
        setValidationState('failed');
      }
    } catch (err) {
      console.error('Failed to verify email config:', err);
      setValidationState('failed');
    }
  }

  // Only the company tab waits on the company list. Guarding this on the tab
  // matters: the loader below never resolves for a super admin with no
  // companies yet (the config effect returns early while selectedCompanyId is
  // undefined), and without this the platform tab would be unreachable behind
  // a skeleton that never goes away.
  if (showCompanyTab && loading && companies.length === 0 && isUserSuperAdmin) {
    return (
      <div className="page-enter" style={{ maxWidth: 920, margin: '0 auto', padding: '20px' }}>
        <div style={{ height: 200, borderRadius: 14, background: 'var(--surface)', opacity: 0.5, border: '1px solid var(--border)' }} />
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 16 }}>
      {/* Company Header */}
      <section style={{
        background: 'linear-gradient(135deg, rgba(13,33,55,0.95), rgba(24,63,98,0.94))',
        borderRadius: 14,
        border: '1px solid rgba(201,151,58,0.25)',
        padding: '18px 20px',
        color: '#F8FAFC',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Mail size={24} color="var(--accent)" />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 23 }}>{t('nav.email')}</h2>
          </div>
          {companyName && !isUserSuperAdmin && (
             <span style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderRadius: 8,
              padding: '4px 10px',
              border: '1px solid rgba(201,151,58,0.35)',
              background: 'rgba(201,151,58,0.2)',
              color: '#F3D48D',
            }}>
              {companyName}
            </span>
          )}
          {isUserSuperAdmin && (
             <span style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderRadius: 8,
              padding: '4px 10px',
              border: '1px solid rgba(201,151,58,0.35)',
              background: 'rgba(201,151,58,0.2)',
              color: '#F3D48D',
            }}>
              {t('roles.super_admin', 'Super Admin')}
            </span>
          )}
        </div>
        <p style={{ margin: '8px 0 0', color: 'rgba(248,250,252,0.78)', lineHeight: 1.6, fontSize: 14 }}>
          {isUserSuperAdmin
            ? t('email.superAdminConfigSubtitle', 'Seleziona un\'azienda per visualizzare o configurare il suo server SMTP per le email automatiche.')
            : t('email.configSubtitle', 'Configure your company\'s SMTP server to send automated emails (e.g., leave approvals, shift assignments).')}
        </p>
      </section>

      {isUserSuperAdmin && (
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 6,
            padding: 5,
            borderRadius: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <TabButton
            active={tab === 'platform'}
            onClick={() => setTab('platform')}
            icon={<Server size={15} />}
            label={t('email.tabPlatform', 'Piattaforma (VeylOHR)')}
          />
          <TabButton
            active={tab === 'companies'}
            onClick={() => setTab('companies')}
            icon={<Building2 size={15} />}
            label={t('email.tabCompanies', 'Aziende')}
          />
        </div>
      )}

      {isUserSuperAdmin && tab === 'platform' && <PlatformEmailSettings />}

      {/* Super Admin Company Selector Dropdown Card */}
      {showCompanyTab && isUserSuperAdmin && companies.length > 0 && (
        <section style={{
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          padding: '20px',
          display: 'grid',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={20} color="var(--accent)" />
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>
              {t('email.superAdminSelectTitle', 'Gestione SMTP Aziende')}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('email.superAdminSelectDesc', 'Seleziona un\'azienda dall\'elenco per gestire la sua configurazione e-mail dedicata.')}
          </p>
          <div style={{ maxWidth: 400, marginTop: 4 }}>
            <select
              value={selectedCompanyId || ''}
              onChange={(e) => {
                setSelectedCompanyId(Number(e.target.value));
                setValidationState('idle');
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease',
              }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {showCompanyTab && error && <Alert variant="danger" onClose={() => setError(null)}>{error}</Alert>}

      {/* Real-time Email Configuration Validation Alerts */}
      {showCompanyTab && validationState === 'checking' && (
        <Alert variant="warning">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RefreshCw size={16} className="animate-spin" />
            <span>{t('email.checking', 'Checking email configuration…')}</span>
          </span>
        </Alert>
      )}

      {showCompanyTab && validationState === 'success' && (
        <Alert variant="success" onClose={() => setValidationState('idle')}>
          {t('email.verifySuccess', 'Email configuration successful')}
        </Alert>
      )}

      {showCompanyTab && validationState === 'failed' && (
        <Alert variant="danger" onClose={() => setValidationState('idle')}>
          {t('email.verifyFailed', 'Email configuration failed')}
        </Alert>
      )}

      {/* Loading Skeleton during dynamic switching */}
      {showCompanyTab && (loading ? (
        <div style={{ padding: '24px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', display: 'grid', gap: 20 }}>
          <div style={{ height: 40, borderRadius: 8, background: 'var(--border)', opacity: 0.3 }} />
          <div style={{ height: 40, borderRadius: 8, background: 'var(--border)', opacity: 0.3 }} />
          <div style={{ height: 40, borderRadius: 8, background: 'var(--border)', opacity: 0.3 }} />
        </div>
      ) : (
        <section style={{
          background: 'var(--surface)',
          borderRadius: 14,
          border: '1px solid var(--border)',
          padding: '24px',
        }}>
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              <Input
                label={t('email.smtpHost', 'SMTP Host')}
                placeholder="e.g., smtp.gmail.com"
                value={formData.smtpHost}
                onChange={(e) => handleFormChange({ smtpHost: e.target.value })}
                required
                disabled={!isEditing}
              />
              <Input
                label={t('email.smtpPort', 'SMTP Port')}
                type="number"
                placeholder="587"
                value={formData.smtpPort}
                onChange={(e) => handleFormChange({ smtpPort: parseInt(e.target.value, 10) || 0 })}
                required
                disabled={!isEditing}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              <Input
                label={t('email.smtpUser', 'SMTP User / Username')}
                placeholder="e.g., user@company.com"
                value={formData.smtpUser}
                onChange={(e) => handleFormChange({ smtpUser: e.target.value })}
                required
                disabled={!isEditing}
              />
              <div style={{ position: 'relative' }}>
                <Input
                  label={t('email.smtpPass', 'SMTP Password')}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.smtpPass}
                  onChange={(e) => handleFormChange({ smtpPass: e.target.value })}
                  required
                  disabled={!isEditing}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  disabled={!isEditing}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 36,
                    background: 'none',
                    border: 'none',
                    color: !isEditing ? 'var(--text-muted)' : 'var(--text-secondary)',
                    cursor: !isEditing ? 'not-allowed' : 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    opacity: !isEditing ? 0.5 : 1
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Input
              label={t('email.smtpFrom', 'Send Emails From (Address)')}
              placeholder="e.g., HR System <noreply@company.com>"
              value={formData.smtpFrom}
              onChange={(e) => handleFormChange({ smtpFrom: e.target.value })}
              required
              disabled={!isEditing}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px', borderRadius: 8, background: 'rgba(201,151,58,0.05)', border: '1px solid rgba(201,151,58,0.1)' }}>
              <Info size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {t('email.configSecurityNote', 'Credentials are stored securely. Ensure your SMTP provider allows connections from this server.')}
              </p>
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {hasSavedConfig && !isEditing && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleVerify}
                  disabled={validationState === 'checking'}
                >
                  {t('email.verifyBtn', 'Verify Configuration')}
                </Button>
              )}
              
              {!isEditing ? (
                <Button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{ minWidth: 140 }}
                >
                  {t('common.edit', 'Edit Configuration')}
                </Button>
              ) : (
                <>
                  {hasSavedConfig && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setIsEditing(false);
                        setValidationState('idle');
                      }}
                    >
                      {t('common.cancel', 'Cancel')}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    loading={saving}
                    style={{ minWidth: 140 }}
                  >
                    {t('common.save', 'Save Configuration')}
                  </Button>
                </>
              )}
            </div>
          </form>
        </section>
      ))}
    </div>
  );
}

/** One tab in the platform / companies switch. */
const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '10px 14px',
      borderRadius: 9,
      border: '1px solid transparent',
      background: active ? 'var(--background)' : 'transparent',
      borderColor: active ? 'var(--border)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      fontSize: 13,
      fontWeight: active ? 700 : 500,
      cursor: 'pointer',
    }}
  >
    {icon}
    {label}
  </button>
);
