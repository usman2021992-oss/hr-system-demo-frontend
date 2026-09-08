import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Phone, Users, Briefcase, FileText, Mail, PhoneIcon, Linkedin, Building2, Store, MessageSquare, Trash2, Bell } from 'lucide-react';
import DocumentPreviewModal from './DocumentPreviewModal';
import { getResumeUrl, getAvatarUrl, getCompanyLogoUrl, getStoreLogoUrl } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { getAllInterviews, Interview as APIInterview, getInterviewFeedbackComments, addInterviewFeedbackComment, deleteInterviewFeedbackComment, InterviewFeedbackComment, getInterviewNotifications, InterviewNotificationLog } from '../../api/ats';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export default function InterviewsPanel({ companyId }: { companyId?: number }) {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState<APIInterview[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedInterview, setSelectedInterview] = useState<APIInterview | null>(null);
  const [feedbackComments, setFeedbackComments] = useState<InterviewFeedbackComment[]>([]);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [hoveredFeedbackId, setHoveredFeedbackId] = useState<number | null>(null);
  const [interviewNotifications, setInterviewNotifications] = useState<InterviewNotificationLog[]>([]);
  const [notificationModalFeedbackId, setNotificationModalFeedbackId] = useState<number | null>(null);
  const [notificationModalLogs, setNotificationModalLogs] = useState<InterviewNotificationLog[]>([]);

  useEffect(() => {
    loadInterviews();
  }, [companyId]);

  const loadInterviews = async () => {
    try {
      setLoading(true);
      const { interviews: data } = await getAllInterviews({ companyId });
      console.log('✅ Interviews loaded successfully:', data.length, 'interviews');
      setInterviews(data);
    } catch (error) {
      console.error('❌ Failed to load interviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackClick = async (interview: APIInterview) => {
    setSelectedInterview(interview);
    setFeedbackDraft('');
    setLoadingFeedback(true);
    try {
      const [comments, notifications] = await Promise.all([
        getInterviewFeedbackComments(interview.id),
        getInterviewNotifications(interview.id).catch(() => []),
      ]);
      setFeedbackComments(comments);
      setInterviewNotifications(notifications);
    } catch (error) {
      console.error('Failed to load feedback:', error);
      showToast(t('ats.errorLoadFeedback', 'Failed to load feedback'), 'error');
    } finally {
      setLoadingFeedback(false);
    }
  };

  const handleCloseFeedbackModal = () => {
    setSelectedInterview(null);
    setFeedbackComments([]);
    setFeedbackDraft('');
  };

  const handleAddFeedback = async () => {
    if (!selectedInterview || !feedbackDraft.trim()) return;
    
    setSavingFeedback(true);
    try {
      const newComment = await addInterviewFeedbackComment(selectedInterview.id, feedbackDraft.trim());
      setFeedbackComments(prev => [...prev, newComment]);
      setFeedbackDraft('');
      showToast(t('ats.feedbackAdded', 'Feedback added successfully'), 'success');
    } catch (error) {
      console.error('Failed to add feedback:', error);
      showToast(t('ats.errorAddFeedback', 'Failed to add feedback'), 'error');
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleDeleteFeedback = async (commentId: number) => {
    setDeletingFeedbackId(commentId);
    try {
      await deleteInterviewFeedbackComment(commentId);
      setFeedbackComments(prev => prev.filter(c => c.id !== commentId));
      showToast(t('ats.feedbackDeleted', 'Feedback deleted successfully'), 'success');
    } catch (error) {
      console.error('Failed to delete feedback:', error);
      showToast(t('ats.errorDeleteFeedback', 'Failed to delete feedback'), 'error');
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const now = new Date();
  
  // Filter interviews based on user role
  const filteredByRole = user?.role === 'store_manager' 
    ? interviews.filter((interview) => interview.interviewerId === user.id)
    : interviews;

  console.log('🔍 Filtering results:', {
    totalInterviews: interviews.length,
    userRole: user?.role,
    filteredCount: filteredByRole.length,
    userId: user?.id
  });

  const upcomingInterviews = filteredByRole
    .filter((interview) => new Date(interview.scheduledAt) >= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const pastInterviews = filteredByRole
    .filter((interview) => new Date(interview.scheduledAt) < now)
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  console.log('📅 Interview counts:', {
    upcoming: upcomingInterviews.length,
    past: pastInterviews.length,
    activeTab
  });

  const displayedInterviews = activeTab === 'upcoming' ? upcomingInterviews : pastInterviews;

  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [showResumePreview, setShowResumePreview] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spinner size="lg" color="var(--primary)" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('upcoming')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'upcoming' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'upcoming' ? 'var(--primary)' : 'var(--text-secondary)',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: -2,
          }}
        >
          {t('ats.upcomingInterviews', 'Upcoming')} ({upcomingInterviews.length})
        </button>
        <button
          onClick={() => setActiveTab('past')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'past' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'past' ? 'var(--primary)' : 'var(--text-secondary)',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: -2,
          }}
        >
          {t('ats.pastInterviews', 'Past')} ({pastInterviews.length})
        </button>
      </div>

      {/* Interviews List */}
      {displayedInterviews.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
          }}
        >
          <Calendar size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>
            {activeTab === 'upcoming'
              ? t('ats.noUpcomingInterviews', 'No upcoming interviews')
              : t('ats.noPastInterviews', 'No past interviews')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayedInterviews.map((interview) => {
            const scheduledDate = new Date(interview.scheduledAt);
            const candidateFullName = `${interview.candidateName || ''} ${interview.candidateSurname || ''}`.trim() || t('ats.defaultCandidateName', 'Candidate');
            const candidateAvatarUrl = getAvatarUrl(interview.candidateAvatarFilename);
            const interviewerFullName = interview.interviewerName
              ? `${interview.interviewerName} ${interview.interviewerSurname || ''}`.trim()
              : null;
            const interviewerAvatarUrl = interview.interviewerAvatarFilename 
              ? getAvatarUrl(interview.interviewerAvatarFilename)
              : null;

            return (
              <div
                key={interview.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                {/* Compact Header */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #0D2137 0%, #1e3a5f 100%)',
                    padding: isMobile ? '12px 14px' : '10px 14px',
                    display: 'flex',
                    alignItems: isMobile ? 'stretch' : 'center',
                    justifyContent: 'space-between',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? 12 : 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', width: isMobile ? '100%' : 'auto' }}>
                    {/* Date Badge */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        minWidth: 50,
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: 7,
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1 }}>
                        {scheduledDate.getDate()}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: 2, opacity: 0.9 }}>
                        {scheduledDate.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
                      </div>
                    </div>

                    {/* Time & Duration */}
                    <div style={{ flex: 1, marginLeft: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#fff', fontSize: '0.9rem', fontWeight: 700 }}>
                        <Clock size={15} />
                        {scheduledDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        {interview.durationMinutes && <span style={{ opacity: 0.8, fontSize: '0.8rem' }}>({interview.durationMinutes}min)</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
                    {/* Feedback Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFeedbackClick(interview);
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 5,
                        background: 'rgba(124,58,237,0.25)',
                        border: '1px solid rgba(124,58,237,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        flex: isMobile ? 1 : 'none',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(124,58,237,0.35)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(124,58,237,0.25)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <MessageSquare size={13} color="#fff" />
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff' }}>
                        {t('ats.feedback', 'Feedback')}
                      </span>
                    </button>

                    {/* Interview Type Badge */}
                    <div
                      style={{
                        padding: '5px 10px',
                        borderRadius: 5,
                        background: interview.interviewType === 'phone' ? 'rgba(234,88,12,0.25)' : 'rgba(34,197,94,0.25)',
                        border: `1px solid ${interview.interviewType === 'phone' ? 'rgba(234,88,12,0.5)' : 'rgba(34,197,94,0.5)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        flex: isMobile ? 1 : 'none',
                        justifyContent: 'center',
                      }}
                    >
                      {interview.interviewType === 'phone' ? <Phone size={13} color="#fff" /> : <Users size={13} color="#fff" />}
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff' }}>
                        {interview.interviewType === 'phone' ? t('ats.phone', 'Phone') : t('ats.inPerson', 'In-Person')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compact Content */}
                <div style={{ padding: '12px 14px' }}>
                  {/* Second Row: Candidate Details with Labels */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                    {/* Candidate Block */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t('ats.candidate', 'Candidate')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {candidateAvatarUrl ? (
                          <img
                            src={candidateAvatarUrl}
                            alt={candidateFullName}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '2px solid #3b82f6',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'linear-gradient(135deg, #1e3a5f, #3a7bd5)',
                              color: '#fff',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              border: '2px solid #3b82f6',
                            }}
                          >
                            {candidateFullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{candidateFullName}</div>
                      </div>
                    </div>

                    {/* Email Block */}
                    {interview.candidateEmail && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('common.email', 'Email')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Mail size={14} color="#3b82f6" />
                          <span style={{ fontSize: '0.85rem', color: '#475569' }}>{interview.candidateEmail}</span>
                        </div>
                      </div>
                    )}

                    {/* Phone Block */}
                    {interview.candidatePhone && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('common.phone', 'Phone')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <PhoneIcon size={14} color="#10b981" />
                          <span style={{ fontSize: '0.85rem', color: '#475569' }}>{interview.candidatePhone}</span>
                        </div>
                      </div>
                    )}

                    {/* LinkedIn Block */}
                    {interview.candidateLinkedinUrl && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          LinkedIn
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Linkedin size={14} color="#0077b5" />
                          <a 
                            href={interview.candidateLinkedinUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.85rem', color: '#0077b5', textDecoration: 'none' }}
                            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                          >
                            {t('ats.viewProfile', 'View Profile')}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CV / Resume - Full Width Row */}
                  {(() => {
                    const candidateCvPath = interview.resumePath || interview.cvPath || null;
                    if (!candidateCvPath) return null;
                    const url = getResumeUrl(candidateCvPath);
                    const filename = candidateCvPath.split('/').pop() ?? candidateCvPath;
                    return (
                      <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px dashed rgba(148,163,184,0.25)', background: 'rgba(241,245,249,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <FileText size={16} color="#64748b" />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>{filename}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t('ats.cvAttached', 'CV attached')}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!url) return;
                            setResumePreviewUrl(url);
                            setResumeFilename(filename);
                            setShowResumePreview(true);
                          }}
                          style={{ 
                            padding: '5px 12px', 
                            borderRadius: 6, 
                            border: '1px solid rgba(13,33,55,0.15)', 
                            background: '#fff', 
                            fontSize: '0.75rem',
                            fontWeight: 700, 
                            cursor: 'pointer',
                            color: '#0f172a',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f1f5f9';
                            e.currentTarget.style.borderColor = '#3b82f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#fff';
                            e.currentTarget.style.borderColor = 'rgba(13,33,55,0.15)';
                          }}
                        >
                          {t('ats.viewCv', 'View')}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Third Row: Interviewer, Company, Store, Position, Location, Salary */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                    {/* Interviewer Block */}
                    {interviewerFullName && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('ats.interviewer', 'Interviewer')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          {interviewerAvatarUrl ? (
                            <img
                              src={interviewerAvatarUrl}
                              alt={interviewerFullName}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid #7c3aed',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                border: '2px solid #7c3aed',
                              }}
                            >
                              {interviewerFullName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                              {interviewerFullName}
                            </div>
                            {interview.interviewerRole && (
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{interview.interviewerRole}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Company Block */}
                    {interview.companyName && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('common.company', 'Company')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {interview.companyLogoFilename ? (
                            <img
                              src={getCompanyLogoUrl(interview.companyLogoFilename) || ''}
                              alt={interview.companyName}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 6,
                                objectFit: 'cover',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <Building2 size={16} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{interview.companyName}</div>
                            {interview.companyGroupName && (
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{interview.companyGroupName}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Store Block */}
                    {interview.storeName && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('common.store', 'Store')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {interview.storeLogoFilename ? (
                            <img
                              src={getStoreLogoUrl(interview.storeLogoFilename) || ''}
                              alt={interview.storeName}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 6,
                                objectFit: 'cover',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <Store size={16} />
                            </div>
                          )}
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{interview.storeName}</div>
                        </div>
                      </div>
                    )}

                    {/* Position Block */}
                    {interview.positionTitle && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('ats.position', 'Position')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0f172a', fontWeight: 700 }}>
                          <Briefcase size={14} />
                          <span style={{ fontSize: '0.9rem' }}>{interview.positionTitle}</span>
                        </div>
                      </div>
                    )}

                    {/* Working Hours Block */}
                    {interview.positionWeeklyHours && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 90 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('ats.workingHours', 'Working Hours')}
                        </div>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 4,
                            background: '#dbeafe',
                            color: '#1e40af',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'inline-block',
                            width: 'fit-content',
                          }}
                        >
                          {interview.positionWeeklyHours}h/week
                        </span>
                      </div>
                    )}

                    {/* Job Type Block */}
                    {interview.positionJobType && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 90 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('ats.jobType', 'Job Type')}
                        </div>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 4,
                            background: '#e0e7ff',
                            color: '#4338ca',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'inline-block',
                            width: 'fit-content',
                          }}
                        >
                          {interview.positionJobType === 'fulltime' ? t('ats.jobType_fulltime', 'Full-time') :
                           interview.positionJobType === 'parttime' ? t('ats.jobType_parttime', 'Part-time') :
                           interview.positionJobType === 'contract' ? t('ats.jobType_contract', 'Contract') :
                           interview.positionJobType === 'internship' ? t('ats.jobType_internship', 'Internship') :
                           interview.positionJobType}
                        </span>
                      </div>
                    )}

                    {/* Location Block */}
                    {interview.positionLocation && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 100 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('common.location', 'Location')}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                          📍 {interview.positionLocation}
                        </div>
                      </div>
                    )}

                    {/* Salary Block */}
                    {(interview.positionSalaryMin || interview.positionSalaryMax) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 80 }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {t('ats.salary', 'Salary')}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 700 }}>
                          💰 {interview.positionSalaryMin && interview.positionSalaryMax
                            ? `€${interview.positionSalaryMin.toLocaleString()} - €${interview.positionSalaryMax.toLocaleString()}`
                            : interview.positionSalaryMin
                            ? `€${interview.positionSalaryMin.toLocaleString()}+`
                            : interview.positionSalaryMax
                            ? `Up to €${interview.positionSalaryMax.toLocaleString()}`
                            : ''}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Position Description */}
                  {interview.description && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 8px',
                        background: 'rgba(148,163,184,0.06)',
                        borderRadius: 5,
                        borderLeft: '3px solid #94a3b8',
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                        {interview.description}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {showResumePreview && resumePreviewUrl && resumeFilename && (
        <DocumentPreviewModal url={resumePreviewUrl} filename={resumeFilename} onClose={() => setShowResumePreview(false)} />
      )}

      {/* Interview Feedback Modal */}
      {selectedInterview && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(13,33,55,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={handleCloseFeedbackModal}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 700,
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
              animation: 'popIn 0.22s cubic-bezier(0.16,1,0.3,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                background: 'linear-gradient(135deg, #0D2137 0%, #1e3a5f 100%)',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MessageSquare size={22} color="#fff" />
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {t('ats.interviewFeedback', 'Interview Feedback')}
                </h2>
              </div>
              <button
                onClick={handleCloseFeedbackModal}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 8,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              {/* Interview Info */}
              <div
                style={{
                  marginBottom: 20,
                  padding: 16,
                  background: 'linear-gradient(135deg, rgba(201,151,58,0.08) 0%, rgba(251,191,36,0.08) 100%)',
                  borderRadius: 10,
                  border: '1px solid rgba(201,151,58,0.2)',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('ats.interviewDetails', 'Interview Details')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <Calendar size={18} color="#92400e" />
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                    {new Date(selectedInterview.scheduledAt).toLocaleString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {selectedInterview.candidateName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <Users size={16} color="#64748b" />
                    <span style={{ fontSize: '0.9rem', color: '#475569' }}>
                      <strong>{t('ats.candidate', 'Candidate')}:</strong> {selectedInterview.candidateName} {selectedInterview.candidateSurname}
                    </span>
                  </div>
                )}
                {selectedInterview.positionTitle && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Briefcase size={16} color="#64748b" />
                    <span style={{ fontSize: '0.9rem', color: '#475569' }}>
                      <strong>{t('ats.position', 'Position')}:</strong> {selectedInterview.positionTitle}
                    </span>
                  </div>
                )}
              </div>

              {/* Feedback Comments */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  💬 {t('ats.feedback', 'Feedback')} ({feedbackComments.length})
                </div>

                {loadingFeedback ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                    <Spinner size="md" color="var(--primary)" />
                  </div>
                ) : feedbackComments.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      background: 'rgba(148,163,184,0.06)',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      color: '#64748b',
                      textAlign: 'center',
                      fontStyle: 'italic',
                    }}
                  >
                    {t('ats.noFeedbackYet', 'No feedback yet. Be the first to add feedback!')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {feedbackComments.map((comment) => {
                      const authorName = [comment.authorName, comment.authorSurname].filter(Boolean).join(' ').trim() || t('common.notSet', 'Not set');
                      const authorAvatar = getAvatarUrl(comment.authorAvatarFilename ?? null);
                      const canDelete = user?.id === comment.authorId || ['admin', 'hr'].includes(user?.role || '');

                      return (
                        <div
                          key={comment.id}
                          style={{
                            background: 'var(--background)',
                            borderRadius: 8,
                            padding: '8px 10px',
                            border: '1px solid var(--border)',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            transition: 'all 0.3s ease',
                          }}
                          onMouseEnter={() => setHoveredFeedbackId(comment.id)}
                          onMouseLeave={() => setHoveredFeedbackId(null)}
                        >
                          {/* Header row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <div style={{
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                overflow: 'hidden',
                                background: authorAvatar ? 'transparent' : 'var(--primary)',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 9,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                {authorAvatar ? (
                                  <img src={authorAvatar} alt={authorName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  authorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {authorName}
                                </span>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                                  • {new Date(comment.createdAt).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </div>
                            
                            {/* Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {/* Notifications button */}
                              {interviewNotifications.some((log) => {
                                try {
                                  const payload = JSON.parse(log.recipientEmail || '{}');
                                  return payload.feedbackId === comment.id;
                                } catch {
                                  return false;
                                }
                              }) && (
                                <button
                                  onClick={() => {
                                    setNotificationModalFeedbackId(comment.id);
                                    setNotificationModalLogs(
                                      interviewNotifications.filter(log => {
                                        try {
                                          const payload = JSON.parse(log.recipientEmail || '{}');
                                          return payload.feedbackId === comment.id;
                                        } catch {
                                          return false;
                                        }
                                      }) || []
                                    );
                                  }}
                                  style={{
                                    background: hoveredFeedbackId === comment.id ? 'rgba(2, 132, 199, 0.08)' : 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    width: 24,
                                    height: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    opacity: hoveredFeedbackId === comment.id ? 1 : 0,
                                    transition: 'opacity 0.15s ease, background 0.15s ease',
                                  }}
                                  title={t('ats.feedbackNotifications', 'View Notifications')}
                                >
                                  <Bell size={12} color="var(--primary)" />
                                </button>
                              )}

                              {/* Message / Chat button */}
                              <button
                                onClick={() => {
                                  const candidateName = [selectedInterview?.candidateName, selectedInterview?.candidateSurname].filter(Boolean).join(' ').trim() || 'Interview';
                                  const subjectVal = `Feedback: ${candidateName}`;
                                  navigate(`/hr-chat?recipientId=${comment.authorId}&recipientName=${encodeURIComponent(authorName)}&subject=${encodeURIComponent(subjectVal)}`);
                                }}
                                style={{
                                  background: hoveredFeedbackId === comment.id ? 'rgba(201, 151, 58, 0.08)' : 'transparent',
                                  border: 'none',
                                  borderRadius: 6,
                                  width: 24,
                                  height: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  opacity: hoveredFeedbackId === comment.id ? 1 : 0,
                                  transition: 'opacity 0.15s ease, background 0.15s ease',
                                }}
                                title={t('ats.messageAuthor', 'Message Author')}
                              >
                                <MessageSquare size={12} color="var(--accent)" />
                              </button>

                              {/* Delete button */}
                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteFeedback(comment.id)}
                                  disabled={deletingFeedbackId === comment.id}
                                  style={{
                                    background: hoveredFeedbackId === comment.id ? 'rgba(220,38,38,0.08)' : 'transparent',
                                    border: 'none',
                                    borderRadius: 6,
                                    width: 24,
                                    height: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: deletingFeedbackId === comment.id ? 'not-allowed' : 'pointer',
                                    opacity: hoveredFeedbackId === comment.id ? 1 : 0,
                                    transition: 'opacity 0.15s ease, background 0.15s ease',
                                  }}
                                  title={t('common.delete', 'Delete')}
                                >
                                  <Trash2 size={12} color="#991b1b" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Body row indented */}
                          <div style={{ paddingLeft: 30, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {comment.body}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add Feedback */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                  {t('ats.addFeedback', 'Add Your Feedback')}
                </div>
                <textarea
                  value={feedbackDraft}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                  rows={4}
                  placeholder={t('ats.feedbackPlaceholder', 'Share your thoughts about this interview...')}
                  style={{
                    width: '100%',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '10px 12px',
                    resize: 'vertical',
                    background: 'var(--surface)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Button variant="secondary" onClick={handleCloseFeedbackModal}>
                {t('common.close', 'Close')}
              </Button>
              <Button
                variant="primary"
                onClick={handleAddFeedback}
                disabled={!feedbackDraft.trim() || savingFeedback}
                loading={savingFeedback}
              >
                {t('ats.saveFeedback', 'Save Feedback')}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {notificationModalFeedbackId !== null && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(13,33,55,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => { setNotificationModalFeedbackId(null); setNotificationModalLogs([]); }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 400,
              padding: 24,
              boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('ats.notificationsSent', 'Notifications Sent')}
            </h3>
            {notificationModalLogs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('common.noData', 'No data')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
                {notificationModalLogs.map((log) => {
                  let name = '';
                  let role = log.recipientType;
                  let company = '';
                  let storeName = '';
                  let avatarUrl: string | null = null;
                  try {
                    const data = JSON.parse(log.recipientEmail || '{}');
                    name = data.name || '';
                    role = data.role || role;
                    company = data.companyName || '';
                    storeName = data.storeName || '';
                    avatarUrl = data.avatarFilename ? getAvatarUrl(data.avatarFilename) : null;
                  } catch {}
                  return (
                    <div key={log.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: avatarUrl ? 'transparent' : 'var(--primary)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || 'Unknown'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {company}
                            {storeName && <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{storeName}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ')}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          {new Date(log.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setNotificationModalFeedbackId(null); setNotificationModalLogs([]); }}>
                {t('common.close', 'Close')}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

