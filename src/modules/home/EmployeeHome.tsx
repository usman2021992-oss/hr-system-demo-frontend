import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Cake, PartyPopper, CalendarDays, Palmtree, Thermometer, CheckCircle2, Coffee, AlertCircle, RefreshCw, ClipboardList, FileText, FileSignature, ChevronRight, MessageSquare, Image as ImageIcon } from 'lucide-react';
import { Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import client, { getAvatarUrl } from '../../api/client';
import { EmployeeDocument, getMyDocuments } from '../../api/documents';
import { getMessages } from '../../api/messages';
import { Message } from '../../types';
import { getEmployeeTasks, OnboardingTask } from '../../api/onboarding';

interface EmployeeProfile {
  id: number;
  name: string;
  surname: string;
  role: string;
  department: string | null;
  storeName: string | null;
}

interface NextShift {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  storeName: string;
}

interface LeaveBalance {
  leaveType: 'vacation' | 'sick';
  totalDays: number;
  usedDays: number;
  remaining: number;
}

export interface EmployeeHomeData {
  profile: EmployeeProfile;
  nextShift?: NextShift | null;
  leaveBalance?: LeaveBalance[];
  isBirthday?: boolean;
  showLeaveBalance?: boolean;
  showShifts?: boolean;
}

interface EmployeeHomeProps {
  data: EmployeeHomeData;
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

// ── Next shift status colors ───────────────────────────────────────────────
const STATUS_META: Record<string, { bg: string; color: string; labelKey: string }> = {
  confirmed:  { bg: 'rgba(21,128,61,0.10)',  color: '#15803d', labelKey: 'shifts.status.confirmed' },
  scheduled:  { bg: 'rgba(13,33,55,0.08)',   color: '#1e4a7a', labelKey: 'shifts.status.scheduled' },
  cancelled:  { bg: 'rgba(220,38,38,0.08)',  color: '#dc2626', labelKey: 'shifts.status.cancelled' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatShiftDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
}

function isTomorrow(dateStr: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
}

function fmt(t: string): string {
  return t ? t.slice(0, 5) : '';
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

// ── Leave balance progress bar ─────────────────────────────────────────────
function BalanceBar({ balance, locale }: { balance: LeaveBalance; locale: string }) {
  const { t } = useTranslation();
  const pct = balance.totalDays > 0 ? Math.min(1, balance.usedDays / balance.totalDays) : 0;
  const isVacation = balance.leaveType === 'vacation';
  const color = isVacation ? '#2563eb' : '#ea580c';
  const bgColor = isVacation ? 'rgba(37,99,235,0.10)' : 'rgba(234,88,12,0.10)';
  const trackColor = isVacation ? 'rgba(37,99,235,0.15)' : 'rgba(234,88,12,0.15)';

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isVacation ? <Palmtree size={14} strokeWidth={2} /> : <Thermometer size={14} strokeWidth={2} />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t(`leave.type_${balance.leaveType}`)}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', color, lineHeight: 1 }}>
            {balance.remaining}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>
            / {balance.totalDays} {t('leave.days_label', 'gg')}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 99, background: trackColor, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${pct * 100}%`,
          background: color,
          transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {t('leave.balance_used_of', { used: balance.usedDays, total: balance.totalDays })}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color, opacity: 0.85 }}>
          {balance.remaining} {t('leave.balance_remaining', 'rimanenti')}
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
const EmployeeAvatar: React.FC<{ name: string; avatarFilename?: string | null }> = ({ name, avatarFilename }) => {
  const color = avatarColor(name);
  const avatarUrl = getAvatarUrl(avatarFilename);

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

export const EmployeeHome: React.FC<EmployeeHomeProps> = ({ data }) => {
  // Defensive check: if data is null, render a loading state.
  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
        <div className="animate-spin" style={{ width: 30, height: 30, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
      </div>
    );
  }

  const { permissions, user, targetCompanyId } = useAuth();
  const { profile, nextShift, leaveBalance = [], isBirthday = false, showLeaveBalance, showShifts } = data;
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';

  const [dailyState, setDailyState] = useState<any>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [showRegWarning, setShowRegWarning] = useState(true);
  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadState = async () => {
      try {
        setStateLoading(true);
        const res = await client.get('/attendance/daily-state');
        if (active) {
          setDailyState(res.data?.data ?? res.data);
        }
      } catch (err) {
        console.error('Error loading daily state in dashboard:', err);
      } finally {
        if (active) setStateLoading(false);
      }
    };
    if (profile) {
      void loadState();
    }
    return () => { active = false; };
  }, [profile]);

  useEffect(() => {
    let active = true;

    const loadActivities = async () => {
      if (!profile?.id) {
        if (active) setActivitiesLoading(false);
        return;
      }

      try {
        setActivitiesLoading(true);
        const [tasksResult, docsResult, messagesResult] = await Promise.all([
          permissions.onboarding === true ? getEmployeeTasks(profile.id) : Promise.resolve({ tasks: [] } as { tasks: OnboardingTask[] }),
          permissions.documenti === true ? getMyDocuments() : Promise.resolve([] as EmployeeDocument[]),
          permissions.messaggi === true ? getMessages(targetCompanyId ?? user?.companyId ?? undefined) : Promise.resolve([] as Message[]),
        ]);

        if (!active) return;
        setOnboardingTasks(tasksResult.tasks ?? []);
        setDocuments(docsResult ?? []);
        setMessages(messagesResult ?? []);
      } catch (err) {
        console.error('Error loading employee dashboard activities:', err);
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
  }, [permissions.documenti, permissions.messaggi, permissions.onboarding, profile?.id, targetCompanyId, user?.companyId]);

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

  const tRole = (role: string) => (t as (k: string) => string)(`roles.${role}`);

  const shiftMeta = nextShift ? (STATUS_META[nextShift.status] ?? STATUS_META.scheduled) : null;
  const shiftIsToday = nextShift ? isToday(nextShift.date) : false;
  const shiftIsTomorrow = nextShift ? isTomorrow(nextShift.date) : false;
  // Further safety for profile
  if (!profile) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        {t('home.employee.loadingProfile', 'Caricamento profilo...')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Birthday banner */}
      {isBirthday && profile && (
        <div style={{
          background: 'linear-gradient(135deg, var(--accent) 0%, #B8831E 100%)',
          borderRadius: 'var(--radius-lg)', padding: '18px 24px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 4px 20px rgba(201,151,58,0.35)',
          animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        }}>
          <div style={{ flexShrink: 0, color: 'rgba(255,255,255,0.9)' }}><Cake size={32} strokeWidth={1.5} /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: '-0.01em' }}>
              {t('home.employee.birthdayTitle', { name: profile.name, defaultValue: `Buon compleanno, ${profile.name}!` })}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('home.employee.birthdaySubtitle', 'Ti auguriamo una splendida giornata!')}
              <PartyPopper size={14} strokeWidth={2} />
            </div>
          </div>
        </div>
      )}



      {/* Profile card */}
      {profile && (
        <Card title={t('home.employee.profileCard')}>
          <div>
            {[
              [t('home.employee.firstName'), profile.name],
              [t('home.employee.lastName'), profile.surname],
            ].map(([label, value], i, arr) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                borderTop: i === 0 ? '1px solid var(--border)' : 'none',
                fontSize: 14,
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

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

      {/* Next shift */}
      {showShifts !== false && permissions.turni === true && (
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>
              {t('home.employee.nextShift')}
            </h3>
          </div>
          <button
            onClick={() => navigate('/turni')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--accent)', fontWeight: 600,
              padding: '4px 8px', borderRadius: 6,
              fontFamily: 'var(--font-body)',
            }}
          >
            {t('common.viewAll', 'Vedi tutti →')}
          </button>
        </div>

        {nextShift ? (
          <div style={{ padding: '20px' }}>
            {/* Date badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                background: shiftIsToday ? 'var(--accent)' : 'var(--primary)',
                color: '#fff', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                  {new Date(nextShift.date + 'T12:00:00').getDate()}
                </span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {new Date(nextShift.date + 'T12:00:00').toLocaleDateString(locale, { month: 'short' })}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  {shiftIsToday
                    ? t('common.today', 'Oggi')
                    : shiftIsTomorrow
                      ? t('common.tomorrow', 'Domani')
                      : formatShiftDate(nextShift.date, locale)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {nextShift.storeName}
                </div>
              </div>
              {shiftMeta && (
                <div style={{
                  marginLeft: 'auto',
                  padding: '4px 10px', borderRadius: 20,
                  background: shiftMeta.bg, color: shiftMeta.color,
                  fontSize: 11, fontWeight: 700,
                }}>
                  {t(shiftMeta.labelKey)}
                </div>
              )}
            </div>
            {/* Time block */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 16px', borderRadius: 10,
              background: 'var(--surface-warm)', border: '1px solid var(--border-light)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {fmt(nextShift.startTime)} – {fmt(nextShift.endTime)}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: 10, opacity: 0.25, display: 'flex', justifyContent: 'center' }}><CalendarDays size={28} /></div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t('home.employee.noNextShift', 'Nessun turno programmato')}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Attendance & Tracking Card */}
      {permissions.presenze === true && (
        <Card 
          title={t('nav.presenze', 'Rilevazione Presenze')}
          actions={
            <button
              onClick={() => navigate('/presenze/checkin')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: 'var(--accent)',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: 6,
                fontFamily: 'var(--font-body)',
              }}
            >
              {t('common.viewAll', 'Vedi tutti →')}
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Status Display */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 20px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-warm)',
              border: '1px solid var(--border-light)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
              width: '100%'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: stateLoading 
                    ? 'rgba(100, 116, 139, 0.1)' 
                    : dailyState?.state?.checkedOut 
                    ? 'rgba(22, 163, 74, 0.1)' 
                    : dailyState?.state?.breakStarted && !dailyState?.state?.breakEnded
                    ? 'rgba(217, 119, 6, 0.1)'
                    : dailyState?.state?.checkedIn
                    ? 'rgba(37, 99, 235, 0.1)'
                    : !dailyState?.hasShift
                    ? 'rgba(37, 99, 235, 0.1)'
                    : 'rgba(100, 116, 139, 0.1)',
                  color: stateLoading
                    ? 'var(--text-muted)'
                    : dailyState?.state?.checkedOut
                    ? '#16a34a'
                    : dailyState?.state?.breakStarted && !dailyState?.state?.breakEnded
                    ? '#d97706'
                    : dailyState?.state?.checkedIn
                    ? '#2563eb'
                    : !dailyState?.hasShift
                    ? '#2563eb'
                    : 'var(--text-muted)',
                  flexShrink: 0
                }}>
                  {stateLoading ? <RefreshCw className="animate-spin" size={20} />
                    : dailyState?.state?.checkedOut ? <CheckCircle2 size={20} />
                    : dailyState?.state?.breakStarted && !dailyState?.state?.breakEnded ? <Coffee size={20} />
                    : dailyState?.state?.checkedIn ? <CheckCircle2 size={20} />
                    : !dailyState?.hasShift ? <CalendarDays size={20} />
                    : <AlertCircle size={20} />}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('attendance.status')}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {stateLoading 
                      ? t('attendance.stateLoading') 
                      : dailyState?.state?.checkedOut 
                      ? t('attendance.finishedService') 
                      : dailyState?.state?.breakStarted && !dailyState?.state?.breakEnded
                      ? t('attendance.onBreak')
                      : dailyState?.state?.checkedIn
                      ? t('attendance.inService')
                      : !dailyState?.hasShift
                      ? t('attendance.notAssigned')
                      : t('attendance.notCheckedIn')}
                  </div>
                  
                  {/* Shift/Permit Summary (Under Heading) */}
                  {!stateLoading && dailyState && (
                    <div style={{ fontSize: '12.5px', marginTop: '2px', fontWeight: 600 }}>
                      {!dailyState.hasShift ? (
                        <span style={{ color: '#2563eb' }}>{t('attendance.noShiftToday')}</span>
                      ) : dailyState.hasLeave ? (
                        <span style={{ color: '#d97706' }}>{t('attendance.leaveToday')}</span>
                      ) : (
                        <span style={{ color: '#16a34a' }}>{t('attendance.hasShiftToday')}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Device Registration Warning Banner */}
            {user?.requiresDeviceRegistration && showRegWarning && (
              <div style={{
                position: 'relative',
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1.5px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
                marginTop: '4px',
                animation: 'fadeIn 0.2s ease'
              }}>
                {/* Dismiss button (top-right) */}
                <button
                  onClick={() => setShowRegWarning(false)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '18px',
                    lineHeight: 1,
                    padding: '4px'
                  }}
                >
                  ×
                </button>

                {/* Icon */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>

                {/* Text & Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, paddingRight: '20px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('deviceRegistration.notRegisteredTitle', 'Dispositivo Non Registrato')}
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {t('deviceRegistration.notRegisteredDesc', 'Questo dispositivo non è registrato. Non potrai timbrare le tue presenze finché non lo registri.')}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/device/register')}
                    className="btn btn-primary"
                    style={{
                      alignSelf: 'flex-start',
                      height: '32px',
                      padding: '0 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {t('deviceRegistration.button', 'Registra Dispositivo')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Leave balance */}
      {showLeaveBalance !== false && (
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
            {t('home.employee.leaveBalance')}
          </h3>
          <button
            onClick={() => navigate('/permessi')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--accent)', fontWeight: 600,
              padding: '4px 8px', borderRadius: 6,
              fontFamily: 'var(--font-body)',
            }}
          >
            {t('common.viewAll', 'Vedi tutti →')}
          </button>
        </div>
        <div style={{ padding: '20px 20px 4px' }}>
          {leaveBalance.length > 0 ? (
            leaveBalance.map((b) => (
              <BalanceBar key={b.leaveType} balance={b} locale={locale} />
            ))
          ) : (
            <div style={{ paddingBottom: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {t('leave.no_balance', 'Nessun saldo disponibile')}
            </div>
          )}
        </div>
      </div>
      )}

    </div>
  );
};

export default EmployeeHome;
