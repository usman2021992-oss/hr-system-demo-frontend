import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAuth } from '../../context/AuthContext';
import { BillingStatusProvider, BillingGraceBanner } from '../../modules/billing/useBillingStatus';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title = 'Dashboard' }) => {
  const { isMobile } = useBreakpoint();
  const { refreshPermissions } = useAuth();

  // Re-fetch permissions when the tab regains focus so that admin permission changes
  // are reflected for already-logged-in users without requiring a logout/login.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshPermissions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshPermissions]);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return window.innerWidth < 1024;
  });
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
        setMobileOpen(false);
      } else {
        setCollapsed(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => !prev);
    }
  };

  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  };

  const mainStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    background: 'var(--background)',
    paddingTop: 'var(--content-padding)',
    paddingLeft: `max(var(--content-padding), env(safe-area-inset-left, 0px))`,
    paddingRight: `max(var(--content-padding), env(safe-area-inset-right, 0px))`,
    paddingBottom: `max(var(--content-padding), env(safe-area-inset-bottom, 0px))`,
    overflowY: 'auto',
  };

  return (
    // One billing probe for the whole shell: the sidebar decides what
    // navigation to allow from it, and the banner below warns for as long as
    // the grace period runs.
    <BillingStatusProvider>
      <div style={wrapperStyle}>
        {mobileOpen && (
          <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
        )}
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div style={mainStyle}>
          <Header onToggleSidebar={toggleSidebar} title={title} />
          <BillingGraceBanner />
          <main style={contentStyle}>
            {children}
          </main>
        </div>
      </div>
    </BillingStatusProvider>
  );
};

export default Layout;
