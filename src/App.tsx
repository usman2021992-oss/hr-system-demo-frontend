import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { SocketProvider } from './context/SocketContext';
import { OfflineSyncProvider } from './context/OfflineSyncContext';
import ToastContainer from './components/ui/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { Spinner } from './components/ui';
import { recoverFromChunkLoadError } from './utils/chunkLoadRecovery';

// Lazy-load route components to reduce the initial ES-module evaluation depth.
// iOS Safari evaluates module imports recursively; eagerly importing 30+ heavy
// page components (each with their own deep dependency trees) overflows Safari's
// smaller call-stack limit, causing "RangeError: Maximum call stack size exceeded".
function lazyRoute<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error) => {
      recoverFromChunkLoadError(error);
      throw error;
    })
  );
}

const LoginPage = lazyRoute(() => import('./modules/auth/LoginPage'));
const HomePage = lazyRoute(() => import('./modules/home/HomePage'));
const EmployeeList = lazyRoute(() => import('./modules/employees/EmployeeList'));
const EmployeeDetail = lazyRoute(() => import('./modules/employees/EmployeeDetail'));
const StoreList = lazyRoute(() => import('./modules/stores/StoreList'));
const StoreDetail = lazyRoute(() => import('./modules/stores/StoreDetail'));
const SystemCompanyManagement = lazyRoute(() => import('./modules/companies/SystemCompanyManagement'));
const CompanyDetail = lazyRoute(() => import('./modules/companies/CompanyDetail'));
const SystemPermissionsPanel = lazyRoute(() => import('./modules/permissions/SystemPermissionsPanel'));
const PermissionsPanel = lazyRoute(() => import('./modules/permissions/PermissionsPanel'));
const ProfilePage = lazyRoute(() => import('./modules/profile/ProfilePage'));
const ShiftsPage = lazyRoute(() => import('./modules/shifts/ShiftsPage'));
const ExternalAffluencePage = lazyRoute(() => import('./modules/externalAffluence/ExternalAffluencePage'));
const AttendanceLogsPage = lazyRoute(() => import('./modules/attendance/AttendanceLogsPage'));
const AnomaliesPage = lazyRoute(() => import('./modules/attendance/AnomaliesPage'));
const QRPage = lazyRoute(() => import('./modules/attendance/QRPage'));
const TerminalPage = lazyRoute(() => import('./modules/attendance/TerminalPage'));
const TerminalList = lazyRoute(() => import('./modules/terminals/TerminalList'));
const LeavePage = lazyRoute(() => import('./modules/leave/LeavePage'));
const SettingsPage = lazyRoute(() => import('./modules/settings/SettingsPage'));
const EmployeeCheckinPage = lazyRoute(() => import('./modules/attendance/EmployeeCheckinPage'));
const ScanPage = lazyRoute(() => import('./modules/attendance/ScanPage'));
const HRChatPage = lazyRoute(() => import('./modules/messages/HRChatPage'));
const ATSPage = lazyRoute(() => import('./modules/ats/ATSPage'));
const OnboardingPage = lazyRoute(() => import('./modules/onboarding/OnboardingPage'));
const DocumentsPage = lazyRoute(() => import('./modules/documents/DocumentsPage'));
const TransfersPage = lazyRoute(() => import('./modules/transfers/TransfersPage'));
const NotificationsPage = lazyRoute(() => import('./modules/notifications/NotificationsPage'));
const AutomationsPage = lazyRoute(() => import('./modules/automations/AutomationsPage'));
const DeviceRegistrationPage = lazyRoute(() => import('./modules/device/DeviceRegistrationPage'));
const HrDeviceResetPage = lazyRoute(() => import('./modules/device/HrDeviceResetPage'));
const EmailSettingsPage = lazyRoute(() => import('./modules/email/EmailSettingsPage'));
const LegalDocumentsAdminPage = lazyRoute(() => import('./modules/legal/LegalDocumentsAdminPage'));
const ReportsPage = lazyRoute(() => import('./modules/reports/ReportsPage'));
const PublicCareersPage = lazyRoute(() => import('./modules/publicCareers/PublicCareersPage'));
const PublicJobDetailPage = lazyRoute(() => import('./modules/publicCareers/PublicJobDetailPage'));
const PrivacyPolicyPage = lazyRoute(() => import('./pages/legal/PrivacyPolicyPage'));
const TermsOfServicePage = lazyRoute(() => import('./pages/legal/TermsOfServicePage'));
const CookiePolicyPage = lazyRoute(() => import('./pages/legal/CookiePolicyPage'));
const BillingPage = lazyRoute(() => import('./modules/billing/BillingPage'));
const PaymentProcessingPage = lazyRoute(() => import('./modules/billing/PaymentProcessingPage'));
import { BillingBlockedOverlay } from './modules/billing/BillingBlockedOverlay';

