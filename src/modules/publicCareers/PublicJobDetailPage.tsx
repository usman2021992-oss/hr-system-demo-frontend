import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bookmark,
  Building2,
  CalendarDays,
  Clock,
  Globe2,
  Heart,
  Languages,
  MapPin,
  MessageSquare,
  Reply,
  Send,
  Store as StoreIcon,
  User2,
  Users,
  Wallet,
  BriefcaseBusiness,
  X,
} from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import { DatePicker } from '../../components/ui/DatePicker';
import CustomSelect from '../../components/ui/CustomSelect';
import { LocationFieldGroup } from '../../components/location';
import { COUNTRY_NAME_TO_CODE } from '../../utils/countryList';
import {
  applyToPublicJob,
  getPublicJobDetail,
  PublicHiringContact,
  PublicJob,
  getPublicJobScreenerQuestions,
  PublicScreenerQuestion,
} from '../../api/publicCareers';
import {
  getCompanyBannerUrl,
  getCompanyLogoUrl,
  getPublicAvatarUrl,
  getPublicStoreLogoUrl,
  getResumeUrl,
} from '../../api/client';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { buildCandidateProfile, type CandidateApplicationProfile } from '../ats/candidateProfile';
import DocumentPreviewModal from '../ats/DocumentPreviewModal';
import CareersFooter from '../../components/careers/CareersFooter';
import CookieConsentBanner from '../../components/legal/CookieConsentBanner';
import './publicCareers.css';

type UiLanguage = 'it' | 'en';

const TYPE_LABEL: Record<UiLanguage, Record<string, string>> = {
  en: {
    fulltime: 'Full-time',
    parttime: 'Part-time',
    contract: 'Contract',
    internship: 'Internship',
  },
  it: {
    fulltime: 'Tempo pieno',
    parttime: 'Part-time',
    contract: 'Contratto',
    internship: 'Stage',
  },
};

const REMOTE_LABEL: Record<UiLanguage, Record<string, string>> = {
  en: {
    onsite: 'On-site',
    hybrid: 'Hybrid',
    remote: 'Remote',
  },
  it: {
    onsite: 'In sede',
    hybrid: 'Ibrido',
    remote: 'Remoto',
  },
};

const ROLE_LABEL: Record<UiLanguage, Record<string, string>> = {
  en: {
    admin: 'System Admin',
    hr: 'HR Lead',
    area_manager: 'Area Manager',
    store_manager: 'Store Manager',
  },
  it: {
    admin: 'Amministratore',
    hr: 'Responsabile HR',
    area_manager: 'Area Manager',
    store_manager: 'Responsabile Negozio',
  },
};

