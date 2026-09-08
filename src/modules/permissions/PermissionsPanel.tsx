import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, Clock, CalendarCheck, CalendarOff, Store, MessageSquare,
  FileText, Briefcase, BarChart2, Settings, Wallet, AlertTriangle, Shield, ArrowLeftRight, Monitor, Bell, Clipboard, Zap, Layers,
  Building2, ShieldAlert
} from 'lucide-react';
import { getPermissions, updatePermissions } from '../../api/permissions';
import { getCompanies } from '../../api/companies';
import { getCompanyLogoUrl, getAvatarUrl } from '../../api/client';
import { translateApiError } from '../../utils/apiErrors';
import { PermissionGrid, Company } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MANAGED_ROLE_KEYS, ModuleKey, ManagedRoleKey, isRoleEligibleForModule, MODULE_ROLE_ELIGIBILITY } from './permissionCatalog';
import PermissionGridTable, { GridModuleDef } from './PermissionGridTable';
import ConfirmModal from '../../components/ui/ConfirmModal';

const MODULE_KEYS: GridModuleDef[] = [
  { key: 'negozi',       implemented: true,  icon: <Store size={15} /> },
  { key: 'dipendenti',   implemented: true,  icon: <Users size={15} /> },
  { key: 'ats',          implemented: true,  icon: <Briefcase size={15} /> },
  { key: 'onboarding',   implemented: true,  icon: <Clipboard size={15} /> },
  { key: 'documenti',    implemented: true,  icon: <FileText size={15} /> },
  { key: 'team_documents', implemented: true, icon: <FileText size={15} /> },
  { key: 'terminali',    implemented: true,  icon: <Monitor size={15} /> },
  { key: 'turni',        implemented: true,  icon: <Clock size={15} /> },
  { key: 'trasferimenti',implemented: true,  icon: <ArrowLeftRight size={15} /> },
  { key: 'presenze',     implemented: true,  icon: <CalendarCheck size={15} /> },
  { key: 'anomalie',     implemented: true,  icon: <AlertTriangle size={15} /> },
  { key: 'permessi',     implemented: true,  icon: <CalendarOff size={15} /> },
  { key: 'notifiche',    implemented: true,  icon: <Bell size={15} /> },
  { key: 'saldi',        implemented: true,  icon: <Wallet size={15} /> },
  { key: 'messaggi',     implemented: true,  icon: <MessageSquare size={15} /> },
  { key: 'gestione_accessi', implemented: true, icon: <Shield size={15} /> },
  { key: 'impostazioni', implemented: true,  icon: <Settings size={15} /> },
  { key: 'automazioni',  implemented: true,  icon: <Zap size={15} /> },
  { key: 'report',       implemented: true,  icon: <BarChart2 size={15} /> },
];

type LocalGrid = Record<string, Record<string, boolean>>;
type SavingMap = Record<string, boolean>;
type CompanyOption = { id: number; name: string };

const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, l) => l.toUpperCase());

// Axios camelizes ALL response keys including module names.
// 'gestione_accessi' in the backend becomes 'gestioneAccessi' after transformation.
// We must use the camelized key to look up values in data.grid.
function buildLocalGrid(data: PermissionGrid): LocalGrid {
  const result: LocalGrid = {};
  for (const mod of MODULE_KEYS) {
    if (!mod.implemented) continue;
    const camelModKey = snakeToCamel(mod.key); // e.g. 'gestione_accessi' → 'gestioneAccessi'
    result[mod.key] = {};
    for (const roleKey of MANAGED_ROLE_KEYS) {
      const camelKey = snakeToCamel(roleKey); // e.g. 'area_manager' → 'areaManager'
      const eligible = isRoleEligibleForModule(roleKey, mod.key as ModuleKey);
      result[mod.key][roleKey] = eligible ? (data.grid?.[camelModKey]?.[camelKey] ?? false) : false;
    }
  }
  return result;
}

const PermissionsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { refreshPermissions, allowedCompanyIds, targetCompanyId, user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<LocalGrid>({});
  const [saving, setSaving] = useState<SavingMap>({});
  const savingRef = React.useRef<SavingMap>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [associatedGroupName, setAssociatedGroupName] = useState<string | null>(null);

  // Confirmation modal state for disabling modules for Admin
  const [confirmDisable, setConfirmDisable] = useState<{ moduleKey: string; moduleLabel: string } | null>(null);

  // Admin-required modal state: shown when trying to enable a non-admin role while admin is disabled
  const [adminRequired, setAdminRequired] = useState<{ moduleKey: string; moduleLabel: string } | null>(null);

  // Company details for modal UI (logo, owner info)
  const [companyDetail, setCompanyDetail] = useState<Company | null>(null);

  useEffect(() => {
    const nextTarget = targetCompanyId ?? allowedCompanyIds[0] ?? null;
    setSelectedCompanyId(nextTarget);
  }, [targetCompanyId, allowedCompanyIds.join(',')]);

  useEffect(() => {
    if (allowedCompanyIds.length === 0) {
      setCompanyOptions([]);
      return;
    }
    getCompanies()
      .then((companies) => {
        const allowed = companies.filter((c) => allowedCompanyIds.includes(c.id));
        
        const groupName = allowed.find((c) => c.groupName)?.groupName || null;
        setAssociatedGroupName(groupName);

        // Grab the currently selected company's details for modal UI
        const targetId = targetCompanyId ?? allowedCompanyIds[0] ?? null;
        const currentCompany = allowed.find(c => c.id === targetId) || allowed[0] || null;
        setCompanyDetail(currentCompany);

        if (allowedCompanyIds.length <= 1) {
          setCompanyOptions([]);
        } else {
          setCompanyOptions(allowed.map((c) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {
        if (allowedCompanyIds.length > 1) {
          setCompanyOptions(allowedCompanyIds.map((id) => ({ id, name: `#${id}` })));
        }
      });
  }, [allowedCompanyIds.join(',')]);

  const fetchGrid = React.useCallback((isSilent = false) => {
    if (selectedCompanyId == null && allowedCompanyIds.length > 0) {
      return;
    }
    // Skip background fetch if currently saving to avoid race conditions or cursor resets
    if (Object.keys(savingRef.current).length > 0) return;

    if (!isSilent) {
      setLoading(true);
    }
    getPermissions(selectedCompanyId ?? undefined)
      .then((data) => setGrid(buildLocalGrid(data)))
      .catch((err: unknown) => {
        if (!isSilent) {
          const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
          if (code === 'COMPANY_MISMATCH') {
            const fallback = targetCompanyId ?? allowedCompanyIds[0] ?? null;
            if (fallback != null && fallback !== selectedCompanyId) {
              setSelectedCompanyId(fallback);
              return;
            }
          }
          setErrorMsg(translateApiError(err, t, t('permissions.errorLoad')));
        }
      })
      .finally(() => {
        if (!isSilent) {
          setLoading(false);
        }
      });
  }, [t, selectedCompanyId, targetCompanyId, allowedCompanyIds.join(',')]);

  useEffect(() => {
    fetchGrid();
  }, [fetchGrid]);

  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'hr_permissions_updated') {
        fetchGrid();
      }
    };
    const handleFocus = () => {
      fetchGrid();
    };

    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('focus', handleFocus);

    // Poll every 10 seconds silently to sync changes across different devices/browsers
    const interval = setInterval(() => {
      fetchGrid(true);
    }, 10 * 1000);

    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [fetchGrid]);

  // Execute actual toggle API call
  const executeToggle = async (moduleKey: string, roleKey: ManagedRoleKey, newValue: boolean) => {
    const cellKey = `${moduleKey}:${roleKey}`;
    setGrid((prev) => ({
      ...prev,
      [moduleKey]: { ...prev[moduleKey], [roleKey]: newValue },
    }));
    setSaving((prev) => {
      const next = { ...prev, [cellKey]: true };
      savingRef.current = next;
      return next;
    });
    setLastSaved(null);

    try {
      await updatePermissions([{ module: moduleKey, role: roleKey, enabled: newValue }], selectedCompanyId ?? undefined);
      setLastSaved(cellKey);
      setTimeout(() => setLastSaved(null), 1800);
      localStorage.setItem('hr_permissions_updated', Date.now().toString());
      await refreshPermissions();
    } catch (err) {
      setGrid((prev) => ({
        ...prev,
        [moduleKey]: { ...prev[moduleKey], [roleKey]: !newValue },
      }));
      showToast(translateApiError(err, t, t('permissions.errorSave')) ?? t('permissions.errorSave'), 'error');
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        savingRef.current = next;
        return next;
      });
    }
  };

  const handleToggle = async (moduleKey: string, roleKey: ManagedRoleKey) => {
    const modKey = moduleKey as ModuleKey;
    if (!isRoleEligibleForModule(roleKey, modKey)) return;

    const currentValue = grid[moduleKey]?.[roleKey] ?? false;
    const newValue = !currentValue;

    // If trying to ENABLE a non-admin role, check if admin is enabled for this module
    if (roleKey !== 'admin' && newValue === true) {
      const adminEnabled = grid[moduleKey]?.['admin'] ?? false;
      if (!adminEnabled) {
        setAdminRequired({
          moduleKey,
          moduleLabel: t(`permissions.modules.${moduleKey}`, moduleKey),
        });
        return;
      }
    }

    // If role is 'admin' and current value is enabled (true), we are disabling it: show confirm modal
    if (roleKey === 'admin' && currentValue) {
      setConfirmDisable({
        moduleKey,
        moduleLabel: t(`permissions.modules.${moduleKey}`, moduleKey)
      });
      return;
    }

    // Otherwise proceed with standard toggle
    await executeToggle(moduleKey, roleKey, newValue);
  };

  // Perform bulk disable for admin and all other roles of the selected module
  const handleConfirmDisable = async () => {
    if (!confirmDisable) return;
    const { moduleKey } = confirmDisable;
    setConfirmDisable(null);

    const cellKey = `${moduleKey}:admin`;
    setSaving((prev) => ({ ...prev, [cellKey]: true }));
    setLastSaved(null);

    const updates = [{ module: moduleKey, role: 'admin' as ManagedRoleKey, enabled: false }];
    const eligibleRoles = MODULE_ROLE_ELIGIBILITY[moduleKey as ModuleKey] || [];
    eligibleRoles.forEach((r) => {
      if (r !== 'admin') {
        updates.push({ module: moduleKey, role: r, enabled: false });
      }
    });

    // Save previous state in case we need to revert
    const previousState = { ...grid[moduleKey] };

    // Update state immediately to reflect disabling
    setGrid((prev) => {
      const nextGrid = { ...prev };
      nextGrid[moduleKey] = { ...nextGrid[moduleKey] };
      updates.forEach((upd) => {
        nextGrid[moduleKey][upd.role] = false;
      });
      return nextGrid;
    });

    try {
      await updatePermissions(updates, selectedCompanyId ?? undefined);
      setLastSaved(cellKey);
      setTimeout(() => setLastSaved(null), 1800);
      localStorage.setItem('hr_permissions_updated', Date.now().toString());
      await refreshPermissions();
    } catch (err) {
      // Revert grid state
      setGrid((prev) => ({
        ...prev,
        [moduleKey]: { ...prev[moduleKey], ...previousState },
      }));
      showToast(translateApiError(err, t, t('permissions.errorSave')) ?? t('permissions.errorSave'), 'error');
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
    }
  };

  // Memoize visible modules list: non-super-admins cannot see modules that are disabled for 'admin'
  const visibleModules = useMemo(() => {
    return MODULE_KEYS.filter((mod) => {
      if (user?.isSuperAdmin) return true;
      const adminEnabled = grid[mod.key]?.['admin'] ?? false;
      return adminEnabled;
    });
  }, [grid, user]);

  const getDeactivatedRolesList = (moduleKey: string): string => {
    const roles = MODULE_ROLE_ELIGIBILITY[moduleKey as ModuleKey] || [];
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
          {t('permissions.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {t('permissions.subtitle')}
        </p>
        {associatedGroupName && (
          <div style={{ marginTop: 12 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'var(--accent-light)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 700,
              border: '1px solid rgba(201,151,58,0.3)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <Layers size={14} />
              {t('permissions.associatedGroup', { defaultValue: 'Associated Group:' })} {associatedGroupName}
            </span>
          </div>
        )}
      </div>

      {allowedCompanyIds.length > 1 && (
        <div style={{ marginBottom: 20, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {companyOptions.map((company) => {
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
                  }}
                >
                  {company.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="danger" title={t('common.error')} onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        </div>
      )}

      <PermissionGridTable
        modules={visibleModules}
        grid={grid}
        saving={saving}
        lastSaved={lastSaved}
        onToggle={handleToggle}
      />

      {/* Auto-save hint */}
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: 'var(--text-disabled)', fontStyle: 'italic' }}>
          {t('permissions.autoSaveHint', { defaultValue: 'Le modifiche vengono salvate automaticamente' })}
        </span>
      </div>

      {/* Confirmation modal for disabling a module entirely for the company */}
      <ConfirmModal
        open={!!confirmDisable}
        onCancel={() => setConfirmDisable(null)}
        onConfirm={handleConfirmDisable}
        title={t('permissions.disableModuleConfirmTitle', { defaultValue: 'Disattivare modulo?' })}
        message={t('permissions.disableModuleConfirmMessage', {
          module: confirmDisable?.moduleLabel || '',
          roles: confirmDisable ? getDeactivatedRolesList(confirmDisable.moduleKey) : '',
          defaultValue: `Disattivando il modulo "${confirmDisable?.moduleLabel || ''}" per il ruolo Admin, verrà disattivato automaticamente per tutti i ruoli della società e non sarà più visibile agli amministratori della società. Vuoi procedere?`
        })}
        confirmLabel={t('common.confirm', 'Conferma')}
        cancelLabel={t('common.cancel', 'Annulla')}
        variant="danger"
      >
        {/* Company and Admin info card */}
        {companyDetail && (() => {
          const companyLogoUrl = getCompanyLogoUrl(companyDetail.logoFilename);
          const adminAvatarUrl = getAvatarUrl(companyDetail.ownerAvatarFilename);
          const adminFullName = [companyDetail.ownerName, companyDetail.ownerSurname].filter(Boolean).join(' ');
          const companyInitial = companyDetail.name?.charAt(0)?.toUpperCase() || 'C';
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
                    <img src={companyLogoUrl} alt={companyDetail.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Building2 size={16} color="#fff" />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {companyDetail.name}
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
        {companyDetail && (() => {
          const companyLogoUrl = getCompanyLogoUrl(companyDetail.logoFilename);

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
                  <img src={companyLogoUrl} alt={companyDetail.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Building2 size={15} color="#fff" />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {companyDetail.name}
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

export default PermissionsPanel;
