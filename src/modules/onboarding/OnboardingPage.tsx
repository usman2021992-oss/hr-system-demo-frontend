import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { Building2, CheckCircle2, ChevronDown, ChevronUp, Pencil, Power, Store as StoreIcon, Trash2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { translateApiError } from '../../utils/apiErrors';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { getAvatarUrl, getCompanyLogoUrl } from '../../api/client';
import { getCompanies } from '../../api/companies';
import { getStores } from '../../api/stores';
import { getEmployees } from '../../api/employees';
import type { Company, Store, Employee } from '../../types';
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getEmployeeTasks, assignTasks, completeTask, uncompleteTask,
  getOnboardingOverview, getOnboardingStats, sendReminder,
  OnboardingTemplate, OnboardingTask, OnboardingProgress, EmployeeOnboardingOverview, OnboardingStats,
} from '../../api/onboarding';

// ─── Phase System ─────────────────────────────────────────────────────────────

type Phase = 'day1' | 'week1' | 'month1' | 'ongoing';

const PHASE_ORDER: Phase[] = ['day1', 'week1', 'month1', 'ongoing'];

const ROLE_BADGE_VARIANT: Record<string, { bg: string; color: string; border: string }> = {
  admin: { bg: 'rgba(201,151,58,0.10)', color: 'var(--accent)', border: 'rgba(201,151,58,0.20)' },
  hr: { bg: 'var(--info-bg)', color: 'var(--info)', border: 'var(--info-border)' },
  area_manager: { bg: 'var(--success-bg)', color: 'var(--success)', border: 'var(--success-border)' },
  store_manager: { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'var(--warning-border)' },
  employee: { bg: 'var(--background)', color: 'var(--text-muted)', border: 'var(--border)' },
  store_terminal: { bg: 'var(--background)', color: 'var(--text-muted)', border: 'var(--border)' },
};

function getPhase(sortOrder: number): Phase {
  if (sortOrder <= 3)  return 'day1';
  if (sortOrder <= 7)  return 'week1';
  if (sortOrder <= 14) return 'month1';
  return 'ongoing';
}

function getTemplatePhase(template: Pick<OnboardingTemplate, 'taskType' | 'sortOrder'>): Phase {
  return template.taskType ?? getPhase(template.sortOrder);
}

function getTaskPhase(task: Pick<OnboardingTask, 'templateTaskType'>, index: number): Phase {
  return task.templateTaskType ?? getPhase(index + 1);
}

const PHASE_META: Record<Phase, { icon: string; color: string; bg: string; border: string; labelKey: string; subKey: string }> = {
  day1:    { icon: '🚀', color: '#0284C7', bg: 'rgba(2,132,199,0.08)',   border: 'rgba(2,132,199,0.2)',   labelKey: 'onboarding.phaseDay1Label',    subKey: 'onboarding.phaseDay1Sub' },
  week1:   { icon: '📚', color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.2)', labelKey: 'onboarding.phaseWeek1Label',   subKey: 'onboarding.phaseWeek1Sub' },
  month1:  { icon: '🎯', color: '#C9973A', bg: 'rgba(201,151,58,0.10)', border: 'rgba(201,151,58,0.2)', labelKey: 'onboarding.phaseMonth1Label',  subKey: 'onboarding.phaseMonth1Sub' },
  ongoing: { icon: '⭐', color: '#15803D', bg: 'rgba(21,128,61,0.08)',  border: 'rgba(21,128,61,0.2)',  labelKey: 'onboarding.phaseOngoingLabel', subKey: 'onboarding.phaseOngoingSub' },
};

const CATEGORY_META: Record<OnboardingTemplate['category'], { icon: string; label: string }> = {
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
  hr_docs: { icon: '📄', label: 'HR Documents' },
  it_setup: { icon: '💻', label: 'IT Setup' },
  meeting: { icon: '🤝', label: 'Meeting' },
  other: { icon: '📌', label: 'Other' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#DC2626',
  medium: '#D97706',
  low: '#15803D',
};

function getCategoryMeta(category: OnboardingTemplate['category'] | OnboardingTask['templateCategory']) {
  return CATEGORY_META[category] ?? CATEGORY_META.other;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string, surname: string) {
  return `${name[0] ?? ''}${surname[0] ?? ''}`.toUpperCase();
}

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function getDueDateDisplay(dueDate: string | null, isOverdue: boolean, t: TFunction): { label: string; color: string } {
  if (!dueDate) return { label: t('onboarding.noDueDate', 'No deadline'), color: 'var(--text-muted)' };
  const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (isOverdue) return { label: t('onboarding.overdue', 'Overdue'), color: '#DC2626' };
  if (diff === 0) return { label: t('onboarding.dueToday', 'Due today'), color: '#D97706' };
  if (diff === 1) return { label: t('onboarding.dueTomorrow', 'Due tomorrow'), color: '#D97706' };
  return { label: t('onboarding.dueInDays', { count: diff, defaultValue: 'Due in {{count}} days' }), color: '#15803D' };
}

function fmtRelative(iso: string, t: TFunction) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return t('onboarding.relToday', 'Today');
  if (days === 1) return t('onboarding.relYesterday', 'Yesterday');
  if (days < 7)  return t('onboarding.relDaysAgo', { count: days, defaultValue: '{{count}}d ago' });
  if (days < 30) return t('onboarding.relWeeksAgo', { count: Math.floor(days / 7), defaultValue: '{{count}}w ago' });
  return t('onboarding.relMonthsAgo', { count: Math.floor(days / 30), defaultValue: '{{count}}mo ago' });
}

const ADMIN_HR    = ['admin', 'hr', 'area_manager'];
const OVERVIEW_R  = ['admin', 'hr', 'area_manager'];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Skel: React.FC<{ w?: string | number; h?: number; r?: number }> = ({ w = '100%', h = 14, r = 6 }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: 'linear-gradient(90deg, var(--border) 25%, #e8e5de 50%, var(--border) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s infinite',
  }} />
);

// ─── Progress Ring ─────────────────────────────────────────────────────────────

const ProgressRing: React.FC<{ pct: number; size?: number; stroke?: number; color?: string; label?: string }> = ({
  pct, size = 52, stroke = 5, color = 'var(--accent)', label,
}) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct === 100 ? '#15803D' : color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: size < 48 ? 9 : 11, fontWeight: 700, color: pct === 100 ? '#15803D' : 'var(--text-primary)', lineHeight: 1 }}>
          {pct === 100 ? '✓' : `${pct}%`}
        </span>
        {label && <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1, marginTop: 1 }}>{label}</span>}
      </div>
    </div>
  );
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string; value: number | string; sub?: string;
  color: string; bg: string; icon: string;
  active?: boolean; onClick?: () => void;
}> = ({ label, value, sub, color, bg, icon, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      flex: '1 1 0', background: active ? bg : 'var(--surface)',
      border: `1.5px solid ${active ? color : 'var(--border)'}`,
      borderRadius: 14, padding: '14px 18px', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s', boxShadow: active ? `0 0 0 3px ${bg}` : 'none',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
    <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
  </div>
);

// ─── Modal Backdrop ─────────────────────────────────────────────────────────────

const ModalBackdrop: React.FC<{ onClose: () => void; width?: number; children: React.ReactNode }> = ({
  onClose, width = 520, children,
}) => createPortal(
  <div
    style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(13,33,55,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    onClick={onClose}
  >
    <div
      style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: width, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 72px rgba(0,0,0,0.22)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>,
  document.body,
);

// ─── Side Drawer ─────────────────────────────────────────────────────────────────

const SideDrawer: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode }> = ({ open, onClose, children }) => createPortal(
  <div
    style={{ position: 'fixed', inset: 0, zIndex: 8500, pointerEvents: open ? 'all' : 'none' }}
    onClick={onClose}
  >
    {/* Overlay */}
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,33,55,0.4)', backdropFilter: 'blur(2px)', opacity: open ? 1 : 0, transition: 'opacity 0.25s' }} />
    {/* Panel */}
    <div
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw',
        background: 'var(--surface)', boxShadow: '-8px 0 48px rgba(0,0,0,0.18)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        overflowY: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>,
  document.body,
);

// ─── Assign Modal ─────────────────────────────────────────────────────────────