const COPY: Record<UiLanguage, {
  missingJobId: string;
  invalidJobId: string;
  loadJobError: string;
  loadingPosition: string;
  jobNotFound: string;
  backToCareers: string;
  backToAllPositions: string;
  independentCompany: string;
  generalHiring: string;
  applyNow: string;
  roleOverview: string;
  languageWarning: string;
  noDescription: string;
  communityTitle: string;
  communitySubtitle: string;
  saved: string;
  save: string;
  like: string;
  comments: string;
  interactionsLoginNote: string;
  loginUnlock: string;
  askHiringTeam: string;
  postComment: string;
  reply: string;
  writeReply: string;
  sendReply: string;
  applyTitle: string;
  applySubtitle: string;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  emailPlaceholder: string;
  phonePlaceholder: string;
  linkedinPlaceholder: string;
  coverLetterPlaceholder: string;
  cvLabel: string;
  privacyConsent: string;
  submitting: string;
  submitApplication: string;
  roleFacts: string;
  posted: string;
  contract: string;
  weeklyHours: string;
  salaryRange: string;
  department: string;
  language: string;
  remoteType: string;
  companySnapshot: string;
  company: string;
  group: string;
  openRoles: string;
  profile: string;
  owner: string;
  storeContext: string;
  assignedStore: string;
  storeCodeNotSet: string;
  teamSize: string;
  location: string;
  hiringTeam: string;
  postingOwner: string;
  noHiringContacts: string;
  securityTitle: string;
  submittedAt: string;
  destination: string;
  visibility: string;
  duplicateCheck: string;
  realtimeSync: string;
  visibilityText: string;
  duplicateCheckText: string;
  notSpecified: string;
  general: string;
  recruitingTeam: string;
  recruiting: string;
  attachCvError: string;
  invalidCvFormatError: string;
  cvSizeError: string;
  privacyRequiredError: string;
  coverLetterTooLongError: string;
  submitError: string;
  positionClosedNotice: string;
  saveAction: string;
  likeAction: string;
  commentAction: string;
  replyAction: string;
  loginToActionPrefix: string;
  loginToActionSuffix: string;
  additionalInfoTitle: string;
  additionalInfoSubtitle: string;
  gdprNotice: string;
  availableStartDateLabel: string;
}> = {
  en: {
    missingJobId: 'Missing job identifier in URL.',
    invalidJobId: 'Invalid job identifier.',
    loadJobError: 'We could not load this job posting.',
    loadingPosition: 'Loading position...',
    jobNotFound: 'Job not found.',
    backToCareers: 'Back to careers',
    backToAllPositions: 'Back to all positions',
    independentCompany: 'Independent company',
    generalHiring: 'General hiring',
    applyNow: 'Apply now',
    roleOverview: 'Role overview',
    languageWarning: 'This posting is primarily in Italian. Please switch language if needed while applying.',
    noDescription: 'No additional description provided.',
    communityTitle: 'Community activity',
    communitySubtitle: 'Save this role, like updates, and join the thread with your questions.',
    saved: 'Saved',
    save: 'Save',
    like: 'Like',
    comments: 'Comments',
    interactionsLoginNote: 'Interactions are available for signed-in users. You can still apply without logging in.',
    loginUnlock: 'Login to unlock save, likes, and threaded replies',
    askHiringTeam: 'Ask a question to the hiring team',
    postComment: 'Post comment',
    reply: 'Reply',
    writeReply: 'Write a reply',
    sendReply: 'Send reply',
    applyTitle: 'Apply for this role',
    applySubtitle: 'Submit your profile directly to the recruiting team.',
    firstNamePlaceholder: 'First name',
    lastNamePlaceholder: 'Last name',
    emailPlaceholder: 'Email address',
    phonePlaceholder: 'Phone number (optional)',
    linkedinPlaceholder: 'LinkedIn URL (optional)',
    coverLetterPlaceholder: 'Cover letter (optional)',
    cvLabel: 'CV/Resume (PDF, DOC, DOCX, TXT, RTF, max 5MB) *',
    privacyConsent: 'I consent to processing of my personal data',
    submitting: 'Submitting...',
    submitApplication: 'Submit application',
    roleFacts: 'Role facts',
    posted: 'Posted',
    contract: 'Contract',
    weeklyHours: 'Weekly hours',
    salaryRange: 'Salary range',
    department: 'Department',
    language: 'Language',
    remoteType: 'Remote type',
    companySnapshot: 'Company snapshot',
    company: 'Company',
    group: 'Group',
    openRoles: 'Open roles',
    profile: 'Profile',
    owner: 'Owner',
    storeContext: 'Store context',
    assignedStore: 'Assigned store',
    storeCodeNotSet: 'Store code not set',
    teamSize: 'Team size',
    location: 'Location',
    hiringTeam: 'Hiring team',
    postingOwner: 'posting owner',
    noHiringContacts: 'No specific hiring contacts configured yet.',
    securityTitle: 'Application security',
    submittedAt: 'Submitted at',
    destination: 'Destination',
    visibility: 'Visibility',
    duplicateCheck: 'Duplicate check',
    realtimeSync: 'Real-time ATS sync',
    visibilityText: 'HR and managers only',
    duplicateCheckText: 'Email-based protection',
    notSpecified: '-',
    general: 'General',
    recruitingTeam: 'Recruiting Team',
    recruiting: 'Recruiting',
    attachCvError: 'Please attach your CV before submitting.',
    invalidCvFormatError: 'Unsupported format. Please use: PDF, Word (.doc/.docx), plain text (.txt) or RTF.',
    cvSizeError: 'The CV file size must be 5MB or less.',
    privacyRequiredError: 'You must accept the privacy notice to submit your application.',
    coverLetterTooLongError: 'Cover letter must be 1000 characters or less.',
    submitError: 'Unable to submit your application right now.',
    positionClosedNotice: 'This position is currently closed and no longer accepting new applications.',
    saveAction: 'save this role',
    likeAction: 'like this role',
    commentAction: 'comment on this role',
    replyAction: 'reply in discussion',
    loginToActionPrefix: 'Please login to',
    loginToActionSuffix: 'You can still read this role and submit the application form.',
    additionalInfoTitle: 'Additional information (optional)',
    additionalInfoSubtitle: 'This information is optional and does not affect your application review.',
    gdprNotice: 'ℹ We only collect information necessary to evaluate your application. Additional details are optional under EU Regulation 2016/679 (GDPR).',
    availableStartDateLabel: 'Available start date',
  },
  it: {
    missingJobId: 'ID posizione mancante nell\'URL.',
    invalidJobId: 'ID posizione non valido.',
    loadJobError: 'Impossibile caricare questo annuncio.',
    loadingPosition: 'Caricamento posizione...',
    jobNotFound: 'Posizione non trovata.',
    backToCareers: 'Torna alle careers',
    backToAllPositions: 'Torna a tutte le posizioni',
    independentCompany: 'Azienda indipendente',
    generalHiring: 'Assunzione generale',
    applyNow: 'Candidati ora',
    roleOverview: 'Panoramica ruolo',
    languageWarning: 'Questo annuncio è principalmente in italiano. Cambia lingua se necessario durante la candidatura.',
    noDescription: 'Nessuna descrizione aggiuntiva disponibile.',
    communityTitle: 'Attività community',
    communitySubtitle: 'Salva questo ruolo, metti like agli aggiornamenti e partecipa alla discussione con le tue domande.',
    saved: 'Salvato',
    save: 'Salva',
    like: 'Mi piace',
    comments: 'Commenti',
    interactionsLoginNote: 'Le interazioni sono disponibili per utenti autenticati. Puoi comunque candidarti senza login.',
    loginUnlock: 'Accedi per sbloccare salvataggi, like e risposte in thread',
    askHiringTeam: 'Fai una domanda al team di selezione',
    postComment: 'Pubblica commento',
    reply: 'Rispondi',
    writeReply: 'Scrivi una risposta',
    sendReply: 'Invia risposta',
    applyTitle: 'Candidati a questo ruolo',
    applySubtitle: 'Invia il tuo profilo direttamente al team recruiting.',
    firstNamePlaceholder: 'Nome',
    lastNamePlaceholder: 'Cognome',
    emailPlaceholder: 'Indirizzo email',
    phonePlaceholder: 'Numero di telefono (opzionale)',
    linkedinPlaceholder: 'URL LinkedIn (opzionale)',
    coverLetterPlaceholder: 'Lettera di presentazione (opzionale)',
    cvLabel: 'CV (PDF, DOC, DOCX, TXT, RTF, max 5MB) *',
    privacyConsent: 'Acconsento al trattamento dei miei dati personali',
    submitting: 'Invio in corso...',
    submitApplication: 'Invia candidatura',
    roleFacts: 'Dettagli ruolo',
    posted: 'Pubblicato',
    contract: 'Contratto',
    weeklyHours: 'Ore settimanali',
    salaryRange: 'Range retributivo',
    department: 'Dipartimento',
    language: 'Lingua',
    remoteType: 'Modalità lavoro',
    companySnapshot: 'Profilo azienda',
    company: 'Azienda',
    group: 'Gruppo',
    openRoles: 'Posizioni aperte',
    profile: 'Profilo',
    owner: 'Proprietario',
    storeContext: 'Contesto negozio',
    assignedStore: 'Negozio assegnato',
    storeCodeNotSet: 'Codice negozio non impostato',
    teamSize: 'Dimensione team',
    location: 'Posizione',
    hiringTeam: 'Team di selezione',
    postingOwner: 'responsabile annuncio',
    noHiringContacts: 'Nessun contatto recruiting configurato al momento.',
    securityTitle: 'Sicurezza candidatura',
    submittedAt: 'Inviata il',
    destination: 'Destinazione',
    visibility: 'Visibilità',
    duplicateCheck: 'Controllo duplicati',
    realtimeSync: 'Sincronizzazione ATS in tempo reale',
    visibilityText: 'Solo HR e manager',
    duplicateCheckText: 'Protezione basata su email',
    notSpecified: '-',
    general: 'Generale',
    recruitingTeam: 'Team Recruiting',
    recruiting: 'Recruiting',
    attachCvError: 'Allega il tuo CV prima dell\'invio.',
    invalidCvFormatError: 'Formato non supportato. Usa: PDF, Word (.doc, .docx), testo (.txt) o RTF.',
    cvSizeError: 'La dimensione del CV deve essere massimo 5MB.',
    privacyRequiredError: 'Devi accettare l\'informativa privacy per inviare la candidatura.',
    coverLetterTooLongError: 'La lettera di presentazione deve essere massimo 1000 caratteri.',
    submitError: 'Impossibile inviare la candidatura in questo momento.',
    positionClosedNotice: 'Questa posizione e chiusa e non accetta nuove candidature.',
    saveAction: 'salvare questo ruolo',
    likeAction: 'mettere like a questo ruolo',
    commentAction: 'commentare questo ruolo',
    replyAction: 'rispondere nella discussione',
    loginToActionPrefix: 'Effettua il login per',
    loginToActionSuffix: 'Puoi comunque leggere il ruolo e inviare la candidatura.',
    additionalInfoTitle: 'Informazioni aggiuntive (opzionale)',
    additionalInfoSubtitle: 'Questi dati sono facoltativi e non influenzano la valutazione della candidatura.',
    gdprNotice: 'ℹ Raccogliamo solo le informazioni necessarie per valutare la tua candidatura. I dati aggiuntivi sono facoltativi ai sensi del Regolamento UE 2016/679 (GDPR).',
    availableStartDateLabel: 'Data di inizio desiderata',
  },
};

interface CommentReply {
  id: number;
  author: string;
  message: string;
  createdAt: string;
}

interface CommunityComment {
  id: number;
  author: string;
  role: string;
  message: string;
  createdAt: string;
  replies: CommentReply[];
}

