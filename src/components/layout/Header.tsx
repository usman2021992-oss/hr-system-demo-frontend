import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Briefcase, CalendarClock, ExternalLink, FileText, GraduationCap, LogOut, Settings, ShieldAlert, UserCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { UserRole } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { getAvatarUrl } from '../../api/client';
import { getCompanyById } from '../../api/companies';
import { GlobalSearch } from './GlobalSearch';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  Notification,
} from '../../api/notifications';
import { getNotificationNavigationUrl } from '../../utils/notificationNavigation';

interface HeaderProps {
  onToggleSidebar: () => void;
  title: string;
}

const ROLE_COLORS: Record<UserRole, { bg: string; color: string }> = {
  admin:          { bg: 'rgba(201,151,58,0.10)',  color: '#C9973A' },
  hr:             { bg: 'rgba(2,132,199,0.10)',   color: '#0284C7' },
  area_manager:   { bg: 'rgba(21,128,61,0.10)',   color: '#15803D' },
  store_manager:  { bg: 'rgba(124,58,237,0.10)',  color: '#7C3AED' },
  employee:       { bg: 'rgba(107,114,128,0.10)', color: '#6B7280' },
  store_terminal: { bg: 'rgba(107,114,128,0.10)', color: '#6B7280' },
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#DC2626',
  high:   '#EA580C',
  medium: '#C9973A',
  low:    '#6B7280',
};

const TYPE_VISUALS: Array<{ startsWith: string; icon: LucideIcon; color: string; bg: string }> = [
  { startsWith: 'shift.', icon: CalendarClock, color: '#1D4ED8', bg: 'rgba(29,78,216,0.11)' },
  { startsWith: 'leave.', icon: UserCircle2, color: '#B45309', bg: 'rgba(180,83,9,0.13)' },
  { startsWith: 'attendance.', icon: AlertTriangle, color: '#B91C1C', bg: 'rgba(185,28,28,0.12)' },
  { startsWith: 'document.', icon: FileText, color: '#0F766E', bg: 'rgba(15,118,110,0.12)' },
  { startsWith: 'ats.', icon: Briefcase, color: '#7C3AED', bg: 'rgba(124,58,237,0.13)' },
  { startsWith: 'onboarding.', icon: GraduationCap, color: '#0D9488', bg: 'rgba(13,148,136,0.13)' },
  { startsWith: 'manager.', icon: ShieldAlert, color: '#334155', bg: 'rgba(51,65,85,0.13)' },
];

