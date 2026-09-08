import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Coffee, RefreshCw, AlertCircle,
  ClipboardList, FileText, FileSignature, ChevronRight, MessageSquare, Image as ImageIcon
} from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui';
import client, { getAvatarUrl } from '../../api/client';
import { EmployeeDocument, getMyDocuments } from '../../api/documents';
import { getMessages } from '../../api/messages';
import { Message } from '../../types';
import { getEmployeeTasks, OnboardingTask } from '../../api/onboarding';

interface StoreInfo {
  id: number;
  name: string;
  code: string;
  maxStaff: number | null;
}

interface TodayAnomaly {
  anomalyType: string;
  severity: 'low' | 'medium' | 'high';
  userName: string;
  userSurname: string;
  userAvatarFilename: string | null;
  detailsKey: string;
  detailsParams: Record<string, string | number>;
}

interface NextShift {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  storeName: string;
}

export interface StoreManagerHomeData {
  store: StoreInfo;
  employeeCount: number;
  todayAnomalies?: TodayAnomaly[];
  todayAttendance?: Record<string, number>;
  upcomingWeekShiftsPlanned?: boolean;
  upcomingWeekNumber?: number;
  nextShift?: NextShift | null;
  stats?: {
    activeEmployees: number;
    presentEmployees: number;
    ongoingOnboarding: number;
    pendingLeaveRequests: number;
  };
}

interface StoreManagerHomeProps {
  data: StoreManagerHomeData;
}

// ── Icons ──────────────────────────────────────────────────────────────────────
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
const IconTrendingUp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
    <polyline points="17 6 23 6 23 12"></polyline>
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

// ── Circular capacity ring ─────────────────────────────────────────────────────
function CapacityRing({ current, max, capacityLabel }: { current: number; max: number | null; capacityLabel: string }) {
  const pct = max && max > 0 ? Math.min(current / max, 1) : 0;
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;

  const color = pct >= 1 ? '#DC2626' : pct >= 0.8 ? '#B45309' : '#15803D';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div style={{ position: 'relative', width: 140, height: 140 }}>
        <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
          {/* Progress */}
          <circle
            cx="70" cy="70" r={r} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.34,1.56,0.64,1), stroke 0.3s' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: '26px', fontWeight: 700, fontFamily: 'var(--font-display)',
            color: color, lineHeight: 1, letterSpacing: '-0.03em',
          }}>{current}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>/ {max ?? '—'}</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '3px 10px', borderRadius: '999px',
          background: `${color}12`, border: `1px solid ${color}25`,
          fontSize: '12px', fontWeight: 600, color,
        }}>
          {Math.round(pct * 100)}% {capacityLabel}
        </div>
      </div>
    </div>
  );
}

// ── Metric row ─────────────────────────────────────────────────────────────────
const MetricRow: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '11px 0', borderBottom: '1px solid var(--border-light)',
  }}>
    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: '14px', fontWeight: 700, color: accent ?? 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{value}</span>
  </div>
);

