import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../context/ToastContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { getCompanies, updateCompany, uploadCompanyLogo } from '../../api/companies';
import { getCompanyLogoUrl } from '../../api/client';
import { getApiErrorCode } from '../../utils/apiErrors';
import { translateApiError } from '../../utils/apiErrors';
import { Company } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';

// ── Edit icon ──────────────────────────────────────────────────────────────────
const IconEdit = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

// ── Stat chip ──────────────────────────────────────────────────────────────────
const StatChip: React.FC<{ value: number; label: string; accent: string }> = ({ value, label, accent }) => (
  <div style={{
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 'var(--radius)',
      background: `${accent}12`, border: `1px solid ${accent}25`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />
    </div>
    <div>
      <div style={{
        fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-display)',
        color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em',
      }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '3px' }}>{label}</div>
    </div>
  </div>
);

// ── Detail row ────────────────────────────────────────────────────────────────
const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', borderBottom: '1px solid var(--border-light)',
  }}>
    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{value}</span>
  </div>
);

export function CompanyList() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formNameError, setFormNameError] = useState<string | undefined>();
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCompanies();
      setCompany(data[0] ?? null);
    } catch {
      setError(t('companies.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = () => {
    if (!company) return;
    setFormName(company.name);
    setFormNameError(undefined);
    setFormError(null);
    setLogoError(null);
    setFormOpen(true);
  };

  const closeEdit = () => {
    setFormOpen(false);
    setFormError(null);
    setFormNameError(undefined);
    setLogoError(null);
    setLogoUploading(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    setLogoUploading(true);
    setLogoError(null);
    try {
      await uploadCompanyLogo(company.id, file);
      showToast(t('companies.logoUpdated'), 'success');
      await load();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('companies.logoError')) ?? t('companies.logoError');
      if (getApiErrorCode(err) === 'INVALID_FILE_TYPE') {
        showToast(message, 'warning');
      }
      setLogoError(message);
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!company) return;
    if (!formName.trim()) {
      setFormNameError(t('companies.validationName'));
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      await updateCompany(company.id, { name: formName.trim() });
      closeEdit();
      showToast(t('companies.updatedSuccess'), 'success');
      await load();
    } catch (err: unknown) {
      setFormError(translateApiError(err, t, t('companies.errorSave')));
    } finally {
      setFormSaving(false);
    }
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {[1, 2].map((i) => (
          <div key={i} style={{
            height: i === 1 ? 100 : 56,
            background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)', opacity: 0.6,
          }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', maxWidth: '860px', margin: '0 auto' }}>
        <Alert variant="danger" title={t('common.error')} onClose={() => setError(null)}>{error}</Alert>
      </div>
    );
  }

  if (!company) return null;

  const locale = i18n.language?.startsWith('it') ? 'it-IT' : 'en-GB';
  const createdDate = new Date(company.createdAt).toLocaleDateString(locale, {
    year: 'numeric', month: 'long',
  });

  return (
    <div className="page-enter" style={{ padding: '24px', maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, #C9973A 0%, #B5852E 100%)',
        borderRadius: 'var(--radius-lg)', padding: '24px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        flexWrap: 'wrap',
        boxShadow: '0 4px 20px rgba(201,151,58,0.25)',
      }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700,
            color: '#FFFFFF', margin: '0 0 4px', letterSpacing: '-0.02em',
          }}>
            {company.name}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', margin: 0 }}>
            {t('companies.title')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={openEdit}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.30)',
            color: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconEdit />
            {t('common.edit')}
          </span>
        </Button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
        <StatChip value={company.storeCount} label={t('companies.statStores')} accent="#0284C7" />
        <StatChip value={company.employeeCount} label={t('companies.statEmployees')} accent="#15803D" />
      </div>

      {/* ── Details card ── */}
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 600,
            color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em',
          }}>
            {t('companies.detailsTitle')}
          </h3>
        </div>
        <div style={{ padding: '4px 24px 12px' }}>
          <DetailRow label={t('companies.labelName')} value={company.name} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{t('companies.labelCreated')}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{createdDate}</span>
          </div>
        </div>
      </div>

      {/* ── Edit modal ── */}
      <Modal
        open={formOpen}
        onClose={closeEdit}
        title={t('companies.editCompany')}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={formSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} loading={formSaving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {formError && (
            <Alert variant="danger" onClose={() => setFormError(null)}>{formError}</Alert>
          )}
          {logoError && (
            <Alert variant="danger" onClose={() => setLogoError(null)}>{logoError}</Alert>
          )}
          <Input
            label={t('companies.fieldName')}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            error={formNameError}
            placeholder={t('companies.placeholderName')}
            disabled={formSaving}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('companies.logoField')}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                background: 'var(--surface-warm)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}>
                {company.logoFilename ? (
                  <img src={getCompanyLogoUrl(company.logoFilename) ?? ''} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : 'LOGO'}
              </div>

              <input
                id="company-logo-upload-company-list"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
                disabled={logoUploading || formSaving}
              />
              <label
                htmlFor="company-logo-upload-company-list"
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-warm)',
                  cursor: logoUploading || formSaving ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  opacity: logoUploading || formSaving ? 0.7 : 1,
                }}
              >
                {logoUploading ? t('companies.logoUploading') : t('companies.uploadLogo')}
              </label>
            </div>

            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('companies.logoHint')}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default CompanyList;
