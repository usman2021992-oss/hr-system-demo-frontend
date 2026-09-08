import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Clock,
  CalendarOff,
  Mail,
  AlertTriangle,
  CheckCircle,
  Search,
  Zap,
  FileText,
  Pencil,
} from 'lucide-react';
import { Card, Toggle, Button, Input, Spinner, Select } from '../../components/ui';
import { automationsApi } from '../../api/automations';
import { getCompanies } from '../../api/companies';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { snakeKeys } from '../../api/client';
import { Company } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import AutomationRolesModal from './AutomationRolesModal';

interface AutomationItem {
  id: string;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
  roles: string[];
  triggerKey: string;
  enabled: boolean;
}

interface AutomationCategory {
  id: 'employees' | 'shifts' | 'leave' | 'documents';
  labelKey: string;
  accent: string;
  items: AutomationItem[];
}

interface AutomationApiEntry {
  is_enabled?: boolean;
  recipient_roles?: string[];
}

const ROLE_COLORS: Record<string, string> = {
  store_manager: '#7C3AED',
  area_manager: '#15803D',
  hr: '#0284C7',
  admin: '#C9973A',
  employee: '#64748B',
};

const INITIAL_DATA: AutomationCategory[] = [
  {
    id: 'employees',
    labelKey: 'automations.categories.employees',
    accent: '#0284C7',
    items: [
      { id: 'benvenuto_email', icon: <Mail size={18} />, labelKey: 'automations.items.benvenuto_email.label', descKey: 'automations.items.benvenuto_email.desc', roles: ['employee'], triggerKey: 'automations.items.benvenuto_email.trigger', enabled: true },
    ],
  },
  {
    id: 'shifts',
    labelKey: 'automations.categories.shifts',
    accent: '#DC2626',
    items: [
      { id: 'anomalia_ritardo', icon: <Clock size={18} />, labelKey: 'automations.items.anomalia_ritardo.label', descKey: 'automations.items.anomalia_ritardo.desc', roles: ['store_manager', 'area_manager'], triggerKey: 'automations.items.anomalia_ritardo.trigger', enabled: true },
      { id: 'anomalia_noshow', icon: <AlertTriangle size={18} />, labelKey: 'automations.items.anomalia_noshow.label', descKey: 'automations.items.anomalia_noshow.desc', roles: ['store_manager', 'area_manager', 'hr'], triggerKey: 'automations.items.anomalia_noshow.trigger', enabled: true },
      { id: 'notifica_turni', icon: <Mail size={18} />, labelKey: 'automations.items.notifica_turni.label', descKey: 'automations.items.notifica_turni.desc', roles: ['employee'], triggerKey: 'automations.items.notifica_turni.trigger', enabled: false },
      { id: 'approvazione_turni', icon: <CheckCircle size={18} />, labelKey: 'automations.items.approvazione_turni.label', descKey: 'automations.items.approvazione_turni.desc', roles: ['hr'], triggerKey: 'automations.items.approvazione_turni.trigger', enabled: false },
    ],
  },
  {
    id: 'leave',
    labelKey: 'automations.categories.leave',
    accent: '#7C3AED',
    items: [
      { id: 'ferie_approvazione', icon: <CalendarOff size={18} />, labelKey: 'automations.items.ferie_approvazione.label', descKey: 'automations.items.ferie_approvazione.desc', roles: ['store_manager', 'area_manager', 'hr'], triggerKey: 'automations.items.ferie_approvazione.trigger', enabled: true },
      { id: 'ferie_esito', icon: <CalendarOff size={18} />, labelKey: 'automations.items.ferie_esito.label', descKey: 'automations.items.ferie_esito.desc', roles: ['employee'], triggerKey: 'automations.items.ferie_esito.trigger', enabled: true },
    ],
  },
  {
    id: 'documents',
    labelKey: 'automations.categories.documents',
    accent: '#0D9488',
    items: [
      { id: 'document_signature', icon: <FileText size={18} />, labelKey: 'automations.items.document_signature.label', descKey: 'automations.items.document_signature.desc', roles: ['admin', 'hr', 'employee'], triggerKey: 'automations.items.document_signature.trigger', enabled: true },
    ],
  },
];

