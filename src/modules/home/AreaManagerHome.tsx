import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Coffee, RefreshCw, AlertCircle,
  ClipboardList, FileText, FileSignature, ChevronRight, MessageSquare, Image as ImageIcon
} from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Table, Card } from '../../components/ui';
import type { Column } from '../../components/ui';
import client, { getAvatarUrl, getStoreLogoUrl } from '../../api/client';
import { EmployeeDocument, getMyDocuments } from '../../api/documents';
import { getMessages } from '../../api/messages';
import { Message } from '../../types';
import { getEmployeeTasks, OnboardingTask } from '../../api/onboarding';

interface AssignedStore {
  id: number;
  name: string;
  code: string;
  logoFilename?: string | null;
  storeManager?: string | null;
  employeeCount: number;
}

interface PendingShiftHomeRow {
  id: number;
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  userName: string;
  userSurname: string;
  userRole?: string;
  userAvatarFilename?: string | null;
  storeName?: string | null;
}

interface PendingLeaveHomeRow {
  id: number;
  userId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  userName: string;
  userSurname: string;
  userRole?: string;
  userAvatarFilename?: string | null;
  storeName?: string | null;
}

export interface AreaManagerHomeData {
  assignedStores: AssignedStore[];
  pendingShiftPreview?: PendingShiftHomeRow[];
  pendingShiftCount?: number;
  pendingLeavePreview?: PendingLeaveHomeRow[];
  pendingLeaveCount?: number;
  nextShift?: any | null;
  stats?: {
    totalStores: number;
    activeEmployees: number;
    presentEmployees: number;
    weeklyHours: number;
  };
}

interface AreaManagerHomeProps {
  data: AreaManagerHomeData;
}

// ── Helpers ────────────────────────────────────────────────────────────────
interface DashboardMessageActivity {
  id: number;
  senderId: number;
  senderName: string;
  senderAvatarFilename?: string | null;
  createdAt: string;
  isImage: boolean;
}

interface ActivityItem {
  id: string;
  type: 'task' | 'document';
  title: string;
  subtitle: string;
  dateLabel: string;
  completed: boolean;
  sortDate: number;
  actionPath: string;
}

const ProgressCircle: React.FC<{ percentage: number }> = ({ percentage }) => {
  const safePercentage = Math.max(0, Math.min(100, percentage));
  const size = 74;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safePercentage / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(13,33,55,0.10)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {safePercentage}%
        </div>
      </div>
    </div>
  );
};

const initials = (name: string) => {
  if (!name) return '?';
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return (name[0] ?? '?').toUpperCase();
};

const avatarColor = (name: string) => {
  if (!name) return '#0284c7';
  const colors = [
    '#0284c7', '#0f766e', '#b45309', '#be123c', '#6d28d9',
    '#1d4ed8', '#15803d', '#4d7c0f', '#c2410c', '#a21caf'
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return colors[sum % colors.length];
};

const EmployeeAvatar: React.FC<{ name: string; avatarFilename?: string | null }> = ({ name, avatarFilename }) => {
  const avatarUrl = getAvatarUrl(avatarFilename);
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(148,163,184,0.3)', flexShrink: 0 }}
      />
    );
  }
  return (
    <span style={{
      width: 36, height: 36, borderRadius: '50%', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', background: avatarColor(name),
      color: '#fff', fontSize: '12px', fontWeight: 800, border: '1px solid rgba(148,163,184,0.3)',
      textShadow: '0 1px 2px rgba(0,0,0,0.1)', flexShrink: 0
    }}>
      {initials(name)}
    </span>
  );
};

