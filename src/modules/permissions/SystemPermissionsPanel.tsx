import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Clock,
  CalendarCheck,
  CalendarOff,
  Store,
  MessageSquare,
  FileText,
  Briefcase,
  BarChart2,
  Settings,
  Wallet,
  AlertTriangle,
  Shield,
  ArrowLeftRight,
  Monitor,
  Clipboard,
  Bell,
  Zap,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import {
  getCompaniesPermissions,
  updateCompanyPermissions,
  CompanyPermissions,
  SystemPermissionUpdate,
} from '../../api/systemPermissions';
import { getCompanyById } from '../../api/companies';
import { getCompanyLogoUrl, getAvatarUrl } from '../../api/client';
import { Company } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { translateApiError } from '../../utils/apiErrors';
import { useToast } from '../../context/ToastContext';
import GroupRoleVisibilityPanel from './GroupRoleVisibilityPanel';
import { ManagedRoleKey, SystemModuleKey, isRoleEligibleForModule, MODULE_ROLE_ELIGIBILITY } from './permissionCatalog';
import PermissionGridTable, { GridModuleDef } from './PermissionGridTable';
import ConfirmModal from '../../components/ui/ConfirmModal';

const SYSTEM_MODULES: GridModuleDef[] = [
  { key: 'negozi',      implemented: true, icon: <Store size={15} /> },
  { key: 'dipendenti',  implemented: true, icon: <Users size={15} /> },
  { key: 'ats',         implemented: true, icon: <Briefcase size={15} /> },
  { key: 'onboarding',  implemented: true, icon: <Clipboard size={15} /> },
  { key: 'documenti',   implemented: true, icon: <FileText size={15} /> },
  { key: 'team_documents', implemented: true, icon: <FileText size={15} /> },
  { key: 'terminali',   implemented: true, icon: <Monitor size={15} /> },
  { key: 'turni',       implemented: true, icon: <Clock size={15} /> },
  { key: 'trasferimenti', implemented: true, icon: <ArrowLeftRight size={15} /> },
  { key: 'presenze',    implemented: true, icon: <CalendarCheck size={15} /> },
  { key: 'anomalie',    implemented: true, icon: <AlertTriangle size={15} /> },
  { key: 'permessi',    implemented: true, icon: <CalendarOff size={15} /> },
  { key: 'notifiche',   implemented: true, icon: <Bell size={15} /> },
  { key: 'saldi',       implemented: true, icon: <Wallet size={15} /> },
  { key: 'messaggi',    implemented: true, icon: <MessageSquare size={15} /> },
  { key: 'gestione_accessi', implemented: true, icon: <Shield size={15} /> },
  { key: 'impostazioni',implemented: true, icon: <Settings size={15} /> },
  { key: 'automazioni', implemented: true, icon: <Zap size={15} /> },
  { key: 'report',      implemented: true,  icon: <BarChart2 size={15} /> },
];

type LocalGrid = Record<SystemModuleKey, Record<ManagedRoleKey, boolean>>;
type SavingMap = Record<string, boolean>;

const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, l) => l.toUpperCase());

function buildLocalGrid(grid: CompanyPermissions['grid']): LocalGrid {
  const result: any = {};
  for (const modDef of SYSTEM_MODULES) {
    if (!modDef.implemented) continue;
    const mod = modDef.key as SystemModuleKey;
    const camelMod = snakeToCamel(mod) as SystemModuleKey; // 'gestione_accessi' → 'gestioneAccessi'
    const g = (grid as any)[camelMod] ?? (grid as any)[mod]; // fallback to snake_case just in case
    result[mod] = {
      admin:          isRoleEligibleForModule('admin', mod) ? (g?.admin ?? false) : false,
      hr:             isRoleEligibleForModule('hr', mod) ? (g?.hr ?? false) : false,
      area_manager:   isRoleEligibleForModule('area_manager', mod) ? (g?.areaManager ?? false) : false,
      store_manager:  isRoleEligibleForModule('store_manager', mod) ? (g?.storeManager ?? false) : false,
      employee:       isRoleEligibleForModule('employee', mod) ? (g?.employee ?? false) : false,
      store_terminal: isRoleEligibleForModule('store_terminal', mod) ? (g?.storeTerminal ?? false) : false,
    };
  }
  return result;
}

const SystemPermissionsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [loading, setLoading]         = useState(true);
  const [companies, setCompanies]     = useState<CompanyPermissions[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [grids, setGrids]             = useState<Record<number, LocalGrid>>({});
  const [saving, setSaving]           = useState<Record<number, SavingMap>>({});
  const savingRef                     = React.useRef<Record<number, SavingMap>>({});
  const [lastSaved, setLastSaved]     = useState<Record<number, string>>({});
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);

  // Company details for modal UI (logo, owner info)
  const [companyDetails, setCompanyDetails] = useState<Record<number, Company>>({});

  // Confirmation modal state for disabling modules for Admin
  const [confirmDisable, setConfirmDisable] = useState<{ moduleKey: string; moduleLabel: string } | null>(null);

  // Admin-required modal state: shown when trying to enable a non-admin role while admin is disabled
  const [adminRequired, setAdminRequired] = useState<{ moduleKey: string; moduleLabel: string } | null>(null);

  const fetchPermissions = React.useCallback((isSilent = false) => {
    // Skip background fetch if currently saving to prevent state race conditions
    if (selectedCompanyId != null && Object.keys(savingRef.current[selectedCompanyId] || {}).length > 0) return;

    if (!isSilent) {
      setLoading(true);
    }
    getCompaniesPermissions()
      .then(({ companies: data }) => {
        setCompanies(data);
        if (data.length > 0 && selectedCompanyId == null) {
          setSelectedCompanyId(data[0].id);
        }
        const built: Record<number, LocalGrid> = {};
        for (const c of data) built[c.id] = buildLocalGrid(c.grid);
        setGrids(built);
      })
      .catch((err) => {
        if (!isSilent) {
          setErrorMsg(translateApiError(err, t, t('permissions.errorLoad')));
        }
      })
      .finally(() => {
        if (!isSilent) {
          setLoading(false);
        }
      });
  }, [t, selectedCompanyId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'hr_permissions_updated') {
        fetchPermissions();
      }
    };
    const handleFocus = () => {
      fetchPermissions();
    };

    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('focus', handleFocus);

    // Poll every 10 seconds silently to sync changes across different devices/browsers
    const interval = setInterval(() => {
      fetchPermissions(true);
    }, 10 * 1000);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [fetchPermissions]);

  const activeCompany = companies.find(c => c.id === selectedCompanyId);

  // Fetch company details (logo, owner) when company selection changes
  useEffect(() => {
    if (selectedCompanyId == null) return;
    if (companyDetails[selectedCompanyId]) return; // already cached
    getCompanyById(selectedCompanyId)
      .then((detail) => {
        setCompanyDetails((prev) => ({ ...prev, [selectedCompanyId]: detail }));
      })
      .catch(() => { /* silently ignore — modal will degrade gracefully */ });
  }, [selectedCompanyId]);

  const executeToggle = async (mod: string, role: ManagedRoleKey, newValue: boolean): Promise<void> => {
    if (!activeCompany) return;
    const sysMod = mod as SystemModuleKey;
    const cid = activeCompany.id;
    const cellKey = `${mod}:${role}`;

    // Optimistic update
    setGrids((prev) => ({
      ...prev,
      [cid]: {
        ...prev[cid],
        [sysMod]: { ...prev[cid][sysMod], [role]: newValue },
      },
    }));
    setSaving((prev) => {
      const next = {
        ...prev,
        [cid]: { ...(prev[cid] ?? {}), [cellKey]: true },
      };
      savingRef.current = next;
      return next;
    });
    setLastSaved((prev) => ({ ...prev, [cid]: '' }));

    const updates: SystemPermissionUpdate[] = [{ module: sysMod, role, enabled: newValue }];
    try {
      await updateCompanyPermissions(cid, updates);
      setLastSaved((prev) => ({ ...prev, [cid]: cellKey }));
      setTimeout(() => setLastSaved((prev) => ({ ...prev, [cid]: prev[cid] === cellKey ? '' : prev[cid] })), 1800);
      localStorage.setItem('hr_permissions_updated', Date.now().toString());
    } catch (err) {
      // Revert
      setGrids((prev) => ({
        ...prev,
        [cid]: {
          ...prev[cid],
          [sysMod]: { ...prev[cid][sysMod], [role]: !newValue },
        },
      }));
      showToast(translateApiError(err, t, t('permissions.errorSave')) ?? t('permissions.errorSave'), 'error');
    } finally {
      setSaving((prev) => {
        const next = { ...prev[cid] };
        delete next[cellKey];
        const nextSaving = { ...prev, [cid]: next };
        savingRef.current = nextSaving;
        return nextSaving;
      });
    }
  };

  const handleToggle = async (mod: string, role: ManagedRoleKey): Promise<void> => {
    if (!activeCompany) return;
    const sysMod = mod as SystemModuleKey;
    if (!isRoleEligibleForModule(role, sysMod)) return;

    const cid = activeCompany.id;
    const currentValue = grids[cid]?.[sysMod]?.[role] ?? false;
    const newValue = !currentValue;

    // If trying to ENABLE a non-admin role, check if admin is enabled for this module
    if (role !== 'admin' && newValue === true) {
      const adminEnabled = grids[cid]?.[sysMod]?.['admin'] ?? false;
      if (!adminEnabled) {
        setAdminRequired({
          moduleKey: mod,
          moduleLabel: t(`permissions.modules.${mod}`, mod),
        });
        return;
      }
    }

    // If role is 'admin' and current value is enabled (true), we are disabling it: show confirm modal
    if (role === 'admin' && currentValue) {
      setConfirmDisable({
        moduleKey: mod,
        moduleLabel: t(`permissions.modules.${mod}`, mod),
      });
      return;
    }

    await executeToggle(mod, role, newValue);
  };

  const handleConfirmDisable = async (): Promise<void> => {
    if (!confirmDisable || !activeCompany) return;
    const { moduleKey } = confirmDisable;
    setConfirmDisable(null);

    const cid = activeCompany.id;
    const sysMod = moduleKey as SystemModuleKey;
    const cellKey = `${moduleKey}:admin`;

    // Disable for admin and all other eligible roles
    const updates: SystemPermissionUpdate[] = [{ module: sysMod, role: 'admin', enabled: false }];
    const eligibleRoles = MODULE_ROLE_ELIGIBILITY[sysMod] || [];
    eligibleRoles.forEach((r) => {
      if (r !== 'admin') {
        updates.push({ module: sysMod, role: r, enabled: false });
      }
    });

    const previousState = { ...grids[cid]?.[sysMod] };

    // Optimistic update of state
    setGrids((prev) => {
      const nextGrids = { ...prev };
      nextGrids[cid] = {
        ...nextGrids[cid],
        [sysMod]: { ...nextGrids[cid]?.[sysMod] },
      };
      updates.forEach((upd) => {
        nextGrids[cid][sysMod][upd.role] = false;
      });
      return nextGrids;
    });

    setSaving((prev) => {
      const next = {
        ...prev,
        [cid]: { ...(prev[cid] ?? {}), [cellKey]: true },
      };
      savingRef.current = next;
      return next;
    });
    setLastSaved((prev) => ({ ...prev, [cid]: '' }));

    try {
      await updateCompanyPermissions(cid, updates);
      setLastSaved((prev) => ({ ...prev, [cid]: cellKey }));
      setTimeout(() => setLastSaved((prev) => ({ ...prev, [cid]: prev[cid] === cellKey ? '' : prev[cid] })), 1800);
      localStorage.setItem('hr_permissions_updated', Date.now().toString());
    } catch (err) {
      // Revert state
      setGrids((prev) => {
        const nextGrids = { ...prev };
        nextGrids[cid] = {
          ...nextGrids[cid],
          [sysMod]: { ...nextGrids[cid]?.[sysMod], ...previousState },
        };
        return nextGrids;
      });
      showToast(translateApiError(err, t, t('permissions.errorSave')) ?? t('permissions.errorSave'), 'error');
    } finally {
      setSaving((prev) => {
        const next = { ...prev[cid] };
        delete next[cellKey];
        const nextSaving = { ...prev, [cid]: next };
        savingRef.current = nextSaving;
        return nextSaving;
      });
    }
  };

  const getDeactivatedRolesList = (moduleKey: string): string => {
    const roles = MODULE_ROLE_ELIGIBILITY[moduleKey as SystemModuleKey] || [];
    const otherRoles = roles.filter(r => r !== 'admin');
    return otherRoles.map(r => t(`roles.${r}`, r)).join(', ');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
        <Spinner size="lg" color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ fontFamily: 'var(--font-body)', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
          {t('nav.permissions')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {t('permissions.systemSubtitle')}
        </p>
      </div>

      {errorMsg && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="danger" title={t('common.error')} onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
        </div>
      )}

      {/* Group role visibility */}
      <GroupRoleVisibilityPanel />

      {/* Company Tabs */}
      {companies.length > 1 && (
        <div style={{
          marginBottom: 20,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '6px'
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
            {companies.map((company) => {
              const isSelected = company.id === selectedCompanyId;
              return (
                <button
                  key={company.id}
                  onClick={() => setSelectedCompanyId(company.id)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 8,
                    border: isSelected ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                    background: isSelected ? 'var(--primary)' : 'var(--surface)',
                    color: isSelected ? '#fff' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-body)',
                    boxShadow: isSelected ? '0 2px 8px rgba(13,33,55,0.18)' : 'none',
                    flexShrink: 0
                  }}
                >
                  {company.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Permission Grid */}
      {activeCompany && (
        <>
          <PermissionGridTable
            modules={SYSTEM_MODULES}
            grid={grids[activeCompany.id] as any}
            saving={saving[activeCompany.id] || {}}
            lastSaved={lastSaved[activeCompany.id] || null}
            onToggle={handleToggle}
          />
          {/* Auto-save hint */}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: 'var(--text-disabled)', fontStyle: 'italic' }}>
              {t('permissions.autoSaveHint', { defaultValue: 'Le modifiche vengono salvate automaticamente' })}
            </span>
          </div>
        </>
      )}

      {/* Deactivation confirmation modal with company/admin info */}
      <ConfirmModal
        open={!!confirmDisable}
        onCancel={() => setConfirmDisable(null)}
        onConfirm={handleConfirmDisable}
        title={t('permissions.disableModuleConfirmTitle', 'Disattivare modulo?')}
        message={t('permissions.disableModuleConfirmMessage', {
          module: confirmDisable?.moduleLabel || '',
          roles: confirmDisable ? getDeactivatedRolesList(confirmDisable.moduleKey) : '',
        })}
        confirmLabel={t('common.confirm', 'Conferma')}
        cancelLabel={t('common.cancel', 'Annulla')}
        variant="danger"
      >
        {/* Company and Admin info card */}
        {activeCompany && (() => {
          const detail = companyDetails[activeCompany.id];
          const companyLogoUrl = detail ? getCompanyLogoUrl(detail.logoFilename) : null;
          const adminAvatarUrl = detail ? getAvatarUrl(detail.ownerAvatarFilename) : null;
          const adminFullName = detail ? [detail.ownerName, detail.ownerSurname].filter(Boolean).join(' ') : null;
          const companyInitial = activeCompany.name?.charAt(0)?.toUpperCase() || 'C';
          const adminInitial = adminFullName ? adminFullName.charAt(0).toUpperCase() : 'A';

          return (
            <div style={{
              background: 'var(--bg-secondary, rgba(13,33,55,0.03))',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              border: '1px solid var(--border)',
            }}>
              {/* Company row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: companyLogoUrl ? 'transparent' : 'linear-gradient(135deg, var(--primary), var(--primary-dark, #0a1e38))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0,
                  border: '1.5px solid var(--border)',
                }}>
                  {companyLogoUrl ? (
                    <img src={companyLogoUrl} alt={activeCompany.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Building2 size={16} color="#fff" />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {activeCompany.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {t('common.company', 'Company')}
                  </div>
                </div>
              </div>
              {/* Admin row */}
              {adminFullName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 999,
                    background: adminAvatarUrl ? 'transparent' : 'linear-gradient(135deg, #e74c3c, #c0392b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', flexShrink: 0,
                    border: '1.5px solid var(--border)',
                  }}>
                    {adminAvatarUrl ? (
                      <img src={adminAvatarUrl} alt={adminFullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{adminInitial}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                      {adminFullName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                      Admin
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </ConfirmModal>

      {/* Admin-required info modal: shown when trying to enable non-admin role but admin is disabled */}
      <ConfirmModal
        open={!!adminRequired}
        onCancel={() => setAdminRequired(null)}
        onConfirm={() => setAdminRequired(null)}
        title={t('permissions.adminRequiredTitle', 'Admin role required')}
        message={t('permissions.adminRequiredMessage', {
          module: adminRequired?.moduleLabel || '',
        })}
        confirmLabel={t('permissions.adminRequiredOk', 'Got it')}
        cancelLabel={t('common.cancel', 'Annulla')}
        variant="warning"
      >
        {activeCompany && (() => {
          const detail = companyDetails[activeCompany.id];
          const companyLogoUrl = detail ? getCompanyLogoUrl(detail.logoFilename) : null;
          const companyInitial = activeCompany.name?.charAt(0)?.toUpperCase() || 'C';

          return (
            <div style={{
              background: 'rgba(201,151,58,0.06)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: '1px solid rgba(201,151,58,0.2)',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: companyLogoUrl ? 'transparent' : 'linear-gradient(135deg, var(--primary), var(--primary-dark, #0a1e38))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
                border: '1.5px solid var(--border)',
              }}>
                {companyLogoUrl ? (
                  <img src={companyLogoUrl} alt={activeCompany.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Building2 size={15} color="#fff" />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {activeCompany.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <ShieldAlert size={12} />
                  Admin: {t('common.disabled', 'Disabled')}
                </div>
              </div>
            </div>
          );
        })()}
      </ConfirmModal>
    </div>
  );
};

export default SystemPermissionsPanel;