const AssignModal: React.FC<{
  employeeName: string;
  templates: OnboardingTemplate[];
  assignedTemplateIds: number[];
  onClose: () => void;
  onConfirm: (selectedIds: number[]) => Promise<void>;
}> = ({ employeeName, templates, assignedTemplateIds, onClose, onConfirm }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<number>>(
    new Set(templates.filter((tmpl) => !assignedTemplateIds.includes(tmpl.id)).map((tmpl) => tmpl.id)),
  );
  const [saving, setSaving] = useState(false);

  const allUnassigned = templates.filter((tmpl) => !assignedTemplateIds.includes(tmpl.id));
  const allSelected = allUnassigned.length > 0 && allUnassigned.every((tmpl) => selected.has(tmpl.id));

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allUnassigned.map((tmpl) => tmpl.id)));
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm([...selected]); onClose(); }
    finally { setSaving(false); }
  };

  const grouped = PHASE_ORDER.reduce((acc, phase) => {
    acc[phase] = templates.filter((tmpl) => getTemplatePhase(tmpl) === phase);
    return acc;
  }, {} as Record<Phase, OnboardingTemplate[]>);

  return (
    <ModalBackdrop onClose={onClose} width={560}>
      <div style={{ padding: '24px 28px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {t('onboarding.assignModalTitle', 'Assign Onboarding Tasks')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('onboarding.assignModalSubtitle', 'Select tasks to assign to {{name}}', { name: employeeName })}
          </p>
        </div>

        <button
          onClick={toggleAll}
          style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16, fontWeight: 600 }}
        >
          {allSelected ? t('onboarding.assignDeselectAll', 'Deselect all') : t('onboarding.assignSelectAll', 'Select all')}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '50vh', overflowY: 'auto' }}>
          {PHASE_ORDER.map((phase) => {
            const phaseTasks = grouped[phase];
            if (phaseTasks.length === 0) return null;
            const meta = PHASE_META[phase];
            return (
              <div key={phase}>
                <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  {meta.icon} {t(meta.labelKey)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {phaseTasks.map((tmpl) => {
                    const isAssigned = assignedTemplateIds.includes(tmpl.id);
                    const isChecked = selected.has(tmpl.id);
                    return (
                      <label
                        key={tmpl.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          borderRadius: 10, border: `1.5px solid ${isChecked && !isAssigned ? 'var(--accent)' : 'var(--border)'}`,
                          background: isAssigned ? 'var(--background)' : isChecked ? 'rgba(2,132,199,0.05)' : 'var(--surface)',
                          cursor: isAssigned ? 'default' : 'pointer', opacity: isAssigned ? 0.5 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isAssigned || isChecked}
                          disabled={isAssigned}
                          onChange={() => !isAssigned && toggle(tmpl.id)}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 18 }}>{getCategoryMeta(tmpl.category).icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {tmpl.name}
                            {isAssigned && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>✓ {t('onboarding.assignAlreadyAssigned', 'Already assigned')}</span>}
                          </div>
                          {tmpl.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tmpl.description}</div>}
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[tmpl.priority] ?? '#6B7280', textTransform: 'uppercase' }}>
                            {t(`onboarding.priority${tmpl.priority.charAt(0).toUpperCase() + tmpl.priority.slice(1)}` as any, tmpl.priority)}
                          </span>
                          {tmpl.dueDays != null && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Day {tmpl.dueDays}</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('onboarding.assignSummary', 'Assigning {{count}} tasks', { count: selected.size })}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0 || saving}>
              {saving ? '...' : t('onboarding.assignConfirm', 'Assign')}
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
};

// ─── Templates Panel ──────────────────────────────────────────────────────────

const TemplatesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const [searchParams] = useSearchParams();
  const searchParamVal = searchParams.get('search') || searchParams.get('q') || '';
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState(searchParamVal);

  useEffect(() => {
    if (searchParamVal) {
      setSearch(searchParamVal);
    }
  }, [searchParamVal]);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OnboardingTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyId: '',
    name: '',
    description: '',
    taskType: 'day1' as Phase,
    sortOrder: '1',
    category: 'other' as OnboardingTemplate['category'],
    dueDays: '',
    linkUrl: '',
    priority: 'medium' as OnboardingTemplate['priority'],
  });
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnboardingTemplate | null>(null);
  const [assignDrawerOpen, setAssignDrawerOpen] = useState(false);
  const [assignCompanyId, setAssignCompanyId] = useState<string>('');
  const [assignEmployeeId, setAssignEmployeeId] = useState<string>('');
  const [assignEmployees, setAssignEmployees] = useState<Employee[]>([]);
  const [assignTemplates, setAssignTemplates] = useState<OnboardingTemplate[]>([]);
  const [assignSelected, setAssignSelected] = useState<Set<number>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignCompanyPickerOpen, setAssignCompanyPickerOpen] = useState(false);
  const [assignEmployeePickerOpen, setAssignEmployeePickerOpen] = useState(false);
  const [assignCompanyQuery, setAssignCompanyQuery] = useState('');
  const [assignEmployeeQuery, setAssignEmployeeQuery] = useState('');
  const assignCompanyPickerRef = useRef<HTMLDivElement | null>(null);
  const assignEmployeePickerRef = useRef<HTMLDivElement | null>(null);

  const companyMap = useMemo(() => {
    const map = new Map<number, string>();
    companies.forEach((company) => map.set(company.id, company.name));
    return map;
  }, [companies]);

  const selectedAssignCompany = useMemo(
    () => companies.find((company) => String(company.id) === assignCompanyId) ?? null,
    [companies, assignCompanyId],
  );

  const selectedAssignEmployee = useMemo(
    () => assignEmployees.find((employee) => String(employee.id) === assignEmployeeId) ?? null,
    [assignEmployees, assignEmployeeId],
  );

  const filteredAssignCompanies = useMemo(() => {
    const q = assignCompanyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) => {
      const owner = `${company.ownerName ?? ''} ${company.ownerSurname ?? ''}`.trim();
      return (
        company.name.toLowerCase().includes(q)
        || (company.groupName ?? '').toLowerCase().includes(q)
        || owner.toLowerCase().includes(q)
        || String(company.storeCount ?? 0).includes(q)
      );
    });
  }, [companies, assignCompanyQuery]);

  const filteredAssignEmployees = useMemo(() => {
    const q = assignEmployeeQuery.trim().toLowerCase();
    if (!q) return assignEmployees;
    return assignEmployees.filter((employee) => {
      const haystack = [
        employee.name,
        employee.surname,
        employee.email,
        employee.role,
        employee.storeName,
        employee.companyName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignEmployees, assignEmployeeQuery]);

  const companySelectOptions = useMemo<SelectOption[]>(() => (
    companies.map((company) => {
      const logoUrl = getCompanyLogoUrl(company.logoFilename);
      const ownerLabel = company.ownerName
        ? `${company.ownerName}${company.ownerSurname ? ` ${company.ownerSurname}` : ''}`
        : t('companies.ownerMissing', 'No owner assigned');
      return {
        value: String(company.id),
        label: company.name,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {logoUrl ? (
                <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>{company.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.name}
                {company.country && (
                  <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                    <img src={`https://flagcdn.com/w20/${company.country.toLowerCase()}.png`} alt={company.country} style={{ height: 9, borderRadius: 1 }} />
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: company.groupName ? '#9A6808' : 'var(--text-muted)', fontWeight: company.groupName ? 600 : 400 }}>
                    {company.groupName || t('common.independent', 'Independent')}
                  </span>
                  <span style={{ opacity: 0.45 }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ownerLabel}</span>
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10.5, flexShrink: 0 }}>
                  {`${company.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                </span>
              </div>
            </span>
          </div>
        ),
      };
    })
  ), [companies, t]);

  const taskCompanyFilterOptions = useMemo<SelectOption[]>(() => (
    companies.map((company) => {
      const logoUrl = getCompanyLogoUrl(company.logoFilename);
      return {
        value: String(company.id),
        label: company.name,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {logoUrl ? (
                <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--primary)' }}>{company.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.name}
                {company.country && (
                  <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center' }}>
                    <img src={`https://flagcdn.com/w20/${company.country.toLowerCase()}.png`} alt={company.country} style={{ height: 9, borderRadius: 1 }} />
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: company.groupName ? '#9A6808' : 'var(--text-muted)', fontWeight: company.groupName ? 600 : 400 }}>
                    {company.groupName || t('common.independent', 'Independent')}
                  </span>
                  <span style={{ opacity: 0.45 }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {`${company.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                  </span>
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                  {company.employeeCount ?? 0} {t('employees.title', 'Employees')}
                </span>
              </div>
            </span>
          </div>
        ),
      };
    })
  ), [companies, t]);

  const categorySelectOptions = useMemo<SelectOption[]>(() => (
    (Object.entries(CATEGORY_META) as Array<[OnboardingTemplate['category'], { icon: string; label: string }]>)
      .map(([value, meta]) => ({
        value,
        label: meta.label,
        render: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
        ),
      }))
  ), []);

  const taskTypeOptions = useMemo<SelectOption[]>(() => (
    PHASE_ORDER.map((phase) => ({
      value: phase,
      label: `${PHASE_META[phase].icon} ${t(PHASE_META[phase].labelKey)}`,
    }))
  ), [t]);

  const priorityOptions = useMemo<SelectOption[]>(() => [
    { value: 'high', label: t('onboarding.priorityHigh', 'High') },
    { value: 'medium', label: t('onboarding.priorityMedium', 'Medium') },
    { value: 'low', label: t('onboarding.priorityLow', 'Low') },
  ], [t]);

  const loadCompanies = useCallback(async () => {
    try {
      const rows = await getCompanies();
      setCompanies(rows.slice().sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      showToast(t('onboarding.errorLoad', 'Error loading data'), 'error');
    }
  }, [showToast, t]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const targetCompanyId = companyFilter !== 'all' ? parseInt(companyFilter, 10) : undefined;
      setTemplates(await getTemplates(showInactive, targetCompanyId));
    }
    catch { showToast(t('onboarding.errorLoad', 'Error loading tasks'), 'error'); }
    finally { setLoading(false); }
  }, [showInactive, companyFilter, showToast, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!assignDrawerOpen) return;

    const preferredCompany = companyFilter !== 'all'
      ? companyFilter
      : (companies.length > 0 ? String(companies[0].id) : '');

    setAssignCompanyId((prev) => prev || preferredCompany);
  }, [assignDrawerOpen, companyFilter, companies]);

  useEffect(() => {
    if (!assignDrawerOpen) {
      setAssignCompanyPickerOpen(false);
      setAssignEmployeePickerOpen(false);
      setAssignCompanyQuery('');
      setAssignEmployeeQuery('');
    }
  }, [assignDrawerOpen]);

  useEffect(() => {
    if (!assignCompanyPickerOpen && !assignEmployeePickerOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (assignCompanyPickerRef.current && !assignCompanyPickerRef.current.contains(target)) {
        setAssignCompanyPickerOpen(false);
      }
      if (assignEmployeePickerRef.current && !assignEmployeePickerRef.current.contains(target)) {
        setAssignEmployeePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [assignCompanyPickerOpen, assignEmployeePickerOpen]);

  useEffect(() => {
    if (!assignDrawerOpen || !assignCompanyId) {
      setAssignEmployees([]);
      setAssignTemplates([]);
      setAssignSelected(new Set());
      return;
    }

    const companyId = parseInt(assignCompanyId, 10);
    if (Number.isNaN(companyId)) return;

    setAssignLoading(true);
    Promise.all([
      getEmployees({ targetCompanyId: companyId, excludeAdmins: true, status: 'active', limit: 500 }),
      getTemplates(false, companyId),
    ])
      .then(([employeesResponse, templatesResponse]) => {
        const employeeRows = employeesResponse.employees.filter((employee) => !['admin', 'store_terminal'].includes(employee.role));
        setAssignEmployees(employeeRows);
        setAssignTemplates(templatesResponse);
        setAssignSelected(new Set());
        setAssignEmployeeId((prev) => (employeeRows.some((employee) => String(employee.id) === prev) ? prev : ''));
      })
      .catch(() => {
        setAssignEmployees([]);
        setAssignTemplates([]);
        setAssignSelected(new Set());
        showToast(t('onboarding.errorLoad', 'Error loading data'), 'error');
      })
      .finally(() => setAssignLoading(false));
  }, [assignDrawerOpen, assignCompanyId, showToast, t]);

  const openCreate = () => {
    setEditing(null);
    const nextOrder = templates.length > 0 ? Math.max(...templates.map((t) => t.sortOrder)) + 1 : 1;
    setForm({
      companyId: companyFilter !== 'all' ? companyFilter : '',
      name: '',
      description: '',
      taskType: 'day1',
      sortOrder: String(nextOrder),
      category: 'other',
      dueDays: '',
      linkUrl: '',
      priority: 'medium',
    });
    setModalOpen(true);
  };

  const openEdit = (tmpl: OnboardingTemplate) => {
    setEditing(tmpl);
    setForm({
      companyId: String(tmpl.companyId),
      name: tmpl.name,
      description: tmpl.description ?? '',
      taskType: tmpl.taskType,
      sortOrder: String(tmpl.sortOrder),
      category: tmpl.category,
      dueDays: tmpl.dueDays != null ? String(tmpl.dueDays) : '',
      linkUrl: tmpl.linkUrl ?? '',
      priority: tmpl.priority,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const parsedCompanyId = parseInt(form.companyId, 10);
    if (Number.isNaN(parsedCompanyId)) {
      showToast(t('onboarding.errorSave', 'Error saving'), 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyId: parsedCompanyId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        taskType: form.taskType,
        sortOrder: parseInt(form.sortOrder, 10) || 1,
        category: form.category,
        dueDays: form.dueDays ? parseInt(form.dueDays, 10) : null,
        linkUrl: form.linkUrl.trim() || null,
        priority: form.priority,
      };
      if (editing) {
        const updated = await updateTemplate(editing.id, {
          ...payload,
          targetCompanyId: editing.companyId,
        });
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        showToast(t('onboarding.templateUpdated', 'Task updated'), 'success');
      } else {
        const created = await createTemplate(payload);
        setTemplates((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
        showToast(t('onboarding.templateCreated', 'Task created'), 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showToast(translateApiError(err, t, t('onboarding.errorSave', 'Error saving')) ?? '', 'error');
    } finally { setSaving(false); }
  };

  const handleToggle = async (tmpl: OnboardingTemplate) => {
    setTogglingId(tmpl.id);
    try {
      const updated = await updateTemplate(tmpl.id, { isActive: !tmpl.isActive, targetCompanyId: tmpl.companyId });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      showToast(updated.isActive ? t('onboarding.templateActivated', 'Task activated') : t('onboarding.templateDeactivated', 'Task deactivated'), 'success');
    } catch (err) {
      showToast(translateApiError(err, t, t('onboarding.errorSave', 'Error saving')) ?? '', 'error');
    } finally { setTogglingId(null); }
  };

  const handleDelete = (tmpl: OnboardingTemplate) => {
    setDeleteConfirm(tmpl);
  };
  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    const tmpl = deleteConfirm;
    setDeleteConfirm(null);
    setDeletingId(tmpl.id);
    try {
      const result = await deleteTemplate(tmpl.id, tmpl.companyId);
      if (result.deleted) {
        setTemplates((prev) => prev.filter((t) => t.id !== tmpl.id));
        showToast(t('onboarding.templateDeleted', 'Task deleted'), 'success');
      } else {
        setTemplates((prev) => prev.map((t) => t.id === tmpl.id ? { ...t, isActive: false } : t));
        showToast(t('onboarding.templateDeletedDeactivated', 'Task deactivated (has assigned employees)'), 'info' as 'success');
      }
    } catch (err) {
      showToast(translateApiError(err, t, t('onboarding.errorSave', 'Error')) ?? '', 'error');
    } finally { setDeletingId(null); }
  };

  const handleMove = async (tmpl: OnboardingTemplate, dir: 'up' | 'down') => {
    const sorted = templates
      .filter((item) => item.companyId === tmpl.companyId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((t) => t.id === tmpl.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      const [a, b] = await Promise.all([
        updateTemplate(tmpl.id, { sortOrder: other.sortOrder, targetCompanyId: tmpl.companyId }),
        updateTemplate(other.id, { sortOrder: tmpl.sortOrder, targetCompanyId: other.companyId }),
      ]);
      setTemplates((prev) => prev.map((t) => t.id === a.id ? a : t.id === b.id ? b : t));
    } catch { /* ignore */ }
  };

  const handleAssignFromLibrary = async () => {
    if (!assignCompanyId || !assignEmployeeId || assignSelected.size === 0) return;
    setAssigning(true);
    try {
      const result = await assignTasks(parseInt(assignEmployeeId, 10), Array.from(assignSelected));
      showToast(t('onboarding.assignedTasks', { n: result.assigned }), 'success');
      setAssignDrawerOpen(false);
    } catch (err) {
      showToast(translateApiError(err, t, t('onboarding.errorSave', 'Error')) ?? '', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignCompanySelect = (company: Company) => {
    setAssignCompanyId(String(company.id));
    setAssignEmployeeId('');
    setAssignCompanyPickerOpen(false);
    setAssignEmployeePickerOpen(false);
    setAssignCompanyQuery('');
    setAssignEmployeeQuery('');
  };

  const handleAssignEmployeeSelect = (employee: Employee) => {
    setAssignEmployeeId(String(employee.id));
    setAssignEmployeePickerOpen(false);
    setAssignEmployeeQuery('');
  };

  const visible = useMemo(() => {
    const list = showInactive ? templates : templates.filter((t) => t.isActive);
    const q = search.toLowerCase();
    return q ? list.filter((t) => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)) : list;
  }, [templates, showInactive, search]);

  // Group by phase
  const grouped = useMemo(() => {
    const map = new Map<Phase, OnboardingTemplate[]>();
    PHASE_ORDER.forEach((p) => map.set(p, []));
    visible.forEach((template) => map.get(getTemplatePhase(template))!.push(template));
    return map;
  }, [visible]);

  const activeCount = templates.filter((t) => t.isActive).length;
  const inactiveCount = templates.filter((t) => !t.isActive).length;

  const assignGroupedTemplates = useMemo(() => {
    const map = new Map<Phase, OnboardingTemplate[]>();
    PHASE_ORDER.forEach((phase) => map.set(phase, []));
    assignTemplates.forEach((template) => {
      map.get(getTemplatePhase(template))?.push(template);
    });
    return map;
  }, [assignTemplates]);

  return (
    <div>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 12 : 10,
        marginBottom: 16
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: 8,
            flex: isMobile ? '1 1 100%' : '1 1 520px',
            width: isMobile ? '100%' : 'auto',
            minWidth: isMobile ? 0 : 280,
            flexWrap: 'wrap',
            flexDirection: isMobile ? 'column' : 'row'
          }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              style={{
                width: isMobile ? '100%' : 'auto',
                minWidth: isMobile ? 0 : 220,
                maxWidth: isMobile ? '100%' : 280
              }}
            />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', padding: '0 2px' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--primary)' }}
            />
            {t('onboarding.showInactive', 'Show inactive')}
            {inactiveCount > 0 && (
              <span style={{ background: 'var(--border)', borderRadius: 99, fontSize: 10, padding: '0 5px', color: 'var(--text-muted)' }}>
                {inactiveCount}
              </span>
            )}
          </label>
        </div>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: isMobile ? 'flex-start' : 'flex-end',
          flex: isMobile ? '1 1 100%' : '0 1 280px',
          width: isMobile ? '100%' : 'auto',
          minWidth: isMobile ? 0 : 220
        }}>
          <div style={{ width: isMobile ? '100%' : 250 }}>
            <CustomSelect
              value={companyFilter}
              onChange={(value) => setCompanyFilter(value ?? 'all')}
              options={[
                { value: 'all', label: `${t('common.all')} ${t('nav.companies', 'Companies')}` },
                ...taskCompanyFilterOptions,
              ]}
              placeholder={`${t('common.all')} ${t('nav.companies', 'Companies')}`}
              searchable
              isClearable={false}
              searchPlaceholder={t('common.search', 'Search...')}
              noOptionsMessage={t('common.noData', 'No options found')}
              menuMaxHeight={280}
            />
          </div>
        </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '1 1 520px', minWidth: 280 }}>
            {PHASE_ORDER.map((p) => {
              const m = PHASE_META[p];
              const count = grouped.get(p)?.length ?? 0;
              return (
                <div key={p} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: count > 0 ? m.bg : 'transparent',
                  border: `1px solid ${count > 0 ? m.border : 'var(--border)'}`,
                  borderRadius: 99, padding: '4px 10px', fontSize: 12,
                  color: count > 0 ? m.color : 'var(--text-muted)',
                  fontWeight: count > 0 ? 600 : 400,
                }}>
                  <span>{m.icon}</span>
                  <span>{t(m.labelKey)}</span>
                  <span style={{ opacity: 0.7, fontWeight: 700 }}>{count}</span>
                </div>
              );
            })}
          </div>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: isMobile ? 'flex-start' : 'flex-end',
          width: isMobile ? '100%' : 'auto',
          flex: isMobile ? '1 1 100%' : '1 1 420px',
          minWidth: isMobile ? 0 : 320,
          flexWrap: 'wrap',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {activeCount} {t('onboarding.activeTasksCount', 'active tasks')}
          </span>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setAssignDrawerOpen(true)}
              style={{ minWidth: isMobile ? 0 : 130, height: 34, justifyContent: 'center', flex: isMobile ? 1 : 'none' }}
              fullWidth={isMobile}
            >
              <UserPlus size={14} /> {t('onboarding.assignTasks')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={openCreate}
              style={{ minWidth: isMobile ? 0 : 130, height: 34, justifyContent: 'center', flex: isMobile ? 1 : 'none' }}
              fullWidth={isMobile}
            >
              + {t('onboarding.newTemplate', 'New Task')}
            </Button>
          </div>
        </div>
      </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <Skel w={32} h={32} r={8} />
              <div style={{ flex: 1 }}>
                <Skel w="40%" h={14} />
                <div style={{ marginTop: 6 }}><Skel w="70%" h={11} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>{t('onboarding.noTemplates', 'No tasks yet')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{t('onboarding.noTemplatesHint', 'Create onboarding tasks for new employees')}</div>
          <Button variant="primary" onClick={openCreate}>+ {t('onboarding.newTemplate', 'New Task')}</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {PHASE_ORDER.map((phase) => {
            const list = grouped.get(phase)!;
            if (list.length === 0) return null;
            const meta = PHASE_META[phase];
            return (
              <div key={phase}>
                {/* Phase header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: meta.bg, border: `1px solid ${meta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                    {meta.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, fontFamily: 'var(--font-display)' }}>{t(meta.labelKey)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t(meta.subKey)}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: meta.color, background: 'var(--background)', border: `1px solid ${meta.border}`, borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>{list.length}</span>
                </div>

                {/* Task cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.sort((a, b) => a.sortOrder - b.sortOrder).map((tmpl) => {
                    const companyPhaseList = list
                      .filter((item) => item.companyId === tmpl.companyId)
                      .sort((a, b) => a.sortOrder - b.sortOrder);
                    const companyIndex = companyPhaseList.findIndex((item) => item.id === tmpl.id);
                    const isCompanyFirst = companyIndex <= 0;
                    const isCompanyLast = companyIndex === companyPhaseList.length - 1;

                    return (
                      <div
                        key={tmpl.id}
                        style={{
                          background: 'var(--surface)', border: `1px solid ${tmpl.isActive ? meta.border : 'var(--border)'}`,
                          borderLeft: `4px solid ${tmpl.isActive ? meta.color : '#D1D5DB'}`,
                          borderRadius: 12, padding: isMobile ? '12px 14px' : '14px 16px',
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          alignItems: isMobile ? 'stretch' : 'center',
                          justifyContent: 'space-between',
                          gap: isMobile ? 12 : 14,
                          opacity: tmpl.isActive ? 1 : 0.55,
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                          {/* Sort order badge */}
                          <div style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: tmpl.isActive ? meta.bg : 'var(--background)',
                            border: `1px solid ${meta.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, color: meta.color,
                            fontFamily: 'var(--font-display)',
                          }}>
                            {tmpl.sortOrder}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: tmpl.isActive ? 'none' : 'line-through' }}>{tmpl.name}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[tmpl.priority] ?? 'var(--text-muted)', textTransform: 'uppercase' }}>
                                {t(`onboarding.priority${tmpl.priority === 'high' ? 'High' : tmpl.priority === 'medium' ? 'Medium' : 'Low'}`)}
                              </span>
                              {!tmpl.isActive && (
                                <span style={{ fontSize: 10, background: 'var(--border)', color: 'var(--text-muted)', borderRadius: 99, padding: '1px 6px', fontWeight: 600 }}>INACTIVE</span>
                              )}
                            </div>
                            {tmpl.description && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', display: '-webkit-box' }}>{tmpl.description}</div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', color: 'var(--text-secondary)', background: 'var(--background)' }}>
                                {companyMap.get(tmpl.companyId) ?? `#${tmpl.companyId}`}
                              </span>
                              <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', color: 'var(--text-secondary)', background: 'var(--background)' }}>
                                {getCategoryMeta(tmpl.category).icon} {getCategoryMeta(tmpl.category).label}
                              </span>
                              {tmpl.createdByName && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <span>{t('common.createdBy', 'Created by')}:</span>
                                  <span style={{ width: 16, height: 16, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,33,55,0.12)', color: 'var(--text-secondary)', fontSize: 9, fontWeight: 700 }}>
                                    {tmpl.createdByAvatarFilename
                                      ? <img src={getAvatarUrl(tmpl.createdByAvatarFilename) ?? ''} alt={tmpl.createdByName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      : tmpl.createdByName.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span>{tmpl.createdByName}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{
                          display: 'flex', gap: 4, alignItems: 'center',
                          justifyContent: isMobile ? 'flex-end' : 'flex-start',
                          flexShrink: 0,
                          borderTop: isMobile ? '1px solid var(--border)' : 'none',
                          paddingTop: isMobile ? 8 : 0,
                        }}>
                          {/* Move up/down */}
                          <button
                            onClick={() => handleMove(tmpl, 'up')} disabled={isCompanyFirst}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: isCompanyFirst ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', opacity: isCompanyFirst ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Move up"
                          ><ChevronUp size={14} /></button>
                          <button
                            onClick={() => handleMove(tmpl, 'down')} disabled={isCompanyLast}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: isCompanyLast ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', opacity: isCompanyLast ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Move down"
                          ><ChevronDown size={14} /></button>
                          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />
                          <button
                            onClick={() => handleToggle(tmpl)} disabled={togglingId === tmpl.id}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: tmpl.isActive ? '#15803D' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title={tmpl.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {togglingId === tmpl.id ? '…' : <Power size={13} />}
                          </button>
                          <button
                            onClick={() => openEdit(tmpl)}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title={t('common.edit')}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(tmpl)} disabled={deletingId === tmpl.id}
                            style={{ background: 'none', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title={t('common.delete')}
                          >
                            {deletingId === tmpl.id ? '…' : <Trash2 size={13} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <ModalBackdrop onClose={() => setModalOpen(false)}>
          <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                {editing ? t('onboarding.editTemplate', 'Edit Task') : t('onboarding.newTemplate', 'New Task')}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {editing ? t('onboarding.modalSubtitleEdit') : t('onboarding.modalSubtitleCreate')}
              </p>
            </div>
            <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)', lineHeight: 1, padding: '2px 6px' }}>×</button>
          </div>
          <form onSubmit={handleSave} style={{ padding: '20px 28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                {t('nav.companies', 'Companies')} *
              </label>
              <CustomSelect
                value={form.companyId}
                onChange={(value) => setForm((f) => ({ ...f, companyId: value ?? '' }))}
                options={companySelectOptions}
                placeholder={t('employees.selectCompany', 'Select company')}
                searchable
                isClearable={false}
                disabled={editing != null}
                searchPlaceholder={t('common.search', 'Search...')}
                noOptionsMessage={t('common.noData', 'No options found')}
                menuMaxHeight={260}
                />
            </div>
            <Input
              label={`${t('onboarding.templateName', 'Task name')} *`}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('onboarding.templateNamePlaceholder', 'e.g. Complete employment paperwork')}
              required autoFocus
            />
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                {t('onboarding.templateDesc', 'Description')}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('onboarding.templateDescPlaceholder', 'Optional instructions or details…')}
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', padding: '8px 12px', fontSize: 13.5, borderRadius: 'var(--radius)', border: '1px solid var(--border)', outline: 'none', color: 'var(--text-primary)', background: 'var(--surface)' }}
              />
            </div>
            {/* Task Type */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                {t('onboarding.taskType', 'Task type')}
              </label>
              <CustomSelect
                value={form.taskType}
                onChange={(value) => setForm((f) => ({ ...f, taskType: (value as Phase) ?? 'day1' }))}
                options={taskTypeOptions}
                isClearable={false}
                menuMaxHeight={260}
                controlMinHeight={40}
              />
            </div>

            {/* Category */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Category
              </label>
              <CustomSelect
                value={form.category}
                onChange={(value) => setForm((f) => ({ ...f, category: (value as OnboardingTemplate['category']) ?? 'other' }))}
                options={categorySelectOptions}
                placeholder="Category"
                searchable
                isClearable={false}
                searchPlaceholder={t('common.search', 'Search...')}
                noOptionsMessage={t('common.noData', 'No options found')}
                menuMaxHeight={260}
                />
            </div>

            {/* Priority */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Priority
              </label>
              <CustomSelect
                value={form.priority}
                onChange={(value) => setForm((f) => ({ ...f, priority: (value as OnboardingTemplate['priority']) ?? 'medium' }))}
                options={priorityOptions}
                isClearable={false}
                menuMaxHeight={260}
                controlMinHeight={40}
              />
            </div>

            {/* Due Days */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Due Days After Hire
              </label>
              <Input
                type="number"
                min={1}
                placeholder={t('onboarding.noDueDate', 'No deadline (leave empty)')}
                value={form.dueDays}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, dueDays: e.target.value }))}
              />
            </div>

            {/* Link URL */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Link URL (optional)
              </label>
              <Input
                type="url"
                placeholder="https://..."
                value={form.linkUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
              />
            </div>

            <div>
              <Input
                label={t('onboarding.sortOrder', 'Sort order')}
                type="number" min="1" value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" type="submit" loading={saving} disabled={!form.name.trim() || !form.companyId}>{t('common.save')}</Button>
            </div>
          </form>
        </ModalBackdrop>
      )}

      <SideDrawer open={assignDrawerOpen} onClose={() => setAssignDrawerOpen(false)}>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)', background: 'var(--surface-warm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--text-primary)' }}>
                {t('onboarding.assignTasks')}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {t('onboarding.lookupHint')}
              </p>
            </div>
            <button onClick={() => setAssignDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '16px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
              <Building2 size={13} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} /> {t('nav.companies', 'Companies')}
            </label>
            <div ref={assignCompanyPickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setAssignCompanyPickerOpen((prev) => !prev);
                  setAssignEmployeePickerOpen(false);
                }}
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  minHeight: 52,
                  padding: selectedAssignCompany ? '8px 10px' : '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                }}
              >
                {selectedAssignCompany ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      background: 'rgba(13,33,55,0.08)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {getCompanyLogoUrl(selectedAssignCompany.logoFilename) ? (
                        <img
                          src={getCompanyLogoUrl(selectedAssignCompany.logoFilename) ?? ''}
                          alt={selectedAssignCompany.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>
                          {selectedAssignCompany.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedAssignCompany.name}
                        {selectedAssignCompany.country && (
                          <span style={{ marginLeft: 8, display: 'inline-flex', verticalAlign: 'middle' }}>
                            <img
                              src={`https://flagcdn.com/w20/${selectedAssignCompany.country.toLowerCase()}.png`}
                              alt={selectedAssignCompany.country}
                              style={{ height: 12, borderRadius: 2 }}
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: selectedAssignCompany.groupName ? '#9A6808' : 'var(--text-muted)', fontWeight: selectedAssignCompany.groupName ? 600 : 400 }}>
                            {selectedAssignCompany.groupName || t('common.independent', 'Independent')}
                          </span>
                          <span style={{ opacity: 0.45 }}>•</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedAssignCompany.ownerName
                              ? `${selectedAssignCompany.ownerName}${selectedAssignCompany.ownerSurname ? ` ${selectedAssignCompany.ownerSurname}` : ''}`
                              : t('companies.ownerMissing', 'No owner assigned')}
                          </span>
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10.5, flexShrink: 0 }}>
                          {`${selectedAssignCompany.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                        </span>
                      </div>
                    </span>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('employees.selectCompany', 'Select company')}</span>
                )}
                <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>

              {assignCompanyPickerOpen && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 35,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  boxShadow: '0 16px 30px rgba(0,0,0,0.15)',
                  maxHeight: 300,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                    <input
                      value={assignCompanyQuery}
                      onChange={(e) => setAssignCompanyQuery(e.target.value)}
                      placeholder={t('common.search')}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', padding: '7px 9px', fontSize: 12, color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: 236 }}>
                    {filteredAssignCompanies.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{t('common.noResults', 'No results')}</div>
                    ) : (
                      filteredAssignCompanies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => handleAssignCompanySelect(company)}
                          style={{
                            width: '100%',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                            background: assignCompanyId === String(company.id) ? 'var(--surface-warm)' : 'var(--surface)',
                            padding: '9px 10px',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 9,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {getCompanyLogoUrl(company.logoFilename) ? (
                              <img src={getCompanyLogoUrl(company.logoFilename) ?? ''} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>{company.name.slice(0, 2).toUpperCase()}</span>
                            )}
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {company.name}
                              {company.country && (
                                <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                                  <img
                                    src={`https://flagcdn.com/w20/${company.country.toLowerCase()}.png`}
                                    alt={company.country}
                                    style={{ height: 9, borderRadius: 1 }}
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                  />
                                </span>
                              )}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: company.groupName ? '#9A6808' : 'var(--text-muted)', fontWeight: company.groupName ? 600 : 400 }}>
                                  {company.groupName || t('common.independent', 'Independent')}
                                </span>
                                <span style={{ opacity: 0.45 }}>•</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {company.ownerName
                                    ? `${company.ownerName}${company.ownerSurname ? ` ${company.ownerSurname}` : ''}`
                                    : t('companies.ownerMissing', 'No owner assigned')}
                                </span>
                              </span>
                              <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10.5, flexShrink: 0 }}>
                                {`${company.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                              </span>
                            </div>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
              <Users size={13} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} /> {t('onboarding.employeeIdLabel', 'Employee')}
            </label>
            <div ref={assignEmployeePickerRef} style={{ position: 'relative' }}>
              <button
                type="button"
                disabled={!assignCompanyId || assignLoading}
                onClick={() => {
                  if (!assignCompanyId || assignLoading) return;
                  setAssignEmployeePickerOpen((prev) => !prev);
                  setAssignCompanyPickerOpen(false);
                }}
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  minHeight: 50,
                  padding: selectedAssignEmployee ? '8px 10px' : '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: !assignCompanyId || assignLoading ? 'not-allowed' : 'pointer',
                  opacity: !assignCompanyId || assignLoading ? 0.6 : 1,
                }}
              >
                {selectedAssignEmployee ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.14)', color: '#0D2137', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getAvatarUrl(selectedAssignEmployee.avatarFilename) ? (
                        <img src={getAvatarUrl(selectedAssignEmployee.avatarFilename) ?? ''} alt={`${selectedAssignEmployee.name} ${selectedAssignEmployee.surname}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : initials(selectedAssignEmployee.name, selectedAssignEmployee.surname)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedAssignEmployee.name} {selectedAssignEmployee.surname}
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        <StoreIcon size={10} style={{ opacity: 0.7 }} />
                        {selectedAssignEmployee.storeName || t('common.noStore', 'No store')}
                      </span>
                    </span>

                    {/* Role Badge - Taller and Centered on the Right */}
                    <div style={{
                      fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase',
                      padding: '4px 8px', borderRadius: 8,
                      background: ROLE_BADGE_VARIANT[selectedAssignEmployee.role]?.bg || 'rgba(13,33,55,0.06)',
                      color: ROLE_BADGE_VARIANT[selectedAssignEmployee.role]?.color || 'var(--text-muted)',
                      border: `1px solid ${ROLE_BADGE_VARIANT[selectedAssignEmployee.role]?.border || 'var(--border)'}`,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                    }}>
                      {t(`roles.${selectedAssignEmployee.role}`, selectedAssignEmployee.role)}
                    </div>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {!assignCompanyId
                      ? t('employees.selectCompanyFirst', 'Select company first')
                      : (assignLoading ? t('common.loading') : t('onboarding.searchEmployeePlaceholder', 'Search employee...'))}
                  </span>
                )}
                <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </button>

              {assignEmployeePickerOpen && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 35,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  boxShadow: '0 16px 30px rgba(0,0,0,0.15)',
                  maxHeight: 300,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                    <input
                      value={assignEmployeeQuery}
                      onChange={(e) => setAssignEmployeeQuery(e.target.value)}
                      placeholder={t('common.search')}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--background)', padding: '7px 9px', fontSize: 12, color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', maxHeight: 236 }}>
                    {filteredAssignEmployees.length === 0 ? (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>{t('common.noResults', 'No results')}</div>
                    ) : (
                      filteredAssignEmployees.map((employee) => (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => handleAssignEmployeeSelect(employee)}
                          style={{
                            width: '100%',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                            background: assignEmployeeId === String(employee.id) ? 'var(--surface-warm)' : 'var(--surface)',
                            padding: '8px 10px',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', background: 'rgba(13,33,55,0.14)', color: '#0D2137', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {getAvatarUrl(employee.avatarFilename) ? (
                              <img src={getAvatarUrl(employee.avatarFilename) ?? ''} alt={`${employee.name} ${employee.surname}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : initials(employee.name, employee.surname)}
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {employee.name} {employee.surname}
                            </div>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                              <StoreIcon size={10} style={{ opacity: 0.7 }} />
                              {employee.storeName || t('common.noStore', 'No store')}
                            </span>
                          </span>

                          {/* Role Badge - Taller and Centered on the Right */}
                          <div style={{
                            fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase',
                            padding: '4px 8px', borderRadius: 8,
                            background: ROLE_BADGE_VARIANT[employee.role]?.bg || 'rgba(13,33,55,0.06)',
                            color: ROLE_BADGE_VARIANT[employee.role]?.color || 'var(--text-muted)',
                            border: `1px solid ${ROLE_BADGE_VARIANT[employee.role]?.border || 'var(--border)'}`,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                          }}>
                            {t(`roles.${employee.role}`, employee.role)}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--background)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              {t('onboarding.tabTemplates', 'Tasks')} ({assignTemplates.length})
            </div>
            {!assignCompanyId ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('employees.selectCompanyFirst', 'Select company first')}</div>
            ) : assignLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Skel w={18} h={18} r={4} />
                    <Skel w={24} h={24} r={6} />
                    <div style={{ flex: 1 }}>
                      <Skel w="40%" h={12} />
                      <div style={{ marginTop: 5 }}><Skel w="68%" h={10} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : assignTemplates.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('onboarding.noTemplates', 'No onboarding tasks configured')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                {PHASE_ORDER.map((phase) => {
                  const phaseTemplates = (assignGroupedTemplates.get(phase) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
                  if (phaseTemplates.length === 0) return null;
                  const meta = PHASE_META[phase];

                  return (
                    <div key={phase}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, border: `1px solid ${meta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {meta.icon}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, fontFamily: 'var(--font-display)' }}>{t(meta.labelKey)}</div>
                        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 8px' }}>
                          {phaseTemplates.length}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {phaseTemplates.map((template) => (
                          <label
                            key={template.id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                              background: 'var(--surface)',
                              border: `1px solid ${meta.border}`,
                              borderLeft: `4px solid ${meta.color}`,
                              borderRadius: 10,
                              padding: '10px 10px',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={assignSelected.has(template.id)}
                              onChange={() => {
                                setAssignSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(template.id)) next.delete(template.id);
                                  else next.add(template.id);
                                  return next;
                                });
                              }}
                              style={{ marginTop: 2, accentColor: 'var(--primary)' }}
                            />
                            <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: meta.bg, border: `1px solid ${meta.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: meta.color, fontFamily: 'var(--font-display)' }}>
                              {template.sortOrder}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {template.name}
                              </div>
                              {template.description && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {template.description}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 5 }}>
                                <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 6px', color: 'var(--text-muted)', background: 'var(--background)' }}>
                                  {getCategoryMeta(template.category).icon} {getCategoryMeta(template.category).label}
                                </span>
                                {template.dueDays != null && template.dueDays > 0 && (
                                  <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 6px', color: 'var(--text-muted)', background: 'var(--background)' }}>
                                    D+{template.dueDays}
                                  </span>
                                )}
                                <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[template.priority] ?? 'var(--text-muted)' }}>
                                  {t(`onboarding.priority${template.priority === 'high' ? 'High' : template.priority === 'medium' ? 'Medium' : 'Low'}`)}
                                </span>
                                {template.createdByName && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    {t('common.createdBy', 'Created by')}: {template.createdByName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            variant="primary"
            onClick={handleAssignFromLibrary}
            loading={assigning}
            disabled={!assignCompanyId || !assignEmployeeId || assignSelected.size === 0 || assignTemplates.length === 0}
          >
            <CheckCircle2 size={14} /> {t('onboarding.assignConfirm', 'Assign')}
          </Button>
        </div>
      </SideDrawer>

      <ConfirmModal
        open={deleteConfirm !== null}
        title={t('onboarding.deleteConfirm', 'Delete Task')}
        message={t('onboarding.confirmDeleteTemplate', 'Delete this task? If employees have it assigned it will be deactivated instead.')}
        confirmLabel={t('onboarding.deleteConfirm', 'Delete')}
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

// ─── Employee Drawer ──────────────────────────────────────────────────────────

const EmployeeDrawer: React.FC<{
  employee: EmployeeOnboardingOverview | null;
  isAdmin: boolean;
  onClose: () => void;
  onRefresh: () => void;
}> = ({ employee, isAdmin, onClose, onRefresh }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [completing, setCompleting] = useState<number | null>(null);
  const [uncompleting, setUncompleting] = useState<number | null>(null);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [assignModal, setAssignModal] = useState<{ employeeId: number; name: string; assignedIds: number[] } | null>(null);

  useEffect(() => {
    if (!employee) return;
    getTemplates(false, employee.companyId).then(setTemplates).catch(() => {});
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    setProgress(null);
    setLoading(true);
    getEmployeeTasks(employee.employeeId)
      .then(setProgress)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee]);

  const handleAssign = async () => {
    if (!employee) return;
    setAssigning(true);
    try {
      const res = await assignTasks(employee.employeeId);
      showToast(t('onboarding.assignedTasks', { n: res.assigned }), 'success');
      const prog = await getEmployeeTasks(employee.employeeId);
      setProgress(prog);
      onRefresh();
    } catch (err) { showToast(translateApiError(err, t, t('onboarding.errorSave', 'Error')) ?? '', 'error'); }
    finally { setAssigning(false); }
  };

  const handleRemind = async () => {
    if (!employee) return;
    setReminding(true);
    try {
      await sendReminder(employee.employeeId);
      showToast(t('onboarding.reminderSent', 'Reminder sent!'), 'success');
    } catch { showToast(t('onboarding.errorSave', 'Error'), 'error'); }
    finally { setReminding(false); }
  };

  const handleComplete = async (taskId: number) => {
    setCompleting(taskId);
    try {
      const updated = await completeTask(taskId);
      setProgress((prev) => prev ? {
        ...prev,
        tasks: prev.tasks.map((t) => t.id === updated.id ? updated : t),
        completed: prev.completed + 1,
        percentage: Math.round((prev.completed + 1) / prev.total * 100),
      } : prev);
      onRefresh();
    } catch { showToast(t('onboarding.errorComplete', 'Error'), 'error'); }
    finally { setCompleting(null); }
  };

  const handleUncomplete = async (taskId: number) => {
    setUncompleting(taskId);
    try {
      const updated = await uncompleteTask(taskId);
      setProgress((prev) => prev ? {
        ...prev,
        tasks: prev.tasks.map((t) => t.id === updated.id ? updated : t),
        completed: Math.max(0, prev.completed - 1),
        percentage: Math.round(Math.max(0, prev.completed - 1) / prev.total * 100),
      } : prev);
      onRefresh();
    } catch { showToast(t('onboarding.errorSave', 'Error'), 'error'); }
    finally { setUncompleting(null); }
  };

  // Group tasks by phase
  const grouped = useMemo(() => {
    if (!progress) return new Map<Phase, OnboardingTask[]>();
    const map = new Map<Phase, OnboardingTask[]>();
    PHASE_ORDER.forEach((p) => map.set(p, []));
    progress.tasks.forEach((task, idx) => {
      const phase = getTaskPhase(task, idx);
      map.get(phase)!.push(task);
    });
    return map;
  }, [progress]);

  const pct = progress?.percentage ?? employee?.percentage ?? 0;
  const avatarUrl = employee ? getAvatarUrl(employee.avatarFilename) : null;

  return (
    <SideDrawer open={!!employee} onClose={onClose}>
      {employee && (
        <>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #1a3a5c 100%)', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {initials(employee.name, employee.surname)}
                  </div>
                )}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {employee.name} {employee.surname}
                      </div>
                      <div style={{
                        fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                        padding: '3px 9px', borderRadius: 6,
                        background: ROLE_BADGE_VARIANT[employee.role]?.bg || 'rgba(255,255,255,0.15)',
                        color: ROLE_BADGE_VARIANT[employee.role]?.color || '#fff',
                        border: `1px solid ${ROLE_BADGE_VARIANT[employee.role]?.border || 'rgba(255,255,255,0.3)'}`,
                        flexShrink: 0
                      }}>
                        {t(`roles.${employee.role}`, employee.role)}
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <StoreIcon size={12} style={{ opacity: 0.8 }} />
                      {employee.storeName || t('common.noStore', 'No store')}
                    </div>
                  </div>
              </div>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  {progress?.completed ?? employee.completed} / {progress?.total ?? employee.total} {t('onboarding.tabTemplates', 'tasks')}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#4ade80' : 'rgba(255,255,255,0.9)' }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#4ade80' : 'var(--accent)', borderRadius: 99, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          </div>

          {/* Actions */}
          {isAdmin && (
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!employee.hasTasksAssigned && (
                <Button variant="primary" size="sm" onClick={() => setAssignModal({ employeeId: employee.employeeId, name: `${employee.name} ${employee.surname}`, assignedIds: progress?.tasks.map((task) => task.templateId) ?? [] })}>
                  📋 {t('onboarding.assignTasks')}
                </Button>
              )}
              <Button variant="secondary" size="sm" loading={reminding} onClick={handleRemind}>
                🔔 {t('onboarding.sendReminder')}
              </Button>
              {employee.hasTasksAssigned && (
                <Button variant="secondary" size="sm" loading={assigning} onClick={handleAssign}>
                  ↻ {t('onboarding.reassignMissing')}
                </Button>
              )}
            </div>
          )}

          {/* Task list */}
          <div style={{ padding: '16px 24px', flex: 1 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Skel w={22} h={22} r={11} />
                    <div style={{ flex: 1 }}><Skel w="70%" h={13} /></div>
                  </div>
                ))}
              </div>
            ) : !progress || progress.tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                {t('onboarding.noTasksAssigned', 'No tasks assigned yet')}
                {isAdmin && <div style={{ marginTop: 8 }}><Button variant="primary" size="sm" onClick={() => setAssignModal({ employeeId: employee.employeeId, name: `${employee.name} ${employee.surname}`, assignedIds: progress?.tasks.map((task) => task.templateId) ?? [] })}>{t('onboarding.assignNow')}</Button></div>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {PHASE_ORDER.map((phase) => {
                  const tasks = grouped.get(phase)!;
                  if (tasks.length === 0) return null;
                  const meta = PHASE_META[phase];
                  const phaseCompleted = tasks.filter((t) => t.completed).length;
                  return (
                    <div key={phase}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <span style={{ fontSize: 13 }}>{meta.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(meta.labelKey)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{phaseCompleted}/{tasks.length}</span>
                        <div style={{ width: 48, height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${tasks.length > 0 ? (phaseCompleted / tasks.length) * 100 : 0}%`, background: meta.color, borderRadius: 99 }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {tasks.map((task) => (
                          <div key={task.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                            background: task.completed ? 'rgba(21,128,61,0.05)' : 'var(--background)',
                            borderRadius: 10, border: `1px solid ${task.completed ? 'rgba(21,128,61,0.2)' : 'var(--border)'}`,
                          }}>
                            {/* Checkbox */}
                            <div style={{
                              width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                              background: task.completed ? '#15803D' : 'transparent',
                              border: `2px solid ${task.completed ? '#15803D' : 'var(--border)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, color: '#fff',
                            }}>
                              {task.completed && '✓'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: task.completed ? 'line-through' : 'none' }}>
                                {task.templateName}
                              </div>
                              {task.templateDescription && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{task.templateDescription}</div>
                              )}
                              {task.completedAt && (
                                <div style={{ fontSize: 10, color: '#15803D', marginTop: 3 }}>✓ {fmtDate(task.completedAt)}</div>
                              )}
                              {task.assignedByName && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    {t('onboarding.assignedBy', 'Assigned by')}: {task.assignedByName}
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* Admin actions */}
                            {isAdmin && (
                              <div style={{ flexShrink: 0 }}>
                                {task.completed ? (
                                  <button
                                    onClick={() => handleUncomplete(task.id)}
                                    disabled={uncompleting === task.id}
                                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)' }}
                                    title="Reset task"
                                  >
                                    {uncompleting === task.id ? '…' : '↺ Reset'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleComplete(task.id)}
                                    disabled={completing === task.id}
                                    style={{ background: 'none', border: '1px solid rgba(21,128,61,0.3)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', fontSize: 10, color: '#15803D' }}
                                    title="Mark complete"
                                  >
                                    {completing === task.id ? '…' : '✓ Done'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {assignModal && (
            <AssignModal
              employeeName={assignModal.name}
              templates={templates}
              assignedTemplateIds={assignModal.assignedIds}
              onClose={() => setAssignModal(null)}
              onConfirm={async (ids) => {
                const result = await assignTasks(assignModal.employeeId, ids);
                showToast(`${result.assigned} ${t('onboarding.tasksAssigned', 'tasks assigned')}`, 'success');
                const prog = await getEmployeeTasks(assignModal.employeeId);
                setProgress(prog);
                onRefresh();
              }}
            />
          )}
        </>
      )}
    </SideDrawer>
  );
};

// ─── Overview Panel ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'complete';

const OverviewPanel: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();

  const [overview, setOverview] = useState<EmployeeOnboardingOverview[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOnboardingOverview | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [bulkCompanyId, setBulkCompanyId] = useState<string>('');
  const [bulkEmployees, setBulkEmployees] = useState<Employee[]>([]);
  const [bulkTemplates, setBulkTemplates] = useState<OnboardingTemplate[]>([]);
  const [bulkSelectedEmployeeIds, setBulkSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [bulkSelectedTemplateIds, setBulkSelectedTemplateIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    getCompanies()
      .then((rows) => setCompanies(rows.slice().sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const targetCompanyId = companyFilter !== 'all' ? parseInt(companyFilter, 10) : undefined;
      setOverview(await getOnboardingOverview(targetCompanyId));
    }
    catch { showToast(t('onboarding.errorLoad', 'Error loading overview'), 'error'); }
    finally { setLoading(false); }
  }, [companyFilter, showToast, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setStoreFilter('');
  }, [companyFilter]);

  const stores = useMemo(() => {
    const map = new Map<number, { id: number; name: string; companyId: number; companyName: string; employeeCount: number }>();
    overview.forEach((row) => {
      if (row.storeId && row.storeName) {
        const existing = map.get(row.storeId);
        map.set(row.storeId, {
          id: row.storeId,
          name: row.storeName,
          companyId: row.companyId,
          companyName: row.companyName,
          employeeCount: (existing?.employeeCount ?? 0) + 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [overview]);

  const filtered = useMemo(() => {
    let list = overview;
    if (search) { const q = search.toLowerCase(); list = list.filter((e) => `${e.name} ${e.surname} ${e.email}`.toLowerCase().includes(q)); }
    if (storeFilter) list = list.filter((e) => String(e.storeId ?? '') === storeFilter);
    if (statusFilter === 'not_started') list = list.filter((e) => !e.hasTasksAssigned);
    if (statusFilter === 'in_progress') list = list.filter((e) => e.hasTasksAssigned && e.percentage < 100);
    if (statusFilter === 'complete')    list = list.filter((e) => e.hasTasksAssigned && e.percentage === 100);
    return list;
  }, [overview, search, storeFilter, statusFilter]);

  const counts = useMemo(() => ({
    all:         overview.length,
    not_started: overview.filter((e) => !e.hasTasksAssigned).length,
    in_progress: overview.filter((e) => e.hasTasksAssigned && e.percentage < 100).length,
    complete:    overview.filter((e) => e.hasTasksAssigned && e.percentage === 100).length,
    avg:         overview.length > 0 ? Math.round(overview.reduce((s, e) => s + e.percentage, 0) / overview.length) : 0,
  }), [overview]);

  const handleBulkAssign = async () => {
    if (!bulkCompanyId || bulkSelectedEmployeeIds.size === 0 || bulkSelectedTemplateIds.size === 0) return;
    setBulkAssigning(true);
    try {
      let totalAssignedEmployees = 0;
      for (const employeeId of bulkSelectedEmployeeIds) {
        const res = await assignTasks(employeeId, Array.from(bulkSelectedTemplateIds));
        if (res.assigned > 0) totalAssignedEmployees += 1;
      }
      showToast(t('onboarding.bulkAssignDone', 'Tasks assigned to {{count}} employees', { count: totalAssignedEmployees }), 'success');
      setBulkDrawerOpen(false);
      void load();
    } catch (err) {
      showToast(translateApiError(err, t, 'Error') ?? '', 'error');
    } finally { setBulkAssigning(false); }
  };

  useEffect(() => {
    if (!bulkDrawerOpen) return;
    const preferredCompany = companyFilter !== 'all'
      ? companyFilter
      : (companies.length > 0 ? String(companies[0].id) : '');
    setBulkCompanyId((prev) => prev || preferredCompany);
  }, [bulkDrawerOpen, companyFilter, companies]);

  useEffect(() => {
    if (!bulkDrawerOpen || !bulkCompanyId) return;
    const companyId = parseInt(bulkCompanyId, 10);
    if (Number.isNaN(companyId)) return;
    setBulkLoading(true);
    getTemplates(false, companyId)
      .then((templatesRes) => {
        // Filter overview for the selected company and exclude admins
        const companyEmployees = overview.filter(
          (row) => row.companyId === companyId && !['admin', 'store_terminal'].includes(row.role) && !row.hasTasksAssigned
        );

        // Map overview objects to match the Employee interface expected by the UI
        const mappedEmployees: any[] = companyEmployees.map((row) => ({
          id: row.employeeId,
          name: row.name,
          surname: row.surname,
          role: row.role,
          avatarFilename: row.avatarFilename,
          storeName: row.storeName,
          companyName: row.companyName,
        }));

        setBulkEmployees(mappedEmployees);
        setBulkTemplates(templatesRes);
        setBulkSelectedEmployeeIds(new Set(mappedEmployees.map((emp) => emp.id)));
        setBulkSelectedTemplateIds(new Set());
    }).catch(() => {
      setBulkEmployees([]);
      setBulkTemplates([]);
      setBulkSelectedEmployeeIds(new Set());
      setBulkSelectedTemplateIds(new Set());
    }).finally(() => setBulkLoading(false));
  }, [bulkDrawerOpen, bulkCompanyId, overview]);

  const statusOpts: Array<{ key: StatusFilter; label: string; color: string }> = [
    { key: 'all',         label: t('onboarding.filterAll', { count: counts.all }),               color: 'var(--primary)' },
    { key: 'not_started', label: t('onboarding.filterNotStarted', { count: counts.not_started }), color: '#6B7280' },
    { key: 'in_progress', label: t('onboarding.filterInProgress', { count: counts.in_progress }), color: '#C9973A' },
    { key: 'complete',    label: t('onboarding.filterComplete', { count: counts.complete }),       color: '#15803D' },
  ];

  const avatarColor = (pct: number) => {
    if (pct === 100) return '#15803D';
    if (pct > 50)   return '#C9973A';
    if (pct > 0)    return '#7C3AED';
    return '#6B7280';
  };

  const overviewCompanyOptions = useMemo<SelectOption[]>(() => (
    companies.map((company) => {
      const logoUrl = getCompanyLogoUrl(company.logoFilename);
      return {
        value: String(company.id),
        label: company.name,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {logoUrl ? (
                <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--primary)' }}>{company.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.name}
                {company.country && (
                  <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                    <img src={`https://flagcdn.com/w20/${company.country.toLowerCase()}.png`} alt={company.country} style={{ height: 10, borderRadius: 1 }} />
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: company.groupName ? '#9A6808' : 'var(--text-muted)', fontWeight: company.groupName ? 600 : 400 }}>
                    {company.groupName || t('common.independent', 'Independent')}
                  </span>
                  <span style={{ opacity: 0.45 }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {company.employeeCount ?? 0} {t('employees.title', 'Employees')}
                  </span>
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10.5, flexShrink: 0 }}>
                  {`${company.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                </span>
              </div>
            </span>
          </div>
        ),
      };
    })
  ), [companies, t]);

  const overviewStoreOptions = useMemo<SelectOption[]>(() => (
    stores.map((store) => {
      const initialsValue = store.name.slice(0, 2).toUpperCase();
      return {
        value: String(store.id),
        label: `${store.name} ${store.companyName}`,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 800 }}>
              {initialsValue}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {store.name}
              </span>
              <span style={{ display: 'block', marginTop: 1, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                {store.companyName} • {store.employeeCount} {t('employees.title', 'Employees')}
              </span>
            </span>
          </div>
        ),
      };
    })
  ), [stores, t]);

  const bulkCompanySelectOptions = useMemo<SelectOption[]>(() => (
    companies.map((company) => {
      const logoUrl = getCompanyLogoUrl(company.logoFilename);
      const ownerLabel = company.ownerName
        ? `${company.ownerName}${company.ownerSurname ? ` ${company.ownerSurname}` : ''}`
        : t('companies.ownerMissing', 'No owner assigned');
      return {
        value: String(company.id),
        label: company.name,
        render: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'rgba(13,33,55,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {logoUrl ? (
                <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--primary)' }}>{company.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.name}
                {company.country && (
                  <span style={{ marginLeft: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                    <img src={`https://flagcdn.com/w20/${company.country.toLowerCase()}.png`} alt={company.country} style={{ height: 10, borderRadius: 1 }} />
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: company.groupName ? '#9A6808' : 'var(--text-muted)', fontWeight: company.groupName ? 600 : 400 }}>
                    {company.groupName || t('common.independent', 'Independent')}
                  </span>
                  <span style={{ opacity: 0.45 }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ownerLabel}</span>
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 10.5, flexShrink: 0 }}>
                  {`${company.storeCount ?? 0} ${t('employees.storesLabel', 'Stores')}`}
                </span>
              </div>
            </span>
          </div>
        ),
      };
    })
  ), [companies, t]);

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label={t('onboarding.statTotalEmployees')} value={counts.all}        icon="👥" color="var(--primary)"  bg="rgba(13,33,55,0.06)" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
        <StatCard label={t('onboarding.statNotStarted')}     value={counts.not_started} icon="⏳" color="#6B7280" bg="rgba(107,114,128,0.08)" onClick={() => setStatusFilter('not_started')} active={statusFilter === 'not_started'} />
        <StatCard label={t('onboarding.statInProgress')}     value={counts.in_progress} icon="🔄" color="#C9973A" bg="rgba(201,151,58,0.08)" onClick={() => setStatusFilter('in_progress')} active={statusFilter === 'in_progress'} />
        <StatCard label={t('onboarding.statComplete')}       value={counts.complete}    icon="✅" color="#15803D" bg="rgba(21,128,61,0.08)" onClick={() => setStatusFilter('complete')} active={statusFilter === 'complete'} />
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        marginBottom: isMobile ? 12 : 10,
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: isMobile ? 'none' : '1 1 300px', minWidth: isMobile ? 0 : 220 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            style={{
              width: isMobile ? '100%' : 'auto',
              minWidth: isMobile ? 0 : 220,
              maxWidth: isMobile ? '100%' : 280
            }}
          />
        </div>
        <div style={{
          display: 'flex',
          gap: 8,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: isMobile ? 'flex-start' : 'flex-end',
          flex: isMobile ? 'none' : '1 1 720px',
          minWidth: isMobile ? 0 : 320,
          flexWrap: 'wrap'
        }}>
          <div style={{ width: isMobile ? '100%' : 250 }}>
            <CustomSelect
              value={companyFilter}
              onChange={(value) => setCompanyFilter(value ?? 'all')}
              options={[
                { value: 'all', label: `${t('common.all')} ${t('nav.companies', 'Companies')}` },
                ...overviewCompanyOptions,
              ]}
              placeholder={`${t('common.all')} ${t('nav.companies', 'Companies')}`}
              searchable
              isClearable={false}
              searchPlaceholder={t('common.search', 'Search...')}
              noOptionsMessage={t('common.noData', 'No options found')}
              menuMaxHeight={280}
            />
          </div>
          {stores.length > 0 && (
            <div style={{ width: isMobile ? '100%' : 240 }}>
              <CustomSelect
                value={storeFilter || null}
                onChange={(value) => setStoreFilter(value ?? '')}
                options={[
                  { value: '', label: t('common.all', 'All') + ' ' + t('stores.title', 'Stores') },
                  ...overviewStoreOptions,
                ]}
                placeholder={t('common.all', 'All') + ' ' + t('stores.title', 'Stores')}
                searchable
                isClearable={false}
                searchPlaceholder={t('common.search', 'Search...')}
                noOptionsMessage={t('common.noData', 'No options found')}
                menuMaxHeight={280}
                />
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 20,
        flexWrap: 'wrap'
      }}>
        <div style={{
          display: 'flex',
          gap: 5,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          overflowX: isMobile ? 'auto' : 'visible',
          width: isMobile ? '100%' : 'auto',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none'
        }}>
          {statusOpts.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              style={{
                padding: '4px 10px', border: 'none', borderRadius: 7, cursor: 'pointer',
                background: statusFilter === opt.key ? opt.color : 'transparent',
                color: statusFilter === opt.key ? '#fff' : 'var(--text-secondary)',
                fontWeight: statusFilter === opt.key ? 600 : 400, fontSize: 12,
                fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isAdmin && counts.not_started > 0 && (
          <Button
            variant="secondary"
            size="sm"
            loading={bulkAssigning}
            onClick={() => setBulkDrawerOpen(true)}
            style={{
              height: 32,
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center'
            }}
          >
            📋 {t('onboarding.bulkAssignBtn', { count: counts.not_started })}
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Skel w={44} h={44} r={22} />
              <div style={{ flex: 1 }}>
                <Skel w="60%" h={13} />
                <div style={{ marginTop: 6 }}><Skel w="80%" h={11} /></div>
                <div style={{ marginTop: 8 }}><Skel w="100%" h={5} r={99} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>{t('onboarding.noEmployeesFound')}</div>
          <div style={{ fontSize: 13 }}>{t('onboarding.noEmployeesHint')}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map((emp) => {
            const pct = emp.percentage;
            const ac  = avatarColor(pct);
            const avatarUrl = getAvatarUrl(emp.avatarFilename);
            return (
              <div
                key={emp.employeeId}
                onClick={() => setSelectedEmployee(emp)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 16, padding: '16px 18px', cursor: 'pointer',
                  transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = ac; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px rgba(0,0,0,0.08)`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
              >
                {/* Completion strip at top */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--border)', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: ac, transition: 'width 0.5s ease' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Avatar */}
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${ac}30`, flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: `${ac}18`, border: `2px solid ${ac}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, fontWeight: 700, color: ac,
                    }}>
                      {initials(emp.name, emp.surname)}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {emp.name} {emp.surname}
                      </div>
                      {/* Role Badge - Inline with Name */}
                      <div style={{
                        fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase',
                        padding: '2px 8px', borderRadius: 6,
                        background: ROLE_BADGE_VARIANT[emp.role]?.bg || 'rgba(13,33,55,0.06)',
                        color: ROLE_BADGE_VARIANT[emp.role]?.color || 'var(--text-muted)',
                        border: `1px solid ${ROLE_BADGE_VARIANT[emp.role]?.border || 'var(--border)'}`,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 20,
                        minWidth: 60,
                        textAlign: 'center',
                      }}>
                        {t(`roles.${emp.role}`, emp.role)}
                      </div>
                    </div>
                    {emp.companyName && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🏢 {emp.companyName}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🏪 {emp.storeName}
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {emp.hasTasksAssigned ? `${emp.completed}/${emp.total} ${t('onboarding.tasksLabel')}` : t('onboarding.notStartedLabel')}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: ac }}>{pct}%</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: ac, borderRadius: 99, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>

                  {/* Ring */}
                  <ProgressRing pct={pct} size={44} stroke={4} color={ac} />
                </div>

                {/* Status badge */}
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                    background: !emp.hasTasksAssigned ? 'rgba(107,114,128,0.12)' : pct === 100 ? 'rgba(21,128,61,0.12)' : 'rgba(201,151,58,0.12)',
                    color: !emp.hasTasksAssigned ? '#6B7280' : pct === 100 ? '#15803D' : '#92600a',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {!emp.hasTasksAssigned ? t('onboarding.statusNotStarted') : pct === 100 ? t('onboarding.statusComplete') : t('onboarding.statusInProgress')}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('onboarding.viewLink')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EmployeeDrawer
        employee={selectedEmployee}
        isAdmin={isAdmin}
        onClose={() => setSelectedEmployee(null)}
        onRefresh={load}
      />
      <SideDrawer open={bulkDrawerOpen} onClose={() => setBulkDrawerOpen(false)}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-warm)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{t('onboarding.assignModalTitle', 'Bulk Assign Tasks')}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{t('onboarding.lookupHint')}</div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ width: '100%' }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              <Building2 size={13} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} /> {t('nav.companies', 'Companies')}
            </label>
            <CustomSelect
              value={bulkCompanyId || null}
              onChange={(value) => setBulkCompanyId(value ?? '')}
              options={bulkCompanySelectOptions}
              placeholder={t('employees.selectCompany', 'Select company')}
              searchable
              isClearable={false}
              searchPlaceholder={t('common.search', 'Search...')}
              noOptionsMessage={t('common.noData', 'No options found')}
              menuMaxHeight={280}
            />
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t('employees.title', 'Employees')} ({bulkEmployees.length})</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 8 }}>
              {bulkLoading ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>…</div>
              ) : bulkEmployees.map((emp) => {
                const url = getAvatarUrl(emp.avatarFilename);
                return (
                  <label
                    key={emp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      fontSize: 12.5,
                      padding: '6px 4px',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={bulkSelectedEmployeeIds.has(emp.id)}
                        onChange={() => setBulkSelectedEmployeeIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id);
                          return next;
                        })}
                      />
                      {url ? (
                        <img src={url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <span style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--surface-warm)', border: '1px solid var(--border)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'var(--primary)',
                        }}>
                          {(emp.name?.[0] ?? '')}{(emp.surname?.[0] ?? '')}
                        </span>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, display: 'block' }}>
                          {emp.name} {emp.surname}
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          <StoreIcon size={10} style={{ opacity: 0.8 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.storeName || '—'}
                          </span>
                        </div>
                      </div>

                      {/* Role Badge - Taller and Centered on the Right */}
                      <div style={{
                        fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
                        padding: '4px 8px', borderRadius: 8,
                        background: ROLE_BADGE_VARIANT[emp.role]?.bg || 'rgba(13,33,55,0.06)',
                        color: ROLE_BADGE_VARIANT[emp.role]?.color || 'var(--text-muted)',
                        border: `1px solid ${ROLE_BADGE_VARIANT[emp.role]?.border || 'var(--border)'}`,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}>
                        {t(`roles.${emp.role}`, emp.role)}
                      </div>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{t('onboarding.tabTemplates', 'Tasks')} ({bulkTemplates.length})</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 2 }}>
              {bulkLoading ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>…</div>
              ) : (
                PHASE_ORDER.map((phase) => {
                  const list = bulkTemplates.filter((x) => getTemplatePhase(x) === phase).slice().sort((a, b) => a.sortOrder - b.sortOrder);
                  if (list.length === 0) return null;
                  const meta = PHASE_META[phase];
                  return (
                    <div key={`bulk-${phase}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 14 }}>{meta.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{t(meta.labelKey)}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{list.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {list.map((tmpl) => (
                          <label
                            key={tmpl.id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                              background: 'var(--surface)',
                              border: `1px solid ${meta.border}`,
                              borderLeft: `4px solid ${meta.color}`,
                              borderRadius: 10,
                              padding: '10px 10px',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={bulkSelectedTemplateIds.has(tmpl.id)}
                              onChange={() => setBulkSelectedTemplateIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(tmpl.id)) next.delete(tmpl.id); else next.add(tmpl.id);
                                return next;
                              })}
                              style={{ marginTop: 2, accentColor: 'var(--primary)' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{tmpl.name}</div>
                              {tmpl.description && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>{tmpl.description}</div>
                              )}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
                                <span style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 99, padding: '1px 7px', color: 'var(--text-secondary)', background: 'var(--background)' }}>
                                  {getCategoryMeta(tmpl.category).icon} {getCategoryMeta(tmpl.category).label}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[tmpl.priority] ?? 'var(--text-muted)', textTransform: 'uppercase' }}>
                                  {t(`onboarding.priority${tmpl.priority === 'high' ? 'High' : tmpl.priority === 'medium' ? 'Medium' : 'Low'}`)}
                                </span>
                                {tmpl.createdByName && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    {t('common.createdBy', 'Created by')}: {tmpl.createdByName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <Button
            variant="primary"
            loading={bulkAssigning || bulkLoading}
            disabled={!bulkCompanyId || bulkSelectedEmployeeIds.size === 0 || bulkSelectedTemplateIds.size === 0}
            onClick={handleBulkAssign}
          >
            {t('onboarding.assignConfirm', 'Assign')}
          </Button>
        </div>
      </SideDrawer>
    </div>
  );
};

// ─── Employee Task View ────────────────────────────────────────────────────────

const EmployeeTaskView: React.FC<{
  progress: OnboardingProgress;
  employeeName: string;
  onComplete: (taskId: number, note?: string) => Promise<void>;
  onUncomplete?: (taskId: number) => Promise<void>;
}> = ({ progress, employeeName, onComplete, onUncomplete }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const [activePhase, setActivePhase] = useState<Phase>('day1');
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [noteTaskId, setNoteTaskId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const pendingTasks = progress.tasks.filter((task) => !task.completed);
  const completedTasks = progress.tasks.filter((task) => task.completed);

  // Group pending tasks by explicit task type.
  const tasksByPhase = useMemo(() => {
    const map = new Map<Phase, OnboardingTask[]>();
    PHASE_ORDER.forEach((p) => map.set(p, []));
    pendingTasks.forEach((task, i) => {
      const phase = getTaskPhase(task, i);
      map.get(phase)!.push(task);
    });
    return map;
  }, [pendingTasks]);

  const pendingCountByPhase = useMemo(() => {
    const counts: Record<Phase, number> = { day1: 0, week1: 0, month1: 0, ongoing: 0 };
    pendingTasks.forEach((task, i) => {
      counts[getTaskPhase(task, i)]++;
    });
    return counts;
  }, [pendingTasks]);

  const handleComplete = async (taskId: number) => {
    setCompletingId(taskId);
    try {
      await onComplete(taskId, note || undefined);
      setNoteTaskId(null);
      setNote('');
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div>
      {/* Header with progress */}
      <div style={{ marginBottom: 20, padding: '16px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          {t('onboarding.welcomeMessage', "Welcome, {{name}}! Here's your onboarding journey.", { name: employeeName })}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {t('onboarding.progressSubtitle', '{{completed}} of {{total}} tasks completed', { completed: progress.completed, total: progress.total })}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress.percentage}%`,
              background: progress.percentage === 100 ? '#15803D' : 'var(--accent)',
              borderRadius: 4, transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: progress.percentage === 100 ? '#15803D' : 'var(--text-primary)', minWidth: 50, textAlign: 'right' }}>
            {progress.completed}/{progress.total}
          </span>
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PHASE_ORDER.map((phase) => {
          const meta = PHASE_META[phase];
          const count = pendingCountByPhase[phase];
          const isActive = activePhase === phase;
          return (
            <button
              key={phase}
              onClick={() => setActivePhase(phase)}
              style={{
                padding: '7px 14px', borderRadius: 20,
                border: `1.5px solid ${isActive ? meta.color : 'var(--border)'}`,
                background: isActive ? meta.bg : 'var(--surface)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 13 }}>{meta.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? meta.color : 'var(--text-muted)' }}>
                {t(meta.labelKey)}
              </span>
              {count > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: meta.color, color: '#fff', borderRadius: 10, padding: '1px 6px' }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Task cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(tasksByPhase.get(activePhase) ?? []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            ✓ {t('onboarding.onboardingComplete', 'All tasks in this phase are complete')}
          </div>
        ) : (
          (tasksByPhase.get(activePhase) ?? []).map((task) => {
            const due = getDueDateDisplay(task.dueDate, task.isOverdue, t);
            return (
              <div
                key={task.id}
                style={{
                  padding: '14px 16px', borderRadius: 10,
                  border: `1.5px solid ${task.isOverdue ? '#FCA5A5' : 'var(--border)'}`,
                  background: task.isOverdue ? 'rgba(220,38,38,0.03)' : 'var(--surface)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>
                      {getCategoryMeta(task.templateCategory).icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{task.templateName}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[task.templatePriority] ?? '#6B7280', textTransform: 'uppercase' }}>
                          {t(`onboarding.priority${task.templatePriority.charAt(0).toUpperCase() + task.templatePriority.slice(1)}` as any, task.templatePriority)}
                        </span>
                      </div>
                      {task.templateDescription && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>{task.templateDescription}</p>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: due.color, fontWeight: 500 }}>📅 {due.label}</span>
                        {task.templateLinkUrl && (
                          task.templateLinkUrl.startsWith('http') || task.templateLinkUrl.startsWith('//') || task.templateLinkUrl.startsWith('www') ? (
                            <a
                              href={task.templateLinkUrl.startsWith('www') ? `https://${task.templateLinkUrl}` : task.templateLinkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                            >
                              {t('onboarding.openLink', 'Open →')}
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => navigate(task.templateLinkUrl!)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: 11,
                                color: 'var(--accent)',
                                fontWeight: 600,
                                textDecoration: 'none',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              {t('onboarding.openLink', 'Open →')}
                            </button>
                          )
                        )}
                      </div>
                      {!isMobile && noteTaskId === task.id && (
                        <textarea
                          autoFocus
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={t('onboarding.completionNotePlaceholder', 'Add a note (optional)...')}
                          rows={2}
                          style={{
                            width: '100%', marginTop: 10, padding: '8px 10px',
                            borderRadius: 8, border: '1.5px solid var(--border)',
                            background: 'var(--background)', fontSize: 12,
                            resize: 'vertical', boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </div>
                    {!isMobile && (
                      <div style={{ flexShrink: 0 }}>
                        {noteTaskId === task.id ? (
                          <Button
                            onClick={() => handleComplete(task.id)}
                            disabled={completingId === task.id}
                          >
                            {completingId === task.id ? '...' : t('onboarding.markDoneWithNote', 'Mark as done')}
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={() => { setNoteTaskId(task.id); setNote(''); }}>
                            {t('onboarding.markDone', 'Done')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {isMobile && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {noteTaskId === task.id && (
                        <textarea
                          autoFocus
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={t('onboarding.completionNotePlaceholder', 'Add a note (optional)...')}
                          rows={2}
                          style={{
                            width: '100%', padding: '8px 10px',
                            borderRadius: 8, border: '1.5px solid var(--border)',
                            background: 'var(--background)', fontSize: 12,
                            resize: 'none', boxSizing: 'border-box',
                          }}
                        />
                      )}
                      {noteTaskId === task.id ? (
                        <Button
                          variant="accent"
                          fullWidth
                          onClick={() => handleComplete(task.id)}
                          disabled={completingId === task.id}
                        >
                          {completingId === task.id ? '...' : t('onboarding.markDoneWithNote', 'Mark as done')}
                        </Button>
                      ) : (
                        <Button
                          variant="accent"
                          fullWidth
                          onClick={() => { setNoteTaskId(task.id); setNote(''); }}
                        >
                          {t('onboarding.markDone', 'Done')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Completed section */}
      {completedTasks.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, padding: 0,
            }}
          >
            {showCompleted ? '▾' : '▸'} {t('onboarding.progressTitle', 'Completed')} ({completedTasks.length})
          </button>
          {showCompleted && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--background)', opacity: 0.75,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#15803D', fontSize: 14 }}>✓</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                      {task.templateName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {fmtDate(task.completedAt)}
                    </span>
                  </div>
                  {task.completionNote && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0 22px', fontStyle: 'italic' }}>
                      "{task.completionNote}"
                    </p>
                  )}
                  {onUncomplete && (
                    <button
                      onClick={() => onUncomplete(task.id)}
                      style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, marginLeft: 22, padding: 0 }}
                    >
                      ↩ Undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── My Tasks Panel ───────────────────────────────────────────────────────────

const MyTasksPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    getEmployeeTasks(user.id)
      .then((p) => {
        setProgress(p);
        if (p.percentage === 100 && p.total > 0) setCelebration(true);
      })
      .catch(() => showToast(t('onboarding.errorLoad', 'Error loading tasks'), 'error'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <Skel w="50%" h={18} />
        <div style={{ marginTop: 10 }}><Skel w="100%" h={8} r={99} /></div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skel w={22} h={22} r={11} />
          <div style={{ flex: 1 }}><Skel w="60%" h={13} /></div>
        </div>
      ))}
    </div>
  );

  if (!progress || progress.total === 0) return (
    <div style={{ textAlign: 'center', padding: '64px 24px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📋</div>
      <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        {t('onboarding.noTasksAssigned', 'No tasks assigned yet')}
      </h3>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        {t('onboarding.noTasksAssignedHint', 'Your manager will assign onboarding tasks soon. Check back later!')}
      </p>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Celebration banner */}
      {celebration && (
        <div style={{
          background: 'linear-gradient(135deg, #15803D 0%, #16a34a 100%)',
          borderRadius: 16, padding: '20px 24px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(21,128,61,0.3)',
          animation: 'popIn 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
              {t('onboarding.celebrationTitle', "You've completed your onboarding!")}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
              {t('onboarding.celebrationSubtitle', "Welcome to the team — you're all set!")}
            </div>
          </div>
          <button onClick={() => setCelebration(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      )}

      <EmployeeTaskView
        progress={progress}
        employeeName={`${user?.name ?? ''} ${user?.surname ?? ''}`.trim()}
        onComplete={async (taskId, noteText) => {
          try {
            const updated = await completeTask(taskId, noteText);
            setProgress((prev) => {
              if (!prev) return prev;
              const tasks = prev.tasks.map((t) => t.id === updated.id ? updated : t);
              const completed = tasks.filter((t) => t.completed).length;
              const pct = Math.round(completed / tasks.length * 100);
              if (pct === 100 && prev.percentage < 100) setCelebration(true);
              return { ...prev, tasks, completed, percentage: pct };
            });
          } catch (err) {
            showToast(translateApiError(err, t, t('onboarding.errorComplete', 'Error completing task')) ?? '', 'error');
            throw err;
          }
        }}
      />
    </div>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'templates' | 'overview' | 'mytasks';

export default function OnboardingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();

  const role    = user?.role ?? '';
  const isAdmin = ADMIN_HR.includes(role);
  const canOverview = OVERVIEW_R.includes(role);

  const defaultTab: Tab = isAdmin ? 'templates' : canOverview ? 'overview' : 'mytasks';
  const [tab, setTab] = useState<Tab>(defaultTab);

  const [stats, setStats] = useState<OnboardingStats | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    getOnboardingStats().then(setStats).catch(() => undefined);
  }, [isAdmin]);

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: 'templates', label: t('onboarding.tabTemplates', 'Task Library'), visible: isAdmin },
    { key: 'overview',  label: t('onboarding.tabOverview', 'Team Overview'), visible: canOverview },
    { key: 'mytasks',   label: t('onboarding.tabMyTasks', 'My Tasks'),       visible: true },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes popIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
      `}</style>

      {/* Hero header */}
      <div style={{ padding: isMobile ? '0' : '18px 16px 0' }}>
        <div style={{
          maxWidth: 1400,
          margin: '0 auto',
          background: 'linear-gradient(135deg, var(--primary) 0%, #1a3a5c 60%, #0f2030 100%)',
          padding: isMobile ? '20px 16px 18px' : '32px 32px 28px',
          borderRadius: 22,
          border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.14)',
          boxShadow: isMobile ? 'none' : '0 12px 30px rgba(10,26,43,0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(201,151,58,0.25)', border: '1px solid rgba(201,151,58,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚀</div>
                <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                  {t('nav.onboarding', 'Onboarding')}
                </h1>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                {isAdmin
                  ? t('onboarding.subtitleAdmin', 'Manage onboarding checklists and monitor new employees')
                  : t('onboarding.subtitleEmployee', 'Complete your onboarding tasks to get started')}
              </p>
            </div>

            {/* Live stats pills */}
            {stats && (
              <div style={{ display: 'flex', gap: isMobile ? 6 : 8, flexWrap: 'wrap' }}>
                {[
                  { label: t('onboarding.heroInProgress'), value: stats.inProgress, color: 'rgba(201,151,58,0.8)' },
                  { label: t('onboarding.heroComplete'),    value: stats.complete,    color: 'rgba(74,222,128,0.8)' },
                  { label: t('onboarding.heroAvg'),         value: `${stats.avgPercentage}%`, color: 'rgba(255,255,255,0.6)' },
                ].map((s) => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 99, padding: isMobile ? '4px 10px' : '5px 12px', backdropFilter: 'blur(8px)' }}>
                    <span style={{ fontSize: isMobile ? 10 : 11, color: 'rgba(255,255,255,0.55)' }}>{s.label} </span>
                    <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pill tabs */}
          <div style={{
            display: 'flex',
            gap: 4,
            marginTop: 22,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 4,
            width: isMobile ? '100%' : 'fit-content',
            justifyContent: isMobile ? 'center' : 'flex-start'
          }}>
            {tabs.filter((t) => t.visible).map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                style={{
                  padding: isMobile ? '7px 0' : '7px 18px',
                  flex: isMobile ? 1 : 'none',
                  border: 'none', borderRadius: 9, cursor: 'pointer',
                  background: tab === tb.key ? '#fff' : 'transparent',
                  color: tab === tb.key ? 'var(--primary)' : 'rgba(255,255,255,0.65)',
                  fontWeight: tab === tb.key ? 700 : 400, fontSize: isMobile ? 12 : 13,
                  fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                  boxShadow: tab === tb.key ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  textAlign: 'center',
                }}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 6px 24px' : '22px 32px 28px' }}>
        {tab === 'templates' && isAdmin    && <TemplatesPanel />}
        {tab === 'overview'  && canOverview && <OverviewPanel isAdmin={isAdmin} />}
        {tab === 'mytasks'                  && <MyTasksPanel />}
      </div>
    </div>
  );
}