function formatActivityDate(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function getActivityTimestamp(dateStr: string): number {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

function formatMessageDateTime(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  } catch {
    return '';
  }
}

function formatShiftDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}
function isToday(dateStr: string): boolean {
  const now = new Date();
  return dateStr === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function isTomorrow(dateStr: string): boolean {
  const t = new Date(); t.setDate(t.getDate() + 1);
  return dateStr === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function fmt(t: string): string { return t ? t.slice(0, 5) : ''; }

const SHIFT_STATUS_META: Record<string, { bg: string; color: string; labelKey: string }> = {
  confirmed: { bg: 'rgba(21,128,61,0.10)', color: '#15803d', labelKey: 'shifts.status.confirmed' },
  scheduled: { bg: 'rgba(13,33,55,0.08)', color: '#1e4a7a', labelKey: 'shifts.status.scheduled' },
  cancelled: { bg: 'rgba(220,38,38,0.08)', color: '#dc2626', labelKey: 'shifts.status.cancelled' },
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconStore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7l1-4h18l1 4"/>
    <path d="M2 7h20v13a2 2 0 01-2 2H4a2 2 0 01-2-2V7z"/>
    <path d="M10 21V12h4v9"/>
  </svg>
);
const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
);
const IconActivity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);
const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

// ── Stat card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  description?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, accent, description }) => (
  <div className="card-lift" style={{
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)',
    borderTop: `3px solid ${accent}`,
    padding: '22px 24px',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column', gap: '14px',
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: `${accent}14`, border: `1px solid ${accent}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent, flexShrink: 0,
      }}>{icon}</div>
      <span style={{
        fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px',
      }}>{label}</span>
    </div>
    <div>
      <div className="stat-num" style={{
        fontSize: '38px', fontWeight: 700, fontFamily: 'var(--font-display)',
        color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em',
      }}>{value}</div>
      {description && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{description}</div>
      )}
    </div>
  </div>
);

const BAR_COLORS = ['#C9973A', '#0D2137', '#0284C7', '#15803D', '#7C3AED', '#B45309'];

const makeChartTooltip = (employeesLabel: string) =>
  ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '8px 12px',
        boxShadow: 'var(--shadow)', fontSize: '12px', fontFamily: 'var(--font-body)',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{payload[0].payload.name}</span>
        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{payload[0].value} {employeesLabel}</span>
      </div>
    );
  };

export const AreaManagerHome: React.FC<AreaManagerHomeProps> = ({ data }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isMobile, isTablet } = useBreakpoint();
  const { permissions, user, targetCompanyId } = useAuth();

  const toStoreSlug = (store: { id: number; name: string }): string => {
    const clean = store.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${store.id}-${clean}`;
  };

  const renderStoreLogo = (logoFilename: string | null | undefined, name: string, size = 36) => {
    const logoUrl = getStoreLogoUrl(logoFilename);
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={name}
          style={{ width: size, height: size, borderRadius: '10px', objectFit: 'cover', border: '1px solid rgba(148,163,184,0.3)', flexShrink: 0 }}
        />
      );
    }
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '10px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #15803D, #166534)',
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 800,
          border: '1px solid rgba(148,163,184,0.3)',
          flexShrink: 0,
        }}
      >
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </span>
    );
  };

  const renderUserAvatar = (avatarFilename: string | null | undefined, name: string, surname: string, size = 32) => {
    const avatarUrl = getAvatarUrl(avatarFilename);
    const initials = `${name?.[0] ?? ''}${surname?.[0] ?? ''}`.toUpperCase() || 'U';
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt=""
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(148,163,184,0.3)', flexShrink: 0 }}
        />
      );
    }
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--primary), #3b82f6)',
          color: '#fff',
          fontSize: size <= 32 ? '0.75rem' : '0.85rem',
          fontWeight: 700,
          border: '1px solid rgba(148,163,184,0.3)',
          flexShrink: 0,
        }}
      >
        {initials}
      </span>
    );
  };
  
  const {
    assignedStores = [],
    pendingShiftPreview = [],
    pendingShiftCount = 0,
    pendingLeavePreview = [],
    pendingLeaveCount = 0,
    stats,
    nextShift,
  } = data;

  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
  const showAttendance = user?.isSuperAdmin || permissions['presenze'] === true;
  const showShifts = user?.isSuperAdmin || permissions['turni'] === true;

  // ── Daily attendance state for self ────────────────────────────────────
  const [dailyState, setDailyState] = useState<any>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [showRegWarning, setShowRegWarning] = useState(true);

  useEffect(() => {
    let active = true;
    const loadState = async () => {
      try {
        setStateLoading(true);
        const res = await client.get('/attendance/daily-state');
        if (active) setDailyState(res.data?.data ?? res.data);
      } catch (err) {
        console.error('Error loading daily state for AM:', err);
      } finally {
        if (active) setStateLoading(false);
      }
    };
    void loadState();
    return () => { active = false; };
  }, []);

  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadActivities = async () => {
      if (!user?.id) {
        if (active) setActivitiesLoading(false);
        return;
      }

      try {
        setActivitiesLoading(true);
        const [tasksResult, docsResult, messagesResult] = await Promise.all([
          permissions.onboarding === true ? getEmployeeTasks(user.id) : Promise.resolve({ tasks: [] } as { tasks: OnboardingTask[] }),
          permissions.documenti === true ? getMyDocuments() : Promise.resolve([] as EmployeeDocument[]),
          permissions.messaggi === true ? getMessages(targetCompanyId ?? user?.companyId ?? undefined) : Promise.resolve([] as Message[]),
        ]);

        if (!active) return;
        setOnboardingTasks(tasksResult.tasks ?? []);
        setDocuments(docsResult ?? []);
        setMessages(messagesResult ?? []);
      } catch (err) {
        console.error('Error loading Area Manager dashboard activities:', err);
        if (active) {
          setOnboardingTasks([]);
          setDocuments([]);
          setMessages([]);
        }
      } finally {
        if (active) setActivitiesLoading(false);
      }
    };

    void loadActivities();
    return () => { active = false; };
  }, [permissions.documenti, permissions.messaggi, permissions.onboarding, user?.id, targetCompanyId, user?.companyId]);

  const activityItems = useMemo<ActivityItem[]>(() => {
    const taskItems: ActivityItem[] = onboardingTasks.map((task) => ({
      id: `task-${task.id}`,
      type: 'task',
      title: task.templateName,
      subtitle: task.completed
        ? t('home.employee.activityTaskCompleted')
        : task.dueDate
          ? t('home.employee.activityTaskDue', { date: formatActivityDate(task.dueDate, locale) })
          : t('home.employee.activityTaskAssigned'),
      dateLabel: formatActivityDate(task.updatedAt || task.createdAt, locale),
      completed: task.completed,
      sortDate: getActivityTimestamp(task.updatedAt || task.createdAt),
      actionPath: '/onboarding',
    }));

    const signatureDocuments = documents.filter((doc) => doc.requiresSignature);
    const documentItems: ActivityItem[] = signatureDocuments.map((doc) => ({
      id: `document-${doc.id}`,
      type: 'document',
      title: doc.fileName,
      subtitle: doc.signedAt
        ? t('home.employee.activityDocumentSigned')
        : t('home.employee.activityDocumentPending'),
      dateLabel: formatActivityDate(doc.updatedAt || doc.createdAt, locale),
      completed: Boolean(doc.signedAt),
      sortDate: getActivityTimestamp(doc.updatedAt || doc.createdAt),
      actionPath: '/documenti',
    }));

    return [...taskItems, ...documentItems].sort((a, b) => b.sortDate - a.sortDate);
  }, [onboardingTasks, documents, t, locale]);

  const totalActivities = activityItems.length;
  const completedActivities = activityItems.filter((item: ActivityItem) => item.completed).length;
  const activityCompletionPercentage = totalActivities > 0
    ? (completedActivities / totalActivities) * 100
    : 0;

  const recentDocuments = useMemo<EmployeeDocument[]>(() => {
    return [...documents]
      .sort((a, b) => getActivityTimestamp(b.updatedAt || b.createdAt) - getActivityTimestamp(a.updatedAt || a.createdAt));
  }, [documents]);

  const recentMessages = useMemo<DashboardMessageActivity[]>(() => {
    return messages
      .filter((message) => message.direction === 'received')
      .sort((a, b) => getActivityTimestamp(b.createdAt) - getActivityTimestamp(a.createdAt))
      .map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName: message.senderName || t('common.unknownUser', 'Unknown user'),
        senderAvatarFilename: message.senderAvatarFilename ?? null,
        createdAt: message.createdAt,
        isImage: Boolean(message.attachmentFilename),
      }));
  }, [messages, t]);

  const shiftMeta = nextShift ? (SHIFT_STATUS_META[nextShift.status] ?? SHIFT_STATUS_META.scheduled) : null;
  const shiftIsToday = nextShift ? isToday(nextShift.date) : false;
  const shiftIsTomorrow = nextShift ? isTomorrow(nextShift.date) : false;

  const ChartTooltip = React.useMemo(() => makeChartTooltip(t('home.areaManager.employeesLabel')), [t]);

  const barData = assignedStores.map((s) => ({ name: s.name, value: s.employeeCount, id: s.id }));
  const totalEmployees = assignedStores.reduce((sum, s) => sum + s.employeeCount, 0);

  const storeColumns: Column<AssignedStore>[] = [
    {
      key: 'logo',
      label: '',
      width: '48',
      render: (row) => renderStoreLogo(row.logoFilename, row.name, 36),
    },
    {
      key: 'name', label: t('home.areaManager.colStore'),
      render: (row) => (
        <span
          style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
          onClick={() => navigate(`/negozi/${toStoreSlug(row)}`)}
        >
          {row.name}
        </span>
      ),
    },
    { key: 'code', label: t('home.areaManager.colCode'), render: (row) => <span style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>{row.code}</span> },
    {
      key: 'storeManager',
      label: t('home.areaManager.colManager', 'Store Manager'),
      render: (row) => <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.storeManager || t('common.not_available', 'N/A')}</span>,
    },
    {
      key: 'employeeCount', label: t('home.areaManager.colEmployees'),
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)', fontSize: '14px' }}>
          {row.employeeCount}
        </span>
      ),
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0, overflow: 'hidden' }}>

      {/* Header banner */}
      <div className="banner-inner" style={{
        background: 'linear-gradient(135deg, #15803D 0%, #166534 100%)',
        borderRadius: 'var(--radius-lg)', padding: '22px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        boxShadow: '0 4px 20px rgba(21,128,61,0.20)',
      }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {t('home.areaManager.title')}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: '13px', margin: 0 }}>
            {t('home.areaManager.storesCount', { count: assignedStores.length })}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="stat-num" style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--font-display)', color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {totalEmployees}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px', fontWeight: 500 }}>
            {t('home.areaManager.totalEmployees')}
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '24px',
        width: '100%',
      }}>
        <StatCard
          label={t('home.areaManager.activeStores')}
          value={stats?.totalStores ?? 0}
          icon={<IconStore />}
          accent="#15803D"
          description={t('home.areaManager.activeStoresDesc')}
        />
        <StatCard
          label={t('home.areaManager.activeEmployees')}
          value={stats?.activeEmployees ?? 0}
          icon={<IconUsers />}
          accent="#0284C7"
          description={t('home.areaManager.activeEmployeesDesc')}
        />
        <StatCard
          label={t('home.areaManager.presentEmployees')}
          value={`${stats?.presentEmployees ?? 0} / ${stats?.activeEmployees ?? 0}`}
          icon={<IconActivity />}
          accent="#C9973A"
          description={t('home.areaManager.presentEmployeesDesc')}
        />
        <StatCard
          label={t('home.areaManager.weeklyHours')}
          value={stats?.weeklyHours ?? 0}
          icon={<IconClock />}
          accent="#7C3AED"
          description={t('home.areaManager.weeklyHoursDesc')}
        />
      </div>

      {/* Activities, Recent Documents and Messages Sections */}
      <Card
        title={t('home.employee.activitiesTitle')}
        actions={
          <button
            onClick={() => navigate('/onboarding')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--accent)',
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: 6,
              fontFamily: 'var(--font-body)',
            }}
          >
            {t('home.employee.activitiesAction')}
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 16px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface-warm)',
            border: '1px solid var(--border-light)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                {t('home.employee.activitiesProgressLabel')}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {t('home.employee.activitiesProgressValue', { completed: completedActivities, total: totalActivities })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('home.employee.activitiesBreakdown', {
                  tasks: onboardingTasks.length,
                  docs: documents.filter((doc) => doc.requiresSignature).length,
                })}
              </div>
            </div>
            <ProgressCircle percentage={activityCompletionPercentage} />
          </div>

          <div
            className="no-scrollbar"
            style={{
              maxHeight: 258,
              overflowY: 'auto',
              paddingRight: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {activitiesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
              </div>
            ) : activityItems.length === 0 ? (
              <div style={{
                minHeight: 160,
                borderRadius: 'var(--radius-lg)',
                border: '1px dashed var(--border)',
                background: 'var(--surface-warm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '20px',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}>
                {t('home.employee.noActivities')}
              </div>
            ) : (
              activityItems.map((item: ActivityItem) => {
                const isTask = item.type === 'task';
                const color = isTask ? '#1d4ed8' : '#b45309';

                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.actionPath)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'var(--surface)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: isTask ? 'rgba(37,99,235,0.12)' : 'rgba(180,83,9,0.12)',
                      color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {isTask ? <ClipboardList size={18} /> : <FileSignature size={18} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <span style={{
                          flexShrink: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 99,
                          background: item.completed ? 'rgba(21,128,61,0.10)' : 'rgba(201,151,58,0.12)',
                          color: item.completed ? '#15803d' : '#b45309',
                        }}>
                          {item.completed ? t('home.employee.activitiesDone') : t('home.employee.activitiesPending')}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>
                        {item.subtitle}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {item.dateLabel}
                      </div>
                    </div>

                    <ChevronRight size={16} color="var(--text-muted)" />
                  </button>
                );
              })
            )}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}>
            <div style={{
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 290,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('home.employee.recentDocumentsTitle')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t('home.employee.recentDocumentsSubtitle')}
                  </div>
                </div>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(37,99,235,0.10)',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FileText size={18} />
                </div>
              </div>

              <div className="no-scrollbar" style={{
                flex: 1,
                maxHeight: 228,
                overflowY: 'auto',
                paddingRight: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {activitiesLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                    <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                  </div>
                ) : recentDocuments.length === 0 ? (
                  <div style={{
                    minHeight: 160,
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border)',
                    background: 'var(--surface-warm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '20px',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}>
                    {t('home.employee.noRecentDocuments')}
                  </div>
                ) : (
                  recentDocuments.map((doc: EmployeeDocument) => (
                    <button
                      key={doc.id}
                      onClick={() => navigate(`/documenti?search=${encodeURIComponent(doc.fileName)}`)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'var(--surface-warm)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        flexShrink: 0,
                        background: doc.requiresSignature ? 'rgba(180,83,9,0.12)' : 'rgba(37,99,235,0.12)',
                        color: doc.requiresSignature ? '#b45309' : '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {doc.requiresSignature ? <FileSignature size={18} /> : <FileText size={18} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                          {doc.fileName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {doc.requiresSignature && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 99,
                              background: doc.signedAt ? 'rgba(21,128,61,0.10)' : 'rgba(220,38,38,0.08)',
                              color: doc.signedAt ? '#15803d' : '#dc2626',
                            }}>
                              {doc.signedAt ? t('home.employee.activityDocumentSigned') : t('home.employee.activityDocumentPending')}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatActivityDate(doc.updatedAt || doc.createdAt, locale)}
                          </span>
                        </div>
                      </div>

                      <ChevronRight size={16} color="var(--text-muted)" />
                    </button>
                  ))
                )}
              </div>
            </div>

            <div style={{
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 290,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('home.employee.messagesTitle')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t('home.employee.messagesSubtitle')}
                  </div>
                </div>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(124,58,237,0.10)',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <MessageSquare size={18} />
                </div>
              </div>

              <div className="no-scrollbar" style={{
                flex: 1,
                maxHeight: 228,
                overflowY: 'auto',
                paddingRight: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {activitiesLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                    <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                  </div>
                ) : recentMessages.length === 0 ? (
                  <div style={{
                    minHeight: 160,
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border)',
                    background: 'var(--surface-warm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '20px',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}>
                    {t('home.employee.noMessages')}
                  </div>
                ) : (
                  recentMessages.map((message: DashboardMessageActivity) => (
                    <button
                      key={message.id}
                      onClick={() => navigate(`/hr-chat?recipientId=${message.senderId}`)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'var(--surface-warm)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <EmployeeAvatar name={message.senderName} avatarFilename={message.senderAvatarFilename} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {message.senderName}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatMessageDateTime(message.createdAt, locale)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                          {message.isImage ? <ImageIcon size={14} color="#7c3aed" /> : <MessageSquare size={14} color="#7c3aed" />}
                          <span style={{ fontSize: 12.5 }}>
                            {message.isImage
                              ? t('home.employee.messageSentImage', { name: message.senderName })
                              : t('home.employee.messageSentText', { name: message.senderName })}
                          </span>
                        </div>
                      </div>

                      <ChevronRight size={16} color="var(--text-muted)" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: '24px',
        minWidth: 0,
        overflow: 'hidden',
      }}>
        {/* Stores list */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '24px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
          minWidth: 0, overflow: 'hidden',
        }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {t('home.areaManager.storesList')}
          </h3>
          {(isMobile || isTablet) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {assignedStores.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '16px',
                    background: 'var(--background)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Logo */}
                    {renderStoreLogo(s.logoFilename, s.name, 44)}
                    
                    {/* Store Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '14.5px',
                          fontWeight: 700,
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-display)',
                        }}
                        onClick={() => navigate(`/negozi/${toStoreSlug(s)}`)}
                      >
                        {s.name}
                      </h4>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {t('home.areaManager.colCode')}: {s.code}
                      </div>
                    </div>
                  </div>
                  
                  {/* Additional info */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '12.5px' }}>
                    <div style={{ flex: '1 0 120px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('home.areaManager.colManager', 'Store Manager')}: </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.storeManager || t('common.not_available', 'N/A')}</span>
                    </div>
                    <div style={{ flex: '1 0 120px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('home.areaManager.colEmployees', 'Employees')}: </span>
                      <span style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'var(--font-display)' }}>{s.employeeCount}</span>
                    </div>
                  </div>
                </div>
              ))}
              {assignedStores.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {t('home.areaManager.noStores')}
                </div>
              )}
            </div>
          ) : (
            <Table<AssignedStore> flush columns={storeColumns} data={assignedStores} emptyText={t('home.areaManager.noStores')} />
          )}
        </div>

        {/* Analytics chart */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: '24px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
          minWidth: 0, overflow: 'hidden',
        }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {t('home.areaManager.staffDistribution')}
          </h3>
          <div style={{ height: 300, overflowX: (isMobile || isTablet) ? 'auto' : 'hidden', width: '100%' }}>
            {assignedStores.length > 0 ? (
              <div style={{ minWidth: (isMobile || isTablet) ? Math.max(400, barData.length * 50) : '100%', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.4 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
                    {barData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {t('home.areaManager.noStores')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pending Reviews Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: '24px',
        minWidth: 0,
        overflow: 'hidden',
      }}>
        {/* Pending Shifts */}
        {(user?.isSuperAdmin || permissions.turni) && (
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
            gridColumn: (user?.isSuperAdmin || permissions.permessi) ? 'span 1' : 'span 2',
            minWidth: 0, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {t('home.areaManager.pendingShifts')}
              </h3>
              {pendingShiftCount > 0 && (
                <span style={{
                  background: 'rgba(201,151,58,0.12)', color: '#C9973A', padding: '3px 10px',
                  borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em',
                }}>
                  {pendingShiftCount} {t('home.areaManager.toReview')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingShiftPreview.slice(0, 3).map((s) => (
                <div key={s.id} style={{
                  padding: '12px 14px', background: 'var(--background)', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: isMobile ? 'flex-start' : 'space-between',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? '10px' : '16px',
                  width: '100%',
                  minWidth: 0,
                }}>
                  {/* User Sub-block */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexShrink: isMobile ? undefined : 0 }}>
                    {renderUserAvatar(s.userAvatarFilename, s.userName, s.userSurname, 36)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.userName} {s.userSurname}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {s.userRole ? t(`roles.${s.userRole}`, s.userRole) : ''}
                      </div>
                    </div>
                  </div>

                  {/* Shift + Store row (on mobile these sit together) */}
                  {isMobile ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.date}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}
                        </div>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--accent)', fontWeight: 600, textAlign: 'right' }}>
                        {s.storeName || '-'}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Shift Sub-block */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '130px', flexShrink: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.date}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {s.startTime.slice(0, 5)} - {s.endTime.slice(0, 5)}
                        </div>
                      </div>

                      {/* Store name Sub-block */}
                      <div style={{ fontSize: '12.5px', color: 'var(--accent)', fontWeight: 600, minWidth: '120px', flexShrink: 0 }}>
                        {s.storeName || '-'}
                      </div>
                    </>
                  )}

                  {/* Button Sub-block */}
                  <div style={{ flexShrink: 0, marginLeft: isMobile ? undefined : 'auto' }}>
                    <button
                      onClick={() => navigate('/turni')}
                      style={{
                        background: 'none', border: '1.5px solid var(--accent)', color: 'var(--accent)',
                        padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                        width: isMobile ? '100%' : undefined,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none';
                        e.currentTarget.style.color = 'var(--accent)';
                      }}
                    >
                      {t('common.view', 'View')}
                    </button>
                  </div>
                </div>
              ))}
              {pendingShiftPreview.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {t('home.areaManager.noPendingShifts')}
                </div>
              )}
              <button
                onClick={() => navigate('/turni')}
                style={{
                  width: '100%', marginTop: '4px', padding: '10px', background: 'none',
                  border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)',
                  color: 'var(--text-muted)', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                {t('home.areaManager.viewAllShifts')}
              </button>
            </div>
          </div>
        )}

        {/* Pending Leaves */}
        {(user?.isSuperAdmin || permissions.permessi) && (
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
            gridColumn: (user?.isSuperAdmin || permissions.turni) ? 'span 1' : 'span 2',
            minWidth: 0, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {t('home.areaManager.pendingLeaves')}
              </h3>
              {pendingLeaveCount > 0 && (
                <span style={{
                  background: 'rgba(2,132,199,0.12)', color: '#0284C7', padding: '3px 10px',
                  borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em',
                }}>
                  {pendingLeaveCount} {t('home.areaManager.toReview')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingLeavePreview.slice(0, 3).map((l) => (
                <div key={l.id} style={{
                  padding: '12px 14px', background: 'var(--background)', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: isMobile ? 'flex-start' : 'space-between',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? '10px' : '16px',
                  width: '100%',
                  minWidth: 0,
                }}>
                  {/* User Sub-block */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexShrink: isMobile ? undefined : 0 }}>
                    {renderUserAvatar(l.userAvatarFilename, l.userName, l.userSurname, 36)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.userName} {l.userSurname}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {l.userRole ? t(`roles.${l.userRole}`, l.userRole) : ''}
                      </div>
                    </div>
                  </div>

                  {/* Leave + Store row */}
                  {isMobile ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                          {t(`leave.type_${l.leaveType}`, l.leaveType)}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {l.startDate} al {l.endDate}
                        </div>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--accent)', fontWeight: 600, textAlign: 'right' }}>
                        {l.storeName || '-'}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Leave Sub-block */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '160px', flexShrink: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                          {t(`leave.type_${l.leaveType}`, l.leaveType)}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {l.startDate} al {l.endDate}
                        </div>
                      </div>

                      {/* Store name Sub-block */}
                      <div style={{ fontSize: '12.5px', color: 'var(--accent)', fontWeight: 600, minWidth: '120px', flexShrink: 0 }}>
                        {l.storeName || '-'}
                      </div>
                    </>
                  )}

                  {/* Button Sub-block */}
                  <div style={{ flexShrink: 0, marginLeft: isMobile ? undefined : 'auto' }}>
                    <button
                      onClick={() => navigate('/permessi')}
                      style={{
                        background: 'none', border: '1.5px solid var(--accent)', color: 'var(--accent)',
                        padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                        width: isMobile ? '100%' : undefined,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none';
                        e.currentTarget.style.color = 'var(--accent)';
                      }}
                    >
                      {t('common.view', 'View')}
                    </button>
                  </div>
                </div>
              ))}
              {pendingLeavePreview.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {t('home.areaManager.noPendingLeaves')}
                </div>
              )}
              <button
                onClick={() => navigate('/permessi')}
                style={{
                  width: '100%', marginTop: '4px', padding: '10px', background: 'none',
                  border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)',
                  color: 'var(--text-muted)', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                {t('home.areaManager.viewAllLeaves')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
