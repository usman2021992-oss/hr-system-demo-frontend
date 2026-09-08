import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, X, Building, Users, UserCheck, Briefcase, Loader2, CornerDownLeft, Store, GraduationCap, MessageSquare, FileText } from 'lucide-react';
import { searchGlobal, GlobalSearchResults } from '../../api/search';
import { useAuth } from '../../context/AuthContext';

interface FlatResultItem {
  type: 'company' | 'employee' | 'candidate' | 'job' | 'store' | 'onboarding_template' | 'onboarding_task' | 'message' | 'document';
  id: number;
  label: string;
  sub: string;
  data: any;
}

export const GlobalSearch: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'companies' | 'employees' | 'candidates' | 'jobs' | 'stores' | 'onboarding' | 'messages' | 'documents'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'hr' | 'area_manager' | 'store_manager' | 'employee'>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>({
    companies: [],
    employees: [],
    candidates: [],
    jobs: [],
    stores: [],
    onboarding: [],
    messages: [],
    documents: []
  });
  const [activeIndex, setActiveIndex] = useState(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut to open (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Autofocus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setQueryText('');
      setRoleFilter('all');
      setResults({ companies: [], employees: [], candidates: [], jobs: [], stores: [], onboarding: [], messages: [], documents: [] });
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (queryText.trim().length < 2) {
      setResults({ companies: [], employees: [], candidates: [], jobs: [], stores: [], onboarding: [], messages: [], documents: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const searchResults = await searchGlobal(queryText, activeTab, roleFilter);
        setResults(searchResults);
        setActiveIndex(0);
      } catch (err) {
        console.error('Global search error:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [queryText, activeTab, roleFilter]);

  // Flatten results for easy keyboard navigation
  const flatResults: FlatResultItem[] = [];

  if (results.companies && results.companies.length > 0) {
    results.companies.forEach((c) => {
      flatResults.push({
        type: 'company',
        id: c.id,
        label: c.name,
        sub: `${c.slug || ''} • ${c.storeCount || 0} ${t('search.stores_owned', 'Stores')} • ${c.employeeCount || 0} ${t('search.employees_count', 'Employees')}`,
        data: c,
      });
    });
  }
  if (results.employees && results.employees.length > 0) {
    results.employees.forEach((e) => {
      flatResults.push({
        type: 'employee',
        id: e.id,
        label: `${e.name} ${e.surname}`,
        sub: `${e.uniqueId || ''} • ${e.email} (${t(`roles.${e.role}`, e.role)}) • ${e.companyName}`,
        data: e,
      });
    });
  }
  if (results.candidates && results.candidates.length > 0) {
    results.candidates.forEach((cand) => {
      flatResults.push({
        type: 'candidate',
        id: cand.id,
        label: cand.fullName,
        sub: `${cand.email || ''} • ${cand.jobTitle || ''} (${cand.status})`,
        data: cand,
      });
    });
  }
  if (results.jobs && results.jobs.length > 0) {
    results.jobs.forEach((j) => {
      flatResults.push({
        type: 'job',
        id: j.id,
        label: j.title,
        sub: `${j.companyName} • ${j.status}`,
        data: j,
      });
    });
  }
  if (results.stores && results.stores.length > 0) {
    results.stores.forEach((s) => {
      flatResults.push({
        type: 'store',
        id: s.id,
        label: s.name,
        sub: `${s.code} • ${s.address || ''} • ${s.companyName}`,
        data: s,
      });
    });
  }
  if (results.onboarding && results.onboarding.length > 0) {
    results.onboarding.forEach((o) => {
      if (o.onboardingType === 'template') {
        flatResults.push({
          type: 'onboarding_template',
          id: o.id,
          label: o.name || '',
          sub: `${t('onboarding.category', 'Category')}: ${o.category || ''} • ${t('onboarding.priority', 'Priority')}: ${o.priority || ''} (${o.companyName})`,
          data: o,
        });
      } else {
        flatResults.push({
          type: 'onboarding_task',
          id: o.id,
          label: o.taskName || '',
          sub: `${t('onboarding.employee', 'Employee')}: ${o.employeeName} ${o.employeeSurname} • ${o.completed ? t('onboarding.completed', 'Completed') : t('onboarding.pending', 'Pending')} (${o.companyName})`,
          data: o,
        });
      }
    });
  }
  if (results.messages && results.messages.length > 0) {
    results.messages.forEach((m) => {
      const isOutgoing = m.senderId === user?.id;
      const peerName = isOutgoing ? `${m.recipientName} ${m.recipientSurname}` : `${m.senderName} ${m.senderSurname}`;
      flatResults.push({
        type: 'message',
        id: m.id,
        label: m.subject,
        sub: `${isOutgoing ? t('messages.to', 'To') : t('messages.from', 'From')}: ${peerName} • ${m.body.substring(0, 60)}${m.body.length > 60 ? '...' : ''} • ${new Date(m.createdAt).toLocaleDateString()}`,
        data: m,
      });
    });
  }
  if (results.documents && results.documents.length > 0) {
    results.documents.forEach((d) => {
      flatResults.push({
        type: 'document',
        id: d.id,
        label: d.fileName || '',
        sub: `${t('documents.employee', 'Employee')}: ${d.employeeName} ${d.employeeSurname} • ${d.categoryName || t('documents.noCategory', 'No category')} • ${d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : ''}`,
        data: d,
      });
    });
  }

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (flatResults.length > 0 ? (prev + 1) % flatResults.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (flatResults.length > 0 ? (prev - 1 + flatResults.length) % flatResults.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[activeIndex]) {
        handleNavigate(flatResults[activeIndex]);
      }
    }
  };

  const handleNavigate = (item: FlatResultItem) => {
    setIsOpen(false);
    switch (item.type) {
      case 'company':
        navigate(`/aziende/${item.id}`);
        break;
      case 'employee':
        navigate(`/dipendenti/${item.id}`);
        break;
      case 'candidate':
        navigate(`/ats?view=candidates&candidateId=${item.id}`);
        break;
      case 'job':
        navigate(`/ats?view=jobs&jobId=${item.id}`);
        break;
      case 'store': {
        const storeNameSlug = item.label
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        navigate(`/negozi/${item.id}-${storeNameSlug || 'store'}`);
        break;
      }
      case 'onboarding_template':
      case 'onboarding_task':
        navigate('/onboarding');
        break;
      case 'message': {
        const isOutgoing = item.data.senderId === user?.id;
        const peerId = isOutgoing ? item.data.recipientId : item.data.senderId;
        const peerName = isOutgoing 
          ? `${item.data.recipientName} ${item.data.recipientSurname}` 
          : `${item.data.senderName} ${item.data.senderSurname}`;
        navigate(`/hr-chat?recipientId=${peerId}&recipientName=${encodeURIComponent(peerName)}&subject=${encodeURIComponent(item.data.subject)}`);
        break;
      }
      case 'document': {
        const lastDot = item.label.lastIndexOf('.');
        const query = lastDot !== -1 ? item.label.substring(0, lastDot) : item.label;
        navigate(`/documenti?search=${encodeURIComponent(query)}`);
        break;
      }
      default:
        break;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'company': return t('search.companies', 'Companies');
      case 'employee': return t('search.employees', 'Employees');
      case 'candidate': return t('search.candidates', 'Candidates');
      case 'job': return t('search.jobs', 'Job Openings');
      case 'store': return t('search.stores', 'Stores');
      case 'onboarding_template': return t('search.onboarding_templates', 'Onboarding Templates');
      case 'onboarding_task': return t('search.onboarding_tasks', 'Employee Onboarding');
      case 'message': return t('search.messages', 'Messages');
      case 'document': return t('search.documents', 'Documents');
      default: return '';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'company': return <Building size={16} />;
      case 'employee': return <Users size={16} />;
      case 'candidate': return <UserCheck size={16} />;
      case 'job': return <Briefcase size={16} />;
      case 'store': return <Store size={16} />;
      case 'onboarding_template':
      case 'onboarding_task': return <GraduationCap size={16} />;
      case 'message': return <MessageSquare size={16} />;
      case 'document': return <FileText size={16} />;
      default: return null;
    }
  };

  if (!user || (user.role !== 'admin' && user.role !== 'hr' && user.role !== 'area_manager' && !user.isSuperAdmin)) {
    return null;
  }

  const getBadgeStyle = (item: FlatResultItem) => {
    switch (item.type) {
      case 'company': {
        const hasGroup = !!item.data.groupName;
        return {
          bg: hasGroup ? 'rgba(201, 151, 58, 0.12)' : 'rgba(13, 33, 55, 0.08)',
          color: hasGroup ? '#C9973A' : 'var(--primary)',
          text: hasGroup ? item.data.groupName : t('search.company', 'Company'),
          icon: <Building size={10} />
        };
      }
      case 'employee': {
        const role = item.data.role;
        let bg = 'rgba(107, 114, 128, 0.10)';
        let color = '#6B7280';
        switch (role) {
          case 'admin':
            bg = 'rgba(201,151,58,0.12)';
            color = '#C9973A';
            break;
          case 'hr':
            bg = 'rgba(2,132,199,0.12)';
            color = '#0284C7';
            break;
          case 'area_manager':
            bg = 'rgba(21,128,61,0.12)';
            color = '#15803D';
            break;
          case 'store_manager':
            bg = 'rgba(124,58,237,0.12)';
            color = '#7C3AED';
            break;
          case 'employee':
            bg = 'rgba(107,114,128,0.12)';
            color = '#6B7280';
            break;
        }
        return {
          bg,
          color,
          text: t(`roles.${role}`, role),
          icon: <Users size={10} />
        };
      }
      case 'candidate': {
        const status = item.data.status;
        let bg = 'rgba(124, 58, 237, 0.1)';
        let color = '#7C3AED';
        switch (status?.toLowerCase()) {
          case 'new':
            bg = 'rgba(59, 130, 246, 0.12)';
            color = '#3B82F6';
            break;
          case 'interviewing':
            bg = 'rgba(245, 158, 11, 0.12)';
            color = '#F59E0B';
            break;
          case 'hired':
            bg = 'rgba(16, 185, 129, 0.12)';
            color = '#10B981';
            break;
          case 'rejected':
            bg = 'rgba(239, 68, 68, 0.12)';
            color = '#EF6868';
            break;
        }
        return {
          bg,
          color,
          text: status,
          icon: <UserCheck size={10} />
        };
      }
      case 'job':
        return {
          bg: 'rgba(21, 128, 61, 0.12)',
          color: '#15803D',
          text: t(`roles.${item.data.targetRole}`, item.data.targetRole || 'Job'),
          icon: <Briefcase size={10} />
        };
      case 'store': {
        const active = item.data.isActive;
        return {
          bg: active ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
          color: active ? '#16A34A' : '#DC2626',
          text: active ? t('common.active', 'Active') : t('common.inactive', 'Inactive'),
          icon: <Store size={10} />
        };
      }
      case 'onboarding_template':
        return {
          bg: 'rgba(13, 148, 136, 0.12)',
          color: '#0D9488',
          text: t('onboarding.template', 'Template'),
          icon: <GraduationCap size={10} />
        };
      case 'onboarding_task':
        return {
          bg: item.data.completed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          color: item.data.completed ? '#10B981' : '#F59E0B',
          text: item.data.completed ? t('onboarding.completed', 'Completed') : t('onboarding.in_progress', 'In Progress'),
          icon: <GraduationCap size={10} />
        };
      case 'message': {
        const unread = !item.data.isRead;
        return {
          bg: unread ? 'rgba(219, 39, 119, 0.12)' : 'rgba(107, 114, 128, 0.10)',
          color: unread ? '#DB2777' : '#6B7280',
          text: unread ? t('messages.unread', 'New') : t('messages.read', 'Read'),
          icon: <MessageSquare size={10} />
        };
      }
      case 'document':
        return {
          bg: 'rgba(15, 118, 110, 0.12)',
          color: '#0F766E',
          text: item.data.categoryName || t('documents.noCategory', 'No category'),
          icon: <FileText size={10} />
        };
      default:
        return {
          bg: 'var(--background)',
          color: 'var(--text-secondary)',
          text: '',
          icon: null
        };
    }
  };

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes borderGradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gemini-border-active {
          position: relative;
        }
        .gemini-border-active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #9b5DE5, #F15BB5, #00F5D4, #00BBF9, #9b5DE5);
          background-size: 400% 400%;
          animation: borderGradientMove 3s ease infinite;
        }
        @keyframes slideDownMobile {
          from { transform: translateY(-30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (max-width: 767px) {
          .global-search-trigger {
            max-width: 36px !important;
            height: 36px !important;
            padding: 0 !important;
            justify-content: center !important;
            margin: 0 4px !important;
            border-radius: 50% !important;
            flex-shrink: 0 !important;
            background: none !important;
            border: none !important;
            box-shadow: none !important;
          }
          .global-search-trigger svg {
            width: 18px !important;
            height: 18px !important;
          }
          .global-search-trigger-text {
            display: none !important;
          }
          .global-search-trigger-kbd {
            display: none !important;
          }
          .global-search-backdrop {
            position: fixed !important;
            top: var(--header-height) !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: rgba(13, 33, 55, 0.3) !important;
            backdrop-filter: blur(8px) !important;
            display: flex !important;
            align-items: flex-start !important;
            justify-content: center !important;
            padding-top: 0 !important;
            z-index: 9999 !important;
          }
          .global-search-modal-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 0 0 16px 16px !important;
            border-top: none !important;
            max-height: calc(100vh - var(--header-height)) !important;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15) !important;
            animation: slideDownMobile 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .global-search-results-list {
            max-height: 280px !important;
            overflow-y: auto !important;
          }
        }
      `}</style>

      <div
        className="global-search-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: '24px',
          padding: '6px 16px',
          color: 'var(--text-muted)',
          fontSize: '13px',
          width: '100%',
          maxWidth: '360px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          margin: '0 16px',
        }}
      >
        <Search size={15} style={{ color: 'var(--text-muted)' }} />
        <span className="global-search-trigger-text" style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {t('search.trigger_placeholder', 'Search everything...')}
        </span>
        <kbd
          className="global-search-trigger-kbd"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '1px 6px',
            fontSize: '10px',
            fontWeight: 600,
            fontFamily: 'monospace',
            color: 'var(--text-muted)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          ⌘K
        </kbd>
      </div>

      {isOpen && (
        <div
          className="global-search-backdrop"
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(13, 33, 55, 0.4)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '10vh',
            zIndex: 9999,
          }}
        >
          <div
            ref={modalRef}
            className="global-search-modal-container"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '75vh',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              position: 'relative',
              animation: 'slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div
              className="gemini-border-active"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-warm)',
                flexShrink: 0,
              }}
            >
              <Search size={20} style={{ color: 'var(--text-muted)', marginRight: '14px' }} />
              <input
                ref={inputRef}
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder={t('search.placeholder_detailed', 'Find employees, candidates, stores, documents...')}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '16px',
                  fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                }}
              />
              {loading ? (
                <Loader2 size={18} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
              ) : queryText ? (
                <button
                  onClick={() => setQueryText('')}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: '4px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--surface-warm)',
                borderBottom: '1px solid var(--border)',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                flexShrink: 0,
              }}
            >
              {[
                { id: 'all', label: t('search.filter_all', 'All'), icon: <Search size={13} /> },
                ...(user?.isSuperAdmin ? [{ id: 'companies', label: t('search.filter_companies', 'Companies'), icon: <Building size={13} /> }] : []),
                { id: 'employees', label: t('search.filter_employees', 'Employees'), icon: <Users size={13} /> },
                { id: 'candidates', label: t('search.filter_candidates', 'Candidates'), icon: <UserCheck size={13} /> },
                { id: 'jobs', label: t('search.filter_jobs', 'Jobs'), icon: <Briefcase size={13} /> },
                { id: 'stores', label: t('search.filter_stores', 'Stores'), icon: <Store size={13} /> },
                { id: 'onboarding', label: t('search.filter_onboarding', 'Onboarding'), icon: <GraduationCap size={13} /> },
                { id: 'messages', label: t('search.filter_messages', 'Messages'), icon: <MessageSquare size={13} /> },
                { id: 'documents', label: t('search.filter_documents', 'Documents'), icon: <FileText size={13} /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    if (tab.id !== 'employees') {
                      setRoleFilter('all');
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: activeTab === tab.id ? 'var(--primary)' : 'var(--surface)',
                    color: activeTab === tab.id ? 'var(--surface)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '20px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {activeTab === 'employees' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 20px',
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginRight: '4px', whiteSpace: 'nowrap' }}>
                  {t('search.filter_by_role', 'Filter by Role')}:
                </span>
                {[
                  { id: 'all', label: t('roles.allRoles', 'All Roles') },
                  { id: 'admin', label: t('roles.admin', 'Admin') },
                  { id: 'hr', label: t('roles.hr', 'HR') },
                  { id: 'area_manager', label: t('roles.area_manager', 'Area Manager') },
                  { id: 'store_manager', label: t('roles.store_manager', 'Store Manager') },
                  { id: 'employee', label: t('roles.employee', 'Employee') },
                ].map((roleChip) => (
                  <button
                    key={roleChip.id}
                    onClick={() => setRoleFilter(roleChip.id as any)}
                    style={{
                      background: roleFilter === roleChip.id ? 'var(--accent-light)' : 'transparent',
                      color: roleFilter === roleChip.id ? 'var(--accent)' : 'var(--text-muted)',
                      border: '1.5px solid',
                      borderColor: roleFilter === roleChip.id ? 'var(--accent)' : 'var(--border)',
                      borderRadius: '14px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {roleChip.label}
                  </button>
                ))}
              </div>
            )}

            <div className="global-search-results-list" style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
              {queryText.trim().length < 2 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Search size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <p style={{ fontSize: '13px' }}>
                    {t('search.prompt_type', 'Type at least 2 characters to search the platform.')}
                  </p>
                </div>
              ) : flatResults.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: '13px' }}>{t('search.no_results', 'No matches found.')}</p>
                </div>
              ) : (
                flatResults.map((item, index) => {
                  const isHighlighted = index === activeIndex;
                  const showHeader = index === 0 || flatResults[index].type !== flatResults[index - 1].type;
                  const badge = getBadgeStyle(item);
                  const resultKey = item.type === 'onboarding_task' 
                    ? `onboarding_task-${item.data.id || item.data.employeeId || index}`
                    : `${item.type}-${item.id}`;

                  return (
                    <div key={resultKey}>
                      {showHeader && (
                        <div
                          style={{
                            padding: '8px 20px 4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            background: 'var(--surface-warm)',
                            borderTop: index > 0 ? '1px solid var(--border-light)' : 'none',
                            borderBottom: '1px solid var(--border-light)',
                          }}
                        >
                          {getTypeName(item.type)}
                        </div>
                      )}

                      <div
                        onClick={() => handleNavigate(item)}
                        onMouseEnter={() => setActiveIndex(index)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '10px 20px',
                          cursor: 'pointer',
                          background: isHighlighted ? 'var(--accent-light)' : 'transparent',
                          transition: 'background 0.1s ease',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'var(--background)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {getTypeIcon(item.type)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '2px',
                              flexWrap: 'wrap'
                            }}
                          >
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {item.label}
                            </span>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '9px',
                              fontWeight: 700,
                              background: badge.bg,
                              color: badge.color,
                              borderRadius: '4px',
                              padding: '1px 6px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}>
                              {badge.icon}
                              <span>{badge.text}</span>
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.sub}
                          </div>
                        </div>
                        {isHighlighted && (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              color: 'var(--accent)',
                              fontWeight: 500,
                            }}
                          >
                            {t('search.navigate', 'Select')}
                            <CornerDownLeft size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div
              style={{
                padding: '10px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-warm)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', gap: '16px' }}>
                <span>
                  <kbd style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 4px', borderRadius: '3px' }}>↑↓</kbd>{' '}
                  {t('search.nav_tips', 'Navigate')}
                </span>
                <span>
                  <kbd style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 4px', borderRadius: '3px' }}>Enter</kbd>{' '}
                  {t('search.open_tips', 'Open')}
                </span>
                <span>
                  <kbd style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 4px', borderRadius: '3px' }}>Esc</kbd>{' '}
                  {t('search.close_tips', 'Close')}
                </span>
              </div>
              <div>{t('search.powered_by', 'Global Search')}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
