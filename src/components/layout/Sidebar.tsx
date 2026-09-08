import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useBillingStatus } from '../../modules/billing/useBillingStatus';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { UserRole } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { getUnreadCount } from '../../api/messages';
import { getAvatarUrl } from '../../api/client';
import fusaroLogoUrl from '../../assets/fusaro-logo-2.png';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconDashboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const IconBuilding = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18z" />
    <path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2" />
    <path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2" />
    <path d="M10 6h4M10 10h4M10 14h4" />
  </svg>
);
const IconStore = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7l1-4h18l1 4" /><path d="M2 7h20v13a2 2 0 01-2 2H4a2 2 0 01-2-2V7z" />
    <path d="M10 21V12h4v9" />
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconSmartphone = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconCreditCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);
const IconScale = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-2.24.75-3 .75s-2.13-.1-3-.75Z" />
    <path d="m2 16 3-8 3 8c-.87.65-2.24.75-3 .75s-2.13-.1-3-.75Z" />
    <path d="M7 21h10" />
    <path d="M12 2v19" />
    <path d="M12 7h10" />
    <path d="M12 7H2" />
  </svg>
);
const IconPerson = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
const IconMessage = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconBell = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);
const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconTransfer = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3h4v4" />
    <path d="M21 3l-7 7" />
    <path d="M7 21H3v-4" />
    <path d="M3 21l7-7" />
    <path d="M21 14v7h-7" />
    <path d="M21 21l-7-7" />
    <path d="M3 10V3h7" />
    <path d="M3 3l7 7" />
  </svg>
);
const IconClock = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);
const IconUmbrella = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 12a11.05 11.05 0 00-22 0zm-5 7a3 3 0 01-6 0v-7" />
  </svg>
);
const IconQr = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h2v2h-2zM18 14h3M14 18h1M17 18h4M20 14v4" />
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconAnomaly = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconTerminal = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const IconDoc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);
const IconBriefcase = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="12" /><line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);
const IconClipboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);
const IconDatabase = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
  </svg>
);
const IconZap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconReports = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const ROLE_ACCENT: Record<UserRole, string> = {
  admin: '#C9973A', hr: '#0284C7', area_manager: '#15803D',
  store_manager: '#7C3AED', employee: '#64748B', store_terminal: '#64748B',
};

