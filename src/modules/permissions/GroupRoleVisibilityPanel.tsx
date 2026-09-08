import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Globe, Plus, ShieldAlert } from 'lucide-react';
import { Toggle } from '../../components/ui/Toggle';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { translateApiError } from '../../utils/apiErrors';
import { useToast } from '../../context/ToastContext';
import { getCompanyGroups, getGroupRoleVisibility, updateGroupRoleVisibility } from '../../api/companyGroups';
import { getCompanies } from '../../api/companies';
import { getEmployees } from '../../api/employees';
import { getAvatarUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Company, Employee } from '../../types';
import { GroupManagementModal } from './GroupManagementModal';

import type { CompanyGroup, GroupRoleVisibility, GroupVisibilityCompany } from '../../api/companyGroups';

const defaultVisibility: GroupRoleVisibility = { hr: false, areaManager: false };

export default function GroupRoleVisibilityPanel() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CompanyGroup[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);

  const [serverVisibility, setServerVisibility] = useState<GroupRoleVisibility>(defaultVisibility);
  const [localVisibility, setLocalVisibility] = useState<GroupRoleVisibility>(defaultVisibility);
  const [groupCompanies, setGroupCompanies] = useState<GroupVisibilityCompany[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);

  const dirty = useMemo(() => (
    localVisibility.hr !== serverVisibility.hr || localVisibility.areaManager !== serverVisibility.areaManager
  ), [localVisibility, serverVisibility]);

  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [g, companies, empData] = await Promise.all([
          getCompanyGroups(),
          getCompanies(),
          getEmployees({ limit: 500 })
        ]);
        setGroups(g);
        setAllCompanies(companies);
        setEmployees(empData.employees || []);
        setGroupId((prev) => prev ?? (g[0]?.id ?? -1));
      } catch {
        setErrorMsg(t('permissions.groupVisibility.errorLoadGroups'));
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!groupId) return;
    void (async () => {
      setErrorMsg(null);
      try {
        const v = await getGroupRoleVisibility(groupId);
        const nextVisibility: GroupRoleVisibility = {
          hr: v.hr,
          areaManager: v.areaManager,
        };
        setServerVisibility(nextVisibility);
        setLocalVisibility(nextVisibility);
        setGroupCompanies(v.companies ?? []);
      } catch (err) {
        setErrorMsg(translateApiError(err, t, t('permissions.groupVisibility.errorLoadVisibility')));
      }
    })();
  }, [groupId, t]);

  const isIsolatedSelection = groupId === -1;
  const selectedCompanies = isIsolatedSelection
    ? allCompanies
      .filter((company) => company.groupId == null)
      .map((company) => ({
        id: company.id,
        name: company.name,
        isActive: company.isActive,
        hasActiveHr: false,
        hasActiveAreaManager: false,
      }))
    : groupCompanies;

  const refreshGroups = async () => {
    try {
      const g = await getCompanyGroups();
      setGroups(g);
      if (groupId != null && !g.find((group) => group.id === groupId)) {
        setGroupId(g[0]?.id ?? -1);
      }
    } catch {
      setErrorMsg(t('permissions.groupVisibility.errorLoadGroups'));
    }
  };

  const handleSave = async () => {
    if (!groupId) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateGroupRoleVisibility(groupId, {
        hr: localVisibility.hr,
        areaManager: localVisibility.areaManager,
      });
      setServerVisibility(JSON.parse(JSON.stringify(localVisibility)));
      // Notify other open tabs to refresh their permissions immediately
      localStorage.setItem('hr_permissions_updated', Date.now().toString());
      showToast(t('permissions.groupVisibility.visibilitySavedSuccess'), 'success');
    } catch (err) {
      setErrorMsg(translateApiError(err, t, t('permissions.errorSave')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20 }}>
        <Spinner size="lg" color="var(--primary)" />
      </div>
    );
  }

  const ROLE_ITEMS: { key: 'hr' | 'areaManager'; label: string; hint: string; color: string }[] = [
    { key: 'hr', label: t('permissions.groupVisibility.hrRoleShort'), hint: t('permissions.groupVisibility.crossCompanyHint'), color: '#0284C7' },
    { key: 'areaManager', label: t('permissions.groupVisibility.areaManagerRoleShort'), hint: t('permissions.groupVisibility.crossCompanyHint'), color: '#15803D' },
  ];

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      marginBottom: 20,
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        background: 'var(--surface-warm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
            flexShrink: 0,
          }}>
            <Layers size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {t('permissions.groupVisibility.title')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              {t('permissions.groupVisibility.subtitle')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 200 }}>
            <Select
              value={groupId ?? -1}
              onChange={(e) => setGroupId(e.target.value ? parseInt(e.target.value, 10) : null)}
              disabled={saving}
            >
              <option value={-1}>{t('permissions.groupVisibility.isolatedCompaniesOption', 'Isolated companies')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <button
            onClick={() => setShowManageModal(true)}
            title={t('permissions.groupVisibility.manageGroups', { defaultValue: 'Manage Groups' })}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-light)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <Layers size={13} />
            {t('permissions.groupVisibility.manageGroups', { defaultValue: 'Manage Groups' })}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 20px' }}>
          <Alert variant="danger" title={t('common.error')} onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
        </div>
      )}

      {/* Visibility toggles */}
      {groupId == null ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {t('common.noData')}
        </div>
      ) : (
        <div style={{
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16
        }}>
          {ROLE_ITEMS.map(({ key, label, hint, color }) => (
            <div
              key={key}
              style={{
                border: `1px solid ${localVisibility[key] ? `${color}30` : 'var(--border-light)'}`,
                borderRadius: 'var(--radius)',
                padding: '16px',
                background: localVisibility[key] ? `${color}08` : 'var(--surface-warm)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: `${color}18`,
                    border: `2px solid ${color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color,
                    flexShrink: 0,
                  }}>
                    <Globe size={14} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-display)' }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 3 }}>
                      {(() => {
                        const coverageCompanies = selectedCompanies;
                        const activeForRoleSafe = coverageCompanies.filter((c) => key === 'hr' ? c.hasActiveHr : c.hasActiveAreaManager).length;
                        return t('permissions.groupVisibility.coverageSummary', {
                          active: activeForRoleSafe,
                          total: coverageCompanies.length,
                          role: label,
                          defaultValue: `${activeForRoleSafe}/${coverageCompanies.length} companies have active ${label}`,
                        });
                      })()}
                    </div>
                  </div>
                </div>
                <Toggle
                  checked={localVisibility[key]}
                  onChange={() => setLocalVisibility((prev) => ({ ...prev, [key]: !prev[key] }))}
                  disabled={saving || isIsolatedSelection}
                />
              </div>

              {/* Companies and Employees list inside role card */}
              <div style={{
                marginTop: 4,
                paddingTop: 14,
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                width: '100%',
              }}>
                {(() => {
                  const displayCompanies = selectedCompanies;

                  if (displayCompanies.length === 0) {
                    return (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {isIsolatedSelection
                          ? t('permissions.groupVisibility.noIsolatedCompanies', { defaultValue: 'No isolated companies found.' })
                          : t('permissions.groupVisibility.noCompaniesInGroup', { defaultValue: 'No companies linked to this group yet.' })}
                      </span>
                    );
                  }

                  return displayCompanies.map((company) => {
                    const fullComp = allCompanies.find((c) => c.id === company.id);
                    const ownerName = fullComp?.ownerName ? `${fullComp.ownerName} ${fullComp.ownerSurname || ''}` : null;
                    const companyUsers = employees.filter(
                      (e) => e.companyId === company.id && (key === 'hr' ? e.role === 'hr' : e.role === 'area_manager')
                    );

                    return (
                      <div
                        key={`${key}-${company.id}`}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 10,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        {/* Company row: name on left, owner on right */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: company.isActive ? '#22C55E' : '#9CA3AF',
                              flexShrink: 0
                            }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {company.name}
                            </span>
                          </div>
                          
                          {/* Owner Info */}
                          {ownerName ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {fullComp?.ownerAvatarFilename && getAvatarUrl(fullComp.ownerAvatarFilename) ? (
                                <img
                                  src={getAvatarUrl(fullComp.ownerAvatarFilename) || ''}
                                  alt={ownerName}
                                  style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: '50%',
                                  background: 'var(--primary)',
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 7,
                                  fontWeight: 800,
                                }}>
                                  {fullComp?.ownerName ? fullComp.ownerName[0].toUpperCase() : 'O'}
                                </div>
                              )}
                              <span style={{ fontSize: 9.5, fontWeight: 550, color: 'var(--text-secondary)' }} title={`Owner: ${ownerName}`}>
                                {ownerName}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 9.5, color: 'var(--text-disabled)', fontStyle: 'italic' }}>
                              {t('common.noOwner', 'No owner')}
                            </span>
                          )}
                        </div>

                        {/* Divider line */}
                        <div style={{ height: 1, background: 'var(--border-light)', margin: '2px 0' }} />

                        {/* Employees List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {companyUsers.length === 0 ? (
                            <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-warm)', borderRadius: 6, border: '1px dashed var(--border-light)', textAlign: 'center' }}>
                              {key === 'hr'
                                ? t('permissions.groupVisibility.noHr', 'No active HR')
                                : t('permissions.groupVisibility.noAreaManagers', 'No active Area Managers')}
                            </div>
                          ) : (
                            companyUsers.map((emp) => {
                              const initials = `${emp.name[0] || ''}${emp.surname[0] || ''}`.toUpperCase();
                              const isActive = emp.status === 'active';
                              const roleColor = key === 'hr' ? '#0284C7' : '#15803D';

                              return (
                                <div
                                  key={emp.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '4px 6px',
                                    background: 'var(--surface-warm)',
                                    borderRadius: 6,
                                    border: '1px solid var(--border-light)',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                    {/* User avatar */}
                                    {emp.avatarFilename && getAvatarUrl(emp.avatarFilename) ? (
                                      <img
                                        src={getAvatarUrl(emp.avatarFilename) || ''}
                                        alt={`${emp.name} ${emp.surname}`}
                                        style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                      />
                                    ) : (
                                      <div style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: '50%',
                                        background: `${roleColor}18`,
                                        border: `1px solid ${roleColor}30`,
                                        color: roleColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 7.5,
                                        fontWeight: 800,
                                        flexShrink: 0,
                                      }}>
                                        {initials}
                                      </div>
                                    )}

                                    {/* User details */}
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {emp.name} {emp.surname}
                                    </span>
                                  </div>

                                  {/* Status Badge */}
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '1px 4px',
                                    borderRadius: 4,
                                    background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(156,163,175,0.1)',
                                    color: isActive ? '#166534' : '#4b5563',
                                    textTransform: 'uppercase',
                                    border: isActive ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(156,163,175,0.18)',
                                    flexShrink: 0,
                                  }}>
                                    {isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save bar */}
      {dirty && !isIsolatedSelection && (
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--surface-warm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 500 }}>
            ● {t('common.unsavedChanges')}
          </span>
          <Button variant="secondary" onClick={() => setLocalVisibility(serverVisibility)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t('permissions.groupVisibility.saveVisibilityButton')}
          </Button>
        </div>
      )}

      <GroupManagementModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        groups={groups}
        onGroupsChanged={refreshGroups}
      />
    </div>
  );
}
