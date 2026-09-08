import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { Globe2 } from 'lucide-react';
import apiClient from '../../api/client';
import { BalancesTab } from '../leave/AdminLeavePanel';
import { BillingSummaryCard } from '../billing/BillingSummaryCard';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import { TimezoneOptionContent } from '../../components/timezone/TimezoneOptionContent';
import {
  getNotificationSettings,
  updateNotificationSetting,
  getAutomationSettings,
  updateAutomationSetting,
  NotificationSetting,
  AutomationSetting,
} from '../../api/documents';
import {
  getBrowserTimeZone,
  getTimezoneOptionValues,
  getUtcOffsetLabel,
} from '../../utils/timezone';

const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconBalances = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const IconEye = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 01-3.46 0"/>
  </svg>
);

const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/>
  </svg>
);

const ArrowIcon = ({ open }: { open: boolean }) => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ 
      transition: 'transform 0.2s ease', 
      transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      color: 'var(--text-muted)',
      flexShrink: 0
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ── Notification Settings Panel ────────────────────────────────────────────

const ALL_EVENT_KEYS = [
  'employee.created', 'employee.updated', 'leave.submitted', 'leave.approved',
  'leave.rejected', 'document.uploaded', 'document.expiring', 'document.signed',
  'onboarding.welcome', 'onboarding.reminder', 'ats.candidate_received',
  'ats.interview_invite', 'ats.bottleneck', 'shift.published', 'anomaly.detected',
  'manager.daily_alert',
];

const EVENT_CATEGORY_DEFS: { labelKey: string; keys: string[] }[] = [
  { labelKey: 'documents.eventCategories.employees', keys: ['employee.created', 'employee.updated'] },
  { labelKey: 'documents.eventCategories.leave', keys: ['leave.submitted', 'leave.approved', 'leave.rejected'] },
  { labelKey: 'documents.eventCategories.documents', keys: ['document.uploaded', 'document.expiring', 'document.signed'] },
  { labelKey: 'documents.eventCategories.onboarding', keys: ['onboarding.welcome', 'onboarding.reminder'] },
  { labelKey: 'documents.eventCategories.ats', keys: ['ats.candidate_received', 'ats.interview_invite', 'ats.bottleneck'] },
  { labelKey: 'documents.eventCategories.shifts', keys: ['shift.published', 'anomaly.detected'] },
  { labelKey: 'documents.eventCategories.manager', keys: ['manager.daily_alert'] },
];

function eventLabel(key: string, t: (k: string, fallback: string) => string): string {
  const tKey = `documents.eventLabels.${key.replace('.', '_')}`;
  return t(tKey, key);
}

const NotificationSettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getNotificationSettings();
      setSettings(s);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (eventKey: string, currentEnabled: boolean) => {
    setToggling(eventKey);
    try {
      const updated = await updateNotificationSetting(eventKey, !currentEnabled);
      setSettings(prev => {
        const exists = prev.find(s => s.eventKey === eventKey);
        if (exists) return prev.map(s => s.eventKey === eventKey ? updated : s);
        return [...prev, updated];
      });
    } catch { /* ignore */ } finally {
      setToggling(null);
    }
  };

  const isEnabled = (key: string): boolean => {
    const s = settings.find(s => s.eventKey === key);
    return s ? s.enabled : true; // default true
  };

  const enabledCount = ALL_EVENT_KEYS.filter(k => isEnabled(k)).length;
  const totalCount = ALL_EVENT_KEYS.length;
  const progressPct = Math.round((enabledCount / totalCount) * 100);

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 24,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          padding: '16px 20px', 
          borderBottom: isOpen ? '1px solid var(--border-light)' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ flex: 1, marginRight: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ color: 'var(--accent)' }}><IconBell /></span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t('documents.settingsNotifications')}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('documents.settingsNotificationsDesc')}
          </p>
          {isOpen && !loading && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border-light)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'var(--accent)',
                  width: `${progressPct}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {t('documents.notifSummary', { enabled: enabledCount, total: totalCount })}
              </span>
            </div>
          )}
        </div>
        <ArrowIcon open={isOpen} />
      </div>
      {isOpen && (
        <div style={{ padding: '8px 20px 16px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 6 }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {EVENT_CATEGORY_DEFS.map((cat, catIdx) => (
                <div key={cat.labelKey} style={{ marginTop: catIdx === 0 ? 8 : 16 }}>
                  {/* Category header */}
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--text-muted)',
                    padding: '0 10px', marginBottom: 4,
                  }}>
                    {t(cat.labelKey)}
                  </div>
                  {/* Event rows */}
                  {cat.keys.map(key => {
                    const enabled = isEnabled(key);
                    const isToggling = toggling === key;
                    return (
                      <div key={key} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px', borderRadius: 6,
                        background: 'transparent',
                        transition: 'background 0.12s',
                      }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 13, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}>
                          {eventLabel(key, t)}
                        </span>
                        <button
                          disabled={isToggling}
                          onClick={() => handleToggle(key, enabled)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: isToggling ? 'not-allowed' : 'pointer', opacity: isToggling ? 0.5 : 1 }}
                        >
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            width: 40, height: 22, borderRadius: 11,
                            background: enabled ? 'var(--accent)' : '#9ca3af',
                            transition: 'background 0.2s', position: 'relative',
                          }}>
                            <span style={{
                              position: 'absolute', top: 2, width: 18, height: 18,
                              left: enabled ? 20 : 2,
                              borderRadius: '50%', background: '#fff',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              transition: 'left 0.2s',
                            }} />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Automation Settings Panel ──────────────────────────────────────────────

function jobName(jobKey: string, t: (k: string, fallback: string) => string): string {
  return t(`documents.jobLabels.${jobKey}`, jobKey);
}

function jobSchedule(jobKey: string, t: (k: string, fallback: string) => string): string {
  return t(`documents.jobSchedules.${jobKey}`, '');
}


// ── Break & Payroll Settings Panel ─────────────────────────────────────────

const BreakPayrollSettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [tolerance, setTolerance] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/companies/break-settings');
      setEnabled(res.data?.data?.breakEnforcementEnabled ?? false);
      setTolerance(res.data?.data?.breakToleranceMinutes ?? 10);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (newEnabled: boolean, newTol: number) => {
    setSaving(true);
    try {
      await apiClient.patch('/companies/break-settings', {
        break_enforcement_enabled: newEnabled,
        break_tolerance_minutes: newTol,
      });
      setEnabled(newEnabled);
      setTolerance(newTol);
      setMsg(t('settings.savedSuccess', 'Impostazioni salvate con successo'));
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg(t('settings.saveError', 'Errore durante il salvataggio'));
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid #b45309',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)', marginBottom: 24,
    }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '16px 20px',
          borderBottom: isOpen ? '1px solid var(--border-light)' : 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ color: '#b45309' }}>☕</span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t('attendance.breakPayrollTitle', 'Gestione Pause e Paghe')}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('attendance.breakPayrollDesc', 'Configura come il tempo di pausa viene dedotto dalle ore lavorate per i calcoli delle paghe.')}
          </p>
        </div>
        <ArrowIcon open={isOpen} />
      </div>

      {isOpen && (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Standard Mode Card */}
          <div style={{
            padding: 16, borderRadius: 10, background: 'var(--background)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📋</span> {t('attendance.standardModeTitle', 'Modalità Standard (Sempre Attiva)')}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {t('attendance.standardModeDesc', 'Il tempo di pausa viene sempre dedotto dalle ore lavorate. Se il dipendente registra la pausa, viene dedotto il tempo effettivo. Se non viene registrata, il tempo programmato viene dedotto automaticamente.')}
            </p>
          </div>

          {/* Strict Enforcement Card */}
          <div style={{
            padding: 16, borderRadius: 10, background: 'var(--surface-warm)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛡️</span> {t('attendance.strictEnforcementTitle', 'Applicazione Rigorosa Paghe (Opzione A)')}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  {t('attendance.strictEnforcementDesc', "Se abilitato, quando un dipendente prende una pausa più breve della soglia (programmata − tolleranza), viene dedotta la pausa completa programmata per proteggere l'accuratezza delle paghe.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSave(!enabled, tolerance)}
                disabled={saving}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  position: 'relative', width: 44, height: 24, flexShrink: 0,
                }}
              >
                <span style={{
                  display: 'block', width: 44, height: 24, borderRadius: 12,
                  background: enabled ? '#15803D' : 'var(--border)',
                  transition: 'background 0.2s',
                }}>
                  <span style={{
                    display: 'block', width: 18, height: 18, borderRadius: '50%',
                    background: '#fff', position: 'absolute', top: 3,
                    left: enabled ? 23 : 3,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    transition: 'left 0.2s',
                  }} />
                </span>
              </button>
            </div>

            {enabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {t('attendance.breakToleranceLabel', 'Tolleranza Pausa (minuti)')}:
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={tolerance}
                  onChange={(e) => setTolerance(parseInt(e.target.value, 10) || 0)}
                  onBlur={() => handleSave(enabled, tolerance)}
                  style={{
                    width: 70, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                    fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'var(--surface)',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('attendance.breakToleranceHint', 'Esempio: con pausa di 60 min e tolleranza di 10 min, pause inferiori a 50 min attivano la deduzione completa.')}
                </span>
              </div>
            )}
          </div>

          {msg && (
            <div style={{ fontSize: 12, fontWeight: 600, color: msg.includes('Error') || msg.includes('Errore') ? '#dc2626' : '#15803D' }}>
              {msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AutomationSettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AutomationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getAutomationSettings();
      setSettings(s);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (jobKey: string, currentEnabled: boolean) => {
    setToggling(jobKey);
    try {
      await updateAutomationSetting(jobKey, !currentEnabled);
      setSettings(prev => prev.map(s => s.jobKey === jobKey ? { ...s, enabled: !currentEnabled } : s));
    } catch { /* ignore */ } finally {
      setToggling(null);
    }
  };

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 24,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          padding: '16px 20px', 
          borderBottom: isOpen ? '1px solid var(--border-light)' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ color: 'var(--accent)' }}><IconClock /></span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t('documents.settingsAutomation')}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('documents.settingsAutomationDesc')}
          </p>
        </div>
        <ArrowIcon open={isOpen} />
      </div>
      {isOpen && (
        <div style={{ padding: '16px 20px' }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 10 }} />)}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}>
              {settings.map(s => {
                const isToggling = toggling === s.jobKey;
                return (
                  <div key={s.jobKey} style={{
                    background: s.enabled ? 'var(--surface)' : 'var(--background)',
                    border: `1.5px solid ${s.enabled ? 'var(--border)' : 'var(--border-light)'}`,
                    borderRadius: 10, padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    opacity: s.enabled ? 1 : 0.65,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.35 }}>
                          {jobName(s.jobKey, t)}
                        </div>
                        {jobSchedule(s.jobKey, t) && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {jobSchedule(s.jobKey, t)}
                          </div>
                        )}
                      </div>
                      <button
                        disabled={isToggling}
                        onClick={() => handleToggle(s.jobKey, s.enabled)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: isToggling ? 'not-allowed' : 'pointer', opacity: isToggling ? 0.5 : 1, flexShrink: 0 }}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          width: 40, height: 22, borderRadius: 11,
                          background: s.enabled ? 'var(--accent)' : '#9ca3af',
                          transition: 'background 0.2s', position: 'relative',
                        }}>
                          <span style={{
                            position: 'absolute', top: 2, width: 18, height: 18,
                            left: s.enabled ? 20 : 2,
                            borderRadius: '50%', background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'left 0.2s',
                          }} />
                        </span>
                      </button>
                    </div>
                    <div style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 5,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: s.enabled ? 'rgba(21,128,61,0.08)' : 'rgba(107,114,128,0.08)',
                      color: s.enabled ? '#15803D' : 'var(--text-muted)',
                      width: 'fit-content',
                    }}>
                      {s.enabled ? `● ${t('documents.jobActive')}` : `○ ${t('documents.jobInactive')}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';
  const detectedTimezone = useMemo(() => getBrowserTimeZone(), []);
  const [selectedTimezone, setSelectedTimezone] = useState<string>(detectedTimezone);
  const currentTimezoneOffset = useMemo(
    () => getUtcOffsetLabel(selectedTimezone || detectedTimezone),
    [detectedTimezone, selectedTimezone],
  );

  const [showLeaveBalance, setShowLeaveBalance] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    timezone: true,
    leaveBalance: false,
    leaveVisibility: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const timezoneOptions = useMemo<SelectOption[]>(() => {
    return getTimezoneOptionValues([detectedTimezone, selectedTimezone])
      .map((timezone) => ({
        value: timezone,
        label: timezone,
        render: <TimezoneOptionContent timezone={timezone} />,
      }));
  }, [detectedTimezone, selectedTimezone]);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiClient.get('/companies/settings')
      .then(r => setShowLeaveBalance(r.data?.data?.showLeaveBalanceToEmployee ?? true))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const handleToggle = async () => {
    if (!isAdmin || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const newVal = !showLeaveBalance;
      await apiClient.patch('/companies/settings', { showLeaveBalanceToEmployee: newVal });
      setShowLeaveBalance(newVal);

      setSaveMsg(t('settings.savedSuccess'));
    } catch {
      setSaveMsg(t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdminOrHr) {
    return (
      <div className="page-enter" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ color: 'var(--primary)', opacity: 0.7 }}><IconSettings /></div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', margin: 0 }}>
              {t('settings.title')}
            </h1>
          </div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {t('settings.noSettingsAvailable')}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ color: 'var(--primary)', opacity: 0.7 }}><IconSettings /></div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', margin: 0 }}>
            {t('settings.title')}
          </h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Plan, licenses, billing period and receipts at a glance. */}
      <BillingSummaryCard />

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: '4px solid #1D4ED8',
        borderRadius: 'var(--radius-lg)', overflow: 'visible', marginBottom: 24,
        position: 'relative', zIndex: 5,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div 
          onClick={() => toggleSection('timezone')}
          style={{ 
            padding: '16px 20px', 
            borderBottom: openSections.timezone ? '1px solid var(--border-light)' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ color: '#1D4ED8' }}><Globe2 size={16} /></span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {t('settings.sectionTimezone', 'Timezone')}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {t('settings.sectionTimezoneDesc', 'Timezone is auto-detected from your current region and can be changed for display.')}
            </p>
          </div>
          <ArrowIcon open={openSections.timezone} />
        </div>
        {openSections.timezone && (
          <div style={{ padding: 20, display: 'grid', gap: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 700 }}>{t('settings.currentTimezone', 'Current timezone')}:</span>
              <span style={{ padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(29,78,216,0.28)', background: 'rgba(219,234,254,0.5)', color: '#1E40AF', fontWeight: 700 }}>
                {selectedTimezone || detectedTimezone} ({currentTimezoneOffset})
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ({t('settings.detectedTimezone', 'Auto-detected')}: {detectedTimezone})
              </span>
            </div>

            <div style={{ maxWidth: 420 }}>
              <CustomSelect
                value={selectedTimezone}
                onChange={(value) => {
                  if (value) setSelectedTimezone(value);
                }}
                options={timezoneOptions}
                placeholder={t('settings.chooseTimezone', 'Choose timezone')}
                searchable
                searchPlaceholder={t('settings.timezoneSearchPlaceholder', 'Search timezone...')}
                noOptionsMessage={t('settings.timezoneNoResults', 'No timezone found')}
                isClearable={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Leave Balance Management (admin + hr) */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: '4px solid #0284C7',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 24,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div 
          onClick={() => toggleSection('leaveBalance')}
          style={{ 
            padding: '16px 20px', 
            borderBottom: openSections.leaveBalance ? '1px solid var(--border-light)' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ color: '#0284C7' }}><IconBalances /></span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {t('settings.sectionLeaveBalance')}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {t('settings.sectionLeaveBalanceDesc')}
            </p>
          </div>
          <ArrowIcon open={openSections.leaveBalance} />
        </div>
        {openSections.leaveBalance && (
          <BalancesTab showFlash={(msg) => setSaveMsg(msg)} />
        )}
      </div>

      {/* Leave Visibility Toggle (admin only) */}
      {isAdmin && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderLeft: '4px solid #15803D',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)', marginBottom: 24,
        }}>
          <div 
            onClick={() => toggleSection('leaveVisibility')}
            style={{ 
              padding: '16px 20px', 
              borderBottom: openSections.leaveVisibility ? '1px solid var(--border-light)' : 'none',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ color: '#15803D' }}><IconEye /></span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {t('settings.sectionLeave')}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('settings.sectionLeaveDesc')}
              </p>
            </div>
            <ArrowIcon open={openSections.leaveVisibility} />
          </div>
          {openSections.leaveVisibility && (
            <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {t('settings.leaveBalanceVisibility')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('settings.leaveBalanceVisibilityDesc')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: showLeaveBalance ? '#15803D' : '#9ca3af' }}>
                  {showLeaveBalance ? t('settings.visibilityOn') : t('settings.visibilityOff')}
                </span>
                {loading ? (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('common.loading')}</span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showLeaveBalance}
                    disabled={saving}
                    onClick={handleToggle}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: saving ? 'not-allowed' : 'pointer' }}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      width: 52, height: 28, borderRadius: 14,
                      background: showLeaveBalance ? '#15803D' : '#9ca3af',
                      opacity: saving ? 0.6 : 1,
                      transition: 'background 0.2s',
                      position: 'relative',
                    }}>
                      <span style={{
                        position: 'absolute', top: 3, width: 22, height: 22,
                        left: showLeaveBalance ? 27 : 3,
                        borderRadius: '50%', background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        transition: 'left 0.2s',
                      }} />
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notification Settings (admin only) */}
      {isAdmin && <NotificationSettingsPanel />}

      {/* Break & Payroll Settings (admin only) */}
      {isAdmin && <BreakPayrollSettingsPanel />}

      {/* Automation Settings (admin only) */}
      {isAdmin && <AutomationSettingsPanel />}

      {/* Flash snackbar */}
      {saveMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: saveMsg.toLowerCase().includes('err') ? '#dc2626' : '#15803D',
          color: '#fff', padding: '10px 20px', borderRadius: 8,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          {saveMsg}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