const Sidebar: React.FC<SidebarProps> = ({ collapsed, mobileOpen, onMobileClose }) => {
  const { user, permissions, logout, targetCompanyId } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [avatarImgError, setAvatarImgError] = useState(false);
  // The shell reads billing once and shares it: the same answer drives which
  // navigation is allowed here and the grace-period banner under the header.
  // A failed probe leaves the status null, which reads as unrestricted -
  // billing must never be the reason navigation disappears.
  const { status: billingStatus } = useBillingStatus();
  const billingRestricted = !!billingStatus?.restricted;

  useEffect(() => {
    if (!user || user.role === 'store_terminal') return;
    const scopedCompanyId = targetCompanyId ?? user.companyId ?? null;
    getUnreadCount(scopedCompanyId).then(setUnreadMessages).catch(() => { });
    const interval = setInterval(() => {
      getUnreadCount(scopedCompanyId).then(setUnreadMessages).catch(() => { });
    }, 60_000);
    return () => clearInterval(interval);
  }, [targetCompanyId, user?.companyId, user?.id, user?.role]);

  if (!user || user.role === 'store_terminal') return null;

  type NavItem = {
    labelKey: string;
    path: string;
    icon: React.ReactNode;
    permissionKey?: string;
    superAdminOnly?: boolean;
    hideForSuperAdmin?: boolean;
    badgeKey?: string;
  };

  const NAV_ITEMS: Record<UserRole, NavItem[]> = {
    admin: [
      { labelKey: 'nav.dashboard', path: '/', icon: <IconDashboard /> },
      { labelKey: 'nav.companies', path: '/aziende', icon: <IconBuilding /> },
      { labelKey: 'nav.stores', path: '/negozi', icon: <IconStore />, permissionKey: 'negozi' },
      { labelKey: 'nav.employees', path: '/dipendenti', icon: <IconUsers />, permissionKey: 'dipendenti' },
      { labelKey: 'nav.ats', path: '/ats', icon: <IconBriefcase />, permissionKey: 'ats' },
      { labelKey: 'nav.onboarding', path: '/onboarding', icon: <IconClipboard />, permissionKey: 'onboarding' },
      { labelKey: 'nav.documenti', path: '/documenti', icon: <IconDoc />, permissionKey: 'documenti' },
      { labelKey: 'nav.deviceReset', path: '/dipendenti/reset-device', icon: <IconSmartphone />, permissionKey: 'dipendenti' },
      { labelKey: 'nav.terminals', path: '/terminali', icon: <IconTerminal />, permissionKey: 'terminali' },
      { labelKey: 'nav.turni', path: '/turni', icon: <IconCalendar />, permissionKey: 'turni' },
      { labelKey: 'nav.trasferimenti', path: '/trasferimenti', icon: <IconTransfer />, permissionKey: 'trasferimenti' },
      { labelKey: 'nav.presenze', path: '/presenze', icon: <IconClock />, permissionKey: 'presenze' },
      { labelKey: 'nav.anomalies', path: '/anomalie', icon: <IconAnomaly />, permissionKey: 'anomalie' },
      { labelKey: 'nav.permessi', path: '/permessi', icon: <IconUmbrella />, permissionKey: 'permessi' },
      { labelKey: 'nav.notifications', path: '/notifiche', icon: <IconBell />, permissionKey: 'notifiche' },
      { labelKey: 'nav.messaggi', path: '/hr-chat', icon: <IconMessage />, permissionKey: 'messaggi' },
      { labelKey: 'nav.email', path: '/impostazioni/email', icon: <IconMail />, superAdminOnly: true },
      { labelKey: 'nav.legalDocuments', path: '/impostazioni/legal', icon: <IconScale />, superAdminOnly: true },
      { labelKey: 'nav.externalAffluence', path: '/integrazioni/database-esterno', icon: <IconDatabase />, superAdminOnly: true },
      { labelKey: 'nav.permissions', path: '/impostazioni/permessi', icon: <IconShield />, permissionKey: 'gestione_accessi' },
      { labelKey: 'nav.automazioni', path: '/automazioni', icon: <IconZap />, permissionKey: 'automazioni' },
      { labelKey: 'nav.reports', path: '/reports', icon: <IconReports />, permissionKey: 'report' },
      { labelKey: 'nav.billing', path: '/impostazioni/fatturazione', icon: <IconCreditCard />, permissionKey: 'impostazioni' },
      { labelKey: 'nav.settings', path: '/impostazioni', icon: <IconSettings />, permissionKey: 'impostazioni' },
    ],
    hr: [
      { labelKey: 'nav.dashboard', path: '/', icon: <IconDashboard /> },
      { labelKey: 'nav.companies', path: '/aziende', icon: <IconBuilding /> },
      { labelKey: 'nav.employees', path: '/dipendenti', icon: <IconUsers />, permissionKey: 'dipendenti' },
      { labelKey: 'nav.deviceReset', path: '/dipendenti/reset-device', icon: <IconSmartphone />, permissionKey: 'dipendenti' },
      { labelKey: 'nav.stores', path: '/negozi', icon: <IconStore />, permissionKey: 'negozi' },
      { labelKey: 'nav.terminals', path: '/terminali', icon: <IconTerminal />, permissionKey: 'terminali' },
      { labelKey: 'nav.ats', path: '/ats', icon: <IconBriefcase />, permissionKey: 'ats' },
      { labelKey: 'nav.onboarding', path: '/onboarding', icon: <IconClipboard />, permissionKey: 'onboarding' },
      { labelKey: 'nav.documenti', path: '/documenti', icon: <IconDoc />, permissionKey: 'documenti' },
      { labelKey: 'nav.turni', path: '/turni', icon: <IconCalendar />, permissionKey: 'turni' },
      { labelKey: 'nav.trasferimenti', path: '/trasferimenti', icon: <IconTransfer />, permissionKey: 'trasferimenti' },
      { labelKey: 'nav.presenze', path: '/presenze', icon: <IconClock />, permissionKey: 'presenze' },
      { labelKey: 'nav.anomalies', path: '/anomalie', icon: <IconAnomaly />, permissionKey: 'anomalie' },
      { labelKey: 'nav.permessi', path: '/permessi', icon: <IconUmbrella />, permissionKey: 'permessi' },
      { labelKey: 'nav.notifications', path: '/notifiche', icon: <IconBell />, permissionKey: 'notifiche' },
      { labelKey: 'nav.messaggi', path: '/hr-chat', icon: <IconMessage />, permissionKey: 'messaggi' },
      { labelKey: 'nav.email', path: '/impostazioni/email', icon: <IconMail />, superAdminOnly: true },
      { labelKey: 'nav.legalDocuments', path: '/impostazioni/legal', icon: <IconScale />, superAdminOnly: true },
      { labelKey: 'nav.permissions', path: '/impostazioni/permessi', icon: <IconShield />, permissionKey: 'gestione_accessi' },
      { labelKey: 'nav.automazioni', path: '/automazioni', icon: <IconZap />, permissionKey: 'automazioni' },
      { labelKey: 'nav.reports', path: '/reports', icon: <IconReports />, permissionKey: 'report' },
      { labelKey: 'nav.settings', path: '/impostazioni', icon: <IconSettings />, permissionKey: 'impostazioni' },
    ],
    area_manager: [
      { labelKey: 'nav.dashboard', path: '/', icon: <IconDashboard /> },
      { labelKey: 'nav.companies', path: '/aziende', icon: <IconBuilding /> },
      { labelKey: 'nav.stores', path: '/negozi', icon: <IconStore />, permissionKey: 'negozi' },
      { labelKey: 'nav.terminals', path: '/terminali', icon: <IconTerminal />, permissionKey: 'terminali' },
      { labelKey: 'nav.employees', path: '/dipendenti', icon: <IconUsers />, permissionKey: 'dipendenti' },
      { labelKey: 'nav.ats', path: '/ats', icon: <IconBriefcase />, permissionKey: 'ats' },
      { labelKey: 'nav.onboarding', path: '/onboarding', icon: <IconClipboard />, permissionKey: 'onboarding' },
      { labelKey: 'nav.documenti', path: '/documenti', icon: <IconDoc />, permissionKey: 'documenti' },
      { labelKey: 'nav.turni', path: '/turni', icon: <IconCalendar />, permissionKey: 'turni' },
      { labelKey: 'nav.trasferimenti', path: '/trasferimenti', icon: <IconTransfer />, permissionKey: 'trasferimenti' },
      { labelKey: 'nav.presenze', path: '/presenze', icon: <IconClock />, permissionKey: 'presenze' },
      { labelKey: 'nav.anomalies', path: '/anomalie', icon: <IconAnomaly />, permissionKey: 'anomalie' },
      { labelKey: 'nav.permessi', path: '/permessi', icon: <IconUmbrella />, permissionKey: 'permessi' },
      { labelKey: 'nav.notifications', path: '/notifiche', icon: <IconBell />, permissionKey: 'notifiche' },
      { labelKey: 'nav.messaggi', path: '/hr-chat', icon: <IconMessage />, permissionKey: 'messaggi' },
      { labelKey: 'nav.permissions', path: '/impostazioni/permessi', icon: <IconShield />, permissionKey: 'gestione_accessi' },
      { labelKey: 'nav.automazioni', path: '/automazioni', icon: <IconZap />, permissionKey: 'automazioni' },
      { labelKey: 'nav.reports', path: '/reports', icon: <IconReports />, permissionKey: 'report' },
      { labelKey: 'nav.settings', path: '/impostazioni', icon: <IconSettings />, permissionKey: 'impostazioni' },
    ],
    store_manager: [
      { labelKey: 'nav.dashboard', path: '/', icon: <IconDashboard /> },
      { labelKey: 'nav.employees', path: '/dipendenti', icon: <IconUsers />, permissionKey: 'dipendenti' },
      { labelKey: 'nav.ats', path: '/ats', icon: <IconBriefcase />, permissionKey: 'ats' },
      { labelKey: 'nav.onboarding', path: '/onboarding', icon: <IconClipboard />, permissionKey: 'onboarding' },
      { labelKey: 'nav.documenti', path: '/documenti', icon: <IconDoc />, permissionKey: 'documenti' },
      { labelKey: 'nav.turni', path: '/turni', icon: <IconCalendar />, permissionKey: 'turni' },
      { labelKey: 'nav.trasferimenti', path: '/trasferimenti', icon: <IconTransfer />, permissionKey: 'trasferimenti' },
      { labelKey: 'nav.presenze', path: '/presenze', icon: <IconClock />, permissionKey: 'presenze' },
      { labelKey: 'nav.anomalies', path: '/anomalie', icon: <IconAnomaly />, permissionKey: 'anomalie' },
      { labelKey: 'nav.permessi', path: '/permessi', icon: <IconUmbrella />, permissionKey: 'permessi' },
      { labelKey: 'nav.stores', path: '/negozi', icon: <IconStore />, permissionKey: 'negozi' },
      { labelKey: 'nav.notifications', path: '/notifiche', icon: <IconBell />, permissionKey: 'notifiche' },
      { labelKey: 'nav.messaggi', path: '/hr-chat', icon: <IconMessage />, permissionKey: 'messaggi' },
      { labelKey: 'nav.terminals', path: '/terminali', icon: <IconTerminal />, permissionKey: 'terminali' },
      { labelKey: 'nav.reports', path: '/reports', icon: <IconReports />, permissionKey: 'report' },
      { labelKey: 'nav.settings', path: '/impostazioni', icon: <IconSettings />, permissionKey: 'impostazioni' },
    ],
    employee: [
      { labelKey: 'nav.dashboard', path: '/', icon: <IconDashboard /> },
      { labelKey: 'nav.myProfile', path: '/profilo', icon: <IconPerson /> },
      { labelKey: 'nav.onboarding', path: '/onboarding', icon: <IconClipboard />, permissionKey: 'onboarding' },
      { labelKey: 'nav.documenti', path: '/documenti', icon: <IconDoc />, permissionKey: 'documenti' },
      { labelKey: 'nav.notifications', path: '/notifiche', icon: <IconBell />, permissionKey: 'notifiche' },
      { labelKey: 'nav.messaggi', path: '/hr-chat', icon: <IconMessage />, permissionKey: 'messaggi' },
      { labelKey: 'nav.turni', path: '/turni', icon: <IconCalendar />, permissionKey: 'turni' },
      { labelKey: 'nav.presenze', path: '/presenze/checkin', icon: <IconClock />, permissionKey: 'presenze' },
      { labelKey: 'nav.permessi', path: '/permessi', icon: <IconUmbrella />, permissionKey: 'permessi' },
      { labelKey: 'nav.terminals', path: '/terminali', icon: <IconTerminal />, permissionKey: 'terminali' },
    ],
    store_terminal: [],
  };

  // While the company's subscription is unpaid, navigation collapses to the
  // set needed to fix that: the company record (where VAT / SDI / PEC live),
  // billing itself, settings, access configuration and messages. Everything
  // operational is hidden — the API blocks it too, so showing it would only
  // produce dead links.
  const BILLING_RESTRICTED_PATHS = [
    '/aziende',
    '/impostazioni',
    '/impostazioni/fatturazione',
    '/impostazioni/permessi',
    '/hr-chat',
  ];

  const navItems = NAV_ITEMS[user.role].filter((item) => {
    if (item.superAdminOnly && user.isSuperAdmin !== true) return false;
    if (item.hideForSuperAdmin && user.isSuperAdmin === true) return false;
    if (billingRestricted && !BILLING_RESTRICTED_PATHS.includes(item.path)) return false;
    if (!item.permissionKey) return true;
    if (user.isSuperAdmin === true) return true;
    return permissions[item.permissionKey] === true;
  });

  const initials = `${user.name.charAt(0)}${user.surname ? user.surname.charAt(0) : ''}`.toUpperCase();
  const fullName = user.surname ? `${user.name} ${user.surname}` : user.name;
  const roleColor = ROLE_ACCENT[user.role];
  const roleLabel = user.isSuperAdmin ? t('roles.super_admin') : t(`roles.${user.role}`);

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
  };

  const { isMobile: isMobileView } = useBreakpoint();

  const isNavItemActive = (path: string, pathname: string): boolean => {
    if (path === '/') return pathname === '/';
    if (path === '/dipendenti/reset-device') return pathname === '/dipendenti/reset-device';
    if (path === '/dipendenti') return pathname === '/dipendenti' || /^\/dipendenti\/\d+$/.test(pathname);
    if (path === '/impostazioni') return pathname === '/impostazioni';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const effectiveCollapsed = isMobileView ? false : collapsed;

  return (
    <aside style={isMobileView ? {
      position: 'fixed',
      left: mobileOpen ? 0 : '-280px',
      top: 0,
      height: '100dvh',
      width: '280px',
      zIndex: 200,
      transition: 'left 0.28s cubic-bezier(0.16,1,0.3,1)',
      background: 'var(--sidebar-bg)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      borderRight: '1px solid rgba(255,255,255,0.05)',
    } : {
      width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
      minWidth: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
      height: '100vh',
      background: 'var(--sidebar-bg)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      transition: 'width 0.22s ease, min-width 0.22s ease',
      flexShrink: 0, position: 'sticky', top: 0,
      borderRight: '1px solid rgba(255,255,255,0.05)',
    }}>

      {/* ── Logo ── */}
      <div style={{
        padding: effectiveCollapsed ? '18px 0' : '20px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: '10px',
        flexShrink: 0, overflow: 'hidden',
        justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
      }}>
        <img
          src={fusaroLogoUrl}
          alt="Fusaro Antonio 1893"
          style={{
            width: effectiveCollapsed ? 30 : 32,
            height: effectiveCollapsed ? 30 : 32,
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
        {!effectiveCollapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: '#FFFFFF', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              {t('nav.appName')}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '1px' }}>
              {t('nav.appVersion')}
            </div>
          </div>
        )}
      </div>

      {/* ── User (click → profile) ── */}
      <NavLink
        to="/profilo"
        title={effectiveCollapsed ? t('nav.myProfile') : undefined}
        onClick={() => { if (isMobileView && onMobileClose) onMobileClose(); }}
        style={({ isActive }) => ({
          padding: effectiveCollapsed ? '12px 0' : '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: '10px',
          overflow: 'hidden', flexShrink: 0,
          justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
          textDecoration: 'none',
          background: isActive ? 'rgba(201,151,58,0.08)' : 'transparent',
          cursor: 'pointer',
          transition: 'background 0.15s',
        })}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: user.avatarFilename ? 'transparent' : `${roleColor}20`,
          border: `2px solid ${roleColor}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: roleColor, fontWeight: 700, fontSize: '12px',
          fontFamily: 'var(--font-display)', flexShrink: 0,
          overflow: 'hidden',
        }}>
          {user.avatarFilename && !avatarImgError ? (
            <img
              src={getAvatarUrl(user.avatarFilename) ?? ''}
              alt={fullName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setAvatarImgError(true)}
            />
          ) : initials}
        </div>
        {!effectiveCollapsed && (
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
            <div style={{ color: roleColor, fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap', marginTop: '1px' }}>{roleLabel}</div>
          </div>
        )}
      </NavLink>

      {/* ── Navigation ── */}
      <nav className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {!effectiveCollapsed && (
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px', marginBottom: '2px' }}>
            {t('nav.navigation')}
          </div>
        )}
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.path, location.pathname);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end
              className="sidebar-item"
              title={effectiveCollapsed ? t(item.labelKey) : undefined}
              onClick={() => { if (isMobileView && onMobileClose) onMobileClose(); }}
              style={() => ({
                display: 'flex', alignItems: 'center',
                justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                gap: '10px',
                padding: effectiveCollapsed ? '10px 0' : '9px 10px',
                margin: '2px 0',
                borderRadius: 'var(--radius-sm)',
                borderLeft: isActive && !effectiveCollapsed ? '2px solid var(--sidebar-active-border)' : '2px solid transparent',
                paddingLeft: isActive && !effectiveCollapsed ? '8px' : (effectiveCollapsed ? '0' : '10px'),
                background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                color: isActive ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                textDecoration: 'none',
                fontSize: '13px', fontWeight: isActive ? 600 : 400,
                overflow: 'hidden', whiteSpace: 'nowrap' as const,
              })}
            >
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              {!effectiveCollapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(item.labelKey)}</span>}
              {!effectiveCollapsed && !!item.badgeKey && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  borderRadius: 999,
                  padding: '1px 6px',
                  border: '1px solid rgba(201,151,58,0.4)',
                  color: '#F3D48D',
                  background: 'rgba(201,151,58,0.15)',
                }}>
                  {t(item.badgeKey)}
                </span>
              )}
              {!effectiveCollapsed && item.labelKey === 'nav.messaggi' && unreadMessages > 0 && (
                <span style={{
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '99px',
                  padding: '1px 6px',
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-display)',
                  minWidth: 16,
                  textAlign: 'center' as const,
                }}>
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Language switcher (full) + Logout ── */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        {(isMobileView || !effectiveCollapsed) && (
          <div style={{ marginBottom: 8 }}>
            <LanguageSwitcher variant="full" />
          </div>
        )}
        <button
          className="sidebar-item"
          onClick={handleLogout}
          title={effectiveCollapsed ? t('nav.logout') : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
            gap: '10px', padding: effectiveCollapsed ? '10px 0' : '9px 10px',
            background: 'none', border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--sidebar-text)', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
          }}
        >
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><IconLogout /></span>
          {!effectiveCollapsed && <span>{t('nav.logout')}</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