// Refresh permissions whenever the user navigates to a new route.
// This ensures that permission changes made by an admin are always picked up
// without the user needing to manually reload or wait for the 5-minute interval.
function PermissionsRefresher() {
  const { user, refreshPermissions } = useAuth();
  const location = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Only refresh when the path actually changes (not on initial render, which
    // is already covered by the session-restore logic in AuthContext).
    if (prevPath.current !== null && prevPath.current !== location.pathname) {
      void refreshPermissions();
    }
    prevPath.current = location.pathname;
  }, [location.pathname, user?.id]);

  return null;
}

// Terminal role gets a bare full-screen view — no header or sidebar
function HomeRoute() {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (user?.role === 'store_terminal') return <HomePage />;
  return <Layout title={t('nav.dashboard')}><HomePage /></Layout>;
}

function AppRoutes() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <>
    <PermissionsRefresher />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/careers" element={<PublicCareersPage />} />
      <Route path="/careers/:companySlug" element={<PublicCareersPage />} />
      <Route path="/careers/jobs/:jobId" element={<PublicJobDetailPage />} />
      <Route path="/careers/:companySlug/jobs/:jobId" element={<PublicJobDetailPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/careers/:companySlug/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/careers/:companySlug/terms" element={<TermsOfServicePage />} />
      <Route path="/cookie-policy" element={<CookiePolicyPage />} />
      <Route path="/careers/:companySlug/cookie-policy" element={<CookiePolicyPage />} />

      <Route path="/" element={
        <ProtectedRoute>
          <HomeRoute />
        </ProtectedRoute>
      } />

      <Route path="/dipendenti" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="dipendenti">
          <Layout title={t('nav.employees')}><EmployeeList /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dipendenti/reset-device" element={
        <ProtectedRoute roles={['admin', 'hr']} permissionKey="dipendenti">
          <Layout title={t('deviceReset.title')}><HrDeviceResetPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dipendenti/:id" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="dipendenti">
          <Layout title={t('employees.colName')}><EmployeeDetail /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/negozi" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="negozi">
          <Layout title={t('nav.stores')}><StoreList /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/negozi/:slug" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="negozi">
          <Layout title={t('nav.stores')}><StoreDetail /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/terminali" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="terminali">
          <Layout title={t('nav.terminals')}><TerminalList /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/aziende" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager']}>
          <Layout title={t('nav.companies')}><SystemCompanyManagement /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/aziende/:slug" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager']}>
          <Layout title={t('nav.companies')}><CompanyDetail /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/impostazioni/permessi" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager']} permissionKey="gestione_accessi">
          <Layout title={t('nav.permissions')}>
            {user?.isSuperAdmin ? <SystemPermissionsPanel /> : <PermissionsPanel />}
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="/impostazioni" element={
        <ProtectedRoute roles={['admin']} permissionKey="impostazioni">
          <Layout title={t('settings.title')}><SettingsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/profilo" element={
        <ProtectedRoute>
          <Layout title={t('profile.title')}><ProfilePage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/hr-chat" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="messaggi">
          <Layout title={t('nav.messaggi')}><HRChatPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/turni" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="turni">
          <Layout title={t('nav.turni')}><ShiftsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/integrazioni/database-esterno" element={
        <ProtectedRoute superAdminOnly={true}>
          <Layout title={t('nav.externalAffluence', 'Database Integration')}><ExternalAffluencePage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/affluenza-esterna" element={<Navigate to="/integrazioni/database-esterno" replace />} />

      <Route path="/trasferimenti" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="trasferimenti">
          <Layout title={t('nav.trasferimenti', 'Trasferimenti')}><TransfersPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/presenze" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="presenze">
          <Layout title={t('nav.presenze')}><AttendanceLogsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/anomalie" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="anomalie">
          <Layout title={t('nav.anomalies', 'Anomalies')}><AnomaliesPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/qr" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager']} permissionKey="presenze">
          <Layout title={t('nav.qr')}><QRPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/terminale" element={
        <ProtectedRoute roles={['store_terminal', 'admin', 'hr', 'area_manager', 'store_manager']} permissionKey="presenze">
          <TerminalPage />
        </ProtectedRoute>
      } />

      <Route path="/presenze/checkin" element={
        <ProtectedRoute roles={['employee', 'store_manager', 'hr', 'area_manager']}>
          <Layout title={t('checkin.title')}><EmployeeCheckinPage /></Layout>
        </ProtectedRoute>
      } />

      {/* QR scan landing page — opened by scanning the store terminal QR code */}
      <Route path="/presenze/scan" element={
        <ProtectedRoute roles={['employee', 'store_manager', 'hr', 'area_manager']}>
          <ScanPage />
        </ProtectedRoute>
      } />

      <Route path="/device/register" element={
        <ProtectedRoute roles={['employee', 'store_terminal', 'store_manager', 'hr', 'area_manager']}>
          <DeviceRegistrationPage />
        </ProtectedRoute>
      } />

      <Route path="/permessi" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="permessi">
          <Layout title={t('nav.permessi')}><LeavePage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/ats" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="ats">
          <Layout title={t('nav.ats')}><ATSPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/onboarding" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="onboarding">
          <Layout title={t('nav.onboarding')}><OnboardingPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/documenti" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="documenti">
          <Layout title={t('nav.documenti')}><DocumentsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/notifiche" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager', 'store_manager', 'employee']} permissionKey="notifiche">
          <Layout title={t('nav.notifications', 'Notifications')}><NotificationsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/automazioni" element={
        <ProtectedRoute roles={['admin', 'hr', 'area_manager']} permissionKey="automazioni">
          <Layout title={t('nav.automazioni', 'Automations')}><AutomationsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/impostazioni/email" element={
        <ProtectedRoute roles={['admin', 'hr']} superAdminOnly={true}>
          <Layout title={t('nav.email')}><EmailSettingsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/impostazioni/legal" element={
        <ProtectedRoute superAdminOnly={true}>
          <Layout title={t('nav.legalDocuments', 'Pagine Legali')}><LegalDocumentsAdminPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/reports" element={
        <ProtectedRoute roles={['admin', 'hr']} permissionKey="report">
          <Layout title={t('nav.reports')}><ReportsPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/impostazioni/fatturazione" element={
        <ProtectedRoute roles={['admin']} permissionKey="impostazioni">
          <Layout title={t('billing.title', 'Fatturazione & Abbonamento')}><BillingPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/impostazioni/fatturazione/processing" element={
        <ProtectedRoute roles={['admin']}>
          <Layout title={t('billing.processing.title', 'Elaborazione Pagamento')}><PaymentProcessingPage /></Layout>
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

function SuspenseFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--background)' }}>
      <Spinner size="lg" color="var(--primary)" />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SocketProvider>
          <OfflineSyncProvider>
            <BrowserRouter>
              <ToastContainer />
              <BillingBlockedOverlay />
              <ErrorBoundary>
                <Suspense fallback={<SuspenseFallback />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </BrowserRouter>
          </OfflineSyncProvider>
        </SocketProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
