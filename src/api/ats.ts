import apiClient from './client';
import { Employee } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'draft' | 'published' | 'closed';
export type JobLanguage = 'it' | 'en' | 'both';
export type JobType = 'fulltime' | 'parttime' | 'contract' | 'internship';
export type RemoteType = 'onsite' | 'hybrid' | 'remote';
export type CandidateStatus = 'received' | 'review' | 'phone_interview' | 'interview' | 'hired' | 'rejected';
export type InterviewType = 'phone' | 'in_person' | 'video';
export type RiskLevel = 'ok' | 'medium' | 'high';
export type AlertType = 'new_candidates' | 'interview_today' | 'candidates_pending' | 'job_at_risk';
export type NotificationStatus = 'pending' | 'sending' | 'done' | 'error';

export interface JobPosting {
  id: number;
  companyId: number;
  companySlug: string;
  companyName: string | null;
  companyLogoFilename: string | null;
  companyGroupName: string | null;
  companyCountry: string | null;
  companyOwnerName: string | null;
  companyOwnerSurname: string | null;
  companyOwnerAvatarFilename: string | null;
  companyStoreCount: number | null;
  storeId: number | null;
  storeName: string | null;
  storeLogoFilename: string | null;
  storeEmployeeCount: number | null;
  storeCountry: string | null;
  storeHrName: string | null;
  storeHrSurname: string | null;
  storeHrAvatarFilename: string | null;
  storeAreaManagerName: string | null;
  storeAreaManagerSurname: string | null;
  storeAreaManagerAvatarFilename: string | null;
  storeManagerName: string | null;
  storeManagerSurname: string | null;
  storeManagerAvatarFilename: string | null;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  address: string | null;
  isRemote: boolean;
  remoteType: RemoteType;
  jobCity: string | null;
  jobState: string | null;
  jobCountry: string | null;
  jobPostalCode: string | null;
  jobAddress: string | null;
  department: string | null;
  weeklyHours: number | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  targetRole: string | null;
  title: string;
  description: string | null;
  tags: string[];
  language: JobLanguage;
  jobType: JobType;
  status: JobStatus;
  source: string;
  indeedPostId: string | null;
  referenceId: string | null;
  createdById: number | null;
  createdByName: string | null;
  createdBySurname: string | null;
  createdByRole: string | null;
  createdByAvatarFilename: string | null;
  createdByStoreName: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: number;
  companyId: number;
  storeId: number | null;
  jobPostingId: number | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  cvPath: string | null;
  tags: string[];
  status: CandidateStatus;
  rejectionReason: string | null;
  source: string;
  sourceRef: string | null;
  resumePath: string | null;
  linkedinUrl: string | null;
  coverLetter: string | null;
  gdprConsent: boolean;
  applicantLocale: string | null;
  consentAcceptedAt: string | null;
  appliedAt: string | null;
  unread: boolean;
  lastStageChange: string;
  createdAt: string;
  updatedAt: string;
}

export interface Interview {
  id: number;
  candidateId: number;
  interviewerId: number | null;
  interviewType: InterviewType;
  scheduledAt: string;
  location: string | null;
  description: string | null;
  notes: string | null;
  feedback: string | null;
  durationMinutes: number | null;
  icsUid: string | null;
  createdAt: string;
  updatedAt: string;
  // Extended fields for calendar view
  candidateName?: string;
  candidateSurname?: string;
  candidateAvatarFilename?: string | null;
  candidateEmail?: string;
  candidatePhone?: string | null;
  candidateLinkedinUrl?: string | null;
  resumePath?: string | null;
  cvPath?: string | null;
  positionTitle?: string;
  positionId?: number | null;
  positionJobType?: string;
  positionWeeklyHours?: number;
  positionSalaryMin?: number;
  positionSalaryMax?: number;
  positionLocation?: string;
  companyId?: number;
  companyName?: string;
  companyLogoFilename?: string | null;
  companyGroupName?: string | null;
  storeId?: number | null;
  storeName?: string | null;
  storeLogoFilename?: string | null;
  interviewerName?: string;
  interviewerSurname?: string;
  interviewerAvatarFilename?: string | null;
  interviewerRole?: string;
}