// Keys must match camelCase-converted response object keys from the API interceptor.
function getEventMeta(t: (key: string) => string): Record<string, { label: string; color: string; bg: string; icon: string }> {
  return {
    checkin:    { label: t('attendance.checkin'),    color: '#15803d', bg: 'rgba(21,128,61,0.10)',  icon: '→' },
    checkout:   { label: t('attendance.checkout'),   color: '#0369a1', bg: 'rgba(3,105,161,0.10)',  icon: '←' },
    breakStart: { label: t('attendance.breakStart'), color: '#b45309', bg: 'rgba(180,83,9,0.10)',   icon: '⏸' },
    breakEnd:   { label: t('attendance.breakEnd'),   color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', icon: '▶' },
  };
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

export const StoreManagerHome: React.FC<StoreManagerHomeProps> = ({ data }) => {
  const { store, employeeCount, todayAnomalies = [], todayAttendance = {}, stats, nextShift } = data;
  const { t, i18n } = useTranslation();
  const { isMobile, isTablet } = useBreakpoint();
  const { permissions, user, targetCompanyId } = useAuth();
  const navigate = useNavigate();
  const EVENT_META = getEventMeta(t);
  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
  const showAttendance = user?.isSuperAdmin || permissions['presenze'] === true;
  const showAnomalies = user?.isSuperAdmin || permissions['anomalie'] === true;
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
        console.error('Error loading daily state for manager:', err);
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
        console.error('Error loading Store Manager dashboard activities:', err);
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

  const available = store.maxStaff ? Math.max(0, store.maxStaff - employeeCount) : null;
  const currentDay = new Date().getDay();
  const isWarningDay = currentDay === 0 || currentDay === 5 || currentDay === 6; // Sunday, Friday, Saturday
  const showUnplannedWarning = isWarningDay && data.upcomingWeekShiftsPlanned === false;

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header banner */}
      <div className="banner-inner" style={{
        background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
        borderRadius: 'var(--radius-lg)', padding: '22px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        boxShadow: '0 4px 20px rgba(124,58,237,0.20)',
      }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {t('home.storeManager.title')}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: '13px', margin: 0 }}>
            {store.name} · {store.code}
          </p>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.20)', borderRadius: '999px',
          fontSize: '12px', fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFFFFF', display: 'inline-block' }}/>
          {t('common.systemActive')}
        </div>
      </div>

      {showUnplannedWarning && (
        <div style={{
          background: 'rgba(220, 38, 38, 0.08)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: '14px',
          color: 'var(--danger)',
        }}>
          <div style={{
            background: 'var(--danger)', color: '#fff', borderRadius: '50%',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>
              {t('home.storeManager.unplannedTitle', 'Weekly Schedule Not Planned')}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--danger)', opacity: 0.9 }}>
              {t('home.storeManager.unplannedMessage', { week: data.upcomingWeekNumber, defaultValue: `You have not planned the shifts for week ${data.upcomingWeekNumber}.` })}
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '24px',
        width: '100%',
      }}>
        <StatCard
          label={t('home.storeManager.activeEmployees')}
          value={stats?.activeEmployees ?? employeeCount}
          icon={<IconUsers />}
          accent="#0284C7"
          description={t('home.storeManager.activeEmployeesDesc')}
        />
        <StatCard
          label={t('home.storeManager.presentEmployees')}
          value={`${stats?.presentEmployees ?? 0} / ${stats?.activeEmployees ?? employeeCount}`}
          icon={<IconActivity />}
          accent="#C9973A"
          description={t('home.storeManager.presentEmployeesDesc')}
        />
        <StatCard
          label={t('home.storeManager.ongoingOnboarding')}
          value={stats?.ongoingOnboarding ?? 0}
          icon={<CheckCircle2 size={20} />}
          accent="#15803D"
          description={t('home.storeManager.ongoingOnboardingDesc')}
        />
        <StatCard
          label={t('home.storeManager.pendingLeaveRequests')}
          value={stats?.pendingLeaveRequests ?? 0}
          icon={<CalendarDays size={20} />}
          accent="#7C3AED"
          description={t('home.storeManager.pendingLeaveRequestsDesc')}
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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>

        {/* Capacity ring card */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {t('home.storeManager.capacityTitle')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{t('home.storeManager.capacityDesc')}</p>
          </div>
          <div style={{ padding: '28px 20px', display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
            <CapacityRing current={employeeCount} max={store.maxStaff} capacityLabel={t('home.storeManager.capacityBadge')} />
          </div>
        </div>

        {/* Store metrics */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {t('home.storeManager.storeInfo')}
            </h3>
          </div>
          <div style={{ padding: '4px 20px 12px' }}>
            <MetricRow label={t('home.storeManager.storeName')} value={store.name} />
            <MetricRow label={t('home.storeManager.storeCode')} value={store.code} />
            <MetricRow label={t('home.storeManager.maxCapacity')} value={store.maxStaff ?? '—'} />
            <MetricRow label={t('home.storeManager.activeEmployees')} value={employeeCount} accent="#15803D" />
            <MetricRow label={t('home.storeManager.availableSlots')} value={available ?? '—'} accent={available === null ? undefined : available > 0 ? '#0284C7' : '#DC2626'} />
          </div>
        </div>
      </div>

      {(showAnomalies || showAttendance) && (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (showAnomalies && showAttendance ? '1fr 1fr' : '1fr'), gap: '16px' }}>

        {/* Today's anomalies */}
        {showAnomalies && (
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
                {t('home.storeManager.todayAnomalies')}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                {new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            {todayAnomalies.length > 0 && (
              <span style={{
                padding: '3px 10px', borderRadius: 20,
                background: 'rgba(220,38,38,0.08)', color: 'var(--danger)',
                fontSize: 12, fontWeight: 700,
              }}>
                {todayAnomalies.length}
              </span>
            )}
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {todayAnomalies.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ marginBottom: 8, opacity: 0.3, display: 'flex', justifyContent: 'center' }}><AlertTriangle size={24} /></div>
                {t('attendance.no_anomalies', 'No anomalies detected')}
              </div>
            ) : (
              todayAnomalies.map((anomaly, idx) => {
                const severityColor = anomaly.severity === 'high' ? 'var(--danger)' : anomaly.severity === 'medium' ? 'var(--warning)' : 'var(--info)';
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    borderBottom: idx < todayAnomalies.length - 1 ? '1px solid var(--border-light)' : 'none',
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: severityColor, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                    }}>
                      {anomaly.userSurname.charAt(0)}{anomaly.userName.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {anomaly.userName} {anomaly.userSurname}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {t(`attendance.anomaly_${anomaly.anomalyType}`)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: severityColor, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        {t(`attendance.severity_${anomaly.severity}`)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* Today's attendance summary */}
        {showAttendance && (
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {t('home.storeManager.todayAttendance')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {t('home.storeManager.attendanceDesc', 'Riepilogo eventi di oggi')}
            </p>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {Object.entries(EVENT_META).map(([key, meta]) => {
              const count = todayAttendance[key] ?? 0;
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: key !== 'breakEnd' ? '1px solid var(--border-light)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: count > 0 ? meta.bg : 'var(--surface-warm)',
                      color: count > 0 ? meta.color : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {meta.icon}
                    </div>
                    <span style={{ fontSize: 13, color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: count > 0 ? 600 : 400 }}>
                      {meta.label}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)',
                    color: count > 0 ? meta.color : 'var(--text-disabled)',
                    lineHeight: 1,
                  }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
      )}
    </div>
  );
};

export default StoreManagerHome;
