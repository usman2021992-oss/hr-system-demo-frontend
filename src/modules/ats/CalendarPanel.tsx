import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Interview as APIInterview, JobPosting, getAllInterviews, updateInterview, deleteInterview, InterviewType } from '../../api/ats';
import { Employee, Company } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { getAvatarUrl, getCompanyLogoUrl } from '../../api/client';
import { Button } from '../../components/ui/Button';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import ATSWeeklyCalendar from './ATSWeeklyCalendar';
import ATSMonthlyCalendar from './ATSMonthlyCalendar';
import InterviewDetailsModal from './InterviewDetailsModal';
import ModalBackdrop from '../../components/ui/ModalBackdrop';
import {
  formatDate,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  addWeeks,
  addMonths,
  applyFilters,
  getActiveFilterCount,
  InterviewFilter,
  Interview,
  INTERVIEW_TYPE_PALETTES,
  INTERVIEW_STATUS_COLORS,
  CONFLICT_COLORS,
  EntryPalette,
} from './atsCalendarUtils';

import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Legend entries read their swatch straight from the shared palettes, so the key
 * can never drift out of sync with the blocks it is explaining.
 */
const CALENDAR_LEGEND: Array<{
  key: string;
  fallback: string;
  palette: EntryPalette;
  emphasise?: boolean;
}> = [
  { key: 'ats.interviewType.in_person', fallback: 'In-Person', palette: INTERVIEW_TYPE_PALETTES.in_person },
  { key: 'ats.interviewType.phone', fallback: 'Phone', palette: INTERVIEW_TYPE_PALETTES.phone },
  { key: 'ats.interviewType.video', fallback: 'Video', palette: INTERVIEW_TYPE_PALETTES.video },
  { key: 'ats.status.completed', fallback: 'Completed', palette: INTERVIEW_STATUS_COLORS.completed },
  { key: 'ats.status.cancelled', fallback: 'Cancelled', palette: INTERVIEW_STATUS_COLORS.cancelled },
  { key: 'ats.scheduleConflict', fallback: 'Conflict', palette: CONFLICT_COLORS, emphasise: true },
];

interface CalendarPanelProps {
  positions: JobPosting[];
  employees: Employee[];
  companyId?: number;
  companies?: Company[];
}

type CalendarView = 'weekly' | 'monthly';