function typeVisual(type: string): { icon: LucideIcon; color: string; bg: string } {
  const matched = TYPE_VISUALS.find((item) => type.startsWith(item.startsWith));
  return matched ?? { icon: UserCircle2, color: '#0D2137', bg: 'rgba(13,33,55,0.10)' };
}

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="3" y1="7" x2="21" y2="7"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="17" x2="14" y2="17"/>
  </svg>
);

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 01-3.46 0"/>
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timeAgo(iso: string, t: (k: string, opts?: any) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.justNow');
  if (mins < 60) return t('notifications.minsAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('notifications.hoursAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  return t('notifications.daysAgo', { count: days });
}

/** Convert a dot-notation event type (e.g. 'leave.approved') to its i18n key. */
function typeLabel(type: string, t: (k: string) => string): string {
  const key = 'notifications.type_' + type.replace(/\./g, '_');
  const label = t(key);
  // If i18next couldn't find the key it returns the key itself — fall back gracefully
  return label === key ? type : label;
}

function notificationTitle(n: Notification, t: (k: string) => string): string {
  const key = `notifications.${n.type.replace(/\./g, '_')}_title`;
  const translated = t(key);
  return translated === key ? n.title : translated;
}

function notificationMessage(n: Notification, t: (k: string) => string): string {
  const key = `notifications.${n.type.replace(/\./g, '_')}_message`;
  const translated = t(key);
  return translated === key ? n.message : translated;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, title }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const { socket } = useSocket();

  const [profileOpen, setProfileOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');

  const profileRef = useRef<HTMLDivElement | null>(null);

  const companyLabel = companyName || (user?.companyId != null ? `${t('companies.companyId', 'Company')} #${user.companyId}` : '');

  useEffect(() => {
    if (!user?.companyId) {
      setCompanyName('');
      return;
    }

    let mounted = true;
    getCompanyById(user.companyId)
      .then((company) => {
        if (!mounted) return;
        setCompanyName(company.name ?? '');
      })
      .catch(() => {
        if (!mounted) return;
        setCompanyName('');
      });

    return () => {
      mounted = false;
    };
  }, [user?.companyId]);

  useEffect(() => {
    if (!profileOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileOpen && !profileRef.current?.contains(target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [profileOpen]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropOpen, setDropOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Fetch on mount and listen to real-time notification events via Socket.io
  useEffect(() => {
    if (!user || user.role === 'store_terminal') return;
    const load = () => {
      getNotifications({ limit: 20 })
        .then((page) => {
          setNotifications(page.notifications);
          setUnreadCount(page.unreadCount);
        })
        .catch(() => {});
    };

    load();

    if (socket) {
      const handleNotification = (data: { userId: number }) => {
        if (data.userId === user.id) {
          load();
        }
      };
      socket.on('NOTIFICATION_CREATED', handleNotification);
      return () => {
        socket.off('NOTIFICATION_CREATED', handleNotification);
      };
    }
  }, [user?.id, socket]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const handleViewNotification = async (notification: Notification, navigationUrl: string) => {
    if (!notification.isRead) {
      await handleMarkRead(notification.id);
    }
    setDropOpen(false);
    navigate(navigationUrl);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ } finally {
      setMarkingAll(false);
    }
  };

  const roleStyle = user ? ROLE_COLORS[user.role] : { bg: 'transparent', color: 'var(--text-muted)' };
  const fullName = user ? (user.surname ? `${user.name} ${user.surname}` : user.name) : '';
  const initials = user
    ? `${user.name.charAt(0)}${user.surname ? user.surname.charAt(0) : ''}`.toUpperCase()
    : '';
  const roleLabel = user ? (user.isSuperAdmin ? t('roles.super_admin') : t(`roles.${user.role}`)) : '';
  const canOpenSettings = user?.role === 'admin';

  return (
    <>
    <header style={{
      minHeight: 'var(--header-height)',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: isMobile
        ? 'max(4px, env(safe-area-inset-top, 0px)) 16px 0 16px'
        : '0 24px',
      gap: '12px',
      flexShrink: 0,
      boxShadow: '0 1px 0 var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>

      {/* Menu toggle */}
      <button
        onClick={onToggleSidebar}
        aria-label="Apri/chiudi menu"
        style={{
          background: 'none', border: 'none', padding: '6px',
          borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', cursor: 'pointer',
          flexShrink: 0, transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--background)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'none';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
        }}
      >
        <MenuIcon />
      </button>

      <div role="heading" aria-level={2} className="header-title" style={{
        fontSize: '16px',
        fontWeight: 600,
        fontFamily: 'var(--font-display)',
        color: 'var(--text-primary)',
        margin: 0,
        letterSpacing: '-0.01em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginRight: '12px',
      }}>{title}</div>


      <GlobalSearch />
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span className="hide-mobile">
          <LanguageSwitcher variant="pill" />
        </span>
        {user && user.role !== 'store_terminal' && (
          <div ref={dropRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setDropOpen((v) => !v)}
              aria-label={t('notifications.bell')}
              style={{
                background: dropOpen ? 'var(--background)' : 'none',
                border: 'none',
                padding: '7px 8px',
                borderRadius: 'var(--radius-sm)',
                color: dropOpen ? 'var(--text-primary)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!dropOpen) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--background)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!dropOpen) {
                  (e.currentTarget as HTMLElement).style.background = 'none';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  background: '#DC2626',
                  color: '#fff',
                  borderRadius: 99,
                  minWidth: 16,
                  height: 16,
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  fontFamily: 'var(--font-display)',
                  boxShadow: '0 0 0 2px var(--surface)',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {dropOpen && (
              <div style={{
                position: isMobile ? 'fixed' : 'absolute',
                top: isMobile ? 'calc(var(--header-height) + 6px)' : 'calc(100% + 6px)',
                right: isMobile ? 12 : 0,
                left: isMobile ? 12 : 'auto',
                width: isMobile ? 'auto' : 340,
                maxWidth: isMobile ? 'none' : 'calc(100vw - 24px)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                zIndex: 50,
                animation: 'popIn 0.18s cubic-bezier(0.16,1,0.3,1)',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '14px 16px 10px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                    {t('notifications.title')}
                    {unreadCount > 0 && (
                      <span style={{
                        marginLeft: 8,
                        background: '#DC262614',
                        color: '#DC2626',
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 7px',
                        fontFamily: 'var(--font-display)',
                      }}>{unreadCount}</span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAll}
                      disabled={markingAll}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: 'var(--primary)',
                        fontWeight: 500,
                        padding: '2px 4px',
                        borderRadius: 4,
                      }}
                    >
                      {markingAll ? '...' : t('notifications.markAllRead')}
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('notifications.empty')}</div>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const visual = typeVisual(n.type);
                      const Icon = visual.icon;
                      const navigationUrl = getNotificationNavigationUrl(n);
                      return (
                        <div
                          key={n.id}
                          onClick={() => !n.isRead && handleMarkRead(n.id)}
                          style={{
                            padding: '11px 14px',
                            borderBottom: '1px solid var(--border)',
                            cursor: n.isRead ? 'default' : 'pointer',
                            background: n.isRead ? 'rgba(22,163,74,0.05)' : 'rgba(201,151,58,0.08)',
                            transition: 'background 0.15s',
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                          }}
                          onMouseEnter={(e) => {
                            if (!n.isRead) (e.currentTarget as HTMLElement).style.background = 'rgba(201,151,58,0.12)';
                          }}
                          onMouseLeave={(e) => {
                            if (!n.isRead) (e.currentTarget as HTMLElement).style.background = 'rgba(201,151,58,0.08)';
                          }}
                        >
                          <span style={{
                            width: 23,
                            height: 23,
                            borderRadius: 8,
                            marginTop: 2,
                            flexShrink: 0,
                            color: visual.color,
                            background: visual.bg,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <Icon size={12} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: n.isRead ? 500 : 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                              {notificationTitle(n, t)}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 4 }}>
                              {notificationMessage(n, t)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {timeAgo(n.createdAt, t)}
                                </div>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: PRIORITY_COLOR[n.priority] ?? '#C9973A',
                                  background: `${PRIORITY_COLOR[n.priority] ?? '#C9973A'}15`,
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  fontFamily: 'var(--font-display)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.03em',
                                }}>
                                  {t(`notifications.priority_${n.priority}`)}
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  color: 'var(--text-muted)',
                                  background: 'var(--background)',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  fontFamily: 'var(--font-display)',
                                }}>
                                  {typeLabel(n.type, t)}
                                </span>
                              </div>
                              {navigationUrl && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleViewNotification(n, navigationUrl);
                                  }}
                                  title={t('notifications.viewSource', 'Go to source')}
                                  style={{
                                    border: '1px solid var(--primary)',
                                    background: 'var(--primary)',
                                    color: '#fff',
                                    borderRadius: 7,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    flexShrink: 0,
                                    lineHeight: 1,
                                  }}
                                >
                                  <ExternalLink size={11} />
                                  {t('notifications.view', 'View')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{
                  padding: '6px 10px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'center',
                  background: 'var(--surface-warm)',
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setDropOpen(false);
                      navigate('/notifiche');
                    }}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--primary)',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '4px 9px',
                      cursor: 'pointer',
                    }}
                  >
                    {t('common.viewAll', 'View all')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {user && (
          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-label={t('nav.myProfile', 'My profile')}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                lineHeight: 0,
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: isMobile ? 32 : 34,
                height: isMobile ? 32 : 34,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '1.5px solid rgba(13,33,55,0.22)',
                background: user.avatarFilename ? 'rgba(255,255,255,0.8)' : roleStyle.color,
                color: '#fff',
                fontSize: 12,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 6px 14px rgba(2,6,23,0.12)',
              }}>
                {user.avatarFilename ? (
                  <img
                    src={getAvatarUrl(user.avatarFilename) ?? ''}
                    alt={fullName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : initials}
              </span>
            </button>

            {profileOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                width: isMobile ? 250 : 280,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                boxShadow: '0 20px 32px rgba(2,6,23,0.18)',
                overflow: 'hidden',
                zIndex: 30,
              }}>
                <div style={{
                  padding: '12px 12px 10px',
                  borderBottom: '1px solid var(--border)',
                  background: 'linear-gradient(135deg, rgba(13,33,55,0.95) 0%, rgba(16,40,66,0.9) 45%, rgba(15,118,110,0.75) 100%)',
                  color: '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: '2px solid rgba(255,255,255,0.45)',
                      background: user.avatarFilename ? 'rgba(255,255,255,0.95)' : roleStyle.color,
                      color: user.avatarFilename ? 'transparent' : '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {user.avatarFilename ? (
                        <img
                          src={getAvatarUrl(user.avatarFilename) ?? ''}
                          alt={fullName}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : initials}
                    </span>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
                      <div style={{ fontSize: 11, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roleLabel}</div>
                      {companyLabel && (
                        <div style={{ marginTop: 5, fontSize: 10.5, color: '#99f6e4', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {companyLabel}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 8, display: 'grid', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/profilo');
                    }}
                    style={menuItemBtnStyle}
                  >
                    <UserCircle2 size={14} />
                    {t('nav.myProfile', 'My profile')}
                  </button>

                  <button
                    type="button"
                    disabled={!canOpenSettings}
                    onClick={() => {
                      if (!canOpenSettings) return;
                      setProfileOpen(false);
                      navigate('/impostazioni');
                    }}
                    style={{
                      ...menuItemBtnStyle,
                      opacity: canOpenSettings ? 1 : 0.55,
                      cursor: canOpenSettings ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <Settings size={14} />
                    {t('nav.settings', 'Settings')}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      void handleLogout();
                    }}
                    style={{ ...menuItemBtnStyle, color: '#b91c1c', borderColor: 'rgba(185,28,28,0.2)', background: 'rgba(220,38,38,0.08)' }}
                  >
                    <LogOut size={14} />
                    {t('nav.logout', 'Logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
    </>
  );
};

const menuItemBtnStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 9,
  background: 'var(--surface-warm)',
  color: 'var(--text-secondary)',
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  cursor: 'pointer',
};

export default Header;