export interface CandidateComment {
  id: number;
  candidateId: number;
  authorId: number;
  authorName: string | null;
  authorSurname: string | null;
  authorAvatarFilename: string | null;
  authorRole: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewFeedbackComment {
  id: number;
  interviewId: number;
  authorId: number;
  authorName: string | null;
  authorSurname: string | null;
  authorAvatarFilename: string | null;
  authorRole: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewNotificationLog {
  id: number;
  interviewId: number;
  recipientType: string;
  recipientEmail: string | null;
  recipientUserId: number | null;
  channel: string;
  status: NotificationStatus;
  attempts: number;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HRAlert {
  type: AlertType;
  title: string;
  message: string;
  count: number;
  jobPostingId?: number;
  jobTitle?: string;
}

export interface JobRisk {
  jobPostingId: number;
  jobTitle: string;
  flags: { lowCandidates: boolean; noInterviews: boolean; noHires: boolean };
  riskLevel: RiskLevel;
}

// ---------------------------------------------------------------------------
// Job Postings
// ---------------------------------------------------------------------------

export async function getJobs(params?: { status?: string; companyId?: number }): Promise<JobPosting[]> {
  const { data } = await apiClient.get('/ats/jobs', { params });
  return (data.data.jobs ?? []) as JobPosting[];
}

export async function createJob(payload: {
  title: string;
  description?: string;
  tags?: string[];
  companyId?: number;
  status?: JobStatus;
  storeId?: number;
  language?: JobLanguage;
  jobType?: JobType;
  isRemote?: boolean;
  remoteType?: RemoteType;
  jobCity?: string;
  jobState?: string;
  jobCountry?: string;
  jobPostalCode?: string;
  jobAddress?: string;
  department?: string;
  weeklyHours?: number;
  contractType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: string;
  targetRole?: string;
}): Promise<JobPosting> {
  const { data } = await apiClient.post('/ats/jobs', payload);
  return data.data.job as JobPosting;
}

export async function updateJob(
  id: number,
  payload: Partial<{
    title: string;
    description: string;
    status: JobStatus;
    tags: string[];
    companyId: number;
    storeId: number | null;
    language: JobLanguage;
    jobType: JobType;
    isRemote: boolean;
    remoteType: RemoteType;
    jobCity: string | null;
    jobState: string | null;
    jobCountry: string | null;
    jobPostalCode: string | null;
    jobAddress: string | null;
    department: string | null;
    weeklyHours: number | null;
    contractType: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryPeriod: string | null;
    targetRole: string | null;
  }>,
): Promise<JobPosting> {
  const { data } = await apiClient.patch(`/ats/jobs/${id}`, payload);
  return data.data.job as JobPosting;
}

export async function deleteJob(id: number, options?: { companyId?: number }): Promise<void> {
  await apiClient.delete(`/ats/jobs/${id}`, {
    params: options?.companyId ? { companyId: options.companyId } : undefined,
  });
}

export async function publishJob(id: number, options?: { companyId?: number }): Promise<JobPosting> {
  const { data } = await apiClient.post(`/ats/jobs/${id}/publish`, null, {
    params: options?.companyId ? { companyId: options.companyId } : undefined,
  });
  return data.data.job as JobPosting;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export async function getCandidates(params?: {
  status?: string;
  jobId?: number;
  companyId?: number;
}): Promise<Candidate[]> {
  const { data } = await apiClient.get('/ats/candidates', {
    params: {
      status: params?.status,
      job_id: params?.jobId,
      company_id: params?.companyId,
    },
  });
  return (data.data.candidates ?? []) as Candidate[];
}

export async function createCandidate(payload: {
  fullName: string;
  email?: string;
  phone?: string;
  jobPostingId?: number;
  storeId?: number;
  tags?: string[];
  cvPath?: string;
  resumePath?: string;
  resumeFile?: File | null;
  linkedinUrl?: string;
  coverLetter?: string;
  source?: string;
  sourceRef?: string;
  gdprConsent?: boolean;
  applicantLocale?: string;
  consentAcceptedAt?: string;
  appliedAt?: string;
}): Promise<Candidate> {
  if (payload.resumeFile) {
    const formData = new FormData();
    formData.append('full_name', payload.fullName);
    if (payload.email) formData.append('email', payload.email);
    if (payload.phone) formData.append('phone', payload.phone);
    if (payload.jobPostingId != null) formData.append('job_posting_id', String(payload.jobPostingId));
    if (payload.storeId != null) formData.append('store_id', String(payload.storeId));
    if (payload.tags?.length) formData.append('tags', JSON.stringify(payload.tags));
    if (payload.linkedinUrl) formData.append('linkedin_url', payload.linkedinUrl);
    if (payload.coverLetter) formData.append('cover_letter', payload.coverLetter);
    if (payload.source) formData.append('source', payload.source);
    if (payload.sourceRef) formData.append('source_ref', payload.sourceRef);
    if (payload.applicantLocale) formData.append('applicant_locale', payload.applicantLocale);
    if (payload.consentAcceptedAt) formData.append('consent_accepted_at', payload.consentAcceptedAt);
    if (payload.appliedAt) formData.append('applied_at', payload.appliedAt);
    formData.append('gdpr_consent', payload.gdprConsent ? 'true' : 'false');
    formData.append('resume', payload.resumeFile);
    const { data } = await apiClient.post('/ats/candidates', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data.candidate as Candidate;
  }

  const { data } = await apiClient.post('/ats/candidates', {
    full_name: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    job_posting_id: payload.jobPostingId,
    store_id: payload.storeId,
    tags: payload.tags,
    cv_path: payload.cvPath,
    resume_path: payload.resumePath,
    linkedin_url: payload.linkedinUrl,
    cover_letter: payload.coverLetter,
    source: payload.source,
    source_ref: payload.sourceRef,
    gdpr_consent: payload.gdprConsent,
    applicant_locale: payload.applicantLocale,
    consent_accepted_at: payload.consentAcceptedAt,
    applied_at: payload.appliedAt,
  });
  return data.data.candidate as Candidate;
}

export async function updateCandidateStage(
  id: number,
  status: CandidateStatus,
  rejectionReason?: string,
): Promise<Candidate> {
  const { data } = await apiClient.patch(`/ats/candidates/${id}`, {
    status,
    ...(rejectionReason !== undefined ? { rejection_reason: rejectionReason } : {}),
  });
  return data.data.candidate as Candidate;
}

export async function updateCandidateTags(
  id: number,
  tags: string[],
): Promise<Candidate> {
  const { data } = await apiClient.patch(`/ats/candidates/${id}/tags`, { tags });
  return data.data.candidate as Candidate;
}

export async function deleteCandidate(id: number): Promise<void> {
  await apiClient.delete(`/ats/candidates/${id}`);
}

// ---------------------------------------------------------------------------
// Candidate Comments
// ---------------------------------------------------------------------------

export async function getCandidateComments(candidateId: number): Promise<CandidateComment[]> {
  const { data } = await apiClient.get(`/ats/candidates/${candidateId}/comments`);
  return (data.data.comments ?? []) as CandidateComment[];
}

export async function addCandidateComment(
  candidateId: number,
  body: string,
): Promise<CandidateComment> {
  const { data } = await apiClient.post(`/ats/candidates/${candidateId}/comments`, { body });
  return data.data.comment as CandidateComment;
}

export async function deleteCandidateComment(id: number): Promise<void> {
  await apiClient.delete(`/ats/comments/${id}`);
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export async function getInterviews(candidateId: number): Promise<Interview[]> {
  const { data } = await apiClient.get(`/ats/candidates/${candidateId}/interviews`);
  return (data.data.interviews ?? []) as Interview[];
}

export async function getAllInterviews(params?: {
  dateFrom?: string;
  dateTo?: string;
  positionId?: number;
  candidateId?: number;
  interviewerId?: number;
  status?: string;
  companyId?: number;
}): Promise<{ interviews: Interview[] }> {
  const queryParams = new URLSearchParams();
  if (params?.dateFrom) queryParams.append('date_from', params.dateFrom);
  if (params?.dateTo) queryParams.append('date_to', params.dateTo);
  if (params?.positionId) queryParams.append('position_id', String(params.positionId));
  if (params?.candidateId) queryParams.append('candidate_id', String(params.candidateId));
  if (params?.interviewerId) queryParams.append('interviewer_id', String(params.interviewerId));
  if (params?.status) queryParams.append('status', params.status);
  if (params?.companyId) queryParams.append('company_id', String(params.companyId));

  const queryString = queryParams.toString();
  const url = queryString ? `/ats/interviews?${queryString}` : '/ats/interviews';
  
  const { data } = await apiClient.get(url);
  return { interviews: (data.data?.interviews ?? []) as Interview[] };
}

export async function createInterview(
  candidateId: number,
  payload: {
    scheduledAt: string;
    interviewType?: InterviewType;
    location?: string;
    description?: string;
    notes?: string;
    durationMinutes?: number;
    interviewerId?: number;
    sendIcs?: boolean;
  },
): Promise<Interview> {
  const { data } = await apiClient.post(`/ats/candidates/${candidateId}/interviews`, {
    scheduled_at: payload.scheduledAt,
    interview_type: payload.interviewType,
    location: payload.location,
    description: payload.description,
    notes: payload.notes,
    duration_minutes: payload.durationMinutes,
    interviewer_id: payload.interviewerId,
    send_ics: payload.sendIcs,
  });
  return data.data.interview as Interview;
}

export async function updateInterview(
  id: number,
  payload: {
    feedback?: string;
    notes?: string;
    scheduledAt?: string;
    interviewType?: InterviewType;
    location?: string;
    description?: string;
    durationMinutes?: number;
    interviewerId?: number | null;
  },
): Promise<Interview> {
  const { data } = await apiClient.patch(`/ats/interviews/${id}`, {
    ...(payload.scheduledAt !== undefined ? { scheduled_at: payload.scheduledAt } : {}),
    ...(payload.interviewType !== undefined ? { interview_type: payload.interviewType } : {}),
    ...(payload.location !== undefined ? { location: payload.location } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    ...(payload.durationMinutes !== undefined ? { duration_minutes: payload.durationMinutes } : {}),
    ...(payload.feedback !== undefined ? { feedback: payload.feedback } : {}),
    ...(payload.interviewerId !== undefined ? { interviewer_id: payload.interviewerId } : {}),
  });
  return data.data.interview as Interview;
}

export async function deleteInterview(id: number): Promise<void> {
  await apiClient.delete(`/ats/interviews/${id}`);
}

// ---------------------------------------------------------------------------
// Interview Feedback Comments
// ---------------------------------------------------------------------------

export async function getInterviewFeedbackComments(interviewId: number): Promise<InterviewFeedbackComment[]> {
  const { data } = await apiClient.get(`/ats/interviews/${interviewId}/feedback`);
  return (data.data.comments ?? []) as InterviewFeedbackComment[];
}

export async function addInterviewFeedbackComment(
  interviewId: number,
  body: string,
): Promise<InterviewFeedbackComment> {
  const { data } = await apiClient.post(`/ats/interviews/${interviewId}/feedback`, { body });
  return data.data.comment as InterviewFeedbackComment;
}

export async function deleteInterviewFeedbackComment(id: number): Promise<void> {
  await apiClient.delete(`/ats/interviews/feedback/${id}`);
}

export interface AllInterviewFeedbackComment {
  id: number;
  interviewId: number;
  candidateId: number;
  candidateName: string;
  positionTitle: string | null;
  authorId: number;
  authorName: string | null;
  authorSurname: string | null;
  authorAvatarFilename: string | null;
  authorRole: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export async function getAllInterviewFeedbackComments(params?: { companyId?: number }): Promise<AllInterviewFeedbackComment[]> {
  const { data } = await apiClient.get('/ats/interviews/feedback/all', { params });
  return (data.data.comments ?? []) as AllInterviewFeedbackComment[];
}

// ---------------------------------------------------------------------------
// Interview Notification Logs
// ---------------------------------------------------------------------------

export async function getInterviewNotifications(interviewId: number): Promise<InterviewNotificationLog[]> {
  const { data } = await apiClient.get(`/ats/interviews/${interviewId}/notifications`);
  return (data.data.logs ?? []) as InterviewNotificationLog[];
}

export async function sendInterviewEmail(
  interviewId: number,
  logId?: number,
  channel?: 'email' | 'in_app',
  recipientType?: 'interviewer' | 'candidate',
): Promise<{ success: boolean; recipientName?: string; recipientEmail?: string }> {
  const { data } = await apiClient.post(`/ats/interviews/${interviewId}/notifications/send`, {
    logId,
    channel,
    recipientType,
  });
  return data.data || { success: true };
}

// ---------------------------------------------------------------------------
// Alerts + Risks
// ---------------------------------------------------------------------------

export async function getAlerts(params?: { companyId?: number }): Promise<HRAlert[]> {
  const { data } = await apiClient.get('/ats/alerts', { params });
  return (data.data.alerts ?? []) as HRAlert[];
}

export async function getRisks(params?: { companyId?: number }): Promise<JobRisk[]> {
  const { data } = await apiClient.get('/ats/risks', { params });
  return (data.data.risks ?? []) as JobRisk[];
}

// ---------------------------------------------------------------------------
// Translation preview
// ---------------------------------------------------------------------------

export async function previewJobTranslation(payload: {
  text: string;
  sourceLanguage?: JobLanguage;
}): Promise<{ translatedText: string; targetLanguage: 'en'; provider: string }> {
  const { data } = await apiClient.post('/ats/translate-preview', payload);
  return data.data as { translatedText: string; targetLanguage: 'en'; provider: string };
}

export async function getJobCompliance(identifier: string, companyId?: number): Promise<any> {
  const { data } = await apiClient.get(`/ats/jobs/${identifier}/compliance`, {
    params: companyId ? { company_id: companyId } : undefined
  });
  return data.data.job;
}

export async function listInterviewers(companyId?: number): Promise<{ interviewers: Employee[] }> {
  const { data } = await apiClient.get('/ats/interviewers', {
    params: companyId ? { companyId } : undefined,
  });
  return data.data as { interviewers: Employee[] };
}

export async function getCandidate(id: number): Promise<Candidate> {
  const { data } = await apiClient.get(`/ats/candidates/${id}`);
  return data.data.candidate as Candidate;
}

export interface IndeedStatsResponse {
  companiesOnFeed: number;
  livePositions: number;
  indeedCandidatesThisMonth: number;
  totalIndeedCandidates: number;
  totalDirectCandidates: number;
  monthlyTrend: Array<{
    month: string;
    indeedCandidates: number;
    directCandidates: number;
    newPositionsPublished: number;
  }>;
  isIndeedApplyConfigured?: boolean;
  isDispositionSyncReal?: boolean;
  companySlug?: string;
}

export async function getIndeedStats(params?: { companyId?: number }): Promise<IndeedStatsResponse> {
  const { data } = await apiClient.get('/ats/indeed-stats', { params });
  return data.data as IndeedStatsResponse;
}

export interface ScreenerQuestion {
  id?: number;
  job_id: number;
  company_id: number;
  question_text: string;
  question_type: 'radio' | 'checkbox' | 'text' | 'number';
  options: any;
  is_knockout: boolean;
  knockout_value: string | null;
  display_order: number;
  is_required?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function listScreenerQuestions(jobId: number, companyId?: number): Promise<ScreenerQuestion[]> {
  const { data } = await apiClient.get(`/ats/jobs/${jobId}/screener-questions`, {
    params: companyId ? { company_id: companyId } : undefined
  });
  return data.data.questions as ScreenerQuestion[];
}

export async function createScreenerQuestion(jobId: number, question: Omit<ScreenerQuestion, 'id'>, companyId?: number): Promise<ScreenerQuestion> {
  const { data } = await apiClient.post(`/ats/jobs/${jobId}/screener-questions`, {
    ...question,
    company_id: companyId
  });
  return data.data.question as ScreenerQuestion;
}

export async function updateScreenerQuestion(jobId: number, qId: number, question: Partial<ScreenerQuestion>, companyId?: number): Promise<ScreenerQuestion> {
  const { data } = await apiClient.put(`/ats/jobs/${jobId}/screener-questions/${qId}`, {
    ...question,
    company_id: companyId
  });
  return data.data.question as ScreenerQuestion;
}

export async function deleteScreenerQuestion(jobId: number, qId: number, companyId?: number): Promise<void> {
  await apiClient.delete(`/ats/jobs/${jobId}/screener-questions/${qId}`, {
    params: companyId ? { company_id: companyId } : undefined
  });
}


