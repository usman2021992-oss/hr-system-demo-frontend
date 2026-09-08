import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Coffee, RefreshCw, AlertCircle,
  ClipboardList, FileText, FileSignature, ChevronRight, MessageSquare, Image as ImageIcon
} from 'lucide-react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Table, Card } from '../../components/ui';
import type { Column } from '../../components/ui';
import client, { getAvatarUrl } from '../../api/client';
import { EmployeeDocument, getMyDocuments } from '../../api/documents';
import { getMessages } from '../../api/messages';
import { Message } from '../../types';
import { getEmployeeTasks, OnboardingTask } from '../../api/onboarding';
import { AttendanceEvent, listAttendanceEvents } from '../../api/attendance';
import { ReportHistoryItem, getReportHistory, downloadArchivedReport } from '../../api/reports';

interface ExpiringContract {
  id: number;
  name: string;
  surname: string;
  storeId: number;
  contractEndDate: string;
}

interface NewHire {
  id: number;
  name: string;
  surname: string;
  role: string;
  hireDate: string;
}

interface MonthlyHire {
  month: string; // 'YYYY-MM'
  count: number;
}

interface StatusItem {
  status: string;
  count: number;
}

interface PendingShiftHomeRow {
  id: number;
  userId: number;
  date: string;
  startTime: string;
  endTime: string;
  userName: string;
  userSurname: string;
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
}

export interface HRHomeData {
  expiringContracts: ExpiringContract[];
  newHires: NewHire[];
  totalEmployees: number;
  totalStores: number;
  expiringContractsCount: number;
  monthlyHires?: MonthlyHire[];
  statusBreakdown?: StatusItem[];
  expiringTrainings?: Array<{
    id: number; trainingType: string; endDate: string;
    userId: number; name: string; surname: string;
  }>;
  expiringMedicals?: Array<{
    id: number; endDate: string;
    userId: number; name: string; surname: string;
  }>;
  pendingShiftPreview?: PendingShiftHomeRow[];
  pendingShiftCount?: number;
  pendingLeavePreview?: PendingLeaveHomeRow[];
  pendingLeaveCount?: number;
  nextShift?: any | null;
}

interface HRHomeProps {
  data: HRHomeData;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const EVENT_TYPE_MAP: Record<string, string> = {
  checkin: 'attendance.checkin',
  checkout: 'attendance.checkout',
  break_start: 'attendance.breakStart',
  break_end: 'attendance.breakEnd',
};

const REPORT_NAME_MAP: Record<string, string> = {
  'hr_weekly': 'reports.data.hr_weekly.name',
  'admin_monthly': 'reports.data.admin_monthly.name',
  'admin_weekly': 'reports.data.admin_weekly.name',
  'hr_monthly': 'reports.data.hr_monthly.name',
  'anomaly_daily': 'reports.data.anomaly_daily.name',
};

function formatEventTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

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

function formatActivityDate(dateStr: string | null | undefined, locale: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function getActivityTimestamp(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const time = new Date(dateStr).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatMessageDateTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const AVATAR_COLORS = ['#0284C7', '#15803D', '#7C3AED', '#C9973A', '#0891B2', '#DC2626', '#D97706'];

function avatarColor(name: string): string {
  const safeName = name.trim() || 'U';
  return AVATAR_COLORS[safeName.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

function ProgressCircle({ percentage }: { percentage: number }) {
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
}

const EmployeeAvatar: React.FC<{ name: string; avatarFilename?: string | null }> = ({ name, avatarFilename }) => {
  const color = avatarColor(name);
  const avatarUrl = avatarFilename ? getAvatarUrl(avatarFilename) : null;

  return (
    <div style={{
      width: 42,
      height: 42,
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `${color}18`,
      border: `1px solid ${color}33`,
      color,
      fontWeight: 800,
      fontSize: 15,
      fontFamily: 'var(--font-display)',
    }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials(name)
      )}
    </div>
  );
};

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

function formatDate(dateStr: string, lang: string): string {
  try {
    const locale = lang.startsWith('it') ? 'it-IT' : 'en-GB';
    const d = new Date(dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr);
    return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

// Fill missing months so the chart always has 6 bars
function buildMonthSeries(raw: MonthlyHire[], lang: string): { label: string; value: number }[] {
  const months: { label: string; value: number }[] = [];
  const locale = lang === 'en' ? 'en-GB' : 'it-IT';
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const found = raw.find((r) => r.month === key);
    const label = d.toLocaleDateString(locale, { month: 'short' });
    months.push({ label, value: found?.count ?? 0 });
  }
  return months;
}

const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
);

const IconStore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7l1-4h18l1 4"/>
    <path d="M2 7h20v13a2 2 0 01-2 2H4a2 2 0 01-2-2V7z"/>
    <path d="M10 21V12h4v9"/>
  </svg>
);

const IconCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const IconClipboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
  </svg>
);

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  description?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, accent, description }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: isHovered ? '0 8px 30px rgba(0,0,0,0.08)' : 'var(--shadow-sm)',
        transition: 'all 0.25s ease',
        cursor: 'default',
        transform: isHovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ 
          width: '38px', height: '38px', borderRadius: '10px', 
          background: `${accent}15`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px' }}>
          {label}
        </div>
        {description && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', padding: '8px 12px',
      boxShadow: 'var(--shadow)', fontSize: '12px', fontFamily: 'var(--font-body)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--text-muted)' }}>{payload[0].value} {payload[0].name}</div>
    </div>
  );
};

