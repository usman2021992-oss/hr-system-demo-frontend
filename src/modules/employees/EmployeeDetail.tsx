import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { Smartphone, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactCountryFlag from 'react-country-flag';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  getEmployee,
  getEmployeeAssociations,
  deactivateEmployee,
  activateEmployee,
  uploadEmployeeAvatar,
  resetEmployeeDevice,
} from '../../api/employees';
import { getAvatarUrl, getCompanyLogoUrl, getStoreLogoUrl } from '../../api/client';
import { getTrainings, getMedicals, createTraining, updateTraining, createMedical, updateMedical } from '../../api/trainings';
import { getApiErrorCode, translateApiError } from '../../utils/apiErrors';
import { formatDateTime, localeFor } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Employee, EmployeeAssociationEntry, EmployeeAssociationsResponse, UserRole, Training, MedicalCheck, TrainingType } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import CustomSelect from '../../components/ui/CustomSelect';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { Modal } from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { DatePicker } from '../../components/ui/DatePicker';
import { EmployeeForm } from './EmployeeForm';
import { MessageBoard } from '../messages/MessageBoard';
import { ComposeMessage } from '../messages/ComposeMessage';
import { getEmployeeTasks, assignTasks, getTemplates, createTemplate, OnboardingProgress, OnboardingTemplate, OnboardingTask } from '../../api/onboarding';
import { DocumentManager } from '../documents/components/DocumentManager';
import MonthlyCalendar from '../shifts/MonthlyCalendar';
import { Shift, listShifts } from '../../api/shifts';


// ── Types & constants ──────────────────────────────────────────────────────────
const ROLE_BADGE_VARIANT: Record<UserRole, 'accent' | 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  admin: 'accent',
  hr: 'info',
  area_manager: 'success',
  store_manager: 'warning',
  employee: 'neutral',
  store_terminal: 'neutral',
};

const AVATAR_PALETTE = ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'];
const ONBOARDING_PHASE_META: Record<'day1' | 'week1' | 'month1' | 'ongoing', { icon: string; label: string }> = {
  day1: { icon: '🚀', label: 'Day 1 Essentials' },
  week1: { icon: '📚', label: 'First Week' },
  month1: { icon: '🎯', label: 'First Month' },
  ongoing: { icon: '⭐', label: 'Ongoing' },
};
const ONBOARDING_CATEGORY_META: Record<OnboardingTemplate['category'], { icon: string; label: string }> = {
  profile_setup: { icon: '👤', label: 'Profile & Setup' },
  hr_compliance: { icon: '📄', label: 'HR & Compliance' },
  system_access: { icon: '🔐', label: 'System Access' },
  training: { icon: '🎓', label: 'Training' },
  operations: { icon: '⚙️', label: 'Operations' },
  scheduling_shifts: { icon: '🕒', label: 'Scheduling & Shifts' },
  performance: { icon: '📊', label: 'Performance' },
  communication: { icon: '💬', label: 'Communication' },
  it_tools: { icon: '💻', label: 'IT & Tools' },
  inventory: { icon: '📦', label: 'Inventory' },
  customer_service: { icon: '🛍️', label: 'Customer Service' },
  finance_payroll: { icon: '💰', label: 'Finance & Payroll' },
  hr_docs: { icon: '📄', label: 'HR Docs' },
  it_setup: { icon: '💻', label: 'IT Setup' },
  meeting: { icon: '🤝', label: 'Meeting' },
  other: { icon: '🧩', label: 'Other' },
};
const ONBOARDING_PRIORITY_COLORS: Record<'high' | 'medium' | 'low', string> = {
  high: '#DC2626',
  medium: '#D97706',
  low: '#15803D',
};
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// ── Translation lookup maps ────────────────────────────────────────────────────
const MARITAL_STATUS_KEYS: Record<string, string> = {
  'Celibe': 'employees.marital_celibe',
  'Nubile': 'employees.marital_nubile',
  'Coniugato': 'employees.marital_coniugato',
  'Coniugata': 'employees.marital_coniugata',
  'Divorziato': 'employees.marital_divorziato',
  'Divorziata': 'employees.marital_divorziata',
  'Vedovo': 'employees.marital_vedovo',
  'Vedova': 'employees.marital_vedova',
  'Separato': 'employees.marital_separato',
  'Separata': 'employees.marital_separata',
  'Unione Civile': 'employees.marital_unione_civile',
};

const CONTRACT_TYPE_KEYS: Record<string, string> = {
  'Tempo Indeterminato': 'employees.contractType_indeterminato',
  'Tempo Determinato': 'employees.contractType_determinato',
  'Apprendistato': 'employees.contractType_apprendistato',
  'Stage / Tirocinio': 'employees.contractType_stage',
  'Partita IVA / Collaborazione': 'employees.contractType_partita_iva',
  'Altro': 'employees.contractType_altro',
};

const TERMINATION_TYPE_KEYS: Record<string, string> = {
  'Dimissioni volontarie': 'employees.terminationType_dimissioni',
  'Fine contratto': 'employees.terminationType_fine_contratto',
  'Licenziamento': 'employees.terminationType_licenziamento',
  'Pensionamento': 'employees.terminationType_pensionamento',
  'Risoluzione consensuale': 'employees.terminationType_consensuale',
  'Altro': 'employees.terminationType_altro',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null | undefined, lang: string): string {
  if (!dateStr) return '—';
  try {
    const locale = lang.startsWith('it') ? 'it-IT' : 'en-GB';
    return new Date(dateStr.split('T')[0] + 'T00:00:00').toLocaleDateString(locale);
  } catch {
    return dateStr;
  }
}

function maskIban(iban: string): string {
  if (iban.length <= 8) return iban;
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

function formatMonthToken(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function shiftClock(value: string | null | undefined): string {
  if (!value) return '--:--';
  return value.slice(0, 5);
}

// ── Info row (horizontal label / value) ───────────────────────────────────────
function InfoRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: '12px', padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid var(--border-light)',
    }}>
      <span style={{
        fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        fontFamily: 'var(--font-body)', flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '13.5px', color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)', textAlign: 'right',
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Section panel ──────────────────────────────────────────────────────────────
function SectionPanel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        background: 'var(--surface-warm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{ color: 'var(--accent)', flexShrink: 0 }}>{icon}</div>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700,
            color: 'var(--text-primary)', margin: 0,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {title}
          </h3>
        </div>
        {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{action}</div>}
      </div>
      <div style={{ padding: '4px 20px 8px' }}>{children}</div>
    </div>
  );
}