export default function CalendarPanel({
  positions,
  employees,
  companyId,
  companies = [],
}: CalendarPanelProps) {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();
  const { showToast } = useToast();
  const { socket } = useSocket();
  const { user } = useAuth();

  // State
  const [view, setView] = useState<CalendarView>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState<APIInterview | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<InterviewFilter>({
    positionId: null,
    interviewerId: null,
  });

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === 'weekly') {
      return {
        start: formatDate(getWeekStart(currentDate)),
        end: formatDate(getWeekEnd(currentDate)),
      };
    } else {
      return {
        start: formatDate(getMonthStart(currentDate)),
        end: formatDate(getMonthEnd(currentDate)),
      };
    }
  }, [view, currentDate]);

  // Fetch interviews
  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        dateFrom: dateRange.start,
        dateTo: dateRange.end,
        companyId,
      };

      if (filters.positionId !== null) {
        params.positionId = filters.positionId;
      }
      if (filters.interviewerId !== null) {
        params.interviewerId = filters.interviewerId;
      }

      const response = await getAllInterviews(params);
      
      // Transform interviews to include scheduledDate, scheduledTime, and status
      const transformedInterviews = (response.interviews || []).map((interview) => {
        const scheduledDate = new Date(interview.scheduledAt);
        const dateStr = scheduledDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = scheduledDate.toTimeString().slice(0, 5); // HH:mm
        
        return {
          ...interview,
          scheduledDate: dateStr,
          scheduledTime: timeStr,
          durationMinutes: interview.durationMinutes || 60,
          status: 'scheduled' as const,
        };
      });
      
      setInterviews(transformedInterviews);
    } catch (error) {
      console.error('Failed to fetch interviews:', error);
      showToast(t('ats.fetchInterviewsError', 'Failed to load interviews'), 'error');
      setInterviews([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end, filters, companyId, t, showToast]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const transformInterview = (interview: APIInterview): Interview => {
      const scheduledDate = new Date(interview.scheduledAt);
      const dateStr = scheduledDate.toISOString().split('T')[0];
      const timeStr = scheduledDate.toTimeString().slice(0, 5);
      
      return {
        ...interview,
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        durationMinutes: interview.durationMinutes || 60,
        status: 'scheduled' as const,
      };
    };

    const handleInterviewCreated = (data: { interview: APIInterview }) => {
      setInterviews((prev) => [...prev, transformInterview(data.interview)]);
      showToast(t('ats.interviewCreated', 'New interview scheduled'), 'success');
    };

    const handleInterviewUpdated = (data: { interview: APIInterview }) => {
      const transformed = transformInterview(data.interview);
      setInterviews((prev) =>
        prev.map((interview) => (interview.id === transformed.id ? transformed : interview))
      );
      if (selectedInterview?.id === data.interview.id) {
        setSelectedInterview(data.interview);
      }
    };

    const handleInterviewDeleted = (data: { interviewId: number }) => {
      setInterviews((prev) => prev.filter((interview) => interview.id !== data.interviewId));
      if (selectedInterview?.id === data.interviewId) {
        setSelectedInterview(null);
      }
    };

    socket.on('interview:created', handleInterviewCreated);
    socket.on('interview:updated', handleInterviewUpdated);
    socket.on('interview:deleted', handleInterviewDeleted);

    return () => {
      socket.off('interview:created', handleInterviewCreated);
      socket.off('interview:updated', handleInterviewUpdated);
      socket.off('interview:deleted', handleInterviewDeleted);
    };
  }, [socket, selectedInterview, t, showToast]);

  // Navigation handlers
  const handlePrevious = () => {
    if (view === 'weekly') {
      setCurrentDate((prev) => addWeeks(prev, -1));
    } else {
      setCurrentDate((prev) => addMonths(prev, -1));
    }
  };

  const handleNext = () => {
    if (view === 'weekly') {
      setCurrentDate((prev) => addWeeks(prev, 1));
    } else {
      setCurrentDate((prev) => addMonths(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // View toggle
  const handleViewChange = (newView: CalendarView) => {
    setView(newView);
  };

  // Filter handlers
  const handleFilterChange = (key: keyof InterviewFilter, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      positionId: null,
      interviewerId: null,
    });
  };

  // Interview handlers
  const handleInterviewClick = (interview: Interview) => {
    // Convert back to API Interview for the modal
    const apiInterview: APIInterview = {
      id: interview.id,
      candidateId: interview.candidateId,
      interviewerId: interview.interviewerId,
      interviewType: interview.interviewType,
      scheduledAt: interview.scheduledAt,
      location: interview.location,
      description: interview.description,
      notes: interview.notes,
      feedback: interview.feedback,
      durationMinutes: interview.durationMinutes,
      icsUid: interview.icsUid,
      createdAt: interview.createdAt,
      updatedAt: interview.updatedAt,
      candidateName: interview.candidateName,
      candidateSurname: interview.candidateSurname,
      candidateAvatarFilename: interview.candidateAvatarFilename,
      positionTitle: interview.positionTitle,
      positionId: interview.positionId,
      interviewerName: interview.interviewerName,
      interviewerSurname: interview.interviewerSurname,
      interviewerAvatarFilename: interview.interviewerAvatarFilename,
    };
    setSelectedInterview(apiInterview);
  };

  const handleSaveInterview = async (updates: Partial<APIInterview>) => {
    if (!selectedInterview) return;

    try {
      // Filter out null values - API expects undefined for optional fields
      const cleanedUpdates: {
        feedback?: string;
        notes?: string;
        scheduledAt?: string;
        interviewType?: InterviewType;
        location?: string;
        description?: string;
        durationMinutes?: number;
        interviewerId?: number | null;
      } = {};
      
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null) {
          (cleanedUpdates as any)[key] = value;
        }
      }
      
      const updated = await updateInterview(selectedInterview.id, cleanedUpdates);
      
      // Transform the updated interview
      const scheduledDate = new Date(updated.scheduledAt);
      const dateStr = scheduledDate.toISOString().split('T')[0];
      const timeStr = scheduledDate.toTimeString().slice(0, 5);
      
      const transformedUpdated: Interview = {
        ...updated,
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        durationMinutes: updated.durationMinutes || 60,
        status: 'scheduled' as const,
      };
      
      setInterviews((prev) =>
        prev.map((interview) => (interview.id === transformedUpdated.id ? transformedUpdated : interview))
      );
      setSelectedInterview(updated);
      showToast(t('ats.interviewUpdated', 'Interview updated successfully'), 'success');
    } catch (error) {
      console.error('Failed to update interview:', error);
      showToast(t('ats.updateInterviewError', 'Failed to update interview'), 'error');
      throw error;
    }
  };

  const handleDeleteInterview = async () => {
    if (!selectedInterview) return;

    try {
      await deleteInterview(selectedInterview.id);
      setInterviews((prev) => prev.filter((interview) => interview.id !== selectedInterview.id));
      setSelectedInterview(null);
      showToast(t('ats.interviewDeleted', 'Interview deleted successfully'), 'success');
    } catch (error) {
      console.error('Failed to delete interview:', error);
      showToast(t('ats.deleteInterviewError', 'Failed to delete interview'), 'error');
      throw error;
    }
  };

  // Apply filters to interviews
  const filteredInterviews = useMemo(() => {
    let result = applyFilters(interviews, filters);
    
    // Filter interviews based on user role - store managers only see their own interviews
    if (user?.role === 'store_manager') {
      result = result.filter((interview) => interview.interviewerId === user.id);
    }
    
    return result;
  }, [interviews, filters, user]);

  // Active filter count
  const activeFilterCount = getActiveFilterCount(filters);

  // Date range label
  const dateRangeLabel = useMemo(() => {
    if (view === 'weekly') {
      const start = getWeekStart(currentDate);
      const end = getWeekEnd(currentDate);
      return `${start.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })} - ${end.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    } else {
      return currentDate.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
    }
  }, [view, currentDate]);

  // Position options for filter
  const positionOptions: SelectOption[] = useMemo(() => {
    return [
      { value: 'all', label: t('common.allPositions', 'All Positions') },
      ...positions.map((position) => ({
        value: String(position.id),
        label: position.title,
      })),
    ];
  }, [positions, t]);

  // Interviewer options for filter
  const interviewerOptions: SelectOption[] = useMemo(() => {
    const interviewers = employees.filter(
      (emp) => emp.role === 'hr' || emp.role === 'area_manager' || emp.role === 'admin' || emp.role === 'store_manager'
    );
    
    // Count interviews per interviewer
    const interviewCounts = new Map<number, number>();
    interviews.forEach((interview) => {
      if (interview.interviewerId) {
        interviewCounts.set(
          interview.interviewerId,
          (interviewCounts.get(interview.interviewerId) || 0) + 1
        );
      }
    });
    
    return [
      { value: 'all', label: t('common.allInterviewers', 'All Interviewers') },
      ...interviewers.map((emp) => {
        const avatarUrl = getAvatarUrl(emp.avatarFilename);
        const fullName = `${emp.name} ${emp.surname}`;
        const interviewCount = interviewCounts.get(emp.id) || 0;
        
        // Role label mapping
        const roleLabels: Record<string, string> = {
          admin: t('roles.admin', 'Admin'),
          hr: t('roles.hr', 'HR'),
          area_manager: t('roles.areaManager', 'Area Manager'),
          store_manager: t('roles.storeManager', 'Store Manager'),
        };
        
        // Role colors
        const roleColors: Record<string, { bg: string; text: string }> = {
          admin: { bg: '#dbeafe', text: '#1e40af' },
          hr: { bg: '#fce7f3', text: '#9f1239' },
          area_manager: { bg: '#e0e7ff', text: '#4338ca' },
          store_manager: { bg: '#fef3c7', text: '#92400e' },
        };
        
        const roleColor = roleColors[emp.role] || { bg: '#f3f4f6', text: '#374151' };
        
        const initials = (name: string) => name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
        
        // Generate beautiful initials and avatar bg for company label
        const companyInitials = (emp as any).companyName ? initials((emp as any).companyName) : 'CO';
        const companyAvatarBg = (emp as any).companyName 
          ? ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'][Math.abs((emp as any).companyName.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)) % 6]
          : 'var(--border)';

        return {
          value: String(emp.id),
          label: `${fullName}${(emp as Employee & { companyName?: string | null }).companyName ? ` — ${(emp as Employee & { companyName?: string | null }).companyName}` : ''}`,
          render: (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr auto',
              gap: 16,
              width: '100%',
              padding: '4px 0',
              alignItems: 'center',
            }}>
              {/* Column 1: User Avatar + Name + Sub-detail (interviews) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: avatarUrl ? 'transparent' : 'var(--primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : initials(fullName)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {fullName}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {t('ats.interviewsCount', 'Interviews')}: {interviewCount}
                  </div>
                </div>
              </div>

              {/* Column 2: Company initials Avatar + Company Name + Store Name (in italics underneath) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {(emp as any).companyName ? (
                  <>
                    {(() => {
                      const comp = companies?.find((c) => c.id === emp.companyId || c.name === (emp as any).companyName);
                      const companyLogoUrl = comp?.logoFilename ? getCompanyLogoUrl(comp.logoFilename) : null;
                      return companyLogoUrl ? (
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          background: 'var(--surface-warm)',
                        }}>
                          <img src={companyLogoUrl} alt={(emp as any).companyName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          background: companyAvatarBg,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}>
                          {companyInitials}
                        </div>
                      );
                    })()}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {(emp as any).companyName}
                      </div>
                      {(emp as any).storeName ? (
                        <div style={{
                          fontSize: 10,
                          fontStyle: 'italic',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {(emp as any).storeName}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-disabled)', fontStyle: 'italic' }}>
                    {t('ats.noCompanyAssigned', 'No company assigned')}
                  </span>
                )}
              </div>

              {/* Column 3: User Role Tag */}
              <div
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: roleColor.bg,
                  color: roleColor.text,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                {roleLabels[emp.role] || emp.role}
              </div>
            </div>
          ),
        };
      }),
    ];
  }, [employees, interviews, t]);

  return (
    <>
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          // No height cap and no scroll of its own: the panel grows to fit the
          // calendar and the app shell's <main> provides the single page scroll.
          // A bounded height here is what produced two nested scrollbars.
          overflow: 'hidden',
        }}
      >
        {/* Single row header - matching shifts module */}
        <div
          style={{
            padding: isMobile ? '12px 14px' : '10px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'space-between',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 12 : 8,
            minHeight: isMobile ? 'auto' : 52,
            flexShrink: 0,
          }}
        >
          {isMobile ? (
            <>
              {/* Row 1: View toggle & Today */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--background)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 8,
                    padding: 2,
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  {(['weekly', 'monthly'] as CalendarView[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleViewChange(mode)}
                      style={{
                        padding: '5px 14px',
                        background: view === mode ? 'var(--primary)' : 'transparent',
                        color: view === mode ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: 6,
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        fontWeight: 600,
                        transition: 'background 0.15s, color 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mode === 'weekly' ? t('ats.weeklyView', 'Weekly') : t('ats.monthlyView', 'Monthly')}
                    </button>
                  ))}
                </div>

                <Button variant="secondary" onClick={handleToday} style={{ fontSize: 12, padding: '5px 14px', fontWeight: 600, flexShrink: 0 }}>
                  {t('common.today', 'Today')}
                </Button>
              </div>

              {/* Row 2: Navigation & Filters */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={handlePrevious}
                    aria-label="Previous"
                    style={{
                      padding: '5px 8px',
                      color: 'var(--text-primary)',
                      borderRadius: 6,
                      lineHeight: 1,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: 110,
                      textAlign: 'center',
                      userSelect: 'none',
                      padding: '0 4px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 13,
                        color: 'var(--primary)',
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dateRangeLabel}
                    </span>
                  </div>

                  <button
                    onClick={handleNext}
                    aria-label="Next"
                    style={{
                      padding: '5px 8px',
                      color: 'var(--text-primary)',
                      borderRadius: 6,
                      lineHeight: 1,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowFilterModal(true)}
                    style={{
                      padding: '6px 12px',
                      border: '1.5px solid var(--border)',
                      borderRadius: 7,
                      background: activeFilterCount > 0 ? 'var(--primary)' : 'var(--surface)',
                      color: activeFilterCount > 0 ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      transition: 'all 0.15s',
                    }}
                  >
                    <Filter size={14} />
                    {t('common.filters', 'Filters')}
                    {activeFilterCount > 0 && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 18,
                          height: 18,
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.25)',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '0 5px',
                        }}
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          flexShrink: 0,
                          border: '2px solid var(--border)',
                          borderTopColor: 'var(--primary)',
                          animation: 'spin 0.7s linear infinite',
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* LEFT: view toggle + navigation + today */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {/* View toggle pill */}
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--background)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 8,
                    padding: 2,
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  {(['weekly', 'monthly'] as CalendarView[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleViewChange(mode)}
                      style={{
                        padding: '5px 14px',
                        background: view === mode ? 'var(--primary)' : 'transparent',
                        color: view === mode ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: 6,
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        fontWeight: 600,
                        transition: 'background 0.15s, color 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mode === 'weekly' ? t('ats.weeklyView', 'Weekly') : t('ats.monthlyView', 'Monthly')}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />

                {/* Navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={handlePrevious}
                    aria-label="Previous"
                    style={{
                      padding: '5px 8px',
                      color: 'var(--text-primary)',
                      borderRadius: 6,
                      lineHeight: 1,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: 130,
                      textAlign: 'center',
                      userSelect: 'none',
                      padding: '0 4px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        fontSize: 14,
                        color: 'var(--primary)',
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dateRangeLabel}
                    </span>
                  </div>

                  <button
                    onClick={handleNext}
                    aria-label="Next"
                    style={{
                      padding: '5px 8px',
                      color: 'var(--text-primary)',
                      borderRadius: 6,
                      lineHeight: 1,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Today button */}
                <Button variant="secondary" onClick={handleToday} style={{ fontSize: 12, padding: '5px 14px', fontWeight: 600, flexShrink: 0 }}>
                  {t('common.today', 'Today')}
                </Button>
              </div>

              {/* RIGHT: filter button + loading */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {/* Filter button */}
                <button
                  onClick={() => setShowFilterModal(true)}
                  style={{
                    padding: '6px 12px',
                    border: '1.5px solid var(--border)',
                    borderRadius: 7,
                    background: activeFilterCount > 0 ? 'var(--primary)' : 'var(--surface)',
                    color: activeFilterCount > 0 ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >
                  <Filter size={14} />
                  {t('common.filters', 'Filters')}
                  {activeFilterCount > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 18,
                        height: 18,
                        borderRadius: 999,
                        background: activeFilterCount > 0 ? 'rgba(255,255,255,0.25)' : 'var(--accent)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '0 5px',
                      }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {loading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        flexShrink: 0,
                        border: '2px solid var(--border)',
                        borderTopColor: 'var(--primary)',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t('common.loading', 'Loading...')}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Calendar Legend Bar */}
        <div
          style={{
            padding: '8px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', fontWeight: 700 }}>
            {t('ats.legend', 'Legend')}:
          </span>
          {CALENDAR_LEGEND.map(({ key, fallback, palette, emphasise }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: palette.bg,
                  borderLeft: `3px solid ${palette.leftBorder}`,
                  border: `1px solid ${palette.border}`,
                  borderLeftWidth: 3,
                  borderLeftColor: palette.leftBorder,
                }}
              />
              <span style={emphasise ? { color: palette.text, fontWeight: 700 } : undefined}>
                {t(key, fallback)}
              </span>
            </div>
          ))}
        </div>

        {/* Calendar Content */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--background)' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '4px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            </div>
          ) : view === 'weekly' ? (
            <ATSWeeklyCalendar
              interviews={filteredInterviews}
              weekStart={getWeekStart(currentDate)}
              onInterviewClick={handleInterviewClick}
            />
          ) : (
            <ATSMonthlyCalendar
              interviews={filteredInterviews}
              currentDate={currentDate}
              onDayClick={(date) => {
                setCurrentDate(new Date(date));
                setView('weekly');
              }}
              onInterviewClick={handleInterviewClick}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <div>
            {filteredInterviews.length} {t('ats.interviews', 'interviews')}
            {activeFilterCount > 0 && ` (${t('common.filtered', 'filtered')})`}
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      {showFilterModal && (
        <ModalBackdrop onClose={() => setShowFilterModal(false)} width={500}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                <Filter size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                {t('common.filters', 'Filters')}
              </h3>
              <button
                onClick={() => setShowFilterModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 24,
                  padding: '0 4px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Position filter */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('ats.position', 'Position')}
              </label>
              <CustomSelect
                options={positionOptions}
                value={filters.positionId === null ? 'all' : String(filters.positionId)}
                onChange={(value) => handleFilterChange('positionId', value === 'all' || value === null ? null : parseInt(value, 10))}
                placeholder={t('ats.selectPosition', 'Select Position')}
              />
            </div>

            {/* Interviewer filter */}
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('ats.interviewer', 'Interviewer')}
              </label>
              <CustomSelect
                options={interviewerOptions}
                value={filters.interviewerId === null ? 'all' : String(filters.interviewerId)}
                onChange={(value) => handleFilterChange('interviewerId', value === 'all' || value === null ? null : parseInt(value, 10))}
                placeholder={t('ats.selectInterviewer', 'Select Interviewer')}
              />
            </div>
          </div>

          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Button variant="secondary" onClick={handleClearFilters} disabled={activeFilterCount === 0}>
              {t('common.clearFilters', 'Clear Filters')}
            </Button>
            <Button variant="primary" onClick={() => setShowFilterModal(false)}>
              {t('common.apply', 'Apply')}
            </Button>
          </div>
        </ModalBackdrop>
      )}

      {/* Interview Details Modal */}
      {selectedInterview && (
        <InterviewDetailsModal
          interview={selectedInterview}
          onClose={() => setSelectedInterview(null)}
          onSave={handleSaveInterview}
          onDelete={handleDeleteInterview}
        />
      )}
    </>
  );
}