function generateEmployeeUniqueId(): string {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EMP-${Date.now().toString().slice(-6)}-${suffix}`;
}

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#!$%&';
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function toInitials(value: string): string {
  return value
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatPersonName(contact: PublicHiringContact): string {
  return `${contact.name} ${contact.surname ?? ''}`.trim();
}

function formatRole(role: string, uiLanguage: UiLanguage): string {
  return ROLE_LABEL[uiLanguage][role] ?? role.replace(/_/g, ' ');
}

function normalizeCountryCode(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_NAME_TO_CODE[raw.toLowerCase()] ?? '';
}

function formatLocation(job: PublicJob, remoteLabel: string): string {
  const parts = [job.location.address, job.location.city, job.location.state, job.location.postalCode, job.location.country]
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : remoteLabel;
}

function formatSalary(value: number | null, uiLanguage: UiLanguage): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat(uiLanguage === 'it' ? 'it-IT' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null, uiLanguage: UiLanguage, fallback?: string): string {
  return new Date(value ?? fallback ?? '').toLocaleDateString(uiLanguage === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const parseRichTextToHtml = (text: string): string => {
  if (!text) return '';
  
  // If the text already contains HTML tags (from the rich text editor), return as-is
  if (/<[a-zA-Z][^>]*>/.test(text)) {
    return text;
  }

  // Legacy: parse Markdown-style plain text into HTML
  // 1. Escape HTML first to prevent any broken tags or XSS
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // 2. Inline elements (Bold, Underline, Italic)
  // Bold: **text** or __text__
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Underline: ___text___ or __text__
  escaped = escaped.replace(/__(.*?)__/g, '<u>$1</u>');
  
  // Italic: *text* or _text_
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 3. Process line-by-line for blocks (headers, lists, and line breaks)
  const lines = escaped.split('\n');
  const result: string[] = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (line.startsWith('### ')) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push(`<h3 style="margin: 12px 0 6px; font-size: 15px; font-weight: 700; color: #0f172a;">${line.slice(4)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push(`<h2 style="margin: 14px 0 8px; font-size: 17px; font-weight: 700; color: #0f172a;">${line.slice(3)}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push(`<h1 style="margin: 16px 0 10px; font-size: 19px; font-weight: 800; color: #0f172a;">${line.slice(2)}</h1>`);
      continue;
    }

    // Bullet list: check for -, *, •, + followed by space
    const bulletMatch = line.match(/^([\-*•+])\s+(.*)$/);
    if (bulletMatch) {
      if (inOl) { result.push('</ol>'); inOl = false; }
      if (!inUl) {
        result.push('<ul style="margin: 6px 0 6px 20px; padding: 0; list-style-type: disc;">');
        inUl = true;
      }
      result.push(`<li style="margin-bottom: 4px; line-height: 1.6; color: inherit;">${bulletMatch[2]}</li>`);
      continue;
    }

    // Numbered list: check for digits followed by dot/parenthesis
    const numberMatch = line.match(/^(\d+)[.\)]\s+(.*)$/);
    if (numberMatch) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (!inOl) {
        result.push('<ol style="margin: 6px 0 6px 20px; padding: 0; list-style-type: decimal;">');
        inOl = true;
      }
      result.push(`<li style="margin-bottom: 4px; line-height: 1.6; color: inherit;">${numberMatch[2]}</li>`);
      continue;
    }

    // Close open lists if we hit a standard paragraph
    if (inUl) { result.push('</ul>'); inUl = false; }
    if (inOl) { result.push('</ol>'); inOl = false; }

    if (line === '') {
      result.push('<div style="height: 10px;"></div>');
    } else {
      result.push(`<div style="margin-bottom: 6px; line-height: 1.6; min-height: 1.2em;">${rawLine}</div>`);
    }
  }

  if (inUl) result.push('</ul>');
  if (inOl) result.push('</ol>');

  return result.join('\n');
};

export default function PublicJobDetailPage() {
  const { i18n } = useTranslation();
  const uiLanguage: UiLanguage = i18n.language?.startsWith('it') ? 'it' : 'en';
  const copy = COPY[uiLanguage];

  const genderOptions = useMemo(() => [
    { value: 'M', label: uiLanguage === 'it' ? 'Maschio' : 'Male' },
    { value: 'F', label: uiLanguage === 'it' ? 'Femmina' : 'Female' },
    { value: 'other', label: uiLanguage === 'it' ? 'Altro' : 'Other' },
  ], [uiLanguage]);

  const maritalStatusOptions = useMemo(() => [
    { value: 'single', label: uiLanguage === 'it' ? 'Single' : 'Single' },
    { value: 'married', label: uiLanguage === 'it' ? 'Sposato/a' : 'Married' },
    { value: 'divorced', label: uiLanguage === 'it' ? 'Divorziato/a' : 'Divorced' },
    { value: 'partnered', label: uiLanguage === 'it' ? 'In coppia' : 'Partnered' },
  ], [uiLanguage]);

  const { jobId, companySlug } = useParams<{ jobId?: string; companySlug?: string }>();
  const legacyCompanySlug = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('company_slug');
    return slug && slug.trim() !== '' ? slug : undefined;
  }, []);
  const effectiveCompanySlug = companySlug ?? legacyCompanySlug;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyMeta, setCompanyMeta] = useState<{
    slug: string;
    groupName: string | null;
    logoFilename: string | null;
    bannerFilename: string | null;
    ownerName: string | null;
    ownerSurname: string | null;
    ownerAvatarFilename: string | null;
    openRolesCount: number;
    companyEmail: string | null;
  } | null>(null);
  const [hiringTeam, setHiringTeam] = useState<PublicHiringContact[]>([]);

  const privacyUrl = useMemo(() => {
    return effectiveCompanySlug 
      ? `/careers/${effectiveCompanySlug}/privacy` 
      : '/privacy';
  }, [effectiveCompanySlug]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [appProfile, setAppProfile] = useState<CandidateApplicationProfile>(() => buildCandidateProfile({
    availability: '',
    gender: '',
    nationality: '',
    country: '',
    state: '',
    city: '',
    address: '',
    dateOfBirth: '',
    currentEmployer: '',
    currentRole: '',
    hasCurrentEmployer: 'no',
    maritalStatus: '',
    uniqueId: generateEmployeeUniqueId(),
    password: generateTempPassword(),
    hireDate: new Date().toISOString().slice(0, 10),
    contractType: '',
    applicationDate: new Date().toISOString().slice(0, 10),
    applicationSource: 'public-careers',
    applicationChannel: 'public',
  }));
  const [coverLetter, setCoverLetter] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [isLong, setIsLong] = useState(false);
  const descriptionRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (descriptionRef.current) {
      setIsLong(descriptionRef.current.scrollHeight > 220);
    }
  }, [job?.description]);

  const [dragActive, setDragActive] = useState(false);

  const [screenerQuestions, setScreenerQuestions] = useState<PublicScreenerQuestion[]>([]);
  const [screenerAnswers, setScreenerAnswers] = useState<Record<string, string>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    if (showApplyModal && job) {
      setLoadingQuestions(true);
      getPublicJobScreenerQuestions(companyMeta?.slug || job.companySlug, job.id)
        .then((qs) => {
          setScreenerQuestions(qs);
          const initialAnswers: Record<string, string> = {};
          qs.forEach((q) => {
            initialAnswers[q.id] = '';
          });
          setScreenerAnswers(initialAnswers);
        })
        .catch((err) => {
          console.error('Failed to load screener questions', err);
        })
        .finally(() => {
          setLoadingQuestions(false);
        });
    }
  }, [showApplyModal, job, companyMeta?.slug]);

  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [communityNotice, setCommunityNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [openReplyBox, setOpenReplyBox] = useState<number | null>(null);

  useEffect(() => {
    if (!jobId) {
      setError(copy.missingJobId);
      setLoading(false);
      return;
    }

    const parsedJobId = Number.parseInt(jobId, 10);
    if (Number.isNaN(parsedJobId)) {
      setError(copy.invalidJobId);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    getPublicJobDetail(parsedJobId, effectiveCompanySlug)
      .then((data) => {
        setCompanyName(data.company.name);
        setCompanyMeta({
          slug: data.company.slug,
          groupName: data.company.groupName ?? null,
          logoFilename: data.company.logoFilename ?? null,
          bannerFilename: data.company.bannerFilename ?? null,
          ownerName: data.company.ownerName ?? null,
          ownerSurname: data.company.ownerSurname ?? null,
          ownerAvatarFilename: data.company.ownerAvatarFilename ?? null,
          openRolesCount: data.company.openRolesCount ?? 0,
          companyEmail: data.company.companyEmail ?? null,
        });
        setJob(data.job);
        setHiringTeam(data.hiringTeam ?? []);
        setLikesCount(14 + (parsedJobId % 9));
      })
      .catch(() => {
        setError(copy.loadJobError);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [jobId, effectiveCompanySlug, copy.invalidJobId, copy.loadJobError, copy.missingJobId]);

  const browserLanguage = useMemo(() => {
    return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  }, []);

  const utmSource = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('utm_source') ?? undefined;
  }, []);

  const formLanguage = job?.language === 'en' ? 'en' : 'it';
  const languageMismatch = !!job && job.language === 'it' && browserLanguage === 'en';
  const companyLogoUrl = getCompanyLogoUrl(companyMeta?.logoFilename ?? job?.companyLogoFilename);
  const companyBannerUrl = getCompanyBannerUrl(companyMeta?.bannerFilename ?? job?.companyBannerFilename);
  const storeLogoUrl = getPublicStoreLogoUrl(job?.storeLogoFilename);
  const remoteFallback = uiLanguage === 'it' ? 'Remoto / Flessibile' : 'Remote / Flexible';
  // Always go back to /careers without company slug
  const careersBackPath = '/careers';
  const isJobClosed = job?.status === 'closed';
  const storeCountryCode = job ? normalizeCountryCode(job.jobCountry ?? job.location.country) : '';
  const companyCountryCode = job ? normalizeCountryCode(job.companyCountry ?? job.location.country) : '';
  const companyGroupName = (companyMeta?.groupName ?? (job ? job.companyGroupName : '') ?? '').trim();

  useEffect(() => {
    if (!job) return;

    const lead = job.postedBy ?? hiringTeam[0] ?? null;
    const author = lead ? formatPersonName(lead) : `${companyName} ${copy.recruitingTeam}`;
    const role = lead ? formatRole(lead.role, uiLanguage) : copy.recruiting;

    setComments([
      {
        id: 1,
        author,
        role,
        message: formLanguage === 'it'
          ? 'Grazie per il tuo interesse. Stiamo cercando profili che possano crescere con il team nel breve periodo.'
          : 'Thanks for your interest. We are looking for candidates who can grow quickly with this team.',
        createdAt: new Date().toISOString(),
        replies: [],
      },
    ]);
    setReplyDrafts({});
    setOpenReplyBox(null);
  }, [job?.id, hiringTeam, companyName, formLanguage, copy.recruiting, copy.recruitingTeam, uiLanguage]);

  const ensureAuthenticated = (action: string): boolean => {
    if (user) {
      setCommunityNotice(null);
      return true;
    }

    setCommunityNotice(`${copy.loginToActionPrefix} ${action}. ${copy.loginToActionSuffix}`);
    return false;
  };

  const toggleSaved = () => {
    if (!ensureAuthenticated(copy.saveAction)) return;
    setSaved((prev) => !prev);
  };

  const toggleLiked = () => {
    if (!ensureAuthenticated(copy.likeAction)) return;
    setLiked((prev) => {
      if (prev) setLikesCount((count) => Math.max(0, count - 1));
      else setLikesCount((count) => count + 1);
      return !prev;
    });
  };

  const addComment = () => {
    if (!ensureAuthenticated(copy.commentAction)) return;

    const message = commentDraft.trim();
    if (!message) return;

    const author = `${user?.name ?? 'User'} ${user?.surname ?? ''}`.trim();
    const role = user?.role ? user.role.replace(/_/g, ' ') : 'employee';

    const nextComment: CommunityComment = {
      id: Date.now(),
      author,
      role,
      message,
      createdAt: new Date().toISOString(),
      replies: [],
    };

    setComments((prev) => [nextComment, ...prev]);
    setCommentDraft('');
  };

  const addReply = (commentId: number) => {
    if (!ensureAuthenticated(copy.replyAction)) return;

    const message = (replyDrafts[commentId] ?? '').trim();
    if (!message) return;

    const author = `${user?.name ?? 'User'} ${user?.surname ?? ''}`.trim();

    setComments((prev) => prev.map((comment) => {
      if (comment.id !== commentId) return comment;
      const reply: CommentReply = {
        id: Date.now(),
        author,
        message,
        createdAt: new Date().toISOString(),
      };
      return {
        ...comment,
        replies: [...comment.replies, reply],
      };
    }));

    setReplyDrafts((prev) => ({ ...prev, [commentId]: '' }));
    setOpenReplyBox(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!job) return;

    if (job.status === 'closed') {
      setSubmitMessage(copy.positionClosedNotice);
      return;
    }

    if (!resume) {
      setSubmitMessage(copy.attachCvError);
      return;
    }

    if (!/\.(pdf|doc|docx|txt|rtf)$/i.test(resume.name)) {
      setSubmitMessage(copy.invalidCvFormatError);
      return;
    }

    if (resume.size > 5 * 1024 * 1024) {
      setSubmitMessage(copy.cvSizeError);
      return;
    }

    if (!agree) {
      setSubmitMessage(copy.privacyRequiredError);
      return;
    }

    if (coverLetter.trim().length > 1000) {
      setSubmitMessage(copy.coverLetterTooLongError);
      return;
    }

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ').trim();
    if (!fullName) {
      setSubmitMessage(uiLanguage === 'it' ? 'Inserisci nome e cognome.' : 'Please enter your first and last name.');
      return;
    }

    // Validate screener questions
    for (const q of screenerQuestions) {
      if (q.required && (!screenerAnswers[q.id] || screenerAnswers[q.id].trim() === '')) {
        setSubmitMessage(
          uiLanguage === 'it'
            ? `Rispondi alla domanda obbligatoria: "${q.label}"`
            : `Please answer the required question: "${q.label}"`
        );
        return;
      }
    }

    setSubmitting(true);
    setSubmitMessage(null);

    const answersArray = Object.entries(screenerAnswers).map(([qId, ans]) => ({
      questionId: parseInt(qId.replace('q_', ''), 10),
      answer: ans
    }));

    try {
      await applyToPublicJob({
        jobId: job.id,
        fullName,
        email,
        phone: phone || undefined,
        linkedinUrl: linkedinUrl || undefined,
        coverLetter: coverLetter || undefined,
        resume,
        gdprConsent: true,
        applicantLocale: browserLanguage,
        utmSource,
        availability: appProfile.availability || (job.weeklyHours != null ? String(job.weeklyHours) : undefined),
        gender: appProfile.gender || undefined,
        nationality: appProfile.nationality || undefined,
        country: appProfile.country || undefined,
        state: appProfile.state || undefined,
        city: appProfile.city || undefined,
        address: appProfile.address || undefined,
        dateOfBirth: appProfile.dateOfBirth || undefined,
        currentEmployer: appProfile.hasCurrentEmployer === 'yes' ? appProfile.currentEmployer || undefined : undefined,
        currentRole: appProfile.hasCurrentEmployer === 'yes' ? appProfile.currentRole || undefined : undefined,
        maritalStatus: appProfile.maritalStatus || undefined,
        hasCurrentEmployer: appProfile.hasCurrentEmployer || undefined,
        applicationDate: appProfile.applicationDate || undefined,
        startDate: appProfile.startDate || undefined,
        postalCode: appProfile.postalCode || undefined,
        screenerAnswers: answersArray,
      });

      setSubmitMessage(browserLanguage === 'it'
        ? 'Grazie per la tua candidatura. Ti contatteremo presto.'
        : 'Thank you for applying. We will be in touch soon.');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setLinkedinUrl('');
      setAppProfile(buildCandidateProfile({
        availability: '',
        gender: '',
        nationality: '',
        country: '',
        state: '',
        city: '',
        address: '',
        dateOfBirth: '',
        currentEmployer: '',
        currentRole: '',
        hasCurrentEmployer: 'no',
        maritalStatus: '',
        uniqueId: generateEmployeeUniqueId(),
        password: generateTempPassword(),
        hireDate: new Date().toISOString().slice(0, 10),
        contractType: '',
        applicationDate: new Date().toISOString().slice(0, 10),
        applicationSource: 'public-careers',
        applicationChannel: 'public',
        startDate: '',
        postalCode: '',
      }));
      setCoverLetter('');
      setResume(null);
      setResumePreviewUrl(null);
      setAgree(false);
      setScreenerAnswers({});
    } catch (err: any) {
      const message = err?.response?.data?.error || copy.submitError;
      setSubmitMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const validateAndSetResume = (file: File | null) => {
    if (!file) {
      setResume(null);
      setResumePreviewUrl(null);
      return;
    }

    if (!/\.(pdf|doc|docx|txt|rtf)$/i.test(file.name)) {
      setSubmitMessage(copy.invalidCvFormatError);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSubmitMessage(copy.cvSizeError);
      return;
    }

    setResume(file);
    setSubmitMessage(null);
    const url = URL.createObjectURL(file);
    setResumePreviewUrl(url);
  };

  const handleResumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    validateAndSetResume(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetResume(file);
    }
  };

  const submitSuccess = !!submitMessage && (/thank|grazie/i.test(submitMessage));

  if (loading) {
    return (
      <div className="careers-detail-shell">
        <div className="careers-detail-wrapper">
          <div className="careers-empty" style={{ marginTop: 24 }}>{copy.loadingPosition}</div>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="careers-detail-shell">
        <div className="careers-detail-wrapper">
          <div className="careers-empty error" style={{ marginTop: 24 }}>{error ?? copy.jobNotFound}</div>
          <Link className="careers-detail-back" to="/careers">
            <ArrowLeft size={14} />
            {copy.backToCareers}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="careers-detail-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="careers-detail-wrapper" style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <Link className="careers-detail-back" to={careersBackPath}>
            <ArrowLeft size={14} />
            {copy.backToAllPositions}
          </Link>
          <LanguageSwitcher variant="pill" />
        </div>

        <section className="careers-detail-hero">
          {companyBannerUrl ? <img src={companyBannerUrl} alt={companyName} /> : <div className="careers-detail-hero-fallback" />}

          <div className="careers-detail-hero-content">
            <div>
              <div className="careers-detail-company-row">
                <div className="careers-detail-company-logo">
                  {companyLogoUrl ? <img src={companyLogoUrl} alt={companyName} /> : <span>{toInitials(companyName)}</span>}
                </div>
                <div>
                  <strong className="careers-detail-company-name">
                    <span>{companyName}</span>
                    {companyCountryCode && (
                      <ReactCountryFlag countryCode={companyCountryCode} svg style={{ width: '1.1em', height: '1.1em', borderRadius: 3, marginLeft: 6 }} />
                    )}
                  </strong>
                  {companyGroupName ? <span className="careers-detail-company-group">{companyGroupName}</span> : null}
                </div>
              </div>

              <h1 className="careers-detail-title">{job.title}</h1>

              <div className="careers-detail-meta">
                <span>{TYPE_LABEL[uiLanguage][job.jobType] ?? job.jobType}</span>
                <span>{REMOTE_LABEL[uiLanguage][job.remoteType] ?? job.remoteType}</span>
                <span>{job.language.toUpperCase()}</span>
                <span>{job.department ?? copy.generalHiring}</span>
              </div>
            </div>

            <div className="careers-detail-hero-actions">
              <div className="careers-detail-location">
                <MapPin size={14} />
                {formatLocation(job, remoteFallback)}
              </div>

              {!isJobClosed ? (
                <button type="button" className="careers-detail-primary-btn" onClick={() => setShowApplyModal(true)}>
                  {copy.applyNow}
                  <Send size={14} />
                </button>
              ) : (
                <span className="careers-detail-primary-btn" style={{ opacity: 0.8, cursor: 'default' }}>
                  {copy.positionClosedNotice}
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="careers-detail-grid">
          <div style={{ display: 'grid', gap: 10, alignSelf: 'start' }}>
            <section className="careers-detail-card">
              <h2>{copy.roleOverview}</h2>
              {languageMismatch && (
                <div className="careers-warning">
                  {copy.languageWarning}
                </div>
              )}
              <div className="careers-detail-body">
                {job.description ? (
                  (() => {
                    return (
                      <div>
                        <div
                          ref={descriptionRef}
                          className="careers-description-container"
                          style={{
                            maxHeight: (!isLong || descExpanded) ? 'none' : '220px',
                            overflow: 'hidden',
                            position: 'relative',
                            transition: 'max-height 0.3s ease',
                          }}
                        >
                          <div dangerouslySetInnerHTML={{ __html: parseRichTextToHtml(job.description) }} />
                          {isLong && !descExpanded && (
                            <div
                              className="careers-description-fade"
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: '80px',
                                background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.88))',
                                pointerEvents: 'none',
                              }}
                            />
                          )}
                        </div>
                        {isLong && (
                          <button
                            type="button"
                            className="careers-description-toggle"
                            onClick={() => setDescExpanded(prev => !prev)}
                            style={{
                              display: 'block',
                              marginTop: '12px',
                              background: 'none',
                              border: 'none',
                              color: '#C9973A',
                              fontWeight: 600,
                              fontSize: '13px',
                              cursor: 'pointer',
                              padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            {descExpanded
                              ? (uiLanguage === 'it' ? 'Leggi meno' : 'See less')
                              : (uiLanguage === 'it' ? 'Leggi tutto' : 'See more')}
                          </button>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  copy.noDescription
                )}
              </div>
            </section>

            <section className="careers-detail-card">
              <h3>{copy.communityTitle}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                {copy.communitySubtitle}
              </p>

              <div className="careers-community-actions">
                <button type="button" className={saved ? 'active' : ''} onClick={toggleSaved}>
                  <Bookmark size={14} />
                  {saved ? copy.saved : copy.save}
                </button>
                <button type="button" className={liked ? 'active' : ''} onClick={toggleLiked}>
                  <Heart size={14} />
                  {copy.like} ({likesCount})
                </button>
                <button type="button" onClick={() => document.getElementById('discussion-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  <MessageSquare size={14} />
                  {copy.comments} ({comments.length})
                </button>
              </div>

              {communityNotice && <div className="careers-community-note">{communityNotice}</div>}

              {!user && (
                <div className="careers-login-gate">
                  <p>{copy.interactionsLoginNote}</p>
                  <Link to="/login">{copy.loginUnlock}</Link>
                </div>
              )}

              <div id="discussion-box" className="careers-comment-box">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder={copy.askHiringTeam}
                />
                <button type="button" onClick={addComment} disabled={!commentDraft.trim()}>
                  {copy.postComment}
                  <Send size={14} />
                </button>
              </div>

              <div className="careers-discussion-list">
                {comments.map((comment) => (
                  <article key={comment.id} className="careers-discussion-item">
                    <div className="careers-discussion-head">
                      <div>
                        <strong>{comment.author}</strong>
                        <span>{comment.role}</span>
                      </div>
                      <span>{formatDate(comment.createdAt, uiLanguage)}</span>
                    </div>

                    <p className="careers-discussion-message">{comment.message}</p>

                    {comment.replies.length > 0 && (
                      <div className="careers-reply-list">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="careers-reply-item">
                            <strong>{reply.author}</strong> - {reply.message}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="careers-discussion-actions">
                      <button type="button" onClick={() => setOpenReplyBox((prev) => (prev === comment.id ? null : comment.id))}>
                        <Reply size={13} />
                        {copy.reply}
                      </button>
                    </div>

                    {openReplyBox === comment.id && (
                      <div className="careers-reply-box">
                        <textarea
                          value={replyDrafts[comment.id] ?? ''}
                          onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [comment.id]: event.target.value }))}
                          placeholder={copy.writeReply}
                        />
                        <button
                          type="button"
                          onClick={() => addReply(comment.id)}
                          disabled={!(replyDrafts[comment.id] ?? '').trim()}
                        >
                          {copy.sendReply}
                          <Send size={14} />
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section id="apply-form" className="careers-detail-card" style={{ display: 'none' }}>
              <h3>{copy.applyTitle}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                {isJobClosed ? copy.positionClosedNotice : copy.applySubtitle}
              </p>

              <form onSubmit={handleSubmit} className="careers-form-grid">
                {/* Section 1 — Required fields (always visible, no heading needed) */}
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    padding: 16,
                    borderRadius: 16,
                    border: '1px solid rgba(13,33,55,0.18)',
                    background: 'rgba(248,250,252,0.8)',
                  }}
                >
                  <div
                    className="careers-form-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <input
                      className="careers-form-input"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder={copy.firstNamePlaceholder}
                      autoComplete="given-name"
                      required
                    />
                    <input
                      className="careers-form-input"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder={copy.lastNamePlaceholder}
                      autoComplete="family-name"
                      required
                    />
                  </div>

                  <div
                    className="careers-form-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <input
                      className="careers-form-input"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={copy.emailPlaceholder}
                      required
                      autoComplete="email"
                    />
                    <input
                      className="careers-form-input"
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder={copy.phonePlaceholder}
                      autoComplete="tel"
                    />
                  </div>

                  <input
                    className="careers-form-input"
                    type="url"
                    value={linkedinUrl}
                    onChange={(event) => setLinkedinUrl(event.target.value)}
                    placeholder={copy.linkedinPlaceholder}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Section 2 — CV/Resume file input */}
                <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 12, border: '1px dashed rgba(201,151,58,0.45)', background: 'rgba(201,151,58,0.06)' }}>
                  <label style={{ fontSize: 12.5, color: '#374151', fontWeight: 700 }}>{copy.cvLabel}</label>
                  {!resume ? (
                    <input type="file" accept=".pdf,.doc,.docx,.txt,.rtf" onChange={handleResumeChange} required />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(201,151,58,0.3)', background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #C9973A, #B5852E)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {resume.name.split('.').pop()?.toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resume.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>{(resume.size / 1024).toFixed(1)} KB</span>
                            <span style={{ color: '#d1d5db' }}>|</span>
                            <button
                              type="button"
                              onClick={() => setShowResumePreview(true)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: '#c9973a',
                                fontSize: '11px',
                                fontWeight: 600,
                                textDecoration: 'underline',
                                cursor: 'pointer',
                              }}
                            >
                              {uiLanguage === 'it' ? 'Anteprima' : 'Preview'}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => setShowResumePreview(true)}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(201,151,58,0.4)', background: 'rgba(201,151,58,0.1)', color: '#8A5A07', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {uiLanguage === 'it' ? 'Visualizza' : 'View'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setResume(null); setResumePreviewUrl(null); }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)', color: '#991B1B', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {uiLanguage === 'it' ? 'Rimuovi' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3 — Cover Letter (optional) */}
                <div style={{ display: 'grid', gap: 4 }}>
                  <textarea
                    className="careers-form-textarea"
                    value={coverLetter}
                    onChange={(event) => setCoverLetter(event.target.value)}
                    placeholder={copy.coverLetterPlaceholder}
                    maxLength={1000}
                    rows={5}
                  />
                  <div className="careers-form-help">{coverLetter.length}/1000</div>
                </div>

                {/* GDPR Helper Notice above collapsible toggle */}
                <div style={{ fontSize: '12.5px', color: '#64748b', padding: '0 4px', lineHeight: 1.4 }}>
                  {copy.gdprNotice}
                </div>

                {/* Section 4 — Collapsible additional information */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(13, 33, 55, 0.12)',
                      background: '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {copy.additionalInfoTitle}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {copy.additionalInfoSubtitle}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '14px',
                      color: '#64748b',
                      transform: showAdditionalInfo ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      display: 'inline-block',
                      marginLeft: '12px',
                    }}>
                      ▼
                    </span>
                  </button>

                  {showAdditionalInfo && (
                    <div
                      style={{
                        display: 'grid',
                        gap: 12,
                        padding: 16,
                        borderRadius: 16,
                        border: '1px solid rgba(201,151,58,0.28)',
                        background: 'rgba(201,151,58,0.06)',
                        marginTop: 4,
                      }}
                    >
                      <div className="careers-form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <input
                          className="careers-form-input"
                          value={appProfile.availability}
                          onChange={(event) => setAppProfile((prev) => ({ ...prev, availability: event.target.value }))}
                          placeholder={uiLanguage === 'it' ? 'Disponibilità / ore settimanali' : 'Availability / weekly hours'}
                        />
                        <input
                          className="careers-form-input"
                          value={appProfile.nationality}
                          onChange={(event) => setAppProfile((prev) => ({ ...prev, nationality: event.target.value }))}
                          placeholder={uiLanguage === 'it' ? 'Nazionalità' : 'Nationality'}
                        />
                        <CustomSelect
                          value={appProfile.gender || null}
                          onChange={(value) => setAppProfile((prev) => ({ ...prev, gender: value || '' }))}
                          options={genderOptions}
                          placeholder={uiLanguage === 'it' ? 'Genere' : 'Gender'}
                          isClearable={false}
                          searchable={false}
                        />
                        <DatePicker
                          value={appProfile.dateOfBirth}
                          onChange={(value) => setAppProfile((prev) => ({ ...prev, dateOfBirth: value }))}
                          label={uiLanguage === 'it' ? 'Data di nascita' : 'Date of birth'}
                          initialViewYear={new Date().getFullYear() - 30}
                          placement="bottom"
                          disablePortal
                        />
                        <DatePicker
                          value={appProfile.applicationDate}
                          onChange={(value) => setAppProfile((prev) => ({ ...prev, applicationDate: value }))}
                          label={uiLanguage === 'it' ? 'Data candidatura' : 'Application date'}
                          placement="bottom"
                          disablePortal
                        />
                        <input
                          className="careers-form-input"
                          value={appProfile.currentEmployer}
                          onChange={(event) => setAppProfile((prev) => ({ ...prev, currentEmployer: event.target.value }))}
                          placeholder={uiLanguage === 'it' ? 'Azienda attuale' : 'Current employer'}
                        />
                        <input
                          className="careers-form-input"
                          value={appProfile.currentRole}
                          onChange={(event) => setAppProfile((prev) => ({ ...prev, currentRole: event.target.value }))}
                          placeholder={uiLanguage === 'it' ? 'Ruolo attuale' : 'Current role'}
                        />
                      </div>

                      <LocationFieldGroup
                        value={{
                          country: appProfile.country,
                          state: appProfile.state,
                          city: appProfile.city,
                        }}
                        onChange={(location) => setAppProfile((prev) => ({
                          ...prev,
                          country: location.country,
                          state: location.state,
                          city: location.city,
                        }))}
                        includeAddress={false}
                        includePostalCode={false}
                        includePhone={false}
                        labels={{
                          country: uiLanguage === 'it' ? 'Paese' : 'Country',
                          state: uiLanguage === 'it' ? 'Regione / Stato' : 'State / Region',
                          city: uiLanguage === 'it' ? 'Città' : 'City',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Section 5 — GDPR consent checkbox */}
                <label className="careers-checkbox">
                  <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} required />
                  {uiLanguage === 'it' ? (
                    <>
                      Acconsento al trattamento dei miei dati personali in conformità con l'
                      <a href={privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', marginLeft: '4px' }}>
                        Informativa sulla Privacy
                      </a>
                    </>
                  ) : (
                    <>
                      I consent to processing of my personal data in accordance with the{' '}
                      <a href={privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        Privacy Policy
                      </a>
                    </>
                  )}
                </label>

                {submitMessage && (
                  <div className={`careers-submit-message ${submitSuccess ? 'success' : ''}`}>
                    {submitMessage}
                  </div>
                )}

                <button type="submit" className="careers-form-submit" disabled={submitting || isJobClosed}>
                  {submitting ? copy.submitting : copy.submitApplication}
                </button>
              </form>
            </section>
          </div>

          <aside style={{ display: 'grid', gap: 12, alignSelf: 'start' }}>
            <section className="careers-detail-card">
              <h3>{copy.roleFacts}</h3>
              <div className="careers-facts-grid">
                <div><strong><CalendarDays size={13} style={{ marginRight: 4 }} />{copy.posted}</strong><span>{formatDate(job.publishedAt, uiLanguage, job.createdAt)}</span></div>
                <div><strong><BriefcaseBusiness size={13} style={{ marginRight: 4 }} />{copy.contract}</strong><span>{job.contractType ?? copy.notSpecified}</span></div>
                <div><strong><Clock size={13} style={{ marginRight: 4 }} />{copy.weeklyHours}</strong><span>{job.weeklyHours ?? copy.notSpecified}</span></div>
                <div><strong><Wallet size={13} style={{ marginRight: 4 }} />{copy.salaryRange}</strong><span>{formatSalary(job.salaryMin, uiLanguage)} - {formatSalary(job.salaryMax, uiLanguage)}</span></div>
                <div><strong><Building2 size={13} style={{ marginRight: 4 }} />{copy.department}</strong><span>{job.department ?? copy.general}</span></div>
                <div><strong><Languages size={13} style={{ marginRight: 4 }} />{copy.language}</strong><span>{job.language.toUpperCase()}</span></div>
                <div><strong><Globe2 size={13} style={{ marginRight: 4 }} />{copy.remoteType}</strong><span>{REMOTE_LABEL[uiLanguage][job.remoteType] ?? job.remoteType}</span></div>
              </div>
            </section>

            {job.storeId && (
              <section className="careers-detail-card">
                <h3>{copy.storeContext}</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
                    <div className="careers-hiring-avatar" style={{ borderRadius: 10 }}>
                      {storeLogoUrl ? <img src={storeLogoUrl} alt={job.storeName ?? copy.assignedStore} /> : <StoreIcon size={16} />}
                    </div>
                    <div>
                      <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#111827' }}>
                        {storeCountryCode ? (
                          <ReactCountryFlag countryCode={storeCountryCode} svg style={{ width: '1.1em', height: '1.1em', borderRadius: 2 }} title={storeCountryCode} />
                        ) : null}
                        {job.storeName ?? copy.assignedStore}
                      </strong>
                      <span style={{ color: '#6b7280', fontSize: 12, display: 'block', marginTop: 2 }}>
                        {job.storeCode ? `Code ${job.storeCode}` : copy.storeCodeNotSet}
                      </span>
                    </div>
                  </div>
                  <div className="careers-facts-grid">
                    <div><strong>{copy.teamSize}</strong><span>{job.storeEmployeeCount ?? copy.notSpecified}</span></div>
                    <div><strong>{copy.location}</strong><span>{formatLocation(job, remoteFallback)}</span></div>
                  </div>
                </div>
              </section>
            )}

            <section className="careers-detail-card">
              <h3>{copy.securityTitle}</h3>
              <div className="careers-facts-grid">
                <div><strong><CalendarDays size={13} style={{ marginRight: 4 }} />{copy.submittedAt}</strong><span>{copy.realtimeSync}</span></div>
                <div><strong><Building2 size={13} style={{ marginRight: 4 }} />{copy.destination}</strong><span>{companyName}</span></div>
                <div><strong><Users size={13} style={{ marginRight: 4 }} />{copy.visibility}</strong><span>{copy.visibilityText}</span></div>
                <div><strong><User2 size={13} style={{ marginRight: 4 }} />{copy.duplicateCheck}</strong><span>{copy.duplicateCheckText}</span></div>
              </div>
            </section>
          </aside>
        </div>

        {showApplyModal && !isJobClosed && createPortal(
          <div className="careers-filter-modal-backdrop" onClick={() => setShowApplyModal(false)}>
            <div className="careers-filter-modal careers-apply-modal" onClick={(event) => event.stopPropagation()}>
              <div className="careers-filter-modal-header">
                <div>
                  <h3>{copy.applyTitle}</h3>
                  <p>{copy.applySubtitle}</p>
                </div>
                <button type="button" onClick={() => setShowApplyModal(false)} aria-label={copy.backToCareers}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: 12, padding: '16px 16px 20px' }}>
                <form onSubmit={handleSubmit} className="careers-form-grid">
                  {/* Section 1 — Required fields (always visible, no heading needed) */}
                  <section style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 16, border: '1px solid rgba(13,33,55,0.18)', background: 'rgba(248,250,252,0.8)' }}>
                    <div className="careers-form-row">
                      <input 
                        className="careers-form-input" 
                        type="text"
                        value={firstName} 
                        onChange={(event) => setFirstName(event.target.value)} 
                        placeholder={copy.firstNamePlaceholder} 
                        autoComplete="given-name"
                        required
                      />
                      <input 
                        className="careers-form-input" 
                        type="text"
                        value={lastName} 
                        onChange={(event) => setLastName(event.target.value)} 
                        placeholder={copy.lastNamePlaceholder} 
                        autoComplete="family-name"
                        required
                      />
                    </div>

                    <div className="careers-form-row">
                      <input 
                        className="careers-form-input" 
                        type="email" 
                        value={email} 
                        onChange={(event) => setEmail(event.target.value)} 
                        placeholder={copy.emailPlaceholder} 
                        required 
                        autoComplete="email" 
                      />
                      <input 
                        className="careers-form-input" 
                        type="tel" 
                        value={phone} 
                        onChange={(event) => setPhone(event.target.value)} 
                        placeholder={copy.phonePlaceholder} 
                        autoComplete="tel" 
                      />
                    </div>

                    <input
                      className="careers-form-input"
                      type="url"
                      value={linkedinUrl}
                      onChange={(event) => setLinkedinUrl(event.target.value)}
                      placeholder={copy.linkedinPlaceholder}
                    />
                  </section>

                  {/* Section 2 & 3 — CV/Resume and Cover Letter */}
                  <section style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 16, border: '1px solid rgba(13,33,55,0.14)', background: '#fff' }}>
                    <div
                      className={`careers-cv-dropzone ${dragActive ? 'drag-active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '24px 16px',
                        borderRadius: 12,
                        border: dragActive ? '2px dashed #C9973A' : '1px dashed rgba(201,151,58,0.45)',
                        background: dragActive ? 'rgba(201,151,58,0.1)' : 'rgba(201,151,58,0.04)',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <label style={{ fontSize: '13px', color: '#374151', fontWeight: 700, cursor: 'pointer', width: '100%', display: 'block' }}>
                        {copy.cvLabel}
                      </label>
                      {!resume ? (
                        <>
                          <input
                            type="file"
                            id="cv-upload-input"
                            accept=".pdf,.doc,.docx,.txt,.rtf"
                            onChange={handleResumeChange}
                            required
                            style={{ display: 'none' }}
                          />
                          <label
                            htmlFor="cv-upload-input"
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 6,
                              cursor: 'pointer',
                              width: '100%',
                            }}
                          >
                            <div style={{ color: '#C9973A', marginBottom: 4 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 16 4-4 4 4"/></svg>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                              {uiLanguage === 'it' ? 'Trascina il tuo CV qui o clicca per sfogliare' : 'Drag & drop your CV here or click to browse'}
                            </span>
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>
                              {uiLanguage === 'it' ? 'Formati accettati: PDF, Word, TXT, RTF (max 5MB)' : 'Accepted formats: PDF, Word, TXT, RTF (max 5MB)'}
                            </span>
                          </label>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(201,151,58,0.3)', background: '#fff', width: '100%', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #C9973A, #B5852E)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {resume.name.split('.').pop()?.toUpperCase()}
                            </div>
                            <div style={{ minWidth: 0, textAlign: 'left' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resume.name}</div>
                              <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>{(resume.size / 1024).toFixed(1)} KB</span>
                                <span style={{ color: '#d1d5db' }}>|</span>
                                <button
                                  type="button"
                                  onClick={() => setShowResumePreview(true)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: '#c9973a',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {uiLanguage === 'it' ? 'Anteprima' : 'Preview'}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => setShowResumePreview(true)}
                              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(201,151,58,0.4)', background: 'rgba(201,151,58,0.1)', color: '#8A5A07', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {uiLanguage === 'it' ? 'Visualizza' : 'View'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setResume(null); setResumePreviewUrl(null); }}
                              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)', color: '#991B1B', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {uiLanguage === 'it' ? 'Rimuovi' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <textarea
                      className="careers-form-textarea"
                      value={coverLetter}
                      onChange={(event) => setCoverLetter(event.target.value)}
                      placeholder={copy.coverLetterPlaceholder}
                      maxLength={1000}
                      rows={5}
                    />
                    <div className="careers-form-help">{coverLetter.length}/1000</div>
                  </section>

                  {/* Part A: Screener Questions */}
                  {screenerQuestions.length > 0 && (
                    <section style={{ display: 'grid', gap: 16, padding: 16, borderRadius: 16, border: '1px solid rgba(201, 151, 58, 0.25)', background: 'rgba(201, 151, 58, 0.03)' }}>
                      <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid rgba(201, 151, 58, 0.15)', paddingBottom: '8px' }}>
                        {uiLanguage === 'it' ? 'Domande di preselezione' : 'Screening questions'}
                      </h3>
                      {screenerQuestions.map((q) => {
                        const qVal = screenerAnswers[q.id] || '';
                        return (
                          <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                              {q.label} {q.required && <span style={{ color: '#ef4444' }}>*</span>}
                            </label>
                            
                            {q.type === 'radio' && (
                              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                                {(q.options || [{ label: 'Sì', value: 'yes' }, { label: 'No', value: 'no' }]).map((opt) => {
                                  const isChecked = qVal === opt.value;
                                  return (
                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: '#1e293b', cursor: 'pointer' }}>
                                      <input
                                        type="radio"
                                        name={q.id}
                                        value={opt.value}
                                        checked={isChecked}
                                        onChange={(e) => setScreenerAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                        required={q.required}
                                        style={{ accentColor: '#C9973A', width: 'auto' }}
                                      />
                                      {opt.label}
                                    </label>
                                  );
                                })}
                              </div>
                            )}

                            {q.type === 'checkbox' && (
                              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                                {q.options?.map((opt) => {
                                  const currentSelections = qVal ? qVal.split(',').map(s => s.trim()) : [];
                                  const isChecked = currentSelections.includes(opt.value);
                                  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                                    let nextSelections;
                                    if (e.target.checked) {
                                      nextSelections = [...currentSelections, opt.value];
                                    } else {
                                      nextSelections = currentSelections.filter(v => v !== opt.value);
                                    }
                                    setScreenerAnswers(prev => ({ ...prev, [q.id]: nextSelections.join(', ') }));
                                  };
                                  return (
                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: '#1e293b', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        value={opt.value}
                                        checked={isChecked}
                                        onChange={handleCheckboxChange}
                                        style={{ accentColor: '#C9973A', width: 'auto' }}
                                      />
                                      {opt.label}
                                    </label>
                                  );
                                })}
                              </div>
                            )}

                            {q.type === 'text' && (
                              <input
                                type="text"
                                className="careers-form-input"
                                value={qVal}
                                onChange={(e) => setScreenerAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                required={q.required}
                                placeholder={uiLanguage === 'it' ? 'Scrivi la tua risposta...' : 'Type your answer...'}
                              />
                            )}

                            {q.type === 'number' && (
                              <input
                                type="number"
                                className="careers-form-input"
                                value={qVal}
                                onChange={(e) => setScreenerAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                required={q.required}
                                placeholder="e.g. 5"
                              />
                            )}
                          </div>
                        );
                      })}
                    </section>
                  )}

                  {/* GDPR Helper Notice */}
                  <div style={{ fontSize: '12.5px', color: '#64748b', padding: '0 4px', lineHeight: 1.4 }}>
                    {copy.gdprNotice}
                  </div>

                  {/* Section 4 — Collapsible additional information */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(13, 33, 55, 0.12)',
                        background: '#ffffff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                          {copy.additionalInfoTitle}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          {copy.additionalInfoSubtitle}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '14px',
                        color: '#64748b',
                        transform: showAdditionalInfo ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        display: 'inline-block',
                        marginLeft: '12px',
                      }}>
                        ▼
                      </span>
                    </button>

                    {showAdditionalInfo && (
                      <section style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 16, border: '1px solid rgba(59,130,246,0.22)', background: 'rgba(239,246,255,0.6)', marginTop: 4 }}>
                        <div className="careers-form-row" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
                          <DatePicker
                            value={appProfile.dateOfBirth}
                            onChange={(value) => setAppProfile((prev) => ({ ...prev, dateOfBirth: value }))}
                            label={uiLanguage === 'it' ? 'Data di nascita' : 'Date of birth'}
                            initialViewYear={new Date().getFullYear() - 30}
                            placement="bottom"
                            disablePortal
                          />
                          <input
                            className="careers-form-input"
                            type="text"
                            value={appProfile.nationality}
                            onChange={(event) => setAppProfile((prev) => ({ ...prev, nationality: event.target.value }))}
                            placeholder={uiLanguage === 'it' ? 'Nazionalità' : 'Nationality'}
                          />
                        </div>

                        <div className="careers-form-row">
                          <CustomSelect
                            value={appProfile.gender || null}
                            onChange={(value) => setAppProfile((prev) => ({ ...prev, gender: value || '' }))}
                            options={genderOptions}
                            placeholder={uiLanguage === 'it' ? 'Genere' : 'Gender'}
                            isClearable={false}
                            searchable={false}
                          />
                          <CustomSelect
                            value={appProfile.maritalStatus || null}
                            onChange={(value) => setAppProfile((prev) => ({ ...prev, maritalStatus: value || '' }))}
                            options={maritalStatusOptions}
                            placeholder={uiLanguage === 'it' ? 'Stato civile' : 'Marital status'}
                            isClearable={false}
                            searchable={false}
                          />
                        </div>

                        <LocationFieldGroup
                          value={{ country: appProfile.country, state: appProfile.state, city: appProfile.city }}
                          onChange={(location) => setAppProfile((prev) => ({ ...prev, country: location.country, state: location.state, city: location.city }))}
                          includeAddress={false}
                          includePostalCode={false}
                          includePhone={false}
                          labels={{
                            country: uiLanguage === 'it' ? 'Paese' : 'Country',
                            state: uiLanguage === 'it' ? 'Regione / Stato' : 'State / Region',
                            city: uiLanguage === 'it' ? 'Città' : 'City',
                          }}
                        />

                        <input
                          className="careers-form-input"
                          type="text"
                          value={appProfile.address || ''}
                          onChange={(event) => setAppProfile((prev) => ({ ...prev, address: event.target.value }))}
                          placeholder={uiLanguage === 'it' ? 'Indirizzo' : 'Address'}
                        />

                        <div className="careers-form-row" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
                          <DatePicker
                            value={appProfile.startDate}
                            onChange={(value) => setAppProfile((prev) => ({ ...prev, startDate: value }))}
                            label={copy.availableStartDateLabel}
                            placement="bottom"
                            disablePortal
                          />
                          <input
                            className="careers-form-input"
                            type="text"
                            value={appProfile.postalCode || ''}
                            onChange={(event) => setAppProfile((prev) => ({ ...prev, postalCode: event.target.value }))}
                            placeholder={uiLanguage === 'it' ? 'Codice postale' : 'Postal code'}
                          />
                        </div>
                      </section>
                    )}
                  </div>

                  <label className="careers-checkbox">
                    <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} required />
                    {uiLanguage === 'it' ? (
                      <>
                        Acconsento al trattamento dei miei dati personali in conformità con l'
                        <a href={privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', marginLeft: '4px' }}>
                          Informativa sulla Privacy
                        </a>
                      </>
                    ) : (
                      <>
                        I consent to processing of my personal data in accordance with the{' '}
                        <a href={privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                          Privacy Policy
                        </a>
                      </>
                    )}
                  </label>

                  {submitMessage && <div className={`careers-submit-message ${submitSuccess ? 'success' : ''}`}>{submitMessage}</div>}

                  <div className="careers-apply-footer">
                    <button type="button" className="careers-form-submit" onClick={() => setShowApplyModal(false)} style={{ background: '#fff', color: '#334155', borderColor: 'rgba(13,33,55,0.16)' }}>
                      {copy.backToCareers}
                    </button>
                    <button type="submit" className="careers-form-submit" disabled={submitting || isJobClosed}>
                      {submitting ? copy.submitting : copy.submitApplication}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {showResumePreview && resumePreviewUrl && resume && (
          <DocumentPreviewModal
            url={resumePreviewUrl}
            filename={resume.name}
            onClose={() => setShowResumePreview(false)}
          />
        )}
      </div>
      <CareersFooter companyName={companyName} companyEmail={companyMeta?.companyEmail || undefined} companySlug={effectiveCompanySlug} />
      <CookieConsentBanner />
    </div>
  );
}