// ── Onboarding Section ─────────────────────────────────────────────────────────
function OnboardingSection({ employeeId, employeeCompanyId, employeeCompanyName, employeeStoreName, employeeAvatarFilename, employeeName, isAdminOrHr, companyLogoFilename, companyGroupName, storeLogoFilename }: { employeeId: number; employeeCompanyId: number | null; employeeCompanyName: string | null; employeeStoreName: string | null; employeeAvatarFilename: string | null | undefined; employeeName: string; isAdminOrHr: boolean; companyLogoFilename?: string | null; companyGroupName?: string | null; storeLogoFilename?: string | null }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [templateMetaById, setTemplateMetaById] = useState<Map<number, OnboardingTemplate>>(new Map());
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    taskType: 'day1' as OnboardingTemplate['taskType'],
    category: 'other' as OnboardingTemplate['category'],
    priority: 'medium' as OnboardingTemplate['priority'],
    sortOrder: 0,
    dueDays: '' as string,
    linkUrl: '',
  });

  const taskTypeOptions = React.useMemo(() => {
    return Object.entries(ONBOARDING_PHASE_META).map(([k, v]) => ({
      value: k,
      label: `${v.icon} ${v.label}`,
    }));
  }, []);

  const priorityOptions = React.useMemo(() => [
    { value: 'high', label: t('onboarding.priorityHigh', 'High') },
    { value: 'medium', label: t('onboarding.priorityMedium', 'Medium') },
    { value: 'low', label: t('onboarding.priorityLow', 'Low') },
  ], [t]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const taskProgress = await getEmployeeTasks(employeeId);
      setProgress(taskProgress);
      if (employeeCompanyId) {
        const rows = await getTemplates(false, employeeCompanyId);
        setTemplateMetaById(new Map(rows.map((row) => [row.id, row])));
      }
    }
    catch { /* silently fail — onboarding may not be configured */ }
    finally { setLoading(false); }
  }, [employeeId, employeeCompanyId]);

  useEffect(() => { load(); }, [load]);

  const openAssignModal = async () => {
    if (!employeeCompanyId) return;
    setAssignModalOpen(true);
    setTemplatesLoading(true);
    try {
      const rows = await getTemplates(false, employeeCompanyId);
      setTemplates(rows);
      const assignedIds = new Set((progress?.tasks ?? []).map((task) => task.templateId));
      setSelectedTemplateIds(assignedIds);
    } catch {
      setTemplates([]);
      setSelectedTemplateIds(new Set());
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleAssignSelected = async () => {
    setAssigning(true);
    try {
      await assignTasks(employeeId, Array.from(selectedTemplateIds));
      showToast(t('onboarding.assignedSuccess', { count: selectedTemplateIds.size }), 'success');
      setAssignModalOpen(false);
      await load();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('onboarding.errorSave')) ?? t('onboarding.errorSave');
      showToast(message, 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!employeeCompanyId) return;
    if (!createForm.name.trim()) {
      showToast(t('onboarding.errorSave', 'Please provide a task name'), 'warning');
      return;
    }
    setCreatingTemplate(true);
    try {
      await createTemplate({
        companyId: employeeCompanyId,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        taskType: createForm.taskType,
        category: createForm.category,
        priority: createForm.priority,
        sortOrder: Number.isFinite(createForm.sortOrder) ? createForm.sortOrder : 0,
        dueDays: createForm.dueDays.trim() === '' ? null : Number(createForm.dueDays),
        linkUrl: createForm.linkUrl.trim() || null,
      });
      showToast(t('onboarding.templateCreated', 'Task template created'), 'success');
      setCreateModalOpen(false);
      setCreateForm({
        name: '',
        description: '',
        taskType: 'day1',
        category: 'other',
        priority: 'medium',
        sortOrder: 0,
        dueDays: '',
        linkUrl: '',
      });
      await load();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('onboarding.errorSave')) ?? t('onboarding.errorSave');
      showToast(message, 'error');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const tasksByPhase = useMemo(() => {
    const map = new Map<'day1' | 'week1' | 'month1' | 'ongoing', OnboardingProgress['tasks']>();
    map.set('day1', []);
    map.set('week1', []);
    map.set('month1', []);
    map.set('ongoing', []);
    (progress?.tasks ?? []).forEach((task) => {
      const key = task.templateTaskType ?? 'ongoing';
      if (!map.has(key)) map.set('ongoing', []);
      map.get(key)!.push(task);
    });
    return map;
  }, [progress]);

  const assignedTaskByTemplateId = useMemo(() => {
    const m = new Map<number, OnboardingTask>();
    (progress?.tasks ?? []).forEach((task) => m.set(task.templateId, task));
    return m;
  }, [progress]);

  const templatesByPhase = useMemo(() => {
    const map = new Map<'day1' | 'week1' | 'month1' | 'ongoing', OnboardingTemplate[]>();
    map.set('day1', []);
    map.set('week1', []);
    map.set('month1', []);
    map.set('ongoing', []);
    templates.forEach((template) => {
      const key = (template.taskType ?? 'ongoing') as 'day1' | 'week1' | 'month1' | 'ongoing';
      map.get(key)?.push(template);
    });
    return map;
  }, [templates]);

  const storeLogoUrl = getStoreLogoUrl(storeLogoFilename ?? null);
  const storeMarkInitials = (employeeStoreName || employeeCompanyName || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  const categorySelectOptions = useMemo(
    () => Object.entries(ONBOARDING_CATEGORY_META).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` })),
    [],
  );

  const headerAction = isAdminOrHr ? (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button size="sm" variant="secondary" onClick={() => setCreateModalOpen(true)}>
        {t('onboarding.newTask', 'New task')}
      </Button>
      <Button size="sm" loading={assigning} onClick={openAssignModal}>
        {t('onboarding.assignTasks')}
      </Button>
    </div>
  ) : undefined;

  return (
    <SectionPanel title={t('nav.onboarding', 'Onboarding')} icon={
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    } action={headerAction}>
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="sm" /></div>
      ) : !progress || progress.total === 0 ? (
        <div style={{
          padding: '24px 0 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          textAlign: 'center',
        }}>
          <span style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border)',
            color: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('onboarding.noTasksAssigned')}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.45 }}>
            {isAdminOrHr ? t('onboarding.noTasksAssignedHintAdmin') : t('onboarding.noTasksAssignedHintEmployee')}
          </span>
          {isAdminOrHr && (
            <Button size="sm" variant="accent" loading={assigning} onClick={openAssignModal}>
              {t('onboarding.assignTasks')}
            </Button>
          )}
        </div>
      ) : (
        <div>
          <div style={{ padding: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#15803D' : 'var(--primary)', borderRadius: 99, transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: pct === 100 ? '#15803D' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {progress.completed}/{progress.total} ({pct}%)
            </span>
          </div>
          {(['day1', 'week1', 'month1', 'ongoing'] as const).map((phase) => {
            const phaseTasks = tasksByPhase.get(phase) ?? [];
            if (phaseTasks.length === 0) return null;
            return (
              <div key={phase} style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {phase === 'day1' ? '🚀 Day 1' : phase === 'week1' ? '📚 Week 1' : phase === 'month1' ? '🎯 Month 1' : '⭐ Ongoing'}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{phaseTasks.length}</span>
                </div>
                <div style={{ display: 'grid', gap: 7 }}>
                  {phaseTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        border: '1px solid var(--border-light)',
                        borderRadius: 8,
                        background: 'var(--surface-warm)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '9px 10px',
                      }}
                    >
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: task.completed ? 'rgba(21,128,61,0.12)' : 'var(--background)', border: `2px solid ${task.completed ? '#15803D' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {task.completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: task.completed ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.templateName}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: task.completed ? '#15803D' : '#C9973A', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                            {task.completed ? t('onboarding.statusComplete', 'Complete') : t('onboarding.statusInProgress', 'In progress')}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: ONBOARDING_PRIORITY_COLORS[task.templatePriority] ?? 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{task.templatePriority}</span>
                        </div>
                        {task.templateDescription && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{task.templateDescription}</div>
                        )}
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', background: 'var(--background)', color: 'var(--text-secondary)' }}>
                              {ONBOARDING_CATEGORY_META[task.templateCategory]?.icon} {ONBOARDING_CATEGORY_META[task.templateCategory]?.label ?? task.templateCategory}
                            </span>
                            <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', background: 'var(--background)', color: 'var(--text-secondary)' }}>
                              {ONBOARDING_PHASE_META[task.templateTaskType]?.icon} {ONBOARDING_PHASE_META[task.templateTaskType]?.label ?? task.templateTaskType}
                            </span>
                          </div>
                          {task.assignedByName && (
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                              <span>{t('onboarding.assignedBy', 'Assigned by')}</span>
                              <span style={{ width: 15, height: 15, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,33,55,0.12)', color: 'var(--text-secondary)', fontSize: 8, fontWeight: 700 }}>
                                {task.assignedByAvatarFilename
                                  ? <img src={getAvatarUrl(task.assignedByAvatarFilename) ?? ''} alt={task.assignedByName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : task.assignedByName.slice(0, 1).toUpperCase()}
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{task.assignedByName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={t('onboarding.assignTasks')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={assigning || templatesLoading} disabled={selectedTemplateIds.size === 0} onClick={handleAssignSelected}>
              {t('onboarding.assignConfirm', 'Assign')}
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, rowGap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px', minWidth: 0 }}>
              <span style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'var(--surface-warm)', border: '1px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--primary)', overflow: 'hidden',
              }}>
                {storeLogoUrl
                  ? <img src={storeLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : storeMarkInitials}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}>
                  {employeeStoreName || t('employees.storeField', 'Store')}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.3 }}>
                  {employeeCompanyName || '—'}
                  {employeeCompanyId != null ? ` · #${employeeCompanyId}` : ''}
                  {companyGroupName ? ` · ${companyGroupName}` : ''}
                </div>
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border-light)', flexShrink: 0, alignSelf: 'center' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 0 }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                border: '1px solid var(--border)', background: 'var(--surface-warm)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--primary)',
              }}>
                {employeeAvatarFilename
                  ? <img src={getAvatarUrl(employeeAvatarFilename) ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : employeeName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}>{employeeName}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1 }}>ID {employeeId}</div>
              </div>
            </div>
          </div>
          {templatesLoading ? (
            <div style={{ padding: '18px 0', textAlign: 'center' }}><Spinner size="sm" /></div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 12 }}>
              {(['day1', 'week1', 'month1', 'ongoing'] as const).map((phase) => {
                const phaseTemplates = templatesByPhase.get(phase) ?? [];
                if (phaseTemplates.length === 0) return null;
                return (
                  <div key={phase}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {phase === 'day1' ? '🚀 Day 1' : phase === 'week1' ? '📚 Week 1' : phase === 'month1' ? '🎯 Month 1' : '⭐ Ongoing'}
                    </div>
                    <div style={{ display: 'grid', gap: 7 }}>
                      {phaseTemplates.map((template) => {
                        const at = assignedTaskByTemplateId.get(template.id);
                        const hasAssigner = Boolean(at?.assignedByName);
                        return (
                          <label
                            key={template.id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              fontSize: 12.5,
                              border: '1px solid var(--border-light)',
                              borderRadius: 8,
                              background: 'var(--surface-warm)',
                              padding: '8px 10px',
                            }}
                          >
                            <input
                              type="checkbox"
                              style={{ marginTop: 2 }}
                              checked={selectedTemplateIds.has(template.id)}
                              onChange={() => setSelectedTemplateIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(template.id)) next.delete(template.id); else next.add(template.id);
                                return next;
                              })}
                            />
                            <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600 }}>{template.name}</span>
                                <span style={{ fontSize: 9, color: ONBOARDING_PRIORITY_COLORS[template.priority] ?? 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{template.priority}</span>
                              </div>
                              {template.description && (
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>{template.description}</div>
                              )}
                              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                    {ONBOARDING_CATEGORY_META[template.category]?.icon} {ONBOARDING_CATEGORY_META[template.category]?.label ?? template.category}
                                  </span>
                                  <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', background: 'var(--background)', color: 'var(--text-secondary)' }}>
                                    {ONBOARDING_PHASE_META[template.taskType]?.icon} {ONBOARDING_PHASE_META[template.taskType]?.label ?? template.taskType}
                                  </span>
                                </div>
                                {hasAssigner && at && (
                                  <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                    <span>{t('onboarding.assignedBy', 'Assigned by')}</span>
                                    <span style={{ width: 15, height: 15, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,33,55,0.12)', color: 'var(--text-secondary)', fontSize: 8, fontWeight: 700 }}>
                                      {at.assignedByAvatarFilename
                                        ? <img src={getAvatarUrl(at.assignedByAvatarFilename) ?? ''} alt={at.assignedByName!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : at.assignedByName!.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{at.assignedByName}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={t('onboarding.newTask', 'New task')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={creatingTemplate} onClick={handleCreateTemplate}>
              {t('common.create', 'Create')}
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {t('onboarding.modalSubtitleCreate', 'Create a reusable task template for this company.')}
            {' '}
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              {employeeCompanyName ?? t('common.company', 'Company')}
              {employeeCompanyId ? ` · #${employeeCompanyId}` : ''}
            </span>
          </p>
          <Input
            label={`${t('onboarding.templateName')} *`}
            value={createForm.name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={t('onboarding.templateNamePlaceholder', 'e.g. Complete employment paperwork')}
            required
          />
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
              {t('onboarding.templateDesc', t('onboarding.description', 'Description'))}
            </label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t('onboarding.templateDescPlaceholder', 'Optional instructions or details…')}
              rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              {t('onboarding.taskType')}
            </label>
            <CustomSelect
              value={createForm.taskType}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, taskType: ((value as OnboardingTemplate['taskType']) ?? 'day1') }))}
              options={taskTypeOptions}
              isClearable={false}
              menuMaxHeight={220}
              controlMinHeight={40}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              {t('onboarding.taskCategory')}
            </label>
            <CustomSelect
              value={createForm.category}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, category: ((value as OnboardingTemplate['category']) ?? 'other') }))}
              options={categorySelectOptions}
              searchable
              isClearable={false}
              menuMaxHeight={220}
              controlMinHeight={40}
              searchPlaceholder={t('common.search', 'Search...')}
              noOptionsMessage={t('common.noData', 'No options found')}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              {t('onboarding.taskPriority')}
            </label>
            <CustomSelect
              value={createForm.priority}
              onChange={(value) => setCreateForm((prev) => ({ ...prev, priority: ((value as OnboardingTemplate['priority']) ?? 'medium') }))}
              options={priorityOptions}
              isClearable={false}
              menuMaxHeight={220}
              controlMinHeight={40}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input
              type="number"
              label={t('onboarding.sortOrder', 'Sort order')}
              value={String(createForm.sortOrder)}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))}
            />
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                {t('onboarding.dueDays', 'Due days after hire')}
              </label>
              <input
                type="number"
                className="field-input"
                value={createForm.dueDays}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, dueDays: e.target.value }))}
                placeholder={t('onboarding.noDueDate', 'Optional')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <Input
            type="url"
            label={t('onboarding.linkUrl', 'Reference link (optional)')}
            value={createForm.linkUrl}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, linkUrl: e.target.value }))}
            placeholder="https://…"
          />
        </div>
      </Modal>
    </SectionPanel>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconUser = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconFile = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconTasks = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </svg>
);
const IconCertificate = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3h8l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
    <path d="M8 13h8" /><path d="M8 17h5" />
  </svg>
);
const IconShifts = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
    <path d="M9 15h6" />
  </svg>
);
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);
const IconOn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);
const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Component ──────────────────────────────────────────────────────────────────
export function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, targetCompanyId } = useAuth();
  const { isMobile } = useBreakpoint();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'documents' | 'qualifications' | 'shifts'>('overview');
  const [shiftMonthCursor, setShiftMonthCursor] = useState<Date>(() => new Date());
  const [employeeShifts, setEmployeeShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftsError, setShiftsError] = useState<string | null>(null);
  const [selectedShiftDate, setSelectedShiftDate] = useState<string | null>(null);

  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [deviceResetting, setDeviceResetting] = useState(false);

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [medicals, setMedicals] = useState<MedicalCheck[]>([]);
  const [trainingsLoading, setTrainingsLoading] = useState(false);
  const [editingTraining, setEditingTraining] = useState<{ trainingType?: TrainingType; startDate?: string | null; endDate?: string | null; editing?: number | null }>({});
  const [editingMedical, setEditingMedical] = useState<{ startDate?: string | null; endDate?: string | null; editing?: number | null }>({});
  const [trainingFormOpen, setTrainingFormOpen] = useState(false);
  const [trainingModalSaving, setTrainingModalSaving] = useState(false);
  const [trainingModalError, setTrainingModalError] = useState<string | null>(null);
  const [medicalFormOpen, setMedicalFormOpen] = useState(false);
  const [medicalModalSaving, setMedicalModalSaving] = useState(false);
  const [medicalModalError, setMedicalModalError] = useState<string | null>(null);
  const [associations, setAssociations] = useState<EmployeeAssociationsResponse | null>(null);
  const [associationsLoading, setAssociationsLoading] = useState(false);
  const [associationsError, setAssociationsError] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const employeeId = id && !isNaN(parseInt(id, 10)) ? parseInt(id, 10) : undefined;
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr' || user?.role === 'area_manager' || user?.isSuperAdmin === true;
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin === true;
  const isOwnProfile = user?.id === employee?.id;
  const canViewSensitive = isAdminOrHr || isOwnProfile;
  const canResetDevice = isAdminOrHr && (employee?.role === 'employee' || employee?.role === 'store_terminal' || employee?.role === 'store_manager' || employee?.role === 'area_manager' || employee?.role === 'hr');
  const activeCompanyId = targetCompanyId ?? user?.companyId ?? null;
  const shiftMonthToken = useMemo(() => formatMonthToken(shiftMonthCursor), [shiftMonthCursor]);

  const tRole = (roleKey: string, isSuper?: boolean) => isSuper ? t('roles.super_admin') : (t as (k: string) => string)(`roles.${roleKey}`);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employeeId) return;
    setAvatarUploading(true);
    try {
      await uploadEmployeeAvatar(employeeId, file);
      showToast(t('employees.avatarSuccess'), 'success');
      await loadEmployee();
    } catch (err: unknown) {
      const message = translateApiError(err, t, t('employees.avatarError')) ?? t('employees.avatarError');
      showToast(message, getApiErrorCode(err) === 'INVALID_FILE_TYPE' ? 'warning' : 'error');
    } finally {
      setAvatarUploading(false);
      const input = document.getElementById('avatar-upload') as HTMLInputElement;
      if (input) input.value = '';
    }
  };

  const loadEmployee = () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    getEmployee(employeeId)
      .then((emp) => {
        if (emp.role === 'store_terminal') {
          showToast(t('employees.errorTerminalAccessDeny', 'Accesso non consentito per i terminali in questo modulo'), 'warning');
          navigate('/dipendenti', { replace: true });
          return;
        }
        setEmployee(emp);
      })
      .catch((err) => {
        setError(translateApiError(err, t, t('employees.errorLoad')));
      })
      .finally(() => setLoading(false));
  };

  const loadAssociations = () => {
    if (!employeeId) return;
    setAssociationsLoading(true);
    setAssociationsError(null);
    getEmployeeAssociations(employeeId)
      .then(setAssociations)
      .catch((err) => {
        setAssociationsError(translateApiError(err, t, t('employees.associationsLoadError')));
      })
      .finally(() => setAssociationsLoading(false));
  };

  useEffect(() => {
    if (!id || isNaN(parseInt(id, 10))) {
      navigate('/dipendenti', { replace: true });
      return;
    }
    loadEmployee();
    loadAssociations();
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId || !canViewSensitive) return;
    setTrainingsLoading(true);
    Promise.all([getTrainings(employeeId), getMedicals(employeeId)])
      .then(([tr, med]) => { setTrainings(tr); setMedicals(med); })
      .catch(() => { })
      .finally(() => setTrainingsLoading(false));
  }, [employeeId, canViewSensitive]);

  useEffect(() => {
    if (activeTab !== 'shifts' || !employeeId) return;

    let cancelled = false;
    setShiftsLoading(true);
    setShiftsError(null);

    listShifts({
      month: shiftMonthToken,
      user_id: employeeId,
    })
      .then((res) => {
        if (cancelled) return;
        setEmployeeShifts(res.shifts);
        const dayKeys = new Set(res.shifts.map((shift) => shift.date.split('T')[0]));
        setSelectedShiftDate((prev) => {
          if (prev && dayKeys.has(prev)) return prev;
          const first = res.shifts[0]?.date?.split('T')[0];
          return first ?? null;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEmployeeShifts([]);
        setSelectedShiftDate(null);
        setShiftsError(translateApiError(err, t, t('shifts.errorLoad', 'Unable to load shifts')) ?? t('shifts.errorLoad', 'Unable to load shifts'));
      })
      .finally(() => {
        if (cancelled) return;
        setShiftsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, employeeId, shiftMonthToken, t]);

  const handleActivate = async () => {
    if (!employeeId) return;
    setActivating(true);
    setActivateError(null);
    try {
      await activateEmployee(employeeId);
      setShowActivateModal(false);
      showToast(t('employees.activatedSuccess'), 'success');
      loadEmployee();
      loadAssociations();
    } catch (err: unknown) {
      setActivateError(translateApiError(err, t, t('employees.errorActivate')));
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!employeeId) return;
    setDeactivating(true);
    setDeactivateError(null);
    try {
      await deactivateEmployee(employeeId);
      setShowDeactivateModal(false);
      showToast(t('employees.deactivatedSuccess'), 'success');
      loadEmployee();
      loadAssociations();
    } catch (err: unknown) {
      setDeactivateError(translateApiError(err, t, t('employees.errorDeactivate')));
    } finally {
      setDeactivating(false);
    }
  };

  const handleDeviceReset = async () => {
    if (!employeeId || deviceResetting) return;
    const name = [employee?.surname, employee?.name].filter(Boolean).join(' ') || 'Utente';
    if (!window.confirm(t('deviceReset.confirmMessage', { employee: name }))) {
      return;
    }
    setDeviceResetting(true);
    try {
      await resetEmployeeDevice(employeeId);
      showToast(t('deviceReset.successToast'), 'success');
      loadEmployee();
      loadAssociations();
    } catch (err: unknown) {
      showToast(translateApiError(err, t) ?? t('employees.deviceResetRequestedError'), 'error');
    } finally {
      setDeviceResetting(false);
    }
  };

  const primaryAssocCompany = useMemo(() => {
    if (!associations || !employee) return null;
    return associations.companies.find((c) => c.id === employee.companyId) ?? associations.companies[0] ?? null;
  }, [associations, employee]);

  const currentAssocStore = useMemo(() => {
    if (!primaryAssocCompany || employee?.storeId == null) return null;
    return primaryAssocCompany.stores.find((s) => s.id === employee.storeId) ?? null;
  }, [primaryAssocCompany, employee?.storeId]);

  const associationEntriesFlat = useMemo((): EmployeeAssociationEntry[] => {
    if (!primaryAssocCompany) return [];
    const out: EmployeeAssociationEntry[] = [];
    primaryAssocCompany.stores.forEach((s) => {
      s.employees.forEach((e) => out.push(e));
    });
    primaryAssocCompany.unassignedEmployees.forEach((e) => out.push(e));
    return out;
  }, [primaryAssocCompany]);

  const hrAssociationEntry = useMemo(
    () => associationEntriesFlat.find((e) => e.role === 'hr' && (e.storeId == null || e.storeId === employee?.storeId))
      ?? associationEntriesFlat.find((e) => e.role === 'hr'),
    [associationEntriesFlat, employee?.storeId],
  );
  const areaAssociationEntry = useMemo(
    () => associationEntriesFlat.find((e) => e.role === 'area_manager' && (e.storeId == null || e.storeId === employee?.storeId))
      ?? associationEntriesFlat.find((e) => e.role === 'area_manager'),
    [associationEntriesFlat, employee?.storeId],
  );
  const storeManagerAssociationEntry = useMemo(
    () => associationEntriesFlat.find((e) => e.role === 'store_manager' && e.storeId === employee?.storeId),
    [associationEntriesFlat, employee?.storeId],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <Alert variant="danger" title={t('common.error')}>
          {error ?? t('employees.notFound')}
        </Alert>
      </div>
    );
  }

  const fullName = `${employee.name} ${employee.surname}`;
  const initials = `${employee.name?.[0] ?? ''}${employee.surname?.[0] ?? ''}`.toUpperCase();
  const avatarBg = getAvatarColor(fullName);

  const workingTypeLabel = employee.workingType === 'full_time'
    ? t('employees.fullTime')
    : employee.workingType === 'part_time'
      ? t('employees.partTime')
      : '—';

  const shiftMonthLabel = shiftMonthCursor.toLocaleDateString(i18n.language.startsWith('it') ? 'it-IT' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const selectedDayShifts = employeeShifts
    .filter((shift) => shift.date.split('T')[0] === selectedShiftDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="page-enter" style={{ maxWidth: '1000px', margin: '0 auto' }}>



      {/* Sticky Header & Tabs */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--background)',
        paddingTop: '4px',
        paddingBottom: '12px',
        marginBottom: '12px',
        boxShadow: '0 -100px 0 var(--background)',
      }}>
        {/* Back + actions row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 12,
          padding: '4px 2px',
        }}>
          <button
            onClick={() => navigate('/dipendenti')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
              cursor: 'pointer', background: 'none', border: 'none', padding: 0,
              fontWeight: 600, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <IconBack /> {t('employees.backToList')}
          </button>

          {isAdminOrHr && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              marginLeft: isMobile ? 'auto' : '0',
              justifyContent: isMobile ? 'flex-end' : 'flex-start',
            }}>
              {isMobile ? (
                <>
                  <button
                    onClick={() => setMobileMenuOpen(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '8px', borderRadius: '50%',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <IconMenu />
                  </button>

                  {mobileMenuOpen && createPortal(
                    <div style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      width: '100vw',
                      height: '100vh',
                      zIndex: 9999,
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}>
                      <style>{`
                        @keyframes slideInRight {
                          from { transform: translateX(100%); }
                          to { transform: translateX(0); }
                        }
                      `}</style>
                      {/* Backdrop */}
                      <div 
                        onClick={() => setMobileMenuOpen(false)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          background: 'rgba(15, 23, 42, 0.4)',
                          backdropFilter: 'blur(4px)',
                        }}
                      />

                      {/* Drawer container */}
                      <div style={{
                        position: 'relative',
                        width: '280px',
                        maxWidth: '80%',
                        height: '100%',
                        background: 'var(--surface)',
                        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '24px 20px',
                        boxSizing: 'border-box',
                        animation: 'slideInRight 0.3s ease-out',
                        borderLeft: '1px solid var(--border)',
                      }}>
                        {/* Header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '24px',
                        }}>
                          <h3 style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '18px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            margin: 0,
                          }}>
                            {t('common.actions', 'Actions')}
                          </h3>
                          <button
                            onClick={() => setMobileMenuOpen(false)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 4,
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <IconClose />
                          </button>
                        </div>

                        {/* Action Buttons list */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}>
                          <button
                            onClick={() => {
                              setMobileMenuOpen(false);
                              setShowEditForm(true);
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 10,
                              padding: '12px 16px', borderRadius: 8,
                              border: '1px solid var(--border)',
                              background: 'var(--surface)',
                              color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                              fontFamily: 'var(--font-body)', cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                            }}
                          >
                            <IconEdit /> {t('common.edit')}
                          </button>

                          {!isOwnProfile && (
                            <button
                              onClick={() => {
                                setMobileMenuOpen(false);
                                setShowCompose(true);
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                padding: '12px 16px', borderRadius: 8,
                                border: '1px solid rgba(201,151,58,0.35)',
                                background: 'rgba(201,151,58,0.10)',
                                color: 'rgba(201,151,58,0.92)', fontSize: 13, fontWeight: 700,
                                fontFamily: 'var(--font-body)', cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                              </svg>
                              {t('employees.sendMessage')}
                            </button>
                          )}

                          {employee.status === 'active' ? (
                            <button
                              onClick={() => {
                                setMobileMenuOpen(false);
                                setShowDeactivateModal(true);
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                padding: '12px 16px', borderRadius: 8,
                                border: '1px solid rgba(220,38,38,0.42)',
                                background: 'rgba(220,38,38,0.10)',
                                color: '#DC2626', fontSize: 13, fontWeight: 700,
                                fontFamily: 'var(--font-body)', cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                              }}
                            >
                              <IconOff /> {t('common.deactivate')}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setMobileMenuOpen(false);
                                setShowActivateModal(true);
                              }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                padding: '12px 16px', borderRadius: 8,
                                border: '1px solid rgba(21,128,61,0.42)',
                                background: 'rgba(21,128,61,0.10)',
                                color: '#15803D', fontSize: 13, fontWeight: 700,
                                fontFamily: 'var(--font-body)', cursor: 'pointer',
                                textAlign: 'left',
                                width: '100%',
                              }}
                            >
                              <IconOn /> {t('common.activate')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowEditForm(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '6px 10px', borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)', fontSize: 11.5, fontWeight: 700,
                      fontFamily: 'var(--font-body)', cursor: 'pointer',
                    }}
                  >
                    <IconEdit /> {t('common.edit')}
                  </button>

                  {!isOwnProfile && (
                    <button
                      onClick={() => setShowCompose(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 10px', borderRadius: 999,
                        border: '1px solid rgba(201,151,58,0.35)',
                        background: 'rgba(201,151,58,0.10)',
                        color: 'rgba(201,151,58,0.92)', fontSize: 11.5, fontWeight: 700,
                        fontFamily: 'var(--font-body)', cursor: 'pointer',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                      {t('employees.sendMessage')}
                    </button>
                  )}

                  {employee.status === 'active' ? (
                    <button
                      onClick={() => setShowDeactivateModal(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 10px', borderRadius: 999,
                        border: '1px solid rgba(220,38,38,0.42)',
                        background: 'rgba(220,38,38,0.10)',
                        color: '#DC2626', fontSize: 11.5, fontWeight: 700,
                        fontFamily: 'var(--font-body)', cursor: 'pointer',
                      }}
                    >
                      <IconOff /> {t('common.deactivate')}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowActivateModal(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6px 10px', borderRadius: 999,
                        border: '1px solid rgba(21,128,61,0.42)',
                        background: 'rgba(21,128,61,0.10)',
                        color: '#15803D', fontSize: 11.5, fontWeight: 700,
                        fontFamily: 'var(--font-body)', cursor: 'pointer',
                      }}
                    >
                      <IconOn /> {t('common.activate')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {/* Hero card */}
        <div style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, #1A3B5C 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 32px',
          marginBottom: '16px',
          boxShadow: '0 4px 24px rgba(13,33,55,0.22)',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}>
          {/* Avatar with upload */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: employee.avatarFilename ? 'transparent' : avatarBg,
              border: '3px solid rgba(201,151,58,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', fontWeight: 700, color: '#fff',
              fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
              boxShadow: '0 4px 16px rgba(0,0,0,0.24)',
              overflow: 'hidden',
            }}>
              {employee.avatarFilename ? (
                <img
                  src={getAvatarUrl(employee.avatarFilename) ?? ''}
                  alt={fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : initials}
            </div>
            {(isOwnProfile || isAdminOrHr) && (
              <>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleAvatarUpload}
                />
                <label
                  htmlFor="avatar-upload"
                  title={t('employees.changeAvatar')}
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--accent)', border: '2px solid var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: avatarUploading ? 'not-allowed' : 'pointer',
                    opacity: avatarUploading ? 0.6 : 1,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </label>
              </>
            )}
          </div>

          {/* Identity */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700,
              color: '#FFFFFF', margin: '0 0 8px', letterSpacing: '-0.02em',
            }}>
              {fullName}
              {employee.country && (
                <ReactCountryFlag
                  countryCode={employee.country}
                  svg
                  style={{ marginLeft: '12px', marginBottom: '2px', width: '20px', height: '16px', verticalAlign: 'middle', borderRadius: '2px' }}
                  title={employee.country}
                />
              )}
            </h1>
            {!isMobile && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Badge variant={ROLE_BADGE_VARIANT[employee.role]}>
                    {tRole(employee.role, employee.isSuperAdmin)}
                  </Badge>
                  <Badge variant={employee.status === 'active' ? 'success' : 'danger'}>
                    {employee.status === 'active' ? t('employees.statusActive') : t('employees.statusInactive')}
                  </Badge>
                </div>
                <div style={{
                  marginTop: '10px', fontSize: '12.5px', color: 'rgba(255,255,255,0.55)',
                  display: 'flex', gap: '16px', flexWrap: 'wrap',
                }}>
                  {employee.email && <span>{employee.email}</span>}
                  {employee.department && <span>· {employee.department}</span>}
                  {employee.storeName && <span>· {employee.storeName}</span>}
                  {employee.uniqueId && (
                    <span style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
                      · ID: {employee.uniqueId}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs Navigation */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          gap: '8px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-xs)',
          width: '100%',
        }}>
          {(() => {
            const visibleTabs = [
              { key: 'overview' as const, label: t('employees.tabOverview', 'Overview'), icon: <IconUser />, color: '#0D2137' },
              { key: 'tasks' as const, label: t('employees.tabTasks', 'Tasks'), icon: <IconTasks />, color: '#1B4D3E' },
              { key: 'qualifications' as const, label: t('employees.tabQualifications', 'Qualifications'), icon: <IconCertificate />, color: '#8B6914' },
              { key: 'shifts' as const, label: t('employees.tabShifts', 'Shifts'), icon: <IconShifts />, color: '#1E4A7A' },
              { key: 'documents' as const, label: t('documents.title'), icon: <IconFile />, color: '#4B5563' },
            ].filter(tab => tab.key !== 'documents' || employee.role !== 'admin');

            return isMobile ? (
              <>
                {/* Row 1: First 3 tabs */}
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  {visibleTabs.slice(0, 3).map((tab) => {
                    const selected = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 4px',
                          borderRadius: '16px',
                          border: selected ? `1px solid ${tab.color}66` : `1px solid ${tab.color}20`,
                          background: selected ? `${tab.color}18` : 'var(--surface-warm)',
                          color: selected ? tab.color : 'var(--text-secondary)',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          fontFamily: 'var(--font-body)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: selected ? `0 8px 18px ${tab.color}18` : 'none',
                          flex: 1,
                          minWidth: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{
                          display: 'inline-flex',
                          color: selected ? '#fff' : 'var(--text-muted)',
                          background: selected ? tab.color : 'transparent',
                          borderRadius: 999,
                          padding: selected ? 4 : 0,
                        }}>
                          {tab.icon}
                        </span>
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Row 2: Remaining tabs */}
                {visibleTabs.length > 3 && (
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    {visibleTabs.slice(3).map((tab) => {
                      const selected = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 4px',
                            borderRadius: '16px',
                            border: selected ? `1px solid ${tab.color}66` : `1px solid ${tab.color}20`,
                            background: selected ? `${tab.color}18` : 'var(--surface-warm)',
                            color: selected ? tab.color : 'var(--text-secondary)',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-body)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: selected ? `0 8px 18px ${tab.color}18` : 'none',
                            flex: 1,
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{
                            display: 'inline-flex',
                            color: selected ? '#fff' : 'var(--text-muted)',
                            background: selected ? tab.color : 'transparent',
                            borderRadius: 999,
                            padding: selected ? 4 : 0,
                          }}>
                            {tab.icon}
                          </span>
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {tab.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              visibleTabs.map((tab) => {
                const selected = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 13px',
                      borderRadius: '16px',
                      border: selected ? `1px solid ${tab.color}66` : `1px solid ${tab.color}20`,
                      background: selected ? `${tab.color}18` : 'var(--surface-warm)',
                      color: selected ? tab.color : 'var(--text-secondary)',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: selected ? `0 8px 18px ${tab.color}18` : 'none',
                    }}
                    onMouseEnter={(event) => {
                      if (!selected) {
                        event.currentTarget.style.background = `${tab.color}14`;
                        event.currentTarget.style.borderColor = `${tab.color}40`;
                      }
                    }}
                    onMouseLeave={(event) => {
                      if (!selected) {
                        event.currentTarget.style.background = 'var(--surface-warm)';
                        event.currentTarget.style.borderColor = `${tab.color}20`;
                      }
                    }}
                  >
                    <span style={{
                      display: 'inline-flex',
                      color: selected ? '#fff' : 'var(--text-muted)',
                      background: selected ? tab.color : 'transparent',
                      borderRadius: 999,
                      padding: selected ? 5 : 0,
                    }}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                );
              })
            );
          })()}
        </div>
      </div>


      {activeTab === 'documents' ? (
        <DocumentManager
          employeeId={Number(employeeId)}
          employeeName={`${employee.name} ${employee.surname}`}
          isTrashEnabled={isAdminOrHr}
        />
      ) : (
        <>
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: (canViewSensitive && !isMobile) ? '1fr 1fr' : '1fr', gap: '20px' }}>
                {/* General info */}
                <SectionPanel title={t('employees.generalInfo')} icon={<IconUser />}>
                  <InfoRow label={t('employees.emailField')} value={employee.email} />
                  <InfoRow label={t('employees.colUniqueId')} value={
                    employee.uniqueId
                      ? <span style={{ fontFamily: 'var(--font-display)', fontSize: '12.5px', letterSpacing: '0.04em' }}>{employee.uniqueId}</span>
                      : '—'
                  } />
                  <InfoRow label={t('common.role')} value={
                    <Badge variant={ROLE_BADGE_VARIANT[employee.role]}>{tRole(employee.role, employee.isSuperAdmin)}</Badge>
                  } />
                  <InfoRow label={t('common.status')} value={
                    <Badge variant={employee.status === 'active' ? 'success' : 'danger'}>
                      {employee.status === 'active' ? t('employees.statusActive') : t('employees.statusInactive')}
                    </Badge>
                  } />
                  <InfoRow label={t('common.department')} value={employee.department ?? '—'} />
                  <InfoRow label={t('employees.companyField')} value={employee.companyName ?? '—'} />
                  <InfoRow label={t('common.store')} value={employee.storeName ?? '—'} />
                  <InfoRow label={t('employees.supervisorField')} value={employee.supervisorName ?? '—'} />
                  {/* Record metadata — when the record was set up and by whom.
                      Needed for support and troubleshooting. */}
                  <InfoRow label={t('common.createdAt', 'Created')} value={formatDateTime(employee.createdAt, localeFor(i18n.language))} />
                  {employee.createdByName && (
                    <InfoRow label={t('common.createdBy', 'Created by')} value={employee.createdByName} />
                  )}
                  <InfoRow label={t('common.updatedAt', 'Last updated')} value={formatDateTime(employee.updatedAt, localeFor(i18n.language))} />
                  <InfoRow label={t('common.updatedBy', 'Updated by')} value={employee.updatedByName ?? '—'} last />
                </SectionPanel>

                {/* Sensitive / contractual info */}
                {canViewSensitive && (
                  <SectionPanel title={t('employees.contractualDetails')} icon={<IconFile />}>
                    <InfoRow label={t('employees.hireDateField')} value={formatDate(employee.hireDate, i18n.language)} />
                    <InfoRow label={t('employees.contractEndField')} value={
                      employee.contractEndDate
                        ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{formatDate(employee.contractEndDate, i18n.language)}</span>
                        : '—'
                    } />
                    <InfoRow label={t('employees.workingTypeField')} value={workingTypeLabel} />
                    <InfoRow label={t('employees.weeklyHoursField')} value={employee.weeklyHours != null ? `${employee.weeklyHours}h` : '—'} />
                    <InfoRow label={t('employees.personalEmailField')} value={employee.personalEmail ?? '—'} />
                    <InfoRow label={t('employees.dateOfBirthField')} value={formatDate(employee.dateOfBirth, i18n.language)} />
                    <InfoRow label={t('employees.ibanField')} value={
                      employee.iban
                        ? <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '0.06em' }}>{maskIban(employee.iban)}</span>
                        : '—'
                    } />
                    <InfoRow
                      label={t('employees.nationalityField')}
                      value={employee.nationality ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {employee.country ? <ReactCountryFlag countryCode={employee.country} svg style={{ width: '1em', height: '1em' }} /> : null}
                          <span>{employee.nationality}</span>
                        </span>
                      ) : '—'}
                    />
                    <InfoRow label={t('employees.genderField')} value={
                      employee.gender === 'M' ? t('employees.genderMale')
                        : employee.gender === 'F' ? t('employees.genderFemale')
                          : employee.gender === 'other' ? t('employees.genderOther')
                            : '—'
                    } />
                    <InfoRow
                      label={t('employees.addressField')}
                      value={[
                        employee.address,
                        employee.city,
                        employee.state,
                        employee.country,
                        employee.cap,
                      ].filter(Boolean).join(', ') || '—'}
                    />
                    <InfoRow label={t('companies.companyPhoneNumbers', 'Phone')} value={employee.phone ?? '—'} />
                    <InfoRow label={t('employees.firstAidField')} value={
                      <span style={{ color: employee.firstAidFlag ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {employee.firstAidFlag ? t('common.yes') : t('common.no')}
                      </span>
                    } />
                    <InfoRow label={t('employees.maritalStatusField')} value={employee.maritalStatus ? t(MARITAL_STATUS_KEYS[employee.maritalStatus] ?? 'employees.maritalStatusField', { defaultValue: employee.maritalStatus }) : '—'} />
                    <InfoRow label={t('employees.contractTypeField')} value={employee.contractType ? t(CONTRACT_TYPE_KEYS[employee.contractType] ?? 'employees.contractTypeField', { defaultValue: employee.contractType }) : '—'} />
                    <InfoRow label={t('employees.probationField')} value={employee.probationMonths != null ? `${employee.probationMonths} ${t('employees.months')}` : '—'} />
                    <InfoRow label={t('employees.terminationDateField')} value={formatDate(employee.terminationDate, i18n.language)} />
                    <InfoRow label={t('employees.terminationTypeField')} value={employee.terminationType ? t(TERMINATION_TYPE_KEYS[employee.terminationType] ?? 'employees.terminationTypeField', { defaultValue: employee.terminationType }) : '—'} last />
                  </SectionPanel>
                )}
              </div>

              {/* Device Binding Section */}
              <SectionPanel
                title={t('deviceReset.title')}
                icon={<Smartphone size={15} style={{ color: 'var(--accent)' }} />}
              >
                {employee.deviceRegistered ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {t('deviceReset.colDeviceStatus')}:
                        </span>
                        {employee.deviceResetPending ? (
                          <Badge variant="warning">{t('employees.deviceStatusResetPending')}</Badge>
                        ) : (
                          <Badge variant="success">{t('employees.deviceStatusRegistered')}</Badge>
                        )}
                      </div>
                      
                      {canResetDevice && (
                        <button
                          type="button"
                          onClick={handleDeviceReset}
                          disabled={deviceResetting}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--danger)',
                            padding: '6px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                          title={t('deviceReset.resetButton')}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '4px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {t('deviceReset.model')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {employee.deviceMetadata?.device?.model || employee.deviceMetadata?.model || 'Generic Device'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {t('deviceReset.os')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {employee.deviceMetadata?.os?.name || '—'} {employee.deviceMetadata?.os?.version || ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {t('deviceReset.browser')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {employee.deviceMetadata?.browser?.name || '—'} {employee.deviceMetadata?.browser?.version || ''}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {t('deviceReset.registeredIp')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {employee.deviceMetadata?.ipAddress || '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {t('deviceReset.lastSeen')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {employee.lastSeenAt ? formatDate(employee.lastSeenAt, i18n.language) : t('deviceReset.neverSeen')}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {t('deviceReset.currentIp')}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{employee.lastSeenIp || '—'}</span>
                          {employee.deviceMetadata?.ipAddress && employee.lastSeenIp && employee.deviceMetadata.ipAddress !== employee.lastSeenIp && (
                            <span style={{
                              background: 'rgba(217,119,6,0.12)',
                              color: '#b45309',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid rgba(217,119,6,0.2)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <AlertTriangle size={10} />
                              {t('deviceReset.ipChangedWarning')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {t('deviceReset.colDeviceStatus')}:
                      </span>
                      <Badge variant="neutral">{t('employees.deviceStatusNotRegistered')}</Badge>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {t('deviceReset.subtitle')}
                    </p>
                  </div>
                )}
              </SectionPanel>
            </div>
          )}

          {activeTab === 'shifts' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <SectionPanel
                title={t('employees.tabShifts', 'Shifts')}
                icon={<IconShifts />}
                action={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setShiftMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                      style={{
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        borderRadius: 8,
                        padding: '3px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {'<'}
                    </button>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', minWidth: 120, textAlign: 'center' }}>
                      {shiftMonthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShiftMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                      style={{
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        borderRadius: 8,
                        padding: '3px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {'>'}
                    </button>
                  </div>
                }
              >
                {shiftsLoading ? (
                  <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
                    <Spinner size="sm" />
                  </div>
                ) : shiftsError ? (
                  <div style={{ padding: '10px 0' }}>
                    <Alert variant="danger" title={t('common.error')}>{shiftsError}</Alert>
                  </div>
                ) : employeeShifts.length === 0 ? (
                  <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {t('shifts.noneInRange', 'No shifts scheduled in this month.')}
                  </div>
                ) : (
                  <div style={{ paddingTop: 8 }}>
                    <MonthlyCalendar
                      shifts={employeeShifts}
                      currentDate={shiftMonthCursor}
                      onDayClick={(date) => setSelectedShiftDate(date)}
                    />
                  </div>
                )}
              </SectionPanel>

              <SectionPanel
                title={selectedShiftDate ? `${t('shifts.day', 'Day')} ${selectedShiftDate}` : t('shifts.day', 'Day')}
                icon={<IconShifts />}
              >
                {!selectedShiftDate ? (
                  <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    {t('shifts.selectDay', 'Select a day on the calendar to view shifts.')}
                  </div>
                ) : selectedDayShifts.length === 0 ? (
                  <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    {t('shifts.noneOnDay', 'No shifts on the selected day.')}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 8, paddingTop: 4 }}>
                    {selectedDayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        style={{
                          border: '1px solid var(--border-light)',
                          background: 'var(--surface-warm)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '9px 11px',
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {shiftClock(shift.startTime)} - {shiftClock(shift.endTime)}
                          </span>
                          <Badge variant={shift.status === 'confirmed' ? 'success' : shift.status === 'cancelled' ? 'danger' : 'warning'}>
                            {shift.status}
                          </Badge>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {shift.storeName || employee.storeName || '—'} · {employee.companyName || t('common.company', 'Company')}
                        </div>
                        {shift.notes ? (
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{shift.notes}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </SectionPanel>
            </div>
          )}

          {activeTab === 'qualifications' && !canViewSensitive && (
            <SectionPanel title={t('employees.tabQualifications', 'Qualifications')} icon={<IconCertificate />}>
              <div style={{ padding: '18px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {t('common.notAllowed', 'You do not have permission to view this section.')}
              </div>
            </SectionPanel>
          )}

          {/* Training Records */}
          {activeTab === 'qualifications' && canViewSensitive && (
            <div style={{ marginTop: 20 }}>
              <SectionPanel title={t('employees.trainingSection')} icon={<IconFile />}>
                {trainingsLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="sm" /></div>
                ) : (
                  <div>
                    {(['product', 'general', 'low_risk_safety', 'fire_safety'] as TrainingType[]).map((type) => {
                      const record = trainings
                        .filter(tr => tr.trainingType === type)
                        .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0];
                      return (
                        <div key={type} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {t(`employees.trainingType_${type}`)}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {record ? (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {formatDate(record.startDate, i18n.language)} → {formatDate(record.endDate, i18n.language)}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                            )}
                            {isAdminOrHr && (
                              <Button size="sm" variant="secondary" onClick={() => {
                                const toDateStr = (d: string | null | undefined) => d ? d.split('T')[0] : null;
                                setEditingTraining({ trainingType: type, startDate: toDateStr(record?.startDate), endDate: toDateStr(record?.endDate), editing: record?.id ?? null });
                                setTrainingFormOpen(true);
                              }}>
                                {record ? t('common.edit') : t('employees.addTraining')}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionPanel>
            </div>
          )}

          {/* Medical Checks */}
          {activeTab === 'qualifications' && canViewSensitive && (
            <div style={{ marginTop: 20 }}>
              <SectionPanel
                title={t('employees.medicalSection')}
                icon={<IconFile />}
                action={isAdminOrHr && medicals.length > 0 ? (
                  <Button size="sm" onClick={() => { setEditingMedical({ editing: null }); setMedicalFormOpen(true); }}>
                    {t('employees.addMedical')}
                  </Button>
                ) : undefined}
              >
                {medicals.length === 0 ? (
                  <div style={{
                    padding: '24px 0 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    textAlign: 'center',
                  }}>
                    <span style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'var(--surface-warm)',
                      border: '1px solid var(--border)',
                      color: 'var(--accent)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20" />
                        <path d="M2 12h20" />
                      </svg>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('employees.noMedicals')}
                    </span>
                    {isAdminOrHr && (
                      <Button size="sm" variant="accent" onClick={() => { setEditingMedical({ editing: null }); setMedicalFormOpen(true); }}>
                        {t('employees.addMedical')}
                      </Button>
                    )}
                  </div>
                ) : (
                  medicals.map((m, i) => (
                    <div key={m.id} style={{ padding: '10px 0', borderBottom: i < medicals.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                        {t('employees.medicalStartDate')}: {formatDate(m.startDate, i18n.language)} &nbsp;|&nbsp; {t('employees.medicalEndDate')}: {formatDate(m.endDate, i18n.language)}
                      </span>
                      {isAdminOrHr && (
                        <Button size="sm" variant="secondary" onClick={() => {
                          const toDateStr = (d: string | null | undefined) => d ? d.split('T')[0] : null;
                          setEditingMedical({ startDate: toDateStr(m.startDate), endDate: toDateStr(m.endDate), editing: m.id });
                          setMedicalFormOpen(true);
                        }}>
                          {t('common.edit')}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </SectionPanel>
            </div>
          )}

          {/* Onboarding Tasks */}
          {activeTab === 'tasks' && (isAdminOrHr || isOwnProfile) && employeeId && (
            <div style={{ marginTop: 20 }}>
              <OnboardingSection
                employeeId={employeeId}
                employeeCompanyId={employee.companyId}
                employeeCompanyName={employee.companyName ?? null}
                employeeStoreName={employee.storeName ?? null}
                employeeAvatarFilename={employee.avatarFilename}
                employeeName={fullName}
                isAdminOrHr={isAdminOrHr}
                companyLogoFilename={primaryAssocCompany?.logoFilename}
                companyGroupName={primaryAssocCompany?.groupName ?? null}
                storeLogoFilename={currentAssocStore?.logoFilename}
              />
            </div>
          )}

          {/* Role associations tree */}
          {activeTab === 'tasks' && (
            <div style={{ marginTop: 20 }}>
              <SectionPanel title={t('employees.associationsSection')} icon={<IconUser />}>
                {associationsLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="sm" /></div>
                ) : associationsError ? (
                  <div style={{ padding: '12px 0' }}>
                    <Alert variant="danger" title={t('common.error')}>
                      {associationsError}
                    </Alert>
                  </div>
                ) : !associations || associations.companies.length === 0 ? (
                  <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {t('employees.associationsEmpty')}
                  </div>
                ) : (
                  <div style={{ padding: '8px 0 6px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
                      gap: 10,
                      padding: 12,
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-warm)',
                    }}
                    >
                      {/* Company */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border-light)', borderRadius: 8, padding: 10, background: 'var(--surface)' }}>
                        {(() => {
                          const cname = primaryAssocCompany?.name ?? employee.companyName ?? '—';
                          const cLogo = getCompanyLogoUrl(primaryAssocCompany?.logoFilename ?? null);
                          const cinits = cname.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '—';
                          return (
                            <>
                              <div style={{
                                width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
                                border: '1px solid var(--border)', background: cLogo ? 'transparent' : getAvatarColor(cname),
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                              }}>
                                {cLogo
                                  ? <img src={cLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : cinits}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{cname}</div>
                                {primaryAssocCompany?.groupName && (
                                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>{primaryAssocCompany.groupName}</div>
                                )}
                                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 3 }}>{t('ats.storeCountLabel', { count: primaryAssocCompany?.stores.length ?? 0 })}</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Store */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border-light)', borderRadius: 8, padding: 10, background: 'var(--surface)' }}>
                        {(() => {
                          const sname = currentAssocStore?.name ?? employee.storeName ?? t('employees.noStore', 'No store');
                          const sLogo = getStoreLogoUrl(currentAssocStore?.logoFilename ?? null);
                          const sinit = sname.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'ST';
                          const empN = currentAssocStore?.employees.length ?? 0;
                          return (
                            <>
                              <div style={{
                                width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
                                border: '1px solid var(--border)', background: sLogo ? 'transparent' : getAvatarColor(sname),
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                              }}>
                                {sLogo
                                  ? <img src={sLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : sinit}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{sname}</div>
                                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 3 }}>{t('employees.associationsEmployeesCount', { count: empN })}</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* HR */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border-light)', borderRadius: 8, padding: 10, background: 'var(--surface)' }}>
                        {(() => {
                          const hr = hrAssociationEntry;
                          if (!hr) {
                            return (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('employees.scopeHrEmpty', 'No HR found for this store')}</div>
                            );
                          }
                          const hrf = `${hr.name} ${hr.surname}`.trim();
                          const hUrl = getAvatarUrl(hr.avatarFilename);
                          const hinit = `${hr.name?.[0] ?? ''}${hr.surname?.[0] ?? ''}`.toUpperCase() || 'H';
                          const hrIsSupervisor = employee.supervisorId != null && employee.supervisorId === hr.id;
                          return (
                            <>
                              <div style={{
                                width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                                border: '1px solid var(--border)', background: hUrl ? 'transparent' : getAvatarColor(hrf),
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                              }}>
                                {hUrl
                                  ? <img src={hUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : hinit}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{hrf}</span>
                                  {hrIsSupervisor && (
                                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#9A6808', border: '1px solid rgba(201,151,58,0.5)', borderRadius: 4, padding: '1px 5px' }}>{t('employees.supervisorTag', 'Supervisor')}</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 3 }}>{hr.storeName ?? t('employees.scopeStoresAll', 'All stores / HQ')}</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Area manager */}
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border-light)', borderRadius: 8, padding: 10, background: 'var(--surface)' }}>
                        {(() => {
                          const am = areaAssociationEntry;
                          if (!am) {
                            return (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('employees.scopeAreaEmpty', 'No area manager found for this store')}</div>
                            );
                          }
                          const amf = `${am.name} ${am.surname}`.trim();
                          const aUrl = getAvatarUrl(am.avatarFilename);
                          const ainit = `${am.name?.[0] ?? ''}${am.surname?.[0] ?? ''}`.toUpperCase() || 'A';
                          const sm = storeManagerAssociationEntry;
                          const smLine = sm ? `${sm.name} ${sm.surname}`.trim() : t('common.notSet', '—');
                          return (
                            <>
                              <div style={{
                                width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                                border: '1px solid var(--border)', background: aUrl ? 'transparent' : getAvatarColor(amf),
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                              }}>
                                {aUrl
                                  ? <img src={aUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : ainit}
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{amf}</div>
                                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 3 }}>{t('employees.scopeStoreManagerLine', { name: smLine })}</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </SectionPanel>
            </div>
          )}
        </>
      )}



      {/* Training Edit Modal */}
      <Modal
        open={trainingFormOpen}
        onClose={() => { setTrainingFormOpen(false); setTrainingModalError(null); setEditingTraining({}); }}
        title={editingTraining.editing != null ? t('common.edit') : t('employees.addTraining')}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setTrainingFormOpen(false); setTrainingModalError(null); setEditingTraining({}); }} disabled={trainingModalSaving}>{t('common.cancel')}</Button>
            <Button loading={trainingModalSaving} onClick={async () => {
              if (!employeeId) return;
              if (!editingTraining.startDate) {
                setTrainingModalError(t('employees.trainingStartDateRequired', 'La data di inizio è obbligatoria'));
                return;
              }
              setTrainingModalSaving(true);
              setTrainingModalError(null);
              try {
                const payload = {
                  trainingType: editingTraining.trainingType,
                  startDate: editingTraining.startDate,
                  endDate: editingTraining.endDate,
                };
                if (editingTraining.editing != null) {
                  await updateTraining(employeeId, editingTraining.editing, payload);
                } else {
                  await createTraining(employeeId, payload);
                }
                const tr = await getTrainings(employeeId);
                setTrainings(tr);
                setTrainingFormOpen(false);
                setTrainingModalError(null);
                setEditingTraining({});
              } catch (err: unknown) {
                setTrainingModalError(translateApiError(err, t, t('employees.errorSave')));
              } finally {
                setTrainingModalSaving(false);
              }
            }}>{t('common.save')}</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {trainingModalError && (
            <Alert variant="danger" title={t('common.error')} onClose={() => setTrainingModalError(null)}>
              {trainingModalError}
            </Alert>
          )}
          <DatePicker
            label={t('employees.trainingStartDate')}
            value={editingTraining.startDate ?? ''}
            onChange={(v) => setEditingTraining(p => ({ ...p, startDate: v || null }))}
          />
          <DatePicker
            label={t('employees.trainingEndDate')}
            value={editingTraining.endDate ?? ''}
            onChange={(v) => setEditingTraining(p => ({ ...p, endDate: v || null }))}
          />
        </div>
      </Modal>

      {/* Medical Edit Modal */}
      <Modal
        open={medicalFormOpen}
        onClose={() => { setMedicalFormOpen(false); setMedicalModalError(null); setEditingMedical({}); }}
        title={editingMedical.editing != null ? t('common.edit') : t('employees.addMedical')}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setMedicalFormOpen(false); setMedicalModalError(null); setEditingMedical({}); }} disabled={medicalModalSaving}>{t('common.cancel')}</Button>
            <Button loading={medicalModalSaving} onClick={async () => {
              if (!employeeId) return;
              if (!editingMedical.startDate) {
                setMedicalModalError(t('employees.medicalStartDateRequired', 'La data di inizio è obbligatoria'));
                return;
              }
              setMedicalModalSaving(true);
              setMedicalModalError(null);
              try {
                const payload = { startDate: editingMedical.startDate, endDate: editingMedical.endDate };
                if (editingMedical.editing != null) {
                  await updateMedical(employeeId, editingMedical.editing, payload);
                } else {
                  await createMedical(employeeId, payload);
                }
                const med = await getMedicals(employeeId);
                setMedicals(med);
                setMedicalFormOpen(false);
                setMedicalModalError(null);
                setEditingMedical({});
              } catch (err: unknown) {
                setMedicalModalError(translateApiError(err, t, t('employees.errorSave')));
              } finally {
                setMedicalModalSaving(false);
              }
            }}>{t('common.save')}</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {medicalModalError && (
            <Alert variant="danger" title={t('common.error')} onClose={() => setMedicalModalError(null)}>
              {medicalModalError}
            </Alert>
          )}
          <DatePicker
            label={t('employees.medicalStartDate')}
            value={editingMedical.startDate ?? ''}
            onChange={(v) => setEditingMedical(p => ({ ...p, startDate: v || null }))}
          />
          <DatePicker
            label={t('employees.medicalEndDate')}
            value={editingMedical.endDate ?? ''}
            onChange={(v) => setEditingMedical(p => ({ ...p, endDate: v || null }))}
          />
        </div>
      </Modal>

      {/* Communication board — only for own profile */}
      {isOwnProfile && employeeId && (
        <MessageBoard />
      )}

      {/* Compose message modal */}
      {showCompose && employee && (
        <ComposeMessage
          recipientId={employee.id}
          recipientName={fullName}
          companyId={employee.companyId ?? activeCompanyId}
          onClose={() => setShowCompose(false)}
          onSent={() => showToast(t('messages.successSent'), 'success')}
        />
      )}

      {/* Edit drawer */}
      {showEditForm && employeeId && (
        <EmployeeForm
          employeeId={employeeId}
          onSuccess={() => {
            setShowEditForm(false);
            showToast(t('employees.updatedSuccess'), 'success');
            loadEmployee();
            loadAssociations();
          }}
          onCancel={() => setShowEditForm(false)}
        />
      )}

      {/* Activate modal */}
      <Modal
        open={showActivateModal}
        onClose={() => setShowActivateModal(false)}
        title={t('employees.confirmActivate')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowActivateModal(false)} disabled={activating}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleActivate} loading={activating}>
              {t('common.activate')}
            </Button>
          </>
        }
      >
        {activateError && (
          <div style={{ marginBottom: '12px' }}>
            <Alert variant="danger" title={t('common.error')}>{activateError}</Alert>
          </div>
        )}
        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)' }}>
          {t('employees.confirmActivateMsg', { name: fullName })}
        </p>
      </Modal>

      {/* Deactivate modal */}
      <Modal
        open={showDeactivateModal}
        onClose={() => setShowDeactivateModal(false)}
        title={t('employees.confirmDeactivate')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeactivateModal(false)} disabled={deactivating}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeactivate} loading={deactivating}>
              {t('common.deactivate')}
            </Button>
          </>
        }
      >
        {deactivateError && (
          <div style={{ marginBottom: '12px' }}>
            <Alert variant="danger" title={t('common.error')}>{deactivateError}</Alert>
          </div>
        )}
        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)' }}>
          {t('employees.confirmDeactivateMsg', { name: fullName })}
        </p>
      </Modal>
    </div>
  );
}

export default EmployeeDetail;