export default function AutomationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();
  const { showToast } = useToast();

  const [categories, setCategories] = useState(INITIAL_DATA);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);

  const isSuperAdmin = user?.isSuperAdmin === true;
  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  React.useEffect(() => {
    if (isSuperAdmin) {
      getCompanies().then(setCompanies).catch(console.error);
    }
  }, [isSuperAdmin]);

  const fetchAutomations = async (companyId?: number) => {
    setLoading(true);
    try {
      const data = snakeKeys(await automationsApi.getAutomations(companyId)) as Record<string, boolean | AutomationApiEntry>;
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((item) => {
            const entry = data[item.id];
            if (typeof entry === 'boolean') {
              return { ...item, enabled: entry };
            }
            return {
              ...item,
              enabled: entry?.is_enabled ?? item.enabled,
              roles: entry?.recipient_roles ?? item.roles,
            };
          }),
        })),
      );
      setPendingChanges({});
    } catch (err) {
      console.error('Failed to fetch automations', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isSuperAdmin && !selectedCompanyId) {
      setLoading(false);
      return;
    }
    void fetchAutomations(selectedCompanyId || undefined);
  }, [selectedCompanyId, isSuperAdmin]);

  const toggleAutomation = (catId: string, itemId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) => (item.id !== itemId ? item : { ...item, enabled: nextEnabled })),
            },
      ),
    );
    setPendingChanges((prev) => ({ ...prev, [itemId]: nextEnabled }));
  };

  const handleSave = async () => {
    const changedIds = Object.keys(pendingChanges);
    if (changedIds.length === 0) return;

    setSaving(true);
    try {
      await Promise.all(
        changedIds.map((id) =>
          automationsApi.updateAutomation(id, {
            isEnabled: pendingChanges[id],
            companyId: selectedCompanyId || undefined,
          }),
        ),
      );
      setPendingChanges({});
      showToast(t('common.success'), 'success');
    } catch (err) {
      console.error('Failed to save automations', err);
      showToast(t('common.error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const editingAutomation = useMemo(
    () => categories.flatMap((category) => category.items).find((item) => item.id === editingAutomationId) ?? null,
    [categories, editingAutomationId],
  );

  const handleSaveRoles = async (roles: string[]) => {
    if (!editingAutomationId || !isSuperAdmin || !selectedCompanyId) return;

    await automationsApi.updateAutomation(editingAutomationId, {
      recipientRoles: roles,
      companyId: selectedCompanyId,
    });

    setCategories((prev) =>
      prev.map((cat) => ({
        ...cat,
        items: cat.items.map((item) => (item.id === editingAutomationId ? { ...item, roles } : item)),
      })),
    );
    showToast(t('notifications.saveRoles', 'Save roles'), 'success');
  };

  const totalEnabled = categories.flatMap((category) => category.items).filter((item) => item.enabled).length;
  const totalItems = categories.flatMap((category) => category.items).length;

  return (
    <div className="page-enter" style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '16px 0' : '24px 20px' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
            {t('automations.page_title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {totalEnabled}/{totalItems} {t('common.active', 'active')} · {t('automations.control_panel')}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          {isSuperAdmin && (
            <div style={{ width: isMobile ? '100%' : 240 }}>
              <Select
                value={selectedCompanyId || ''}
                onChange={(e) => setSelectedCompanyId(Number((e.target as HTMLSelectElement).value))}
                style={{ height: 38, fontSize: 13, borderRadius: 10, background: 'var(--background)' }}
              >
                <option value="" disabled>{t('common.select_company', 'Select a Company...')}</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div style={{ position: 'relative', width: isMobile ? '100%' : 'auto' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)' }} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('automations.search_placeholder')}
              style={{ paddingLeft: 32, height: 38, width: isMobile ? '100%' : 220, fontSize: 13, borderRadius: 10 }}
            />
          </div>
          <Button
            variant="primary"
            style={{ height: 38, padding: '0 20px', minWidth: 100, borderRadius: 10, fontWeight: 700, width: isMobile ? '100%' : 'auto' }}
            onClick={handleSave}
            disabled={saving || Object.keys(pendingChanges).length === 0}
          >
            {saving ? <Spinner size="sm" color="#fff" /> : t('common.save')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 14 }}>{t('common.loading')}</p>
        </div>
      ) : isSuperAdmin && !selectedCompanyId ? (
        <div
          style={{
            padding: '120px 40px',
            textAlign: 'center',
            background: 'var(--background-alt)',
            borderRadius: 24,
            border: '2px dashed var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'var(--background)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: 'var(--accent)',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
            }}
          >
            <Users size={40} />
          </div>
          <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>
            {t('automations.select_company_title', 'Select a Company')}
          </h3>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
            {t('automations.select_company_desc', 'To manage email automations, please select a company from the dropdown menu above. You can customize settings individually for each business.')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {categories.map((cat) => {
            const filteredItems = cat.items.filter(
              (item) =>
                t(item.labelKey).toLowerCase().includes(search.toLowerCase()) ||
                t(item.descKey).toLowerCase().includes(search.toLowerCase()),
            );

            if (search && filteredItems.length === 0) return null;

            return (
              <div key={cat.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '0 4px' }}>
                  <div style={{ width: 4, height: 18, background: cat.accent, borderRadius: 2 }} />
                  <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                    {t(cat.labelKey)}
                  </h2>
                  <span style={{ fontSize: 12, color: 'var(--text-disabled)', fontWeight: 500 }}>({filteredItems.length})</span>
                </div>

                <Card padding="none" style={{ overflow: 'hidden' }}>
                  {filteredItems.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '20px',
                        borderBottom: idx < filteredItems.length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex',
                        gap: 16,
                        alignItems: 'flex-start',
                        background: item.enabled ? 'transparent' : 'var(--background-alt)',
                        opacity: item.enabled ? 1 : 0.7,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          flexShrink: 0,
                          background: item.enabled ? `${cat.accent}12` : 'var(--border)',
                          border: `1px solid ${item.enabled ? cat.accent : 'var(--border)'}30`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: item.enabled ? cat.accent : 'var(--text-disabled)',
                        }}
                      >
                        {item.icon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t(item.labelKey)}</span>
                            {!item.enabled && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#DC2626',
                                  background: '#FEF2F2',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  border: '1px solid rgba(220,38,38,0.2)',
                                }}
                              >
                                OFF
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditingAutomationId(item.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  color: 'var(--text-primary)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                aria-label={`Edit roles for ${t(item.labelKey)}`}
                              >
                                <Pencil size={17} />
                              </button>
                            )}
                            <Toggle checked={item.enabled} onChange={() => toggleAutomation(cat.id, item.id, item.enabled)} />
                          </div>
                        </div>

                        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 12px' }}>{t(item.descKey)}</p>

                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-disabled)' }}>
                            <Zap size={11} />
                            {t('automations.trigger_label')}: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t(item.triggerKey)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {item.roles.map((role) => (
                              <span
                                key={role}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '1px 7px',
                                  borderRadius: 6,
                                  color: ROLE_COLORS[role] || '#6B7280',
                                  background: `${ROLE_COLORS[role] || '#6B7280'}12`,
                                  border: `1px solid ${ROLE_COLORS[role] || '#6B7280'}20`,
                                }}
                              >
                                {t(`roles.${role}`, { defaultValue: role.replace('_', ' ') })}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>
              </div>
            );
          })}

          {search && categories.every((cat) => cat.items.filter((item) => t(item.labelKey).toLowerCase().includes(search.toLowerCase()) || t(item.descKey).toLowerCase().includes(search.toLowerCase())).length === 0) && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {t('common.noResults')}
            </div>
          )}
        </div>
      )}

      {editingAutomation && selectedCompany && isSuperAdmin && (
        <AutomationRolesModal
          open={Boolean(editingAutomation)}
          onClose={() => setEditingAutomationId(null)}
          companyName={selectedCompany.name}
          automationTitle={t(editingAutomation.labelKey)}
          automationDescription={t(editingAutomation.descKey)}
          currentRoles={editingAutomation.roles}
          onSave={handleSaveRoles}
        />
      )}
    </div>
  );
}