const SectionCard: React.FC<{ title: string; subtitle: string; badge?: { label: string; color: string }; children: React.ReactNode }> = ({ title, subtitle, badge, children }) => (
  <div style={{
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
  }}>
    <div style={{
      padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px',
    }}>
      <div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{title}</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>
      </div>
      {badge && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '3px 9px', borderRadius: '999px',
          background: `${badge.color}12`, border: `1px solid ${badge.color}25`,
          fontSize: '11px', fontWeight: 600, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, display: 'inline-block' }}/>
          {badge.label}
        </span>
      )}
    </div>
    <div>{children}</div>
  </div>
);

export const HRHome: React.FC<HRHomeProps> = ({ data }) => {
  const {
    expiringContracts, newHires, totalEmployees, totalStores = 0, expiringContractsCount = 0,
    monthlyHires = [], statusBreakdown = [],
    pendingShiftPreview = [], pendingShiftCount = 0, pendingLeavePreview = [], pendingLeaveCount = 0,
    nextShift,
  } = data;
  const { t, i18n } = useTranslation();
  const { isMobile, isTablet } = useBreakpoint();
  const { permissions, user, targetCompanyId } = useAuth();
  const navigate = useNavigate();
  const tRole = (role: string) => (t as (k: string) => string)(`roles.${role}`);

  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
  const showAttendance = user?.isSuperAdmin || permissions['presenze'] === true;
  const showShifts = user?.isSuperAdmin || permissions['turni'] === true;

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
        console.error('Error loading HR dashboard activities:', err);
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

  const [todayAttendance, setTodayAttendance] = useState<AttendanceEvent[]>([]);
  const [todayReports, setTodayReports] = useState<ReportHistoryItem[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadTodayData = async () => {
      try {
        setSectionsLoading(true);
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const [attendanceResult, reportsResult] = await Promise.all([
          listAttendanceEvents({ dateFrom: todayStr, dateTo: todayStr, limit: 100 }),
          getReportHistory(targetCompanyId ?? user?.companyId ?? undefined, { limit: 100 }),
        ]);

        if (!active) return;
        setTodayAttendance(attendanceResult.events ?? []);
        setTodayReports(reportsResult.items ?? []);
      } catch (err) {
        console.error('Error loading today HR dashboard sections:', err);
        if (active) {
          setTodayAttendance([]);
          setTodayReports([]);
        }
      } finally {
        if (active) setSectionsLoading(false);
      }
    };

    void loadTodayData();
    return () => { active = false; };
  }, [targetCompanyId, user?.companyId]);

  const todayReportsFiltered = useMemo(() => {
    return todayReports.filter((r) => {
      if (!r.generatedAt) return false;
      const genDate = new Date(r.generatedAt);
      const today = new Date();
      return (
        genDate.getFullYear() === today.getFullYear() &&
        genDate.getMonth() === today.getMonth() &&
        genDate.getDate() === today.getDate()
      );
    });
  }, [todayReports]);

  const handleDownloadReport = async (report: ReportHistoryItem) => {
    try {
      const blob = await downloadArchivedReport(report.id, targetCompanyId ?? user?.companyId ?? undefined);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${report.reportId}-${report.targetDate.slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report:', err);
    }
  };

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
  }, [documents, locale, onboardingTasks, t]);

  const signatureDocuments = useMemo(
    () => documents.filter((doc) => doc.requiresSignature),
    [documents],
  );

  const completedActivities = activityItems.filter((item) => item.completed).length;
  const totalActivities = activityItems.length;
  const activityCompletionPercentage = totalActivities === 0 ? 0 : Math.round((completedActivities / totalActivities) * 100);

  const recentDocuments = useMemo(
    () => [...documents].sort((a, b) => getActivityTimestamp(b.updatedAt || b.createdAt) - getActivityTimestamp(a.updatedAt || a.createdAt)),
    [documents],
  );

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
        console.error('Error loading daily state for HR:', err);
      } finally {
        if (active) setStateLoading(false);
      }
    };
    void loadState();
    return () => { active = false; };
  }, []);

  const shiftMeta = nextShift ? (SHIFT_STATUS_META[nextShift.status] ?? SHIFT_STATUS_META.scheduled) : null;
  const shiftIsToday = nextShift ? isToday(nextShift.date) : false;
  const shiftIsTomorrow = nextShift ? isTomorrow(nextShift.date) : false;

  const monthSeries = buildMonthSeries(monthlyHires, i18n.language);

  const statusPieData = statusBreakdown.map((s) => ({
    name: s.status === 'active' ? t('employees.statusActive') : t('employees.statusInactive'),
    value: s.count,
    color: s.status === 'active' ? '#15803D' : '#DC2626',
  }));

  const contractColumns: Column<ExpiringContract>[] = [
    { key: 'name', label: t('home.hr.colEmployee'), render: (row) => <span style={{ fontWeight: 500 }}>{row.name} {row.surname}</span> },
    {
      key: 'contractEndDate', label: t('home.hr.colEndDate'), align: 'right',
      render: (row) => <span style={{ color: 'var(--warning)', fontWeight: 600, fontSize: '12.5px' }}>{formatDate(row.contractEndDate, i18n.language)}</span>,
    },
  ];

  const hireColumns: Column<NewHire>[] = [
    { key: 'name', label: t('home.hr.colEmployee'), render: (row) => <span style={{ fontWeight: 500 }}>{row.name} {row.surname}</span> },
    { key: 'role', label: t('common.role'), render: (row) => <span style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>{tRole(row.role) ?? row.role}</span> },
    {
      key: 'hireDate', label: t('home.hr.colHireDate'), align: 'right',
      render: (row) => <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '12.5px' }}>{formatDate(row.hireDate, i18n.language)}</span>,
    },
  ];

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header Banner */}
      <div className="banner-inner" style={{
        background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
        borderRadius: 'var(--radius-lg)', padding: '24px 32px',
        boxShadow: '0 4px 20px rgba(2,132,199,0.15)',
      }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          {t('home.hr.title')}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '14px', margin: 0, fontWeight: 500 }}>
          {t('home.hr.subtitle')} · {new Date().toLocaleDateString(i18n.language.startsWith('it') ? 'it-IT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Metric boxes row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? '1fr 1fr' : `repeat(${(user?.isSuperAdmin || permissions.permessi) ? 4 : 3}, 1fr)`, 
        gap: '16px' 
      }}>
        <StatCard 
          label={t('home.hr.totalEmployees')}
          value={totalEmployees}
          icon={<IconUsers />}
          accent="#0284C7"
        />
        <StatCard 
          label={t('home.hr.expiringContracts')}
          value={expiringContractsCount}
          icon={<IconCalendar />}
          accent="#B45309"
          description={t('home.hr.expiringContractsDesc')}
        />
        <StatCard 
          label={t('home.admin.activeStores')}
          value={totalStores}
          icon={<IconStore />}
          accent="#15803D"
        />
        {(user?.isSuperAdmin || permissions.permessi) && (
          <StatCard 
            label={t('home.hr.pendingLeaveTitle')}
            value={pendingLeaveCount}
            icon={<IconClipboard />}
            accent="#7C3AED"
          />
        )}
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
                  docs: signatureDocuments.length,
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
              activityItems.map((item) => {
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
                  recentDocuments.map((doc) => (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 99,
                            background: doc.requiresSignature ? 'rgba(201,151,58,0.12)' : 'rgba(21,128,61,0.10)',
                            color: doc.requiresSignature ? '#b45309' : '#15803d',
                          }}>
                            {doc.requiresSignature
                              ? t('home.employee.documentNeedsSignature')
                              : t('home.employee.documentNoSignature')}
                          </span>
                          {doc.requiresSignature && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 99,
                              background: doc.signedAt ? 'rgba(21,128,61,0.10)' : 'rgba(220,38,38,0.08)',
                              color: doc.signedAt ? '#15803d' : '#dc2626',
                            }}>
                              {doc.signedAt ? t('home.employee.activitiesDone') : t('home.employee.activitiesPending')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatActivityDate(doc.updatedAt || doc.createdAt, locale)}
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
                  recentMessages.map((message) => (
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

      {/* Attendance and Reports sections side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {/* Attendance Section */}
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
                {t('nav.presenze', 'Attendance')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {t('home.hr.todayAttendanceSubtitle', "Today's events")}
              </div>
            </div>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(21,128,61,0.10)',
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <CheckCircle2 size={18} />
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
            {sectionsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
              </div>
            ) : todayAttendance.length === 0 ? (
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
                {t('home.hr.noTodayAttendance', 'No attendance recorded today.')}
              </div>
            ) : (
              todayAttendance.map((event) => (
                <div
                  key={event.id}
                  style={{
                    background: 'var(--surface-warm)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <EmployeeAvatar name={`${event.userName} ${event.userSurname}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.userName} {event.userSurname}
                      </div>
                      <span style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background:
                          event.eventType === 'checkin'
                                ? 'rgba(21,128,61,0.10)'
                                : event.eventType === 'checkout'
                                ? 'rgba(220,38,38,0.08)'
                                : event.eventType === 'break_start'
                                ? 'rgba(201,151,58,0.12)'
                                : 'rgba(37,99,235,0.12)',
                        color:
                          event.eventType === 'checkin'
                                ? '#15803d'
                                : event.eventType === 'checkout'
                                ? '#dc2626'
                                : event.eventType === 'break_start'
                                ? '#b45309'
                                : '#1d4ed8',
                      }}>
                        {t(EVENT_TYPE_MAP[event.eventType] || event.eventType)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {formatEventTime(event.eventTime)}
                      </div>
                      {event.storeName && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {event.storeName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reports Section */}
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
                {t('reports.archive.title', 'Recent report archive')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {t('home.hr.todayReportsSubtitle', 'Reports generated today')}
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
            {sectionsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160 }}>
                <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
              </div>
            ) : todayReportsFiltered.length === 0 ? (
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
                {t('home.hr.noTodayReports', 'No reports generated today.')}
              </div>
            ) : (
              todayReportsFiltered.map((report) => (
                <button
                  key={report.id}
                  onClick={() => handleDownloadReport(report)}
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
                    background: 'rgba(37,99,235,0.12)',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <FileText size={18} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                      {t(REPORT_NAME_MAP[report.reportId] || report.reportId)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 99,
                        background: 'rgba(21,128,61,0.10)',
                        color: '#15803d',
                      }}>
                        {(report.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {formatEventTime(report.generatedAt)}
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



      {/* Approvals (Shifts only now, or keep both? I'll keep shifts as a main card since it has preview) */}
      {(user?.isSuperAdmin || permissions.turni) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          <div
            onClick={() => navigate('/turni')}
            className="card-lift"
            style={{
              background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
              padding: '18px 20px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
              borderTop: '3px solid #1E4A7A',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {t('home.hr.pendingShiftsTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('home.hr.pendingShiftsSubtitle')}</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--primary)', lineHeight: 1 }}>{pendingShiftCount}</div>
            {pendingShiftPreview.slice(0, 3).map((row) => (
              <div key={row.id} style={{ fontSize: 12, marginTop: 8, color: 'var(--text-secondary)' }}>
                {row.userName} {row.userSurname} · {formatDate(row.date, i18n.language)} · {String(row.startTime).slice(0, 5)}
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{t('home.hr.viewShifts')} →</div>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '16px', alignItems: 'stretch' }}>

        {/* Monthly hires bar chart */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {t('home.hr.monthlyHires')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{t('home.hr.monthlyHiresDesc')}</p>
          </div>
          <div style={{ padding: '20px 20px 12px' }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthSeries} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(201,151,58,0.06)' }} />
                <Bar dataKey="value" name={t('home.hr.hiresLabel')} fill="#C9973A" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active vs inactive donut */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {t('home.hr.employeeStatus')}
            </h3>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={36} outerRadius={54} paddingAngle={3} dataKey="value" strokeWidth={0}>
                    {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
              {statusPieData.map((entry) => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{entry.name}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: entry.color, fontFamily: 'var(--font-display)' }}>{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tables row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
        <SectionCard
          title={t('home.hr.expiringContracts')}
          subtitle={t('home.hr.expiringContractsDesc')}
          badge={expiringContracts.length > 0 ? { label: t('home.hr.expiringBadge', { count: expiringContracts.length }), color: '#B45309' } : undefined}
        >
          <Table<ExpiringContract> flush minWidth="0" columns={contractColumns} data={expiringContracts} emptyText={t('home.hr.noExpiringContracts')} />
        </SectionCard>
        <SectionCard
          title={t('home.hr.newHires')}
          subtitle={t('home.hr.newHiresDesc')}
          badge={newHires.length > 0 ? { label: t('home.hr.newHiresBadge', { count: newHires.length }), color: '#15803D' } : undefined}
        >
          <Table<NewHire> flush minWidth="0" columns={hireColumns} data={newHires} emptyText={t('home.hr.noNewHires')} />
        </SectionCard>
      </div>

      {/* Expiring Trainings */}
      {(data.expiringTrainings?.length ?? 0) > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-light)', background: 'rgba(234,88,12,0.05)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#ea580c', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('home.hr.expiringTrainings')}
            </h3>
          </div>
          <div>
            {data.expiringTrainings!.map((tr) => {
              const daysLeft = Math.ceil((new Date(tr.endDate).getTime() - Date.now()) / 86400000);
              return (
                <div key={tr.id}
                  onClick={() => navigate(`/dipendenti/${tr.userId}`)}
                  style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{tr.name} {tr.surname}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{t(`employees.trainingType_${tr.trainingType}`)}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: daysLeft <= 14 ? '#dc2626' : '#ea580c', background: daysLeft <= 14 ? 'rgba(220,38,38,0.1)' : 'rgba(234,88,12,0.1)', padding: '2px 8px', borderRadius: 20 }}>
                    {daysLeft > 0 ? `${daysLeft} ${t('leave.days_label')}` : 'Oggi'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expiring Medical Checks */}
      {(data.expiringMedicals?.length ?? 0) > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-light)', background: 'rgba(124,58,237,0.05)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#7c3aed', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('home.hr.expiringMedicals')}
            </h3>
          </div>
          <div>
            {data.expiringMedicals!.map((m) => {
              const daysLeft = Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 86400000);
              return (
                <div key={m.id}
                  onClick={() => navigate(`/dipendenti/${m.userId}`)}
                  style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{m.name} {m.surname}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: daysLeft <= 14 ? '#dc2626' : '#7c3aed', background: daysLeft <= 14 ? 'rgba(220,38,38,0.1)' : 'rgba(124,58,237,0.1)', padding: '2px 8px', borderRadius: 20 }}>
                    {daysLeft > 0 ? `${daysLeft} ${t('leave.days_label')}` : 'Oggi'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HRHome;
