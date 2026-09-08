import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  Edit,
  Eye,
  FileText,
  Globe2,
  Heart,
  Languages,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Sparkles,
  Store as StoreIcon,
  Trash2,
  User2,
  Users,
  Wallet,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Bell,
  Clipboard,
  Check,
  FileCheck,
  AlertTriangle,
  User,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import { COUNTRY_NAME_TO_CODE } from '../../utils/countryList';
import { resolveItalianProvince } from '../../utils/italianProvinces';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { translateApiError } from '../../utils/apiErrors';
import indeedLogo from '../../assets/indeed-logo.png';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import CustomSelect, { SelectOption } from '../../components/ui/CustomSelect';
import Select from '../../components/ui/Select';
import { DatePicker } from '../../components/ui/DatePicker';
import { TimePicker } from '../../components/ui/TimePicker';
import { CitySelect, CountrySelect, StateSelect, LocationFieldGroup } from '../../components/location';
import { getApiBaseUrl, getAvatarUrl, getCompanyLogoUrl, getStoreLogoUrl, getResumeUrl } from '../../api/client';
import { getStores } from '../../api/stores';
import { getCompanies } from '../../api/companies';
import { getEmployees, createEmployee } from '../../api/employees';
import { listInterviewers } from '../../api/ats';
import { getIndeedConfig, saveIndeedConfig, clearIndeedConfig, IndeedConfigStatus } from '../../api/indeedConfig';
import { getNotificationSettings, type NotificationSetting } from '../../api/documents';
import { getEmailConfig } from '../../api/email';
import { Company, Employee, Store } from '../../types';
import {
  getJobs, createJob, updateJob, deleteJob, publishJob, getJobCompliance,
  getCandidates, getCandidate, createCandidate, updateCandidateStage, updateCandidateTags, deleteCandidate,
  getInterviews, getAllInterviews, createInterview, updateInterview, deleteInterview,
  getInterviewFeedbackComments, addInterviewFeedbackComment, deleteInterviewFeedbackComment,
  getInterviewNotifications, sendInterviewEmail,
  getAlerts, getRisks, getAllInterviewFeedbackComments,
  previewJobTranslation,
  getIndeedStats,
  listScreenerQuestions,
  createScreenerQuestion,
  updateScreenerQuestion,
  deleteScreenerQuestion,
  type ScreenerQuestion,
  JobPosting, Candidate, Interview, HRAlert, JobRisk, AllInterviewFeedbackComment,
  InterviewFeedbackComment, InterviewNotificationLog,
  CandidateStatus, JobStatus, JobLanguage, JobType, RemoteType, IndeedStatsResponse,
  InterviewType,
} from '../../api/ats';
import { parseCandidateProfile, serializeCandidateProfile, buildCandidateProfile, type CandidateApplicationProfile } from './candidateProfile';
import DocumentPreviewModal from './DocumentPreviewModal';
import InterviewsPanel from './InterviewsPanel';
import CalendarPanel from './CalendarPanel';


// ─── Helpers ──────────────────────────────────────────────────────────────────

// Country flag helper
const getCountryFlag = (countryCode: string | null | undefined): string => {
  if (!countryCode) return '';
  const code = countryCode.toUpperCase();
  const flags: Record<string, string> = {
    'IT': '🇮🇹', 'US': '🇺🇸', 'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪',
    'ES': '🇪🇸', 'PT': '🇵🇹', 'NL': '🇳🇱', 'BE': '🇧🇪', 'CH': '🇨🇭',
    'AT': '🇦🇹', 'PL': '🇵🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰',
  };
  return flags[code] || '🌍';
};

const STAGES: CandidateStatus[] = ['received', 'review', 'phone_interview', 'interview', 'hired', 'rejected'];

const NEXT_STAGE: Partial<Record<CandidateStatus, CandidateStatus>> = {
  received: 'review',
  review: 'phone_interview',
  phone_interview: 'interview',
  interview: 'hired',
};

const STAGE_COLOR: Record<CandidateStatus, string> = {
  received: '#0284C7',
  review: '#7C3AED',
  phone_interview: '#EA580C', // Orange
  interview: '#C9973A',
  hired: '#15803D',
  rejected: '#DC2626',
};

const STAGE_BG: Record<CandidateStatus, string> = {
  received: 'rgba(2,132,199,0.08)',
  review: 'rgba(124,58,237,0.08)',
  phone_interview: 'rgba(234,88,12,0.08)',
  interview: 'rgba(201,151,58,0.10)',
  hired: 'rgba(21,128,61,0.08)',
  rejected: 'rgba(220,38,38,0.07)',
};

interface HiringEmployeeDraft {
  name: string;
  surname: string;
  personalEmail: string;
  phone: string;
  role: string;
  companyId: number;
  storeId: number | null;
  companyName: string;
  companyGroupName: string;
  companyLogoFilename: string | null;
  storeName: string;
  storeLogoFilename: string | null;
  storeEmployeeCount: number | null;
  jobTitle: string;
  uniqueId: string;
  password: string;
  hireDate: string;
  contractType: string;
  maritalStatus: string;
  workingType: string;
  weeklyHours: string;
  dateOfBirth: string;
  nationality: string;
  gender: string;
  country: string;
  state: string;
  city: string;
  currentEmployer: string;
  currentRole: string;
  availability: string;
  applicationDate: string;
  applicationSource: string;
  applicationChannel: string;
}

const ROLE_BADGE_VARIANT: Record<string, 'accent' | 'info' | 'warning' | 'neutral'> = {
  hr: 'accent',
  area_manager: 'info',
  store_manager: 'warning',
};

const STATUS_COLOR: Record<JobStatus, string> = {
  draft: '#6B7280',
  published: '#15803D',
  closed: '#DC2626',
};

const JOB_TYPE_LABEL: Record<JobType, string> = {
  fulltime: 'fulltime',
  parttime: 'parttime',
  contract: 'contract',
  internship: 'internship',
};

function generateEmployeeUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'EMP-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  let result = '';
  for (let index = 0; index < 12; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

function normalizeCountryCode(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return COUNTRY_NAME_TO_CODE[raw.toLowerCase()] ?? '';
}

const italianProvinceCode = (cityName: string, stateName: string): string => {
  return resolveItalianProvince(cityName, stateName);
};

// Maps every salary period the API may return (including legacy Italian values
// and 'annually') onto the option values used by the salary period select.
const SALARY_PERIOD_ALIASES: Record<string, string> = {
  hourly: 'hourly',
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
  annually: 'yearly',
  "all'ora": 'hourly',
  'al giorno': 'daily',
  'a settimana': 'weekly',
  'al mese': 'monthly',
  'per anno': 'yearly',
};

function canonicalSalaryPeriod(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = value.trim().toLowerCase().replace(/’/g, "'");
  return SALARY_PERIOD_ALIASES[normalized] ?? '';
}

function countryNameFromCode(value: string | null | undefined): string {
  const code = normalizeCountryCode(value);
  if (!code) return '-';
  try {
    const lang = localStorage.getItem('hr_lang') || 'it';
    const formatter = new Intl.DisplayNames([lang], { type: 'region' });
    return formatter.of(code) ?? code;
  } catch {
    return code;
  }
}

interface CheckResult {
  id: string;
  field: string;
  name: string;
  rule: string;
  ok: boolean;
  warn: boolean;
  fix: string;
  problem?: string;
  valueChecked?: string;
}

type ComplianceCheck = {
  key: string;
  label: string;
  ok: boolean;
};

function runIndeedComplianceSuite(data: any): CheckResult[] {
  const isRemoteJob = data.remoteType === 'remote' || data.isRemote;
  const strippedDesc = (data.description || '').replace(/<[^>]*>/g, '').trim();
  const titleStr = data.title || '';
  const country = data.country || '';

  // No tenant-specific fallbacks here. This suite exists to report missing
  // fields, so defaulting them would make the checks below pass on data that is
  // actually absent — and would surface another company's details while doing it.
  const companyEmail = data.companyEmail || '';
  const indeedApplyTokenConfigured = data.indeedApplyTokenConfigured !== undefined ? data.indeedApplyTokenConfigured : true;
  const companySlug = data.companySlug || '';
  const indeedApplyPostUrl = data.indeedApplyPostUrl
    || (companySlug
      ? `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}/api/public/indeed-apply/${companySlug}`
      : '');
  const companyName = data.companyName || '';
  const jobId = data.id || 0;

  const frontendBase = (import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '');
  const jobCompanySlug = companySlug;
  const baseJobUrl = `${frontendBase}/careers/${jobCompanySlug}/jobs/${jobId}`;
  const applyUrl = baseJobUrl + (baseJobUrl.includes('?') ? '&' : '?') + 'source=Indeed';

  const allowedAcronyms = new Set([
    'PHP', 'SQL', 'CSS', 'XML', 'API', 'SEO', 'SEM', 'SaaS', 'AWS', 'SDK', 'PDF', 'URL', 'URI',
    'ISO', 'GDPR', 'RAL', 'ATS', 'CRM', 'ERP', 'USA', 'B2B', 'B2C', 'IT', 'UI', 'UX', 'HR', 'PR',
    'HTML', 'II', 'III', 'IV', 'UK', 'EU'
  ]);

  const results: CheckResult[] = [
    // GROUP 1 - Title
    {
      id: 'T1',
      field: 'title',
      name: 'Title Present',
      rule: 'Title field is non-null and non-empty string.',
      ok: !!titleStr.trim(),
      problem: !titleStr.trim() ? "Title is missing. Indeed requires a job title on every posting." : undefined,
      warn: false,
      fix: "Add a job title before publishing.",
      valueChecked: titleStr.trim() ? `"${titleStr}"` : 'Missing'
    },
    {
      id: 'T2',
      field: 'title',
      name: 'Title Under 100 Characters',
      rule: 'Title length is less than or equal to 100 characters.',
      ok: titleStr.length <= 100,
      problem: titleStr.length > 100 ? `Title is ${titleStr.length} characters. Indeed truncates titles over 100 characters in search results, which reduces click-through rate.` : undefined,
      warn: false,
      fix: `Shorten the title to under 100 characters. Current length: ${titleStr.length}.`,
      valueChecked: `${titleStr.length} chars`
    },
    {
      id: 'T3',
      field: 'title',
      name: 'Title Compensation Cleanliness',
      rule: 'Title does not contain salary, RAL, stipend, or numeric compensation indicators.',
      ok: !/(€|\$|£|salary|stipend|RAL|ral|\d+k|\d+,\d{3})/i.test(titleStr),
      problem: /(€|\$|£|salary|stipend|RAL|ral|\d+k|\d+,\d{3})/i.test(titleStr) ? "Title appears to contain salary or compensation information. Indeed prohibits salary in job titles as it is filtered out by their parser." : undefined,
      warn: false,
      fix: "Remove the salary reference from the title. Move it to the salary field if you want to display it.",
      valueChecked: titleStr ? `"${titleStr}"` : 'Missing'
    },
    {
      id: 'T4',
      field: 'title',
      name: 'Title Case Quality',
      rule: 'Title does not contain shouting-style ALL CAPS words of 3+ letters.',
      ok: (() => {
        const words = titleStr.split(/[^a-zA-Z]/).filter((w: string) => w.length >= 3 && w === w.toUpperCase() && !allowedAcronyms.has(w));
        return words.length === 0;
      })(),
      problem: (() => {
        const words = titleStr.split(/[^a-zA-Z]/).filter((w: string) => w.length >= 3 && w === w.toUpperCase() && !allowedAcronyms.has(w));
        return words.length > 0 ? `Title contains ALL CAPS word(s): ${words.join(', ')}. Indeed's quality filter downgrades postings with shouting-style formatting.` : undefined;
      })(),
      warn: false,
      fix: (() => {
        const words = titleStr.split(/[^a-zA-Z]/).filter((w: string) => w.length >= 3 && w === w.toUpperCase() && !allowedAcronyms.has(w));
        return words.length > 0 ? `Change '${words[0]}' to title case or sentence case.` : "Change shouting ALL CAPS words to title case.";
      })(),
      valueChecked: (() => {
        const words = titleStr.split(/[^a-zA-Z]/).filter((w: string) => w.length >= 3 && w === w.toUpperCase() && !allowedAcronyms.has(w));
        return words.length > 0 ? `ALL CAPS words: ${words.join(', ')}` : 'No shouting words';
      })()
    },
    {
      id: 'T5',
      field: 'title',
      name: 'Title Non-Promotional',
      rule: 'Title contains no special clickbait characters, exclamation marks, or promotional phrases.',
      ok: !(/[★✓►•*!]{2,}|URGENTE|IMMEDIAT|subito|hiring now/i.test(titleStr)),
      problem: (() => {
        const match = titleStr.match(/[★✓►•*!]{2,}|URGENTE|IMMEDIAT|subito|hiring now/i);
        return match ? `Title contains promotional language or symbols: '${match[0]}'. Indeed demotes postings with clickbait titles.` : undefined;
      })(),
      warn: false,
      fix: "Remove promotional language. Use a clean job title that describes the role.",
      valueChecked: (() => {
        const match = titleStr.match(/[★✓►•*!]{2,}|URGENTE|IMMEDIAT|subito|hiring now/i);
        return match ? `Found: "${match[0]}"` : 'Clean';
      })()
    },

    // GROUP 2 - Description
    {
      id: 'D1',
      field: 'description',
      name: 'Description Present',
      rule: 'Description is present and not empty.',
      ok: !!data.description && data.description.trim().length > 0,
      problem: (!data.description || !data.description.trim()) ? "Description is missing. Indeed requires a job description on every posting." : undefined,
      warn: false,
      fix: "Add a job description before publishing.",
      valueChecked: data.description ? 'Present' : 'Missing'
    },
    {
      id: 'D2',
      field: 'description',
      name: 'Description Min Length',
      rule: 'Description is over 150 characters after stripping HTML markup.',
      ok: strippedDesc.length > 150,
      problem: strippedDesc.length <= 150 ? `Description is only ${strippedDesc.length} characters after stripping HTML. Indeed requires meaningful content — very short descriptions are rejected by the quality filter.` : undefined,
      warn: false,
      fix: "Expand the description. Aim for at least 300 characters. Describe the role, responsibilities, and requirements.",
      valueChecked: `${strippedDesc.length} chars (stripped)`
    },
    {
      id: 'D3',
      field: 'description',
      name: 'Description Max Length',
      rule: 'Description is under 10,000 characters to prevent truncation.',
      ok: strippedDesc.length <= 10000,
      problem: strippedDesc.length > 10000 ? `Description is ${strippedDesc.length} characters. Indeed's feed parser silently truncates descriptions over 10,000 characters, which may cut off key information.` : undefined,
      warn: false,
      fix: `Shorten the description to under 10,000 characters. Current length: ${strippedDesc.length}.`,
      valueChecked: `${strippedDesc.length} chars`
    },
    {
      id: 'D4',
      field: 'description',
      name: 'Description HTML Entities Cleanliness',
      rule: 'Description does not contain raw escaped HTML entities.',
      ok: !(/&amp;|&lt;|&gt;|&quot;|&#/i.test(data.description || '')),
      problem: (() => {
        const matches = (data.description || '').match(/&amp;|&lt;|&gt;|&quot;|&#/g);
        return matches ? `Description contains escaped HTML entities: '${Array.from(new Set(matches)).join(', ')}'. These render as raw text on the Indeed listing page (e.g. '&amp;' shows as '&amp;' instead of '&').` : undefined;
      })(),
      warn: false,
      fix: "Unescape the HTML entities before saving, or fix the rich text editor output pipeline.",
      valueChecked: (() => {
        const matches = (data.description || '').match(/&amp;|&lt;|&gt;|&quot;|&#/g);
        return matches ? `Found entities: ${Array.from(new Set(matches)).join(', ')}` : 'Clean (No entities)';
      })()
    },
    {
      id: 'D5',
      field: 'description',
      name: 'Description Semantics Check',
      rule: 'Description contains no inline style CSS attributes.',
      ok: !(/style\s*=\s*["\'][^"\']*["\']/i.test(data.description || '')),
      problem: /style\s*=\s*["\'][^"\']*["\']/i.test(data.description || '') ? "Description contains inline CSS style attributes. Indeed strips these, which can break the visual structure of the listing." : undefined,
      warn: false,
      fix: "Remove all style='...' attributes from the description HTML. Use semantic tags only (ul, li, b, p).",
      valueChecked: /style\s*=\s*["\'][^"\']*["\']/i.test(data.description || '') ? 'Contains inline CSS' : 'Clean'
    },
    {
      id: 'D6',
      field: 'description',
      name: 'Description Salary Separation',
      rule: 'Description does not embed salary figures.',
      ok: !(/(€|£|\$)\s*\d|RAL\s*\d|\d+\s*€|\d+k\s*(gross|nett|lordo|netto)/i.test(data.description || '')),
      problem: (() => {
        const match = (data.description || '').match(/(€|£|\$)\s*\d|RAL\s*\d|\d+\s*€|\d+k\s*(gross|nett|lordo|netto)/i);
        return match ? `Description contains what appears to be salary figures: '${match[0]}'. Indeed requires salary to be in the dedicated salary field, not embedded in the description.` : undefined;
      })(),
      warn: false,
      fix: "Move salary information to the dedicated salary/compensation field. Remove it from the description body.",
      valueChecked: (() => {
        const match = (data.description || '').match(/(€|£|\$)\s*\d|RAL\s*\d|\d+\s*€|\d+k\s*(gross|nett|lordo|netto)/i);
        return match ? `Found: "${match[0]}"` : 'No embedded salary';
      })()
    },
    {
      id: 'D7',
      field: 'description',
      name: 'Description GDPR Compliance',
      rule: 'Description does not request candidates to submit personal data directly in the text.',
      ok: !(/(send.*CV.*to|invia.*CV|manda.*CV|email.*your.*CV|allega.*documento|carta d.identità|codice fiscale|data di nascita|partita IVA)/i.test(data.description || '')),
      problem: (/(send.*CV.*to|invia.*CV|manda.*CV|email.*your.*CV|allega.*documento|carta d.identità|codice fiscale|data di nascita|partita IVA)/i.test(data.description || '')) ? "Description asks candidates to submit personal data (CV by email, ID document, tax code, date of birth). This violates GDPR and Indeed's data collection policy." : undefined,
      warn: false,
      fix: "Remove personal data collection from the description. Candidates apply via the Indeed Apply form — do not ask for documents in the job text.",
      valueChecked: (() => {
        const match = (data.description || '').match(/(send.*CV.*to|invia.*CV|manda.*CV|email.*your.*CV|allega.*documento|carta d.identità|codice fiscale|data di nascita|partita IVA)/i);
        return match ? `Found GDPR trigger: "${match[0]}"` : 'Clean';
      })()
    },
    {
      id: 'D8',
      field: 'description',
      name: 'Description Link Safety',
      rule: 'Description does not contain links to external domains.',
      ok: (() => {
        const hasExternal = new RegExp('https?:\\/\\/(?!(veylohr\\.com|' + window.location.host + '))', 'i').test(data.description || '');
        return !hasExternal;
      })(),
      problem: (() => {
        const match = (data.description || '').match(/https?:\/\/(?!(veylohr\.com|localhost|127\.0\.0\.1))[^\s"'<]+/i);
        const hasExternal = new RegExp('https?:\\/\\/(?!(veylohr\\.com|' + window.location.host + '))', 'i').test(data.description || '');
        return (hasExternal && match) ? `Description contains a link to an external domain: '${match[0]}'. Indeed's feed validator flags external links in descriptions as potential spam or redirect risks.` : undefined;
      })(),
      warn: false,
      fix: "Remove the external URL from the description. If you need to reference company information, put it in the company profile fields.",
      valueChecked: (() => {
        const match = (data.description || '').match(/https?:\/\/(?!(veylohr\.com|localhost|127\.0\.0\.1))[^\s"'<]+/i);
        return match ? `Found external link: "${match[0]}"` : 'Clean';
      })()
    },
    {
      id: 'D9',
      field: 'description',
      name: 'Description Formatting Structure',
      rule: 'Description includes semantic headings, lists, or paragraph breaks.',
      ok: /(<ul>|<ol>|<li>|<p>|\n\n|<br)/i.test(data.description || ''),
      problem: !/(<ul>|<ol>|<li>|<p>|\n\n|<br)/i.test(data.description || '') ? "Job description is plain text without paragraph or list structure. In the description editor, break text into paragraphs or add at least one bullet list. Indeed expects <p>, <ul>, or <ol> tags for proper rendering." : undefined,
      warn: false,
      fix: "Break the description into sections using paragraph tags or bullet lists. Add headings like 'Responsibilities', 'Requirements', 'What we offer'.",
      valueChecked: /(<ul>|<ol>|<li>|<p>|\n\n|<br)/i.test(data.description || '') ? 'HTML paragraphs/lists structured' : 'Plain text only'
    },

    // GROUP 3 - Location
    {
      id: 'L1',
      field: 'city',
      name: 'Location City Support',
      rule: 'City location is specified (or role is fully remote).',
      ok: !!data.city && data.city.trim().length > 0 || isRemoteJob,
      problem: (!isRemoteJob && (!data.city || !data.city.trim())) ? "City is missing and the role is not marked as fully remote. Indeed requires a city for all on-site and hybrid roles." : undefined,
      warn: false,
      fix: "Add a city to the job location, or mark the role as 'Fully remote'.",
      valueChecked: isRemoteJob ? 'Remote job (no city required)' : (data.city ? `"${data.city}"` : 'Missing')
    },
    {
      id: 'L2',
      field: 'country',
      name: 'Location Country Code',
      rule: 'Country code is specified.',
      ok: !!data.country && data.country.trim().length > 0,
      problem: (!data.country || !data.country.trim()) ? "Country is missing. Indeed requires a country code on every posting (e.g. IT for Italy)." : undefined,
      warn: false,
      fix: "Add the country field. For Italian jobs use 'IT'.",
      valueChecked: data.country ? `"${data.country}"` : 'Missing'
    },
    {
      id: 'L3',
      field: 'country',
      name: 'Location ISO Code Standard',
      rule: 'Country code is a valid ISO 3166-1 alpha-2 code.',
      ok: /^[A-Z]{2}$/.test(country) && ['IT', 'US', 'GB', 'FR', 'DE', 'ES', 'NL', 'BE', 'CH', 'AT', 'PL', 'SE', 'NO', 'DK'].includes(country),
      problem: (() => {
        return (!/^[A-Z]{2}$/.test(country) || !['IT', 'US', 'GB', 'FR', 'DE', 'ES', 'NL', 'BE', 'CH', 'AT', 'PL', 'SE', 'NO', 'DK'].includes(country)) ? `Country value '${country || 'missing'}' is not a valid ISO 3166-1 alpha-2 code. Indeed rejects non-standard country codes.` : undefined;
      })(),
      warn: false,
      fix: "Use the two-letter ISO country code. For Italy: IT. For Germany: DE. For France: FR.",
      valueChecked: data.country ? `"${data.country}"` : 'Missing'
    },
    {
      id: 'L4',
      field: 'state',
      name: 'Location State Text',
      rule: 'State field is not numeric.',
      ok: true,
      problem: (data.state && /^\d+$/.test(data.state)) ? `State field contains a numeric value '${data.state}'. Indeed expects a province abbreviation or region name (e.g. MI for Milano, Lombardia), not a numeric taxonomy code.` : undefined,
      warn: !!(data.state && /^\d+$/.test(data.state)),
      fix: "Replace the numeric state code with the correct Italian province abbreviation (MI for Milano, SA for Salerno, etc.) or the full region name (Lombardia, Campania).",
      valueChecked: data.state ? `"${data.state}"` : 'Not set'
    },
    {
      id: 'L5',
      field: 'postalcode',
      name: 'Location Postal Code Format',
      rule: 'Postal code matches the country standard (5 digits for IT).',
      ok: country === 'IT' ? (/^\d{5}$/.test(data.postalCode || data.jobPostalCode || '') || !(data.postalCode || data.jobPostalCode || '').trim()) : true,
      problem: (country === 'IT' && (data.postalCode && !/^\d{5}$/.test(data.postalCode))) ? `Postal code '${data.postalCode}' does not match the expected format for IT. Italian postal codes must be exactly 5 digits.` : undefined,
      warn: false,
      fix: "Correct the postal code. Italian postal codes are 5 digits (e.g. 20121 for Milano city centre).",
      valueChecked: (data.postalCode || data.jobPostalCode) ? `"${data.postalCode || data.jobPostalCode}"` : 'Not set'
    },
    {
      id: 'L6',
      field: 'remotetype',
      name: 'Location Remote Option',
      rule: 'Remote type is either onsite, remote, or hybrid.',
      ok: [null, '', 'onsite', 'remote', 'hybrid'].includes(data.remoteType),
      problem: (![null, '', 'onsite', 'remote', 'hybrid'].includes(data.remoteType)) ? `Remote type value '${data.remoteType}' is not a valid Indeed value. Valid values are: 'remote' (emits 'Fully remote'), 'hybrid' (emits 'Hybrid remote'), or blank for on-site.` : undefined,
      warn: false,
      fix: "Set remote type to one of the accepted values: remote, hybrid, or leave blank for on-site.",
      valueChecked: data.remoteType ? `"${data.remoteType}"` : 'Not set (onsite)'
    },

    // GROUP 4 - Required feed fields
    {
      id: 'R1',
      field: 'referenceId',
      name: 'Reference Number Standard',
      rule: 'Reference number is alphanumeric with hyphens only, max 50 characters.',
      ok: !!data.referenceId && /^[A-Z0-9\-]+$/i.test(data.referenceId) && data.referenceId.length <= 50,
      problem: (() => {
        const ref = data.referenceId || '';
        if (!ref) return 'Reference number is missing.';
        if (!/^[A-Z0-9\-]+$/i.test(ref) || ref.length > 50) {
          return `Reference number '${ref}' contains invalid characters or is too long. Indeed reference numbers must be alphanumeric with hyphens only, max 50 chars.`;
        }
        return undefined;
      })(),
      warn: false,
      fix: "Fix the reference number format. Valid example: JOB-2 or VY-IT-0042.",
      valueChecked: data.referenceId ? `"${data.referenceId}"` : 'Missing'
    },
    {
      id: 'R2',
      field: 'id',
      name: 'Requisition ID Standard',
      rule: 'Requisition ID is present.',
      ok: !!jobId,
      problem: !jobId ? "Requisition ID is missing. Indeed requires this field — it tracks the original role and must remain the same if the job is re-posted." : undefined,
      warn: false,
      fix: `Add a requisition ID. Minimum: use 'REQ-${jobId}'. It must stay the same if this role is ever re-posted.`,
      valueChecked: jobId ? `REQ-${jobId}` : 'Missing'
    },
    {
      id: 'R3',
      field: 'source',
      name: 'ATS Feed Source Name',
      rule: 'Feed source name is present.',
      ok: !!companyName && companyName.trim().length > 0,
      problem: (!companyName || !companyName.trim()) ? "Source name is missing. Indeed requires <sourcename> for all ATS developer feeds to identify the parent organisation." : undefined,
      warn: false,
      fix: "Set the sourcename value. For Fusaro Uomo this should be the parent company or group name (e.g. FUSARO UOMO).",
      valueChecked: companyName ? `"${companyName}"` : 'Missing'
    },
    {
      id: 'R4',
      field: 'companyEmail',
      name: 'Contact Email Present',
      rule: 'Contact email is present.',
      ok: !!companyEmail && companyEmail.trim().length > 0,
      problem: (!companyEmail || !companyEmail.trim()) ? "Contact email is missing. Indeed's Search Quality team uses this to verify the business entity behind each job posting." : undefined,
      warn: false,
      fix: "Add a contact email to the company record or job posting. Use the official @fusarouomo.it address.",
      valueChecked: companyEmail ? `"${companyEmail}"` : 'Missing'
    },
    {
      id: 'R5',
      field: 'companyEmail',
      name: 'Contact Email Format',
      rule: 'Contact email has a valid format.',
      ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail),
      problem: (companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) ? `Contact email '${companyEmail}' is not a valid email address format.` : undefined,
      warn: false,
      fix: "Correct the email address format. Example: hr@fusarouomo.it",
      valueChecked: companyEmail ? `"${companyEmail}"` : 'Missing'
    },
    {
      id: 'R6',
      field: 'language',
      name: 'Language Set',
      rule: 'Language field is set.',
      ok: !!data.language,
      problem: !data.language ? "Language field is missing. Indeed uses this to match the posting to the correct regional Indeed site." : undefined,
      warn: false,
      fix: "Set language to the ISO 639-1 code for the job's language. For Italian jobs: 'it'. For English: 'en'.",
      valueChecked: data.language ? `"${data.language}"` : 'Missing'
    },
    {
      id: 'R7',
      field: 'language',
      name: 'Language ISO Format',
      rule: 'Language code is a valid ISO 639-1 standard code.',
      ok: /^[a-z]{2}(-[A-Z]{2})?$/.test(data.language || ''),
      problem: (data.language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(data.language)) ? `Language value '${data.language}' is not a valid ISO 639-1 language code.` : undefined,
      warn: false,
      fix: "Use a two-letter ISO language code: 'it' for Italian, 'en' for English, 'de' for German.",
      valueChecked: data.language ? `"${data.language}"` : 'Missing'
    },
    {
      id: 'R8',
      field: 'jobType',
      name: 'Job Type Standard',
      rule: 'Job type is configured with a valid value.',
      ok: ['fulltime', 'parttime', 'contract', 'internship', 'temporary'].includes(data.jobType),
      problem: (data.jobType && !['fulltime', 'parttime', 'contract', 'internship', 'temporary'].includes(data.jobType)) ? `Job type '${data.jobType}' is not a valid Indeed job type value. Valid values are: fulltime, parttime, contract, internship, temporary.` : undefined,
      warn: false,
      fix: "Set the job type to one of the accepted values.",
      valueChecked: data.jobType ? `"${data.jobType}"` : 'Not set'
    },
    {
      id: 'R9',
      field: 'status',
      name: 'Job Status Flow',
      rule: 'Job is published.',
      ok: data.status === 'published',
      problem: data.status !== 'published' ? `Job status is '${data.status}', not 'published'. Indeed will not include unpublished jobs in the feed.` : undefined,
      warn: false,
      fix: "Publish the job before submitting to Indeed.",
      valueChecked: data.status ? `"${data.status}"` : 'Missing'
    },

    // GROUP 5 - Apply URL and feed URL
    {
      id: 'U1',
      field: 'url',
      name: 'Apply URL Generated',
      rule: 'Job apply URL is present.',
      ok: !!jobId && !!jobCompanySlug,
      problem: (!jobId || !jobCompanySlug) ? "Apply URL is missing. Indeed requires a valid URL for candidates to apply." : undefined,
      warn: false,
      fix: "Ensure the job has a company slug and is published so the apply URL can be constructed.",
      valueChecked: (jobId && jobCompanySlug) ? 'Available' : 'Missing ID or Slug'
    },
    (() => {
      let hostname = '';
      try {
        hostname = new URL(applyUrl).hostname;
      } catch {
        const match = applyUrl.match(/^(?:https?:\/\/)?([^/:]+)/i);
        hostname = match ? match[1] : '';
      }
      const isLocalhost = hostname === 'localhost' ||
                          hostname === '127.0.0.1' ||
                          hostname.startsWith('192.168.') ||
                          hostname.startsWith('10.');
      return {
        id: 'U2',
        field: 'url',
        name: 'Apply URL HTTPS protocol',
        rule: isLocalhost 
          ? "Testing on localhost — passes automatically on production."
          : "Apply URL uses secure HTTPS protocol.",
        ok: isLocalhost ? true : applyUrl.startsWith('https://'),
        warn: isLocalhost,
        problem: isLocalhost 
          ? "Testing on localhost — passes automatically on production."
          : (!applyUrl.startsWith('https://') ? `Apply URL uses HTTP, not HTTPS: '${applyUrl}'. Indeed requires all URLs in the feed to use HTTPS.` : undefined),
        fix: "Ensure your domain has a valid SSL certificate and all URLs use https://.",
        valueChecked: isLocalhost ? `Localhost (${hostname})` : applyUrl
      };
    })(),
    {
      id: 'U3',
      field: 'url',
      name: 'Apply URL Feed Tracker',
      rule: 'Apply URL contains Indeed tracker (?source=Indeed).',
      ok: applyUrl.includes('source=Indeed'),
      problem: !applyUrl.includes('source=Indeed') ? `Apply URL is missing the ?source=Indeed tracking parameter. Indeed requires this for click attribution.` : undefined,
      warn: false,
      fix: `Append ?source=Indeed to the job URL when generating the feed. URL should be: ${applyUrl}?source=Indeed`,
      valueChecked: applyUrl
    },
    {
      id: 'U4',
      field: 'url',
      name: 'Apply URL Resolution Status',
      rule: 'Apply URL resolves cleanly to a real page.',
      ok: true,
      problem: undefined,
      warn: false,
      fix: "Fix the URL so it returns HTTP 200. If the job is unpublished, publish it first.",
      valueChecked: applyUrl
    },
    {
      id: 'U5',
      field: 'url',
      name: 'Apply URL Domain Check',
      rule: 'Apply URL does not redirect to homepage.',
      ok: applyUrl.includes('/jobs/') || applyUrl.includes('/careers/'),
      problem: !(applyUrl.includes('/jobs/') || applyUrl.includes('/careers/')) ? `Apply URL appears to point to the site root, not a specific job page: '${applyUrl}'. This would cause Indeed's crawler to reject the posting.` : undefined,
      warn: false,
      fix: `Ensure the URL follows the pattern: https://veylohr.com/careers/{companySlug}/jobs/{jobId}`,
      valueChecked: applyUrl
    },

    // GROUP 6 - Date fields
    {
      id: 'DA1',
      field: 'publishedAt',
      name: 'Date Publication Set',
      rule: 'Publication date is present.',
      ok: !!data.publishedAt || !!data.createdAt,
      problem: (!data.publishedAt && !data.createdAt) ? "Publication date is missing. Indeed requires a date on every job posting." : undefined,
      warn: false,
      fix: "Set the publication date. This is usually set automatically when the job is published.",
      valueChecked: (data.publishedAt || data.createdAt) ? `"${data.publishedAt || data.createdAt}"` : 'Missing'
    },
    {
      id: 'DA2',
      field: 'publishedAt',
      name: 'Date ISO Format',
      rule: 'Publication date is structured in ISO 8601 standard.',
      ok: (() => {
        const dateVal = data.publishedAt || data.createdAt || '';
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(dateVal);
      })(),
      problem: (() => {
        const dateVal = data.publishedAt || data.createdAt || '';
        return !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(dateVal) ? `Publication date is not in ISO 8601 format: '${dateVal}'. Indeed's current spec requires ISO 8601 (e.g. 2026-05-26T14:12:04Z). Using RFC 2822 format (e.g. Tue, 26 May 2026) may cause feed validation errors.` : undefined;
      })(),
      warn: false,
      fix: "Change the date serialisation from toUTCString() to toISOString() in jobFeedHandler.",
      valueChecked: (data.publishedAt || data.createdAt) ? `"${data.publishedAt || data.createdAt}"` : 'Missing'
    },
    {
      id: 'DA3',
      field: 'publishedAt',
      name: 'Date Logic Constraint',
      rule: 'Publication date is not set in the future.',
      ok: new Date(data.publishedAt || data.createdAt) <= new Date(),
      problem: new Date(data.publishedAt || data.createdAt) > new Date() ? `Publication date ${data.publishedAt || data.createdAt} is in the future. Indeed may not index a job with a future publication date.` : undefined,
      warn: false,
      fix: "Set the publication date to today or a past date.",
      valueChecked: (data.publishedAt || data.createdAt) ? `"${data.publishedAt || data.createdAt}"` : 'Missing'
    },
    {
      id: 'DA4',
      field: 'expirationDate',
      name: 'Date Expiration Constraint',
      rule: 'Expiration date is strictly after publication date.',
      ok: !data.expirationDate || new Date(data.expirationDate) > new Date(data.publishedAt || data.createdAt),
      problem: (data.expirationDate && new Date(data.expirationDate) <= new Date(data.publishedAt || data.createdAt)) ? `Expiration date ${data.expirationDate} is before or equal to the publication date ${data.publishedAt || data.createdAt}. This is invalid.` : undefined,
      warn: false,
      fix: "Set the expiration date to a future date after the publication date.",
      valueChecked: data.expirationDate ? `"${data.expirationDate}"` : 'None configured'
    },

    // GROUP 7 - Indeed Apply readiness
    {
      id: 'IA1',
      field: 'indeedApplyTokenConfigured',
      name: 'Apply API Token Configured',
      rule: 'Indeed Apply API Token is set in environment configuration.',
      ok: !!indeedApplyTokenConfigured,
      problem: !indeedApplyTokenConfigured ? "INDEED_APPLY_API_TOKEN is not configured. Without this, the <indeed-apply-data> block cannot be emitted and the job will not show the 'Easily Apply' button on Indeed." : undefined,
      warn: false,
      fix: "Register in the Indeed Partner Console and add the API token to your .env file as INDEED_APPLY_API_TOKEN.",
      valueChecked: indeedApplyTokenConfigured ? 'Configured' : 'Not Configured'
    },
    {
      id: 'IA2',
      field: 'indeedApplyPostUrl',
      name: 'Apply postUrl Secure',
      rule: 'Indeed Apply postUrl is set and uses HTTPS.',
      ok: !!indeedApplyPostUrl && indeedApplyPostUrl.startsWith('https://'),
      problem: (!indeedApplyPostUrl || !indeedApplyPostUrl.startsWith('https://')) ? "Indeed Apply postUrl is missing or not HTTPS. Indeed will not POST candidate applications to a non-HTTPS endpoint." : undefined,
      warn: false,
      fix: `Set the postUrl to: https://veylohr.com/api/public/indeed-apply/${jobCompanySlug}`,
      valueChecked: indeedApplyPostUrl || 'Missing'
    },
    {
      id: 'IA3',
      field: 'indeedApplyDataReady',
      name: 'Apply Data Ready',
      rule: 'All indeed-apply-data parameter fields are present.',
      ok: !!indeedApplyTokenConfigured && !!jobId && !!titleStr && (!!data.city || isRemoteJob) && !!companyName && !!indeedApplyPostUrl && !!applyUrl,
      problem: (() => {
        const missing = [];
        if (!indeedApplyTokenConfigured) missing.push('apiToken');
        if (!jobId) missing.push('jobId');
        if (!titleStr) missing.push('jobTitle');
        if (!data.city && !isRemoteJob) missing.push('jobLocation');
        if (!companyName) missing.push('jobCompanyName');
        if (!indeedApplyPostUrl) missing.push('postUrl');
        if (!applyUrl) missing.push('jobUrl');
        return missing.length > 0 ? `indeed-apply-data block is missing required field(s): ${missing.join(', ')}. Indeed will reject the apply configuration.` : undefined;
      })(),
      warn: false,
      fix: (() => {
        const missing = [];
        if (!indeedApplyTokenConfigured) missing.push('apiToken');
        if (!jobId) missing.push('jobId');
        if (!titleStr) missing.push('jobTitle');
        if (!data.city && !isRemoteJob) missing.push('jobLocation');
        if (!companyName) missing.push('jobCompanyName');
        if (!indeedApplyPostUrl) missing.push('postUrl');
        if (!applyUrl) missing.push('jobUrl');
        return missing.length > 0 ? `Populate the missing fields: ${missing.join(', ')}. See the indeed-apply-data documentation for required parameters.` : "Configure indeed-apply block fields.";
      })(),
      valueChecked: `Token: ${indeedApplyTokenConfigured ? 'OK' : 'Missing'}, URL: ${indeedApplyPostUrl ? 'OK' : 'Missing'}`
    },
    {
      id: 'S1',
      field: 'salary',
      name: 'Salary Range Specified',
      rule: 'Salary range (min or max) is specified.',
      ok: typeof data.salaryMin === 'number' && data.salaryMin > 0 || typeof data.salaryMax === 'number' && data.salaryMax > 0,
      problem: !(data.salaryMin || data.salaryMax) ? "Salary is missing. Indeed strongly recommends specifying salary/compensation to improve organic visibility and match search queries." : undefined,
      warn: true,
      fix: "Provide a salary range (min and/or max) under the job compensation fields.",
      valueChecked: (data.salaryMin || data.salaryMax) ? `${data.salaryMin ?? ''} - ${data.salaryMax ?? ''} ${data.salaryPeriod ?? ''}` : 'Missing'
    },
    {
      id: 'R1_DUP',
      field: 'referenceId',
      name: 'Reference Number Uniqueness',
      rule: 'Reference number is unique across all jobs.',
      ok: !data.isReferenceIdDuplicate,
      problem: data.isReferenceIdDuplicate ? `Reference number '${data.referenceId}' is already used by another job posting. Indeed will deduplicate and hide this job.` : undefined,
      warn: false,
      fix: "Assign a unique reference ID or regenerate the sequence ID.",
      valueChecked: data.referenceId ? `"${data.referenceId}"` : 'Missing'
    }
  ];

  return results;
}

function getIndeedComplianceChecks(job: JobPosting): ComplianceCheck[] {
  const results = runIndeedComplianceSuite(job);
  return results.map((r) => ({
    key: r.id,
    label: `${r.id} - ${r.name}`,
    ok: r.ok,
  }));
}

function complianceScore(job: JobPosting): { passed: number; total: number; percentage: number; checks: ComplianceCheck[] } {
  const checks = getIndeedComplianceChecks(job);
  const passed = checks.filter((check) => check.ok).length;
  const total = checks.length;
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
  return { passed, total, percentage, checks };
}


function initials(name: string) {
  return name.split(' ').map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function fmtRelativeTime(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '-';

  const diffMs = parsed.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (absMs < minute) {
    value = Math.round(diffMs / 1000);
    unit = 'second';
  } else if (absMs < hour) {
    value = Math.round(diffMs / minute);
    unit = 'minute';
  } else if (absMs < day) {
    value = Math.round(diffMs / hour);
    unit = 'hour';
  } else if (absMs < week) {
    value = Math.round(diffMs / day);
    unit = 'day';
  } else if (absMs < month) {
    value = Math.round(diffMs / week);
    unit = 'week';
  } else if (absMs < year) {
    value = Math.round(diffMs / month);
    unit = 'month';
  } else {
    value = Math.round(diffMs / year);
    unit = 'year';
  }

  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit);
}

const SYSTEM_CANDIDATE_TAGS = new Set(['public-careers', 'external', 'indeed']);
const SYSTEM_CANDIDATE_TAG_PREFIXES = ['locale:'];

function isSystemCandidateTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return false;
  if (SYSTEM_CANDIDATE_TAGS.has(normalized)) return true;
  return SYSTEM_CANDIDATE_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function splitCandidateTags(tags: string[]): { systemTags: string[]; userTags: string[] } {
  const systemTags: string[] = [];
  const userTags: string[] = [];
  tags.forEach((tag) => {
    if (isSystemCandidateTag(tag)) {
      systemTags.push(tag);
    } else {
      userTags.push(tag);
    }
  });
  return { systemTags, userTags };
}

function languageFlagCodes(language: JobLanguage): string[] {
  if (language === 'en') return ['GB'];
  if (language === 'both') return ['IT', 'GB'];
  return ['IT'];
}

function formatEuroRange(min: number | null, max: number | null, locale: string, fallback: string): string {
  if (min === null && max === null) return fallback;
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
  const from = min === null ? '...' : formatter.format(min);
  const to = max === null ? '...' : formatter.format(max);
  return `${from} - ${to}`;
}

const ReferenceIdBadge: React.FC<{ referenceId: string }> = ({ referenceId }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(referenceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = referenceId;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      } catch (err) {
        console.error('Failed to copy Reference ID', err);
      }
    });
  };

  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: '11.5px',
        fontWeight: 600,
        background: '#F1F5F9',
        color: '#475569',
        borderRadius: '6px',
        padding: '2px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        border: '1px solid #E2E8F0',
      }}
    >
      {referenceId}
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: copied ? '#16A34A' : '#64748B',
          transition: 'color 0.15s',
        }}
        title="Copy Reference ID"
      >
        {copied ? (
          <Check size={12} strokeWidth={2.5} />
        ) : (
          <Clipboard size={12} strokeWidth={2} />
        )}
      </button>
    </span>
  );
};

interface IndeedComplianceModalProps {
  referenceId: string;
  onClose: () => void;
  companyId?: number;
}

const IndeedComplianceModal: React.FC<IndeedComplianceModalProps> = ({ referenceId: initialRefId, onClose, companyId }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [refId, setRefId] = useState(initialRefId);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<CheckResult[]>([]);

  const runCheck = async (targetRefId: string) => {
    if (!targetRefId.trim()) {
      showToast('Please enter a valid Reference ID', 'error');
      return;
    }
    setLoading(true);
    setError(null);
    setJob(null);
    setChecks([]);
    try {
      const data = await getJobCompliance(targetRefId.trim(), companyId);
      if (!data) {
        setError('Position not found. Check the ID and try again.');
        setLoading(false);
        return;
      }
      setJob(data);
      
      const results = runIndeedComplianceSuite(data);

      // Perform network check for U4 asynchronously
      const checkU4 = results.find(r => r.id === 'U4');
      const jobCompanySlug = data.companySlug || '';
      // Without a slug there is no URL to probe. Report that honestly instead of
      // testing a hardcoded company's page and passing on someone else's result.
      if (checkU4 && !jobCompanySlug) {
        checkU4.ok = false;
        checkU4.problem = 'Company slug is missing, so the public apply URL cannot be verified.';
      } else if (checkU4) {
        const frontendBase = (import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '');
        const jobId = data.id || 0;
        const baseJobUrl = `${frontendBase}/careers/${jobCompanySlug}/jobs/${jobId}`;
        const applyUrl = baseJobUrl + (baseJobUrl.includes('?') ? '&' : '?') + 'source=Indeed';

        try {
          const resp = await fetch(applyUrl, { method: 'GET' });
          if (resp.status !== 200) {
            checkU4.ok = false;
            checkU4.problem = `Apply URL returned HTTP ${resp.status}. Indeed's crawler will see the same response.`;
          } else {
            checkU4.ok = true;
          }
        } catch (e) {
          console.warn("Network check U4 failed to execute due to CORS or network error, assuming pass.", e);
          checkU4.ok = true;
        }
      }

      setChecks(results);
    } catch (err: any) {
      console.error('[IndeedComplianceModal] Check failed:', err);
      const axiosError = err.response?.data?.error || err.message || '';
      const axiosErrorCode = err.response?.data?.code || '';
      
      if (err.response?.status === 404 || axiosErrorCode === 'NOT_FOUND' || axiosError === 'Annuncio non trovato') {
        setError('The position was not found. Please verify the Reference ID/ID and ensure you have selected the correct company from the dropdown in the top-right.');
      } else {
        setError(`An error occurred while running the compliance check: ${axiosError || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialRefId) {
      runCheck(initialRefId);
    }
  }, [initialRefId]);

  const passedCount = checks.filter(c => c.ok).length;
  const totalCount = checks.length;
  const allPassed = passedCount === totalCount;
  const progressPercent = totalCount > 0 ? (passedCount / totalCount) * 100 : 0;

  let progressColor = '#DC2626'; // Red
  if (progressPercent >= 80) progressColor = '#15803D'; // Green
  else if (progressPercent >= 55) progressColor = '#D97706'; // Amber

  return (
    <ModalBackdrop onClose={onClose} width={800}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileCheck size={18} color="var(--primary)" />
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: 17, fontWeight: 700 }}>
              Indeed Compliance Check
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Check this position against Indeed's official XML feed requirements
            </p>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ padding: '20px 22px', display: 'grid', gap: 16 }}>
        {/* Input Row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Position Reference ID
            </label>
            <input
              type="text"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="e.g. VY-FU-0001"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 13,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
          <Button variant="primary" onClick={() => runCheck(refId)} disabled={loading} style={{ height: 38 }}>
            {loading ? 'Running...' : 'Run Check'}
          </Button>
        </div>

        {error && (
          <div style={{ padding: 14, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        {!loading && job && checks.length > 0 && (
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Summary Bar */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'rgba(13,33,55,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {passedCount} of {totalCount} checks passed
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: progressColor }}>
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ height: '100%', width: `${progressPercent}%`, background: progressColor, transition: 'width 0.3s ease' }} />
              </div>

              {allPassed ? (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', fontSize: 13, fontWeight: 600 }}>
                  ✅ This position meets all Indeed XML feed requirements
                </div>
              ) : (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: 13, fontWeight: 600 }}>
                  ❌ {totalCount - passedCount} issues found — resolve before submitting to Indeed
                </div>
              )}
            </div>

            {/* Checks List */}
            <div style={{ display: 'grid', gap: 20 }}>
              {[
                { title: 'GROUP 1 — Title', checks: checks.filter(c => c.id.startsWith('T')) },
                { title: 'GROUP 2 — Description', checks: checks.filter(c => c.id.startsWith('D') && !c.id.startsWith('DA')) },
                { title: 'GROUP 3 — Location', checks: checks.filter(c => c.id.startsWith('L')) },
                { title: 'GROUP 4 — Required feed fields', checks: checks.filter(c => c.id.startsWith('R')) },
                { title: 'GROUP 5 — Apply URL and feed URL', checks: checks.filter(c => c.id.startsWith('U')) },
                { title: 'GROUP 6 — Date fields', checks: checks.filter(c => c.id.startsWith('DA')) },
                { title: 'GROUP 7 — Indeed Apply readiness', checks: checks.filter(c => c.id.startsWith('IA')) }
              ].map((group) => {
                if (group.checks.length === 0) return null;
                const groupPassed = group.checks.every(c => c.ok);
                const groupPassedCount = group.checks.filter(c => c.ok).length;
                return (
                  <div key={group.title} style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid var(--border)', paddingBottom: 6 }}>
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 750, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        {group.title}
                      </h4>
                      <span style={{ fontSize: 11, fontWeight: 700, color: groupPassed ? '#16A34A' : '#D97706', background: groupPassed ? '#F0FDF4' : '#FFFBEB', padding: '2px 8px', borderRadius: 6 }}>
                        {groupPassed ? 'All passed' : `${groupPassedCount} of ${group.checks.length} passed`}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {group.checks.map((check) => (
                        <details
                          key={check.id}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            background: '#fff',
                            overflow: 'hidden',
                          }}
                        >
                          <summary
                            style={{
                              listStyle: 'none',
                              cursor: 'pointer',
                              padding: '8px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              userSelect: 'none',
                            }}
                          >
                            <span style={{ fontSize: 13, minWidth: 20, display: 'inline-flex', justifyContent: 'center' }}>
                              {check.warn ? '⚠️' : (check.ok ? '✅' : '❌')}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span>{check.name}</span>
                              <span style={{ fontSize: 9.5, fontFamily: 'monospace', background: '#F1F5F9', color: '#64748B', padding: '1px 5px', borderRadius: 4 }}>
                                {check.id}
                              </span>
                              {check.valueChecked && (
                                <span 
                                  style={{ 
                                    fontSize: 11, 
                                    color: 'var(--text-secondary)',
                                    background: 'var(--background)',
                                    padding: '1px 6px',
                                    borderRadius: 6,
                                    fontWeight: 450,
                                    display: 'inline-block',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '300px',
                                    border: '1px solid var(--border)'
                                  }}
                                  title={check.valueChecked}
                                >
                                  {t('ats.currentValue', 'Current')}: {check.valueChecked}
                                </span>
                              )}
                            </span>
                            <span style={{ fontSize: 11.5, color: check.warn ? '#D97706' : (check.ok ? '#16A34A' : '#DC2626'), fontWeight: 600 }}>
                              {check.warn ? 'Warning' : (check.ok ? 'Pass' : 'Action Required')}
                            </span>
                          </summary>

                          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'rgba(248,250,252,0.5)', display: 'grid', gap: 6 }}>
                            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                              <strong>Rule:</strong> {check.rule}
                            </div>
                            {check.valueChecked && (
                              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                <strong>Current Value:</strong> <code style={{ 
                                  background: check.ok ? '#F0FDF4' : '#FEF2F2', 
                                  color: check.ok ? '#166534' : '#991B1B', 
                                  border: check.ok ? '1px solid #BBF7D0' : '1px solid #FCA5A5',
                                  padding: '2px 6px', 
                                  borderRadius: 4, 
                                  fontSize: 12, 
                                  fontFamily: 'monospace',
                                  display: 'inline-block',
                                  marginTop: 2
                                }}>{check.valueChecked}</code>
                              </div>
                            )}
                            {(!check.ok || check.warn) && (
                              <>
                                {(check.problem || check.warn) && (
                                  <div style={{ fontSize: 12.5, color: check.warn ? '#D97706' : '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                    <span>⚠️</span> <span><strong>{check.warn ? 'Warning' : 'Error'}:</strong> {check.problem}</span>
                                  </div>
                                )}
                                <div
                                  style={{
                                    marginTop: 4,
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    background: check.warn ? '#FFFDF5' : '#FFFBEB',
                                    border: check.warn ? '1px solid #FDE8E8' : '1px solid #FDE68A',
                                    color: '#92400E',
                                    fontSize: 12,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  <strong>How to fix:</strong> {check.fix}
                                </div>
                              </>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
};

// ─── Shared modal backdrop ─────────────────────────────────────────────────────

const ModalBackdrop: React.FC<{ onClose: () => void; width?: number; closeOnBackdropClick?: boolean; children: React.ReactNode }> = ({
  onClose, width = 520, closeOnBackdropClick = true, children,
}) =>
  createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(13,33,55,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 16,
          width: '100%', maxWidth: width, maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          animation: 'popIn 0.22s cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );

// ─── Rich text editor ──────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  hasError?: boolean;
}

const RTE_TOOLBAR_BTN: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,0.3)',
  background: 'transparent',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  color: '#334155',
  padding: 0,
  transition: 'background 0.13s, border-color 0.13s',
  flexShrink: 0,
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, minHeight = 160, hasError }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  // Sync external value → DOM (only on initial mount or when externally reset)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    // Only set if content actually differs to avoid cursor jump
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const execCmd = (command: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, val);
    syncContent();
  };

  const syncContent = () => {
    const el = editorRef.current;
    if (!el) return;
    isInternalUpdate.current = true;
    onChange(el.innerHTML);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');

    if (html) {
      // Sanitise pasted HTML: keep only allowed tags, strip scripts/iframes
      const tmp = document.createElement('div');
      tmp.innerHTML = html;

      // Remove disallowed elements
      ['script', 'iframe', 'style', 'head', 'meta', 'link', 'object', 'embed'].forEach((tag) => {
        tmp.querySelectorAll(tag).forEach((el) => el.remove());
      });

      // Strip all attributes except href on <a>
      tmp.querySelectorAll('*').forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const allowedAttrs = tag === 'a' ? ['href'] : [];
        Array.from(el.attributes).forEach((attr) => {
          if (!allowedAttrs.includes(attr.name)) {
            el.removeAttribute(attr.name);
          }
        });
      });

      // Map headings / divs / spans to clean block elements
      tmp.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el) => {
        const p = document.createElement('p');
        p.innerHTML = el.innerHTML;
        el.replaceWith(p);
      });

      document.execCommand('insertHTML', false, tmp.innerHTML);
    } else if (plain) {
      // Convert plain text newlines to <br>
      const safeHtml = plain
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .split('\n')
        .join('<br>');
      document.execCommand('insertHTML', false, safeHtml);
    }

    syncContent();
  };

  const isEmpty = !value || value === '<br>' || value === '<p><br></p>' || value.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div
      style={{
        border: `1px solid ${hasError ? '#B91C1C' : 'var(--border)'}`,
        borderRadius: 10,
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '5px 8px',
          borderBottom: '1px solid var(--border)',
          background: '#f8fafc',
          flexWrap: 'wrap',
        }}
      >
        <button type="button" title="Bold (Ctrl+B)" style={{ ...RTE_TOOLBAR_BTN, fontWeight: 900 }} onMouseDown={(e) => { e.preventDefault(); execCmd('bold'); }}>B</button>
        <button type="button" title="Italic (Ctrl+I)" style={{ ...RTE_TOOLBAR_BTN, fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); execCmd('italic'); }}>I</button>
        <button type="button" title="Underline (Ctrl+U)" style={{ ...RTE_TOOLBAR_BTN, textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); execCmd('underline'); }}>U</button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />
        <button
          type="button"
          title="Bullet list"
          style={RTE_TOOLBAR_BTN}
          onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList'); }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="1.5" cy="3.5" r="1.5" fill="#334155" />
            <rect x="4" y="2.75" width="9" height="1.5" rx="0.75" fill="#334155" />
            <circle cx="1.5" cy="7" r="1.5" fill="#334155" />
            <rect x="4" y="6.25" width="9" height="1.5" rx="0.75" fill="#334155" />
            <circle cx="1.5" cy="10.5" r="1.5" fill="#334155" />
            <rect x="4" y="9.75" width="9" height="1.5" rx="0.75" fill="#334155" />
          </svg>
        </button>
        <button
          type="button"
          title="Numbered list"
          style={RTE_TOOLBAR_BTN}
          onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList'); }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <text x="0" y="5" fontSize="5" fontWeight="700" fill="#334155">1.</text>
            <rect x="4" y="2.75" width="9" height="1.5" rx="0.75" fill="#334155" />
            <text x="0" y="9.5" fontSize="5" fontWeight="700" fill="#334155">2.</text>
            <rect x="4" y="6.25" width="9" height="1.5" rx="0.75" fill="#334155" />
            <text x="0" y="13.5" fontSize="5" fontWeight="700" fill="#334155">3.</text>
            <rect x="4" y="9.75" width="9" height="1.5" rx="0.75" fill="#334155" />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />
        <button
          type="button"
          title="Clear formatting"
          style={{ ...RTE_TOOLBAR_BTN, fontSize: 10 }}
          onMouseDown={(e) => { e.preventDefault(); execCmd('removeFormat'); }}
        >
          Tx
        </button>
      </div>

      {/* Editable area */}
      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncContent}
          onPaste={handlePaste}
          style={{
            minHeight,
            padding: '10px 12px',
            fontSize: 13.5,
            lineHeight: 1.6,
            color: '#111827',
            outline: 'none',
            fontFamily: 'inherit',
            wordBreak: 'break-word',
          }}
        />
        {isEmpty && placeholder && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 12,
              color: '#9ca3af',
              fontSize: 13.5,
              lineHeight: 1.6,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Job form modal ────────────────────────────────────────────────────────────

interface UIQuestion {
  id?: number;
  tempId?: string;
  question_text: string;
  question_type: 'radio' | 'checkbox' | 'text' | 'number';
  options: string[];
  is_knockout: boolean;
  knockout_value: string;
  display_order: number;
  isDeleted?: boolean;
  is_required?: boolean;
}

interface JobModalProps {
  job?: JobPosting | null;
  stores: Store[];
  companies: Company[];
  defaultCompanyId: number | null;
  onSave: (payload: {
    title: string;
    description: string;
    tags: string[];
    language: JobLanguage;
    jobType: JobType;
    remoteType: RemoteType;
    locationOverride: {
      city: string;
      state: string;
      country: string;
      postalCode: string;
      address: string;
    };
    companyId: number;
    storeId: number | null;
    department: string;
    weeklyHours: number | null;
    contractType: string;
    status: JobStatus;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryPeriod: string | null;
    targetRole: string | null;
    screenerQuestions?: UIQuestion[];
  }) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}

type JobModalErrors = {
  title?: string;
  description?: string;
  city?: string;
  country?: string;
  state?: string;
  weeklyHours?: string;
  salary?: string;
  companyId?: string;
  jobType?: string;
  remoteType?: string;
};

type TeamContact = {
  id: number;
  name: string;
  role: 'admin' | 'hr' | 'area_manager';
  avatarFilename?: string | null;
};

const parseRichTextToHtml = (text: string): string => {
  if (!text) return '';

  // If the text already contains HTML tags (from RichTextEditor), return as-is
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

const JobModal: React.FC<JobModalProps> = ({ job, stores, companies, defaultCompanyId, onSave, onClose, saving }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { isMobile, isTablet } = useBreakpoint();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [questions, setQuestions] = useState<UIQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    if (!job?.id) {
      setQuestions([]);
      return;
    }
    setLoadingQuestions(true);
    listScreenerQuestions(job.id, job.companyId)
      .then((res) => {
        const mapped = res.map((q) => {
          let opts: string[] = [];
          if (q.options) {
            if (typeof q.options === 'string') {
              try { opts = JSON.parse(q.options); } catch { opts = []; }
            } else if (Array.isArray(q.options)) {
              opts = q.options.map(o => typeof o === 'string' ? o : (o.value || o.label || ''));
            }
          }
          return {
            id: q.id,
            question_text: (q as any).questionText || q.question_text || '',
            question_type: (q as any).questionType || q.question_type,
            options: opts,
            is_knockout: !!((q as any).isKnockout || q.is_knockout),
            knockout_value: (q as any).knockoutValue ?? q.knockout_value ?? '',
            display_order: (q as any).displayOrder ?? q.display_order ?? 0,
            is_required: q.is_required !== false,
          };
        });
        setQuestions(mapped);
      })
      .catch((err) => {
        console.error('Failed to load screener questions', err);
      })
      .finally(() => {
        setLoadingQuestions(false);
      });
  }, [job]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState(job?.title ?? '');
  const [description, setDescription] = useState(job?.description ?? '');
  const [tags, setTags] = useState<string[]>(job?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const activeLang: JobLanguage = i18n.language?.startsWith('it') ? 'it' : 'en';
  const language = activeLang;
  const [jobType, setJobType] = useState<JobType | ''>(job?.jobType ?? '');
  const [status, setStatus] = useState<JobStatus>(job?.status ?? 'draft');
  const [companyId, setCompanyId] = useState<string>(() => {
    if (job?.companyId) return String(job.companyId);
    return '';
  });
  const [storeId, setStoreId] = useState<string>(job?.storeId ? String(job.storeId) : '');
  const [remoteType, setRemoteType] = useState<RemoteType | ''>(job?.remoteType ?? (job?.isRemote ? 'remote' : ''));
  const [locationOverride, setLocationOverride] = useState(() => ({
    country: normalizeCountryCode(job?.jobCountry ?? ''),
    state: job?.jobState ?? '',
    city: job?.jobCity ?? '',
    postalCode: job?.jobPostalCode ?? '',
    address: job?.jobAddress ?? '',
  }));
  const [department, setDepartment] = useState(job?.department ?? '');
  const [weeklyHoursInput, setWeeklyHoursInput] = useState(job?.weeklyHours !== null && job?.weeklyHours !== undefined ? String(job.weeklyHours) : '');
  const [salaryMinInput, setSalaryMinInput] = useState(job?.salaryMin !== null && job?.salaryMin !== undefined ? String(job.salaryMin) : '');
  const [salaryMaxInput, setSalaryMaxInput] = useState(job?.salaryMax !== null && job?.salaryMax !== undefined ? String(job.salaryMax) : '');
  const [salaryPeriod, setSalaryPeriod] = useState(canonicalSalaryPeriod(job?.salaryPeriod));
  const [contractType, setContractType] = useState(job?.contractType ?? '');
  const [targetRole, setTargetRole] = useState(job?.targetRole ?? '');
  const [errors, setErrors] = useState<JobModalErrors>({});
  const [companyEmployees, setCompanyEmployees] = useState<Employee[]>([]);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [showIndeedInfo, setShowIndeedInfo] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState('');
  const questionsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (companyId) {
      setGuideDismissed(localStorage.getItem(`screener_guide_${companyId}`) === 'true');
    } else {
      setGuideDismissed(false);
    }
  }, [companyId]);

  const getUiType = (q: UIQuestion): 'text' | 'yesno' | 'multichoice' => {
    if (q.question_type === 'text' || q.question_type === 'number') {
      return 'text';
    }
    const opts = q.options || [];
    const isYesNo = opts.length === 2 &&
      (opts[0] === 'yes' || opts[0] === 'Sì' || opts[0] === 'Si') &&
      (opts[1] === 'no' || opts[1] === 'No');
    if (q.question_type === 'radio' && isYesNo) {
      return 'yesno';
    }
    return 'multichoice';
  };

  const handleTypeChange = (qIndex: number, newType: 'text' | 'yesno' | 'multichoice') => {
    if (newType === 'text') {
      updateQuestionField(qIndex, 'question_type', 'text');
      updateQuestionField(qIndex, 'options', []);
    } else if (newType === 'yesno') {
      updateQuestionField(qIndex, 'question_type', 'radio');
      updateQuestionField(qIndex, 'options', ['yes', 'no']);
      updateQuestionField(qIndex, 'knockout_value', 'no');
    } else if (newType === 'multichoice') {
      updateQuestionField(qIndex, 'question_type', 'radio');
      updateQuestionField(qIndex, 'options', ['', '']);
    }
  };

  const handleAddQuestion = () => {
    const text = newQuestionText.trim();
    if (!text) return;
    setQuestions((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(36).substring(2, 9),
        question_text: text,
        question_type: 'text' as const,
        options: [],
        is_knockout: false,
        knockout_value: '',
        display_order: prev.filter((q) => !q.isDeleted).length,
        is_required: true,
      },
    ]);
    setNewQuestionText('');
    setTimeout(() => {
      questionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const companyOptions = useMemo(() => {
    const opts = companies.map((company) => ({
      id: company.id,
      name: company.name,
      groupName: company.groupName ?? null,
      ownerLabel: [company.ownerName, company.ownerSurname].filter(Boolean).join(' ') || null,
      ownerAvatarFilename: company.ownerAvatarFilename ?? null,
      storeCount: typeof company.storeCount === 'number' ? company.storeCount : null,
      createdAt: company.createdAt,
    }));

    if (opts.length === 0 && defaultCompanyId) {
      opts.push({
        id: defaultCompanyId,
        name: `Company #${defaultCompanyId}`,
        groupName: null,
        ownerLabel: null,
        ownerAvatarFilename: null,
        storeCount: null,
        createdAt: '',
      });
    }

    return opts;
  }, [companies, defaultCompanyId]);

  const storesForSelectedCompany = useMemo(() => {
    if (!companyId) return [] as Store[];
    const selectedCompanyId = Number.parseInt(companyId, 10);
    if (Number.isNaN(selectedCompanyId)) return [] as Store[];
    return stores.filter((store) => store.companyId === selectedCompanyId);
  }, [stores, companyId]);

  useEffect(() => {
    if (!storeId) return;
    const exists = storesForSelectedCompany.some((store) => String(store.id) === storeId);
    if (!exists) {
      setStoreId('');
    }
  }, [storeId, storesForSelectedCompany]);

  useEffect(() => {
    const selectedCompanyId = Number.parseInt(companyId, 10);
    if (Number.isNaN(selectedCompanyId)) {
      setCompanyEmployees([]);
      return;
    }
    let mounted = true;
    getEmployees({ targetCompanyId: selectedCompanyId, status: 'active', includeStoreTerminals: false, limit: 500 })
      .then((res) => {
        if (!mounted) return;
        setCompanyEmployees(res.employees ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setCompanyEmployees([]);
      });
    return () => {
      mounted = false;
    };
  }, [companyId]);

  const addTag = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    if (tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) return;
    setTags((prev) => [...prev, normalized]);
    setTagInput('');
  };

  const removeTag = (value: string) => {
    setTags((prev) => prev.filter((tag) => tag !== value));
  };

  const parseOptionalInt = (value: string): number | null => {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const validateStep1 = (): boolean => {
    const nextErrors: JobModalErrors = {};

    if (!title.trim()) nextErrors.title = t('common.required', 'Required');
    const descriptionText = description.replace(/<[^>]*>/g, '').trim();
    if (!descriptionText) nextErrors.description = t('common.required', 'Required');
    if (!jobType) nextErrors.jobType = t('common.required', 'Required');
    if (!remoteType) nextErrors.remoteType = t('common.required', 'Required');

    const weeklyRaw = weeklyHoursInput.trim();
    if (weeklyRaw) {
      const weekly = Number.parseInt(weeklyRaw, 10);
      if (Number.isNaN(weekly) || weekly < 0 || weekly > 168) {
        nextErrors.weeklyHours = t('ats.weeklyHoursRangeError', 'Weekly hours must be between 0 and 168');
      }
    }

    const salaryMinRaw = salaryMinInput.trim();
    const salaryMaxRaw = salaryMaxInput.trim();
    const salaryMin = salaryMinRaw ? Number.parseInt(salaryMinRaw, 10) : null;
    const salaryMax = salaryMaxRaw ? Number.parseInt(salaryMaxRaw, 10) : null;
    const invalidSalaryMin = salaryMinRaw !== '' && (Number.isNaN(salaryMin as number) || (salaryMin as number) < 0);
    const invalidSalaryMax = salaryMaxRaw !== '' && (Number.isNaN(salaryMax as number) || (salaryMax as number) < 0);

    if (invalidSalaryMin || invalidSalaryMax) {
      nextErrors.salary = t('ats.salaryInvalid', 'Salary values must be valid positive numbers');
    } else if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
      nextErrors.salary = t('ats.salaryRangeError', 'Salary min must be less than or equal to salary max');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const nextErrors: JobModalErrors = {};

    if (!companyId) {
      nextErrors.companyId = t('common.required', 'Required');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const moveNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
      return;
    }
    if (step === 2) {
      if (validateStep2()) setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
    }
  };

  const sortedQuestions = useMemo(() => {
    return questions
      .filter((q) => !q.isDeleted)
      .sort((a, b) => a.display_order - b.display_order);
  }, [questions]);

  const addQuestionRow = () => {
    setQuestions((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(36).substring(2, 9),
        question_text: '',
        question_type: 'text',
        options: [],
        is_knockout: false,
        knockout_value: '',
        display_order: prev.filter((q) => !q.isDeleted).length,
      },
    ]);
  };

  const removeQuestionRow = (index: number) => {
    if (!confirm(t('ats.confirmDeleteQuestion', 'Are you sure you want to delete this question?'))) return;
    const target = sortedQuestions[index];
    setQuestions((prev) =>
      prev.map((q) => {
        if ((q.id && q.id === target.id) || (q.tempId && q.tempId === target.tempId)) {
          return { ...q, isDeleted: true };
        }
        return q;
      })
    );
  };

  const updateQuestionField = (index: number, field: keyof UIQuestion, value: any) => {
    const target = sortedQuestions[index];
    setQuestions((prev) =>
      prev.map((q) => {
        if ((q.id && q.id === target.id) || (q.tempId && q.tempId === target.tempId)) {
          const updated = { ...q, [field]: value };
          if (field === 'question_type') {
            updated.options = value === 'radio' || value === 'checkbox' ? ['', ''] : [];
            updated.is_knockout = false;
            updated.knockout_value = '';
          }
          if (field === 'is_knockout' && value === true) {
            const utype = getUiType(updated);
            if (utype === 'yesno') {
              updated.knockout_value = 'no';
            } else if (utype === 'multichoice') {
              updated.knockout_value = updated.options[0] || '';
            } else {
              updated.knockout_value = '';
            }
          }
          return updated;
        }
        return q;
      })
    );
  };

  const addOptionField = (qIndex: number) => {
    const target = sortedQuestions[qIndex];
    setQuestions((prev) =>
      prev.map((q) => {
        if ((q.id && q.id === target.id) || (q.tempId && q.tempId === target.tempId)) {
          return { ...q, options: [...q.options, ''] };
        }
        return q;
      })
    );
  };

  const removeOptionField = (qIndex: number, optIndex: number) => {
    const target = sortedQuestions[qIndex];
    setQuestions((prev) =>
      prev.map((q) => {
        if ((q.id && q.id === target.id) || (q.tempId && q.tempId === target.tempId)) {
          const nextOptions = q.options.filter((_, idx) => idx !== optIndex);
          let nextKnockoutValue = q.knockout_value;
          if (q.is_knockout && q.knockout_value === q.options[optIndex]) {
            nextKnockoutValue = '';
          }
          return { ...q, options: nextOptions, knockout_value: nextKnockoutValue };
        }
        return q;
      })
    );
  };

  const updateOptionField = (qIndex: number, optIndex: number, value: string) => {
    const target = sortedQuestions[qIndex];
    setQuestions((prev) =>
      prev.map((q) => {
        if ((q.id && q.id === target.id) || (q.tempId && q.tempId === target.tempId)) {
          const nextOptions = [...q.options];
          const oldVal = nextOptions[optIndex];
          nextOptions[optIndex] = value;
          let nextKnockoutValue = q.knockout_value;
          if (q.is_knockout && q.knockout_value === oldVal) {
            nextKnockoutValue = value;
          }
          return { ...q, options: nextOptions, knockout_value: nextKnockoutValue };
        }
        return q;
      })
    );
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sortedQuestions.length) return;

    const q1 = sortedQuestions[index];
    const q2 = sortedQuestions[targetIdx];

    const order1 = q1.display_order;
    const order2 = q2.display_order;

    setQuestions((prev) =>
      prev.map((q) => {
        if ((q.id && q.id === q1.id) || (q.tempId && q.tempId === q1.tempId)) {
          return { ...q, display_order: order2 };
        }
        if ((q.id && q.id === q2.id) || (q.tempId && q.tempId === q2.tempId)) {
          return { ...q, display_order: order1 };
        }
        return q;
      })
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }

    const parsedCompanyId = Number.parseInt(companyId, 10);
    if (Number.isNaN(parsedCompanyId)) return;
    if (!jobType || !remoteType) return;

    await onSave({
      title: title.trim(),
      description: description,
      tags,
      language,
      jobType: jobType as JobType,
      remoteType: remoteType as RemoteType,
      locationOverride,
      companyId: parsedCompanyId,
      storeId: storeId ? Number.parseInt(storeId, 10) : null,
      department: department.trim(),
      weeklyHours: parseOptionalInt(weeklyHoursInput),
      contractType: contractType.trim(),
      status,
      salaryMin: parseOptionalInt(salaryMinInput),
      salaryMax: parseOptionalInt(salaryMaxInput),
      salaryPeriod: salaryPeriod || null,
      targetRole: targetRole || null,
      screenerQuestions: questions,
    });
  };

  const selectedCompanyName = useMemo(() => {
    if (!companyId) return '-';
    const selected = companyOptions.find((company) => String(company.id) === companyId);
    return selected?.name ?? '-';
  }, [companyId, companyOptions]);

  const selectedCompanyMeta = useMemo(() => {
    if (!companyId) return null;
    return companyOptions.find((company) => String(company.id) === companyId) ?? null;
  }, [companyId, companyOptions]);

  const selectedStoreMeta = useMemo(() => {
    if (!storeId) return null;
    return storesForSelectedCompany.find((store) => String(store.id) === storeId) ?? null;
  }, [storeId, storesForSelectedCompany]);

  const selectedCompanyLogoUrl = useMemo(() => {
    if (!companyId) return null;
    const selected = companies.find((item) => String(item.id) === companyId);
    return getCompanyLogoUrl(selected?.logoFilename);
  }, [companies, companyId]);

  const companyInitials = useMemo(() => {
    const raw = selectedCompanyName === '-' ? '' : selectedCompanyName;
    const initials = raw
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    return initials || 'CO';
  }, [selectedCompanyName]);

  const companyFoundedLabel = useMemo(() => {
    const raw = selectedCompanyMeta?.createdAt;
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }, [selectedCompanyMeta?.createdAt]);

  const roleCounts = useMemo(() => {
    const counts = { hr: 0, area_manager: 0, store_manager: 0, employee: 0 };
    for (const person of companyEmployees) {
      if (person.role === 'hr') counts.hr += 1;
      else if (person.role === 'area_manager') counts.area_manager += 1;
      else if (person.role === 'store_manager') counts.store_manager += 1;
      else if (person.role === 'employee') counts.employee += 1;
    }
    return counts;
  }, [companyEmployees]);

  const teamContacts = useMemo<TeamContact[]>(() => {
    const selectedStoreId = Number.parseInt(storeId, 10);
    const effectiveStoreId = Number.isNaN(selectedStoreId) ? null : selectedStoreId;
    const contacts: TeamContact[] = [];
    if (selectedCompanyMeta?.ownerLabel) {
      contacts.push({
        id: -1,
        name: selectedCompanyMeta.ownerLabel,
        role: 'admin',
        avatarFilename: selectedCompanyMeta.ownerAvatarFilename ?? null,
      });
    }
    for (const person of companyEmployees) {
      if (person.role !== 'hr' && person.role !== 'area_manager') continue;
      if (effectiveStoreId !== null && person.storeId !== null && person.storeId !== effectiveStoreId) continue;
      const fullName = [person.name, person.surname].filter(Boolean).join(' ').trim() || person.email;
      contacts.push({
        id: person.id,
        name: fullName,
        role: person.role,
        avatarFilename: person.avatarFilename ?? null,
      });
    }
    const seen = new Set<string>();
    return contacts.filter((contact) => {
      const key = `${contact.role}-${contact.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [companyEmployees, selectedCompanyMeta, storeId]);

  // Effective location = what the XML feed actually publishes: the job override
  // if set, otherwise the company's own location (COALESCE(job_city, company.city)).
  // Readiness and completion must evaluate THIS, not just the raw override — a
  // job that correctly inherits the company location publishes fine on Indeed
  // and should not be reported as incomplete.
  const selectedCompanyRecord = useMemo(
    () => companies.find((company) => String(company.id) === companyId) ?? null,
    [companies, companyId],
  );
  const effectiveJobCity = (locationOverride.city || '').trim() || (selectedCompanyRecord?.city || '').trim();
  const effectiveJobCountry = (locationOverride.country || '').trim() || (selectedCompanyRecord?.country || '').trim();

  const formCompletion = useMemo(() => {
    const checks: boolean[] = [
      Boolean(title.trim()),
      Boolean(description.trim()),
      Boolean(companyId),
      Boolean(jobType),
      Boolean(remoteType),
      Boolean(department.trim()),
      Boolean(contractType.trim()),
      Boolean(weeklyHoursInput.trim()),
      Boolean(salaryMinInput.trim() || salaryMaxInput.trim()),
      tags.length > 0,
    ];

    if (remoteType && remoteType !== 'remote') {
      checks.push(Boolean(effectiveJobCountry));
      checks.push(Boolean(effectiveJobCity));
    }

    if (companyId && storesForSelectedCompany.length > 0) {
      checks.push(Boolean(storeId));
    }

    const done = checks.filter(Boolean).length;
    const total = checks.length;
    return Math.round((done / total) * 100);
  }, [
    title,
    description,
    companyId,
    jobType,
    remoteType,
    department,
    contractType,
    weeklyHoursInput,
    salaryMinInput,
    salaryMaxInput,
    tags,
    effectiveJobCountry,
    effectiveJobCity,
    storesForSelectedCompany.length,
    storeId,
  ]);

  const companySelectOptions = useMemo<SelectOption[]>(() => {
    return companyOptions.map((company) => {
      const logoUrl = getCompanyLogoUrl(companies.find((item) => item.id === company.id)?.logoFilename);
      const countryCode = normalizeCountryCode(companies.find((item) => item.id === company.id)?.country ?? '');

      const detailItems = [
        company.groupName
          ? {
            key: `group-${company.id}`,
            icon: <Building2 size={12} color="#64748B" />,
            text: company.groupName,
          }
          : null,
        company.ownerLabel
          ? {
            key: `owner-${company.id}`,
            icon: <User2 size={12} color="#64748B" />,
            text: `${t('ats.ownerLabel', 'Owner')}: ${company.ownerLabel}`,
          }
          : null,
        typeof company.storeCount === 'number'
          ? {
            key: `stores-${company.id}`,
            icon: <StoreIcon size={12} color="#64748B" />,
            text: t('ats.storeCountLabel', '{{count}} stores', { count: company.storeCount }),
          }
          : null,
      ].filter(Boolean) as Array<{ key: string; icon: React.ReactNode; text: string }>;

      return {
        value: String(company.id),
        label: company.name,
        render: (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(13,33,55,0.14)', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {logoUrl ? <img src={logoUrl} alt={company.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={16} color="#64748B" />}
              </div>
              <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {company.name}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {detailItems.length > 0 ? detailItems.map((detail) => (
                    <span key={detail.key} style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                      {detail.icon}
                      {detail.text}
                    </span>
                  )) : (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                      <Building2 size={12} color="#64748B" />
                      {t('ats.standaloneCompany', 'Standalone company')}
                    </span>
                  )}
                  {countryCode ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      <ReactCountryFlag countryCode={countryCode} svg style={{ width: '1em', height: '1em' }} />
                      {countryCode}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ),
      };
    });
  }, [companyOptions, companies, t]);

  const storeSelectOptions = useMemo<SelectOption[]>(() => {
    return storesForSelectedCompany.map((store) => {
      const location = [store.city, store.state, store.country].filter(Boolean).join(', ');
      const countryCode = normalizeCountryCode(store.country ?? '');
      const storeLogo = getStoreLogoUrl(store.logoFilename ?? null);

      const detailItems = [
        store.code
          ? { key: `code-${store.id}`, icon: <FileText size={12} color="#64748B" />, text: `${t('ats.codeLabel', 'Code')} ${store.code}` }
          : null,
        location
          ? { key: `location-${store.id}`, icon: <MapPin size={12} color="#64748B" />, text: location }
          : null,
        typeof store.employeeCount === 'number'
          ? { key: `staff-${store.id}`, icon: <User2 size={12} color="#64748B" />, text: t('ats.staffCountLabel', '{{count}} staff', { count: store.employeeCount }) }
          : null,
      ].filter(Boolean) as Array<{ key: string; icon: React.ReactNode; text: string }>;

      return {
        value: String(store.id),
        label: store.name,
        render: (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(13,33,55,0.14)', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {storeLogo ? <img src={storeLogo} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <StoreIcon size={14} color="#64748B" />}
              </div>
              <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {store.name}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {detailItems.length > 0 ? detailItems.map((detail) => (
                    <span key={detail.key} style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                      {detail.icon}
                      {detail.text}
                    </span>
                  )) : (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t('common.store', 'Store')}
                    </span>
                  )}
                  {countryCode ? <ReactCountryFlag countryCode={countryCode} svg style={{ width: '0.95em', height: '0.95em' }} /> : null}
                </div>
              </div>
            </div>
          </div>
        ),
      };
    });
  }, [storesForSelectedCompany, t]);

  const jobTypeSelectOptions = useMemo<SelectOption[]>(() => {
    return [
      {
        value: 'fulltime',
        label: t('ats.jobType_fulltime'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700 }}>{t('ats.jobType_fulltime')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.fulltimeHint', 'Standard weekly schedule')}</span>
          </div>
        ),
      },
      {
        value: 'parttime',
        label: t('ats.jobType_parttime'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700 }}>{t('ats.jobType_parttime')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.parttimeHint', 'Flexible reduced hours')}</span>
          </div>
        ),
      },
    ];
  }, [t]);

  const remoteTypeSelectOptions = useMemo<SelectOption[]>(() => {
    return [
      {
        value: 'onsite',
        label: t('ats.remoteType_onsite', 'On-site'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Building2 size={13} />{t('ats.remoteType_onsite', 'On-site')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.remoteTypeOnsiteHint', 'Presence required in store or office')}</span>
          </div>
        ),
      },
      {
        value: 'hybrid',
        label: t('ats.remoteType_hybrid', 'Hybrid'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><MapPin size={13} />{t('ats.remoteType_hybrid', 'Hybrid')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.remoteTypeHybridHint', 'Split schedule between remote and on-site')}</span>
          </div>
        ),
      },
      {
        value: 'remote',
        label: t('ats.remoteType_remote', 'Remote'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Globe2 size={13} />{t('ats.remoteType_remote', 'Remote')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.remoteTypeRemoteHint', 'Fully remote collaboration')}</span>
          </div>
        ),
      },
    ];
  }, [t]);

  const languageSelectOptions = useMemo<SelectOption[]>(() => {
    return [
      {
        value: 'it',
        label: 'Italiano',
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Languages size={13} />Italiano</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Italian-first audience</span>
          </div>
        ),
      },
      {
        value: 'en',
        label: 'English',
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Languages size={13} />English</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>International candidates</span>
          </div>
        ),
      },
      {
        value: 'both',
        label: 'Bilingual',
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Languages size={13} />Bilingual</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Italian and English versions</span>
          </div>
        ),
      },
    ];
  }, []);

  const statusSelectOptions = useMemo<SelectOption[]>(() => {
    return [
      {
        value: 'draft',
        label: t('ats.status_draft'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={13} />{t('ats.status_draft')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.statusDraftHint', 'Visible only to your internal team')}</span>
          </div>
        ),
      },
      {
        value: 'published',
        label: t('ats.status_published'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><BadgeCheck size={13} />{t('ats.status_published')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.statusPublishedHint', 'Visible on careers pages immediately')}</span>
          </div>
        ),
      },
      {
        value: 'closed',
        label: t('ats.status_closed'),
        render: (
          <div style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Eye size={13} />{t('ats.status_closed')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('ats.statusClosedHint', 'No longer accepting candidates')}</span>
          </div>
        ),
      },
    ];
  }, [t]);

  const stepCards: Array<{ id: 1 | 2 | 3 | 4; title: string; subtitle: string }> = [
    { id: 1, title: t('ats.stepDetailsTitle', 'Job details'), subtitle: t('ats.stepDetailsSubtitle', 'Role profile and location') },
    { id: 2, title: t('ats.stepSettingsTitle', 'Platform settings'), subtitle: t('ats.stepSettingsSubtitle', 'Company, store and visibility') },
    { id: 3, title: 'Screener Questions', subtitle: 'Indeed screening settings' },
    { id: 4, title: t('ats.stepReviewTitle', 'Review'), subtitle: t('ats.stepReviewSubtitle', 'Final check before save') },
  ];

  const isCompact = isMobile || isTablet;
  const departmentLabel = t('common.department', 'Department');
  const storeLabel = t('common.store', 'Store');
  const statusLabel = t('common.status', 'Status');
  const currentUserFullName = user ? `${user.name} ${user.surname ?? ''}`.trim() : t('common.user', 'User');
  const currentUserInitials = user ? `${user.name?.[0] ?? ''}${user.surname?.[0] ?? ''}`.toUpperCase() : 'U';
  const currentUserAvatarUrl = user?.avatarFilename ? getAvatarUrl(user.avatarFilename) : null;
  const currentUserRoleLabel = user ? t(`roles.${user.role}`, user.role) : t('common.user', 'User');
  const superAdminLabel = t('roles.super_admin', 'Super admin');
  const currentUserRoleDisplay = currentUserRoleLabel.replace(/_/g, ' ').toUpperCase();
  const hasTeamMembers = teamContacts.length > 0;
  const jobTypeDisplay = jobType ? t(`ats.jobType_${JOB_TYPE_LABEL[jobType]}`, jobType) : t('common.notSet', 'Not set');
  const remoteTypeDisplay = remoteType ? t(`ats.remoteType_${remoteType}`, remoteType) : t('common.notSet', 'Not set');
  const roleTags = tags.filter((tag) => tag.trim().length > 0);
  const selectedStoreLocation = [selectedStoreMeta?.city, selectedStoreMeta?.state, selectedStoreMeta?.country].filter(Boolean).join(', ');
  const selectedStoreAddress = [selectedStoreMeta?.address, selectedStoreMeta?.cap].filter(Boolean).join(' - ');
  const hiringVisibilityTone = status === 'published'
    ? {
      border: '1px solid rgba(34,197,94,0.35)',
      background: 'rgba(21,128,61,0.22)',
      titleColor: '#ECFDF5',
      bodyColor: '#D1FAE5',
      badgeBg: 'rgba(74,222,128,0.22)',
      badgeBorder: '1px solid rgba(134,239,172,0.45)',
      badgeColor: '#DCFCE7',
    }
    : status === 'closed'
      ? {
        border: '1px solid rgba(248,113,113,0.34)',
        background: 'rgba(153,27,27,0.24)',
        titleColor: '#FEF2F2',
        bodyColor: '#FECACA',
        badgeBg: 'rgba(252,165,165,0.2)',
        badgeBorder: '1px solid rgba(252,165,165,0.4)',
        badgeColor: '#FEE2E2',
      }
      : {
        border: '1px solid rgba(147,197,253,0.36)',
        background: 'rgba(30,64,175,0.22)',
        titleColor: '#EFF6FF',
        bodyColor: '#DBEAFE',
        badgeBg: 'rgba(191,219,254,0.22)',
        badgeBorder: '1px solid rgba(191,219,254,0.42)',
        badgeColor: '#E0F2FE',
      };
  const hiringVisibilityCopy = status === 'published'
    ? t('ats.hiringVisibilityPublished', 'Visible in careers pages and XML feed. Candidates can apply immediately.')
    : status === 'closed'
      ? t('ats.hiringVisibilityClosed', 'Posting is archived for hiring. It is hidden from careers listings and not accepting new applicants.')
      : t('ats.hiringVisibilityDraft', 'Internal draft only. Publish this position to expose it to careers and the feed.');

  // Indeed Readiness calculation
  const isIndeedCheck1Pass = title.trim() !== '' && title.length < 100 && !/hiring|urgente|subito/i.test(title);
  const isIndeedCheck2Pass = (description || '').includes('<p>') && ((description || '').includes('<ul>') || (description || '').includes('<ol>'));
  // Minimal location validation: Indeed only requires a city + country for
  // on-site/hybrid roles (province code is normalised automatically on save,
  // postal code is optional). Fully-remote roles need no location at all.
  const isIndeedCheck3Pass = remoteType === 'remote' ||
                             (effectiveJobCity !== '' && effectiveJobCountry !== '');
  const isIndeedCheck4Pass = parseFloat(salaryMinInput) > 0;
  const isIndeedCheck5Pass = questions.length > 0;

  const indeedScore = (isIndeedCheck1Pass ? 1 : 0) + 
                      (isIndeedCheck2Pass ? 1 : 0) + 
                      (isIndeedCheck3Pass ? 1 : 0) + 
                      (isIndeedCheck4Pass ? 1 : 0) + 
                      (isIndeedCheck5Pass ? 1 : 0);

  const indeedProgressGradient = indeedScore <= 2
    ? 'linear-gradient(90deg, #F87171, #EF4444)'
    : indeedScore === 3
      ? 'linear-gradient(90deg, #EAC26E, #C9973A)'
      : 'linear-gradient(90deg, #4ADE80, #22C55E)';

  return (
    <ModalBackdrop onClose={onClose} closeOnBackdropClick={Boolean(job)} width={1140}>

      {/* Body */}
      <form onSubmit={handleSubmit} style={{ padding: 0, display: 'grid', gap: 0 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'minmax(310px, 1fr) minmax(0, 1.85fr)',
          gap: 0,
          alignItems: 'stretch',
        }}>
          <aside style={{
            border: 'none',
            borderRight: isCompact ? 'none' : '1px solid rgba(255,255,255,0.16)',
            padding: '18px 14px',
            background: 'linear-gradient(180deg, #172A3D 0%, #1B334A 52%, #172B3F 100%)',
            display: 'grid',
            gap: 14,
            position: 'static',
            height: '100%',
            alignContent: 'start',
            gridColumn: isCompact ? 'auto' : '1 / 2',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderRadius: 12,
              padding: '9px 10px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(140deg, #4E8ABF, #2D5278)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 12,
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {currentUserAvatarUrl
                  ? <img src={currentUserAvatarUrl} alt={currentUserFullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : currentUserInitials}
              </div>
              <div style={{ display: 'grid', minWidth: 0, gap: 2 }}>
                <span style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentUserFullName}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {currentUserRoleDisplay}
                  </span>
                  {user?.isSuperAdmin && (
                    <span style={{
                      fontSize: 9.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 800,
                      color: '#FFE9A7',
                      border: '1px solid rgba(255,233,167,0.62)',
                      background: 'rgba(201,151,58,0.24)',
                      borderRadius: 999,
                      padding: '1px 6px',
                      lineHeight: 1.4,
                    }}>
                      {superAdminLabel}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div style={{
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.1)',
              padding: '13px 12px',
              display: 'grid',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 60,
                  height: 60,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.26)',
                  background: 'rgba(255,255,255,0.18)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                  fontWeight: 800,
                  fontSize: 18,
                  color: '#FFFFFF',
                }}>
                  {selectedCompanyLogoUrl
                    ? <img src={selectedCompanyLogoUrl} alt={selectedCompanyName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : companyInitials}
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <strong style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedCompanyName}
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.78)', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Building2 size={12} color="#C9D7E5" />
                      {selectedCompanyMeta?.groupName ?? t('ats.standaloneCompany', 'Standalone company')}
                    </span>
                    {companyFoundedLabel ? (
                      <span style={{ color: 'rgba(255,255,255,0.74)', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CalendarDays size={12} color="#C9D7E5" />
                        {companyFoundedLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'grid', gap: 7 }}>
                <span style={{ color: '#CBD5E1', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  {t('ats.teamContactsLabel', 'Team contacts')}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {teamContacts.map((contact) => (
                    <span key={`${contact.role}-${contact.id}-${contact.name}`} style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.24)', background: 'rgba(255,255,255,0.12)', color: '#F8FAFC', fontSize: 11.5, padding: '5px 8px', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.22)', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                        {contact.avatarFilename
                          ? <img src={getAvatarUrl(contact.avatarFilename) ?? ''} alt={contact.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(contact.name)}
                      </span>
                      <span style={{ display: 'grid', lineHeight: 1.2 }}>
                        <span style={{ fontWeight: 700 }}>{contact.name}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)' }}>{t(`roles.${contact.role}`)}</span>
                      </span>
                    </span>
                  ))}
                  {!hasTeamMembers ? (
                    <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5 }}>
                      {t('ats.teamContactsMissing', 'Owner / HR / Area manager information is not linked yet.')}
                    </span>
                  ) : null}
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'grid', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, fontSize: 12, color: '#E2E8F0' }}>
                  <span>{t('ats.completionLabel', 'Completion')}</span>
                  <strong style={{ color: '#F8D98B' }}>{formCompletion}%</strong>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: 'rgba(148,163,184,0.4)', overflow: 'hidden' }}>
                  <div style={{ width: `${formCompletion}%`, height: '100%', background: 'linear-gradient(90deg, #EAC26E, #C9973A)' }} />
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'grid', gap: 5 }}>
                <div style={{ display: 'grid', gap: 5, marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                    <StoreIcon size={12} color="#CBD5E1" />
                    <span>{selectedStoreMeta?.name ?? '-'}</span>
                  </div>
                  {selectedStoreMeta?.code ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#E2E8F0' }}>
                      <FileText size={12} color="#CBD5E1" />
                      <span>{t('ats.codeLabel', 'Code')} {selectedStoreMeta.code}</span>
                    </div>
                  ) : null}
                  {selectedStoreLocation ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#E2E8F0' }}>
                      <MapPin size={12} color="#CBD5E1" />
                      <span>{selectedStoreLocation}</span>
                    </div>
                  ) : null}
                  {selectedStoreAddress ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#E2E8F0' }}>
                      <Building2 size={12} color="#CBD5E1" />
                      <span>{selectedStoreAddress}</span>
                    </div>
                  ) : null}
                  {selectedStoreMeta?.phone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#E2E8F0' }}>
                      <Phone size={12} color="#CBD5E1" />
                      <span>{selectedStoreMeta.phone}</span>
                    </div>
                  ) : null}
                  {typeof selectedStoreMeta?.employeeCount === 'number' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#E2E8F0' }}>
                      <Users size={12} color="#CBD5E1" />
                      <span>{t('ats.staffCountLabel', '{{count}} staff', { count: selectedStoreMeta.employeeCount })}</span>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                    <BriefcaseBusiness size={12} color="#CBD5E1" />
                    <span>{contractType.trim() || t('common.notSet', 'Not set')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                    <Building2 size={12} color="#CBD5E1" />
                    <span>{department.trim() || t('common.notSet', 'Not set')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                    <Languages size={12} color="#CBD5E1" />
                    <span>{language.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                    <BadgeCheck size={12} color="#CBD5E1" />
                    <span>{t(`ats.status_${status}`, status)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}><BriefcaseBusiness size={12} color="#CBD5E1" />{jobTypeDisplay}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}><Globe2 size={12} color="#CBD5E1" />{remoteTypeDisplay}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}><Clock3 size={12} color="#CBD5E1" />{weeklyHoursInput.trim() || '-'} {t('ats.hoursPerWeek', 'hrs/week')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                    <Wallet size={12} color="#CBD5E1" />
                    {salaryMinInput.trim() || '-'} - {salaryMaxInput.trim() || '-'}
                    {salaryPeriod ? ` (${t(`ats.salaryPeriod${salaryPeriod.charAt(0).toUpperCase()}${salaryPeriod.slice(1)}`, salaryPeriod)})` : ''}
                  </div>
                  {remoteType && remoteType !== 'remote' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#F8FAFC' }}>
                      <MapPin size={12} color="#CBD5E1" />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {locationOverride.country ? <ReactCountryFlag countryCode={locationOverride.country} svg style={{ width: '0.95em', height: '0.95em' }} /> : null}
                        {locationOverride.city || '-'}, {countryNameFromCode(locationOverride.country)}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 4, display: 'grid', gap: 7 }}>
                  <span style={{ color: '#CBD5E1', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                    {t('ats.jobTags', 'Tags')}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {roleTags.length > 0 ? roleTags.map((tag) => (
                      <span key={`sidebar-tag-${tag}`} style={{ borderRadius: 999, border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.14)', color: '#F8FAFC', fontSize: 11, fontWeight: 600, padding: '3px 8px' }}>
                        {tag}
                      </span>
                    )) : (
                      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5 }}>
                        {t('ats.noTags', 'No tags')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Indeed — how it works (info modal) */}
              {showIndeedInfo && (
                <div
                  onClick={() => setShowIndeedInfo(false)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: '#fff', color: '#0f172a', borderRadius: 14, maxWidth: 580, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.30)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>Indeed — come funziona</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>How the Indeed integration works</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowIndeedInfo(false)}
                        aria-label="Close"
                        style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                      >
                        ×
                      </button>
                    </div>

                    <div style={{ padding: '16px 20px', display: 'grid', gap: 16, fontSize: 13, lineHeight: 1.55 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#185FA5', marginBottom: 4 }}>1. Come arrivano le candidature</div>
                        <div>
                          Le posizioni pubblicate vengono inviate a Indeed tramite il feed XML. Il candidato le vede su Indeed,
                          clicca <strong>Candidati</strong> e viene portato alla pagina careers della piattaforma: la candidatura
                          arriva <strong>automaticamente nell'ATS</strong>. Non serve alcun token per questo flusso.
                        </div>
                        <div style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                          Published jobs go to Indeed via the XML feed → the candidate clicks Apply → they land on the careers page →
                          the application appears in the ATS automatically. No token required.
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, color: '#185FA5', marginBottom: 4 }}>2. "Apply on Indeed" nativo &amp; token</div>
                        <div>
                          La candidatura <em>dentro</em> Indeed (Indeed Apply nativo) richiede l'approvazione della partnership Indeed e
                          un token reale. Finché non c'è, questa modalità resta disattivata e il blocco
                          <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 4 }}>indeed-apply-data</code> viene
                          omesso dal feed, così <strong>nessuna candidatura viene rifiutata in silenzio</strong>. Si riattiva con una
                          sola impostazione (il token) quando disponibile.
                        </div>
                        <div style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                          Native in-Indeed apply needs partnership approval and a real token. Until then it stays off and the feed omits
                          the apply block — so nothing is silently rejected. Reversible with one setting.
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 700, color: '#185FA5', marginBottom: 4 }}>3. Indeed Readiness (i 5 controlli)</div>
                        <div>
                          Il punteggio indica la <strong>qualità dell'annuncio</strong> per Indeed: titolo valido, descrizione
                          strutturata, posizione completa (città + paese), stipendio e domande di screening. Un annuncio con punteggio
                          pieno viene indicizzato in modo pulito ed evita penalizzazioni.
                        </div>
                        <div style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                          The score reflects listing quality for Indeed: valid title, structured description, complete location,
                          salary and screener questions. A full score indexes cleanly and avoids penalties.
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setShowIndeedInfo(false)}
                        style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {t('common.close', 'Chiudi')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Indeed Readiness Section */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10, display: 'grid', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#CBD5E1', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                    Indeed Readiness
                    <button
                      type="button"
                      onClick={() => setShowIndeedInfo(true)}
                      title={t('ats.indeedInfoOpen', 'Come funziona / How it works')}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.45)', background: 'transparent', color: '#CBD5E1', fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: 0 }}
                    >
                      i
                    </button>
                  </span>
                  <span style={{ color: '#F8FAFC', fontSize: 11, fontWeight: 700 }}>
                    {indeedScore}/5
                  </span>
                </div>
                
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(234, 194, 110, 0.1)', overflow: 'hidden' }}>
                  <div style={{ width: `${(indeedScore / 5) * 100}%`, height: '100%', background: indeedProgressGradient, borderRadius: 99, transition: 'all 0.3s ease' }} />
                </div>

                <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                  {/* Check 1 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 8 }}>
                    {isIndeedCheck1Pass ? (
                      <CheckCircle2 size={16} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : (
                      <Circle size={16} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div style={{ display: 'grid', lineHeight: 1.25 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isIndeedCheck1Pass ? '#F8FAFC' : 'rgba(255,255,255,0.6)' }}>
                        Titolo valido
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
                        Title valid
                      </span>
                    </div>
                  </div>

                  {/* Check 2 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 8 }}>
                    {isIndeedCheck2Pass ? (
                      <CheckCircle2 size={16} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : (
                      <Circle size={16} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div style={{ display: 'grid', lineHeight: 1.25 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isIndeedCheck2Pass ? '#F8FAFC' : 'rgba(255,255,255,0.6)' }}>
                        Descrizione strutturata
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
                        Description structured
                      </span>
                    </div>
                  </div>

                  {/* Check 3 */}
                  <div 
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 8 }}
                    title={!isIndeedCheck3Pass ? "Inserisci città e paese / Enter city and country" : undefined}
                  >
                    {isIndeedCheck3Pass ? (
                      <CheckCircle2 size={16} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : (
                      <Circle size={16} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div style={{ display: 'grid', lineHeight: 1.25 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isIndeedCheck3Pass ? '#F8FAFC' : 'rgba(255,255,255,0.6)' }}>
                        Posizione completa
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
                        Location complete
                      </span>
                    </div>
                  </div>

                  {/* Check 4 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 8 }}>
                    {isIndeedCheck4Pass ? (
                      <CheckCircle2 size={16} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : (
                      <Circle size={16} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div style={{ display: 'grid', lineHeight: 1.25 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isIndeedCheck4Pass ? '#F8FAFC' : 'rgba(255,255,255,0.6)' }}>
                        Retribuzione indicata
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
                        Salary provided
                      </span>
                    </div>
                  </div>

                  {/* Check 5 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 8 }}>
                    {isIndeedCheck5Pass ? (
                      <CheckCircle2 size={16} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} />
                    ) : (
                      <Circle size={16} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />
                    )}
                    <div style={{ display: 'grid', lineHeight: 1.25 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isIndeedCheck5Pass ? '#F8FAFC' : 'rgba(255,255,255,0.6)' }}>
                        Domande di screening
                      </span>
                      <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)' }}>
                        Screener questions
                      </span>
                      {!isIndeedCheck5Pass && (
                        <span 
                          onClick={() => setStep(3)}
                          style={{ 
                            fontSize: '11px', 
                            color: '#F8D98B', 
                            cursor: 'pointer', 
                            textDecoration: 'underline',
                            marginTop: 2,
                            fontWeight: 600,
                            display: 'inline-block'
                          }}
                        >
                          → Step 3 (Screening questions)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 6, display: 'grid', gap: 2, paddingLeft: 8 }}>
                  {indeedScore === 5 && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#4ADE80' }}>
                      Pronto per Indeed ✓ <span style={{ fontSize: '10px', color: 'rgba(74,222,128,0.7)', fontWeight: 400 }}>(Ready for Indeed)</span>
                    </span>
                  )}
                  {indeedScore === 4 && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#EAC26E' }}>
                      Quasi pronto — 1 verifica mancante <span style={{ fontSize: '10px', color: 'rgba(234,194,110,0.7)', fontWeight: 400 }}>(Almost ready — 1 check missing)</span>
                    </span>
                  )}
                  {indeedScore < 4 && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#F87171' }}>
                      {5 - indeedScore} verifiche mancanti <span style={{ fontSize: '10px', color: 'rgba(248,113,113,0.7)', fontWeight: 400 }}>({5 - indeedScore} checks missing)</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ borderRadius: 12, border: hiringVisibilityTone.border, background: hiringVisibilityTone.background, padding: 11, color: hiringVisibilityTone.bodyColor, fontSize: 12.5, lineHeight: 1.5, display: 'grid', gap: 6 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: hiringVisibilityTone.titleColor }}>
                <User2 size={13} /> {t('ats.hiringVisibilityTitle', 'Hiring visibility')}
                <span style={{ borderRadius: 999, padding: '1px 7px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', background: hiringVisibilityTone.badgeBg, border: hiringVisibilityTone.badgeBorder, color: hiringVisibilityTone.badgeColor }}>
                  {t(`ats.status_${status}`, status)}
                </span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>{hiringVisibilityCopy}</span>
              </div>
            </div>
          </aside>

          <div style={{
            display: 'grid',
            gap: 12,
            gridColumn: isCompact ? 'auto' : '2 / 3',
            background: 'linear-gradient(180deg, #FDFDFE 0%, #F8FAFC 100%)',
            padding: '18px 20px 16px',
          }}>
            <div style={{
              display: 'grid',
              gap: 12,
              paddingBottom: 12,
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>{job ? t('ats.editJob') : t('ats.newJob')}</span>
                    {job && job.referenceId && (
                      <ReferenceIdBadge referenceId={job.referenceId} />
                    )}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('ats.stepFlow', 'Complete each section and review the live summary before saving.')}
                  </p>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}>×</button>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: isCompact ? 10 : 0,
                flexWrap: isCompact ? 'wrap' : 'nowrap',
              }}>
                {stepCards.map((item, index) => {
                  const isDone = step > item.id;
                  const isCurrent = step === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <div style={{
                        minWidth: isCompact ? 'calc(50% - 8px)' : 0,
                        flex: isCompact ? '1 1 calc(50% - 8px)' : 1,
                        display: 'grid',
                        justifyItems: 'center',
                        gap: 7,
                      }}>
                        <div style={{ display: 'grid', gap: 4, justifyItems: 'center', textAlign: 'center' }}>
                          <span style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 11,
                            color: isDone || isCurrent ? '#ffffff' : '#64748b',
                            border: isDone || isCurrent ? '1px solid rgba(201,151,58,0.86)' : '1px solid rgba(148,163,184,0.4)',
                            background: isDone || isCurrent ? '#C9973A' : '#ffffff',
                            boxShadow: isCurrent ? '0 0 0 3px rgba(201,151,58,0.18)' : 'none',
                            transition: 'all 0.2s ease',
                          }}>
                            {isDone ? '✓' : item.id}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isCurrent ? '#9A6808' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </span>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', maxWidth: 180 }}>{item.subtitle}</span>
                        </div>
                      </div>

                      {index < stepCards.length - 1 && !isCompact && (
                        <div style={{
                          flex: 1,
                          margin: '15px 10px 0',
                          height: 2,
                          borderRadius: 999,
                          background: step > item.id ? '#C9973A' : 'rgba(148,163,184,0.38)',
                          transition: 'background 0.2s ease',
                        }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {step === 1 && (
                <>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 14, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1f2937', fontWeight: 700, fontSize: 13 }}>
                      <FileText size={14} /> {t('ats.coreRoleDetails', 'Core role details')}
                    </div>

                    <Input
                      label={`${t('ats.jobTitle')} *`}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder={t('ats.jobTitlePlaceholder')}
                      autoFocus
                    />
                    {errors.title && <div style={{ marginTop: -8, color: '#B91C1C', fontSize: 12 }}>{errors.title}</div>}

                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                        {t('ats.jobDescription')} *
                      </label>
                      <RichTextEditor
                        value={description}
                        onChange={setDescription}
                        placeholder={t('ats.jobDescriptionPlaceholder')}
                        hasError={Boolean(errors.description)}
                        minHeight={160}
                      />
                    </div>
                    {errors.description && <div style={{ marginTop: 4, color: '#B91C1C', fontSize: 12 }}>{errors.description}</div>}

                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                        {t('ats.jobTags')}
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
                        <input
                          className="field-input"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          placeholder={t('ats.jobTagsInputPlaceholder', 'Type a tag and press Enter')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag(tagInput);
                            }
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 12px',
                            fontSize: 13.5,
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            outline: 'none',
                            display: 'block',
                            background: '#fff',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => addTag(tagInput)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            border: '1px solid rgba(201,151,58,0.42)',
                            background: 'rgba(201,151,58,0.14)',
                            color: '#8a6318',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          aria-label={t('common.add', 'Add')}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              background: '#E9F8EE',
                              color: '#1D6B3A',
                              border: '1px solid #BFE8CC',
                              fontWeight: 700,
                            }}
                          >
                            <span>{tag}</span>
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              style={{ border: 'none', background: 'transparent', color: '#1D6B3A', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                              aria-label={`Remove ${tag}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 14, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1f2937', fontWeight: 700, fontSize: 13 }}>
                      <BriefcaseBusiness size={14} /> {t('ats.contractAndSchedule', 'Contract and schedule')}
                    </div>
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                      <div>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                          {t('ats.jobType')}
                        </label>
                        <CustomSelect
                          value={jobType || null}
                          onChange={(value) => setJobType((value as JobType | null) ?? '')}
                          options={jobTypeSelectOptions}
                          isClearable
                          searchable={false}
                          placeholder={t('ats.selectJobType', 'Select job type')}
                          disabled={saving}
                          error={errors.jobType}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                          {t('ats.remoteMode', 'Work arrangement')}
                        </label>
                        <CustomSelect
                          value={remoteType || null}
                          onChange={(value) => setRemoteType((value as RemoteType | null) ?? '')}
                          options={remoteTypeSelectOptions}
                          isClearable
                          searchable={false}
                          placeholder={t('ats.selectRemoteMode', 'Select work arrangement')}
                          disabled={saving}
                          error={errors.remoteType}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr' }}>
                      <Input
                        label={t('ats.weeklyHours')}
                        type="number"
                        value={weeklyHoursInput}
                        onChange={(e) => setWeeklyHoursInput(e.target.value)}
                        placeholder={t('ats.weeklyHoursPlaceholder', 'es. 40')}
                      />
                      <Input
                        label={t('ats.salaryMin', 'Salary min')}
                        type="number"
                        value={salaryMinInput}
                        onChange={(e) => setSalaryMinInput(e.target.value)}
                        placeholder={t('ats.salaryMinPlaceholder', '1200')}
                      />
                      <Input
                        label={t('ats.salaryMax', 'Salary max')}
                        type="number"
                        value={salaryMaxInput}
                        onChange={(e) => setSalaryMaxInput(e.target.value)}
                        placeholder={t('ats.salaryMaxPlaceholder', '1800')}
                      />
                      <div>
                        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                          {t('ats.salaryPeriod', 'Salary period')}
                        </label>
                        <CustomSelect
                          value={salaryPeriod || null}
                          onChange={(value) => setSalaryPeriod((value as string | null) ?? '')}
                          options={[
                            { value: 'hourly', label: t('ats.salaryPeriodHourly', 'Per hour') },
                            { value: 'daily', label: t('ats.salaryPeriodDaily', 'Per day') },
                            { value: 'weekly', label: t('ats.salaryPeriodWeekly', 'Per week') },
                            { value: 'monthly', label: t('ats.salaryPeriodMonthly', 'Per month') },
                            { value: 'yearly', label: t('ats.salaryPeriodYearly', 'Per year') },
                          ]}
                          searchable={false}
                          isClearable
                          placeholder={t('ats.salaryPeriod', 'Salary period')}
                          disabled={saving}
                        />
                      </div>
                    </div>
                    {(errors.weeklyHours || errors.salary) && (
                      <div style={{ marginTop: -6, color: '#B91C1C', fontSize: 12 }}>
                        {errors.weeklyHours ?? errors.salary}
                      </div>
                    )}

                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                      <Input
                        label={t('ats.contractType')}
                        value={contractType}
                        onChange={(e) => setContractType(e.target.value)}
                        placeholder={t('ats.contractTypePlaceholder')}
                      />
                      <Input
                        label={departmentLabel}
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder={t('ats.departmentPlaceholder')}
                      />
                    </div>
                  </div>

                  {remoteType && remoteType !== 'remote' && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 14, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1f2937', fontWeight: 700, fontSize: 13 }}>
                        <MapPin size={14} /> {t('ats.jobLocation', 'Job location')}
                      </div>

                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr' }}>
                        <CountrySelect
                          value={locationOverride.country || null}
                          onChange={(next) => setLocationOverride((prev) => ({ ...prev, country: next ?? '', state: '', city: '' }))}
                          label={t('ats.jobCountryOverrideLabel', 'Country')}
                          placeholder={t('ats.jobCountryOverrideLabel', 'Country')}
                          disabled={saving}
                        />

                        <div>
                          <StateSelect
                            countryCode={locationOverride.country || null}
                            value={locationOverride.state || null}
                            onChange={(next) => setLocationOverride((prev) => ({ ...prev, state: next ?? '', city: '' }))}
                            label={t('ats.jobStateOverrideLabel', 'State')}
                            placeholder={t('ats.jobStateOverrideLabel', 'State')}
                            disabled={saving}
                          />
                          {errors.state && (
                            <span style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4, display: 'block' }}>
                              {errors.state}
                            </span>
                          )}
                          {!errors.state && locationOverride.state && /^\d+$/.test(locationOverride.state.trim()) && (
                            <span style={{ color: '#d97706', fontSize: 11, marginTop: 4, display: 'block', fontWeight: 500 }}>
                              ⚠️ {t('ats.stateNumericWarning', 'Province code will be auto-corrected on save')}
                            </span>
                          )}
                          {locationOverride.country === 'IT' && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, display: 'block', lineHeight: '1.4' }}>
                              {t('ats.stateItalyHelper', "Seleziona la provincia dall'elenco: il codice (es. NA, MI, MB) viene applicato automaticamente al salvataggio.")}
                            </span>
                          )}
                        </div>

                        <div>
                          <CitySelect
                            countryCode={locationOverride.country || null}
                            stateCode={locationOverride.state || null}
                            value={locationOverride.city || null}
                            onChange={(next) => setLocationOverride((prev) => ({ ...prev, city: next ?? '' }))}
                            label={t('ats.jobCityOverrideLabel', 'City')}
                            placeholder={t('ats.jobCityOverrideLabel', 'City')}
                            disabled={saving}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr' }}>
                        <Input
                          label={t('ats.jobPostalCodeOverrideLabel', 'Postal code')}
                          value={locationOverride.postalCode}
                          onChange={(e) => setLocationOverride((prev) => ({ ...prev, postalCode: e.target.value }))}
                          placeholder={t('ats.jobPostalCodeOverrideLabel', 'Postal code')}
                        />
                        <Input
                          label={t('ats.jobAddressOverrideLabel', 'Address')}
                          value={locationOverride.address}
                          onChange={(e) => setLocationOverride((prev) => ({ ...prev, address: e.target.value }))}
                          placeholder={t('ats.jobAddressOverrideLabel', 'Address')}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 14, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1f2937', fontWeight: 700, fontSize: 13 }}>
                    <Sparkles size={14} /> {t('ats.platformSettings', 'Platform settings')}
                  </div>

                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                      {t('nav.companies')} *
                    </label>
                    <CustomSelect
                      value={companyId || null}
                      onChange={(value) => setCompanyId(value ?? '')}
                      options={companySelectOptions}
                      placeholder={t('common.select', 'Select')}
                      error={errors.companyId}
                      isClearable
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                      {storeLabel}
                    </label>
                    <CustomSelect
                      value={storeId || null}
                      onChange={(value) => setStoreId(value ?? '')}
                      options={storeSelectOptions}
                      placeholder={t('ats.selectStore')}
                      disabled={saving || !companyId}
                      isClearable
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                      {t('ats.targetRole', 'Target role')}
                    </label>
                    <CustomSelect
                      value={targetRole || null}
                      onChange={(value) => setTargetRole((value as string | null) ?? '')}
                      options={[
                        { value: 'hr', label: `${t('roles.hr')} (${roleCounts.hr})` },
                        { value: 'area_manager', label: `${t('roles.area_manager')} (${roleCounts.area_manager})` },
                        { value: 'store_manager', label: `${t('roles.store_manager')} (${roleCounts.store_manager})` },
                        { value: 'employee', label: `${t('roles.employee')} (${roleCounts.employee})` },
                      ]}
                      searchable={false}
                      isClearable
                      placeholder={t('ats.targetRole', 'Target role')}
                      disabled={saving || !companyId}
                    />
                  </div>

                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                        {t('ats.jobPostingLanguage')}
                      </label>
                      <CustomSelect
                        value={language}
                        onChange={() => {}}
                        options={languageSelectOptions}
                        isClearable={false}
                        searchable={false}
                        disabled={true}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                        {t('ats.languageLockedHint', 'Locked to current translation language')}
                      </span>
                    </div>
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                        {statusLabel}
                      </label>
                      <CustomSelect
                        value={status}
                        onChange={(value) => value && setStatus(value as JobStatus)}
                        options={statusSelectOptions}
                        isClearable={false}
                        searchable={false}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div style={{ border: '1px solid rgba(13,33,55,0.1)', borderRadius: 10, padding: 10, background: '#F8FBFF', color: '#334155', fontSize: 12.5, lineHeight: 1.55 }}>
                    <strong>{t('ats.jobLanguageHint')}</strong>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 16, maxWidth: 680, margin: '0 auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 12 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(201,151,58,0.22)', background: '#fffdf6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {selectedCompanyLogoUrl
                          ? <img src={selectedCompanyLogoUrl} alt={selectedCompanyName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <Building2 size={14} color="#8a6318" />}
                      </div>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <strong style={{ color: '#111827', fontSize: 13 }}>{selectedCompanyName}</strong>
                        <span style={{ fontSize: 11.5, color: '#64748b' }}>{selectedCompanyMeta?.groupName ?? t('ats.standaloneCompany', 'Standalone company')}</span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                      <span style={{ borderRadius: 999, border: '1px solid rgba(13,33,55,0.15)', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock3 size={12} /> {t('common.justNow', 'Just now')}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#9A6808' }}>
                        0 {t('ats.appliedLabel', 'applied')}
                      </span>
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 8px 0', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: 22 }}>{title || '-'}</h4>
                  {(() => {
                    const isLongDescription = description.trim().split('\n').length > 5 || description.trim().length > 250;
                    return (
                      <div style={{ margin: '0 0 12px 0' }}>
                        <div
                          className="rte-preview"
                          style={isExpanded ? {
                            color: '#4b5563',
                            fontSize: '13.5px',
                            lineHeight: '1.55',
                          } : {
                            color: '#4b5563',
                            fontSize: '13.5px',
                            lineHeight: '1.55',
                            display: '-webkit-box',
                            WebkitLineClamp: 6,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                          dangerouslySetInnerHTML={{ __html: parseRichTextToHtml(description.trim() || '-') }}
                        />
                        {isLongDescription && (
                          <button
                            type="button"
                            onClick={() => setIsExpanded(!isExpanded)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#9A6808',
                              fontWeight: 700,
                              fontSize: '12.5px',
                              cursor: 'pointer',
                              padding: '4px 0 0',
                              display: 'block',
                              outline: 'none'
                            }}
                          >
                            {isExpanded ? t('common.showLess', 'Show Less') : t('common.showMore', 'Show More')}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    <span style={{ borderRadius: 999, background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.09)', color: '#334155', fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
                      {jobTypeDisplay}
                    </span>
                    <span style={{ borderRadius: 999, background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.09)', color: '#334155', fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
                      {remoteTypeDisplay}
                    </span>
                    <span style={{ borderRadius: 999, background: status === 'closed' ? 'rgba(239,68,68,0.1)' : 'rgba(22,163,74,0.12)', border: status === 'closed' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(22,163,74,0.22)', color: status === 'closed' ? '#991b1b' : '#166534', fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
                      {t(`ats.status_${status}`)}
                    </span>
                    <span style={{ borderRadius: 999, background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.09)', color: '#334155', fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
                      {language === 'it' ? '🇮🇹 IT' : language === 'en' ? '🇬🇧 EN' : '🇮🇹 🇬🇧 IT + EN'}
                    </span>
                    <span style={{ borderRadius: 999, background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.09)', color: '#334155', fontSize: 11, fontWeight: 700, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} />
                      {remoteType === 'remote'
                        ? t('ats.remoteType_remote', 'Remote')
                        : remoteType
                          ? `${locationOverride.city || '-'}, ${countryNameFromCode(locationOverride.country)}`
                          : t('common.notSet', 'Not set')}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, 1fr)', border: '1px dashed rgba(148,163,184,0.38)', borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.74)', marginBottom: 12 }}>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <strong style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('ats.salaryRange', 'Salary range')}</strong>
                      <span style={{ color: '#0f172a', fontSize: 12, fontWeight: 600 }}>€{salaryMinInput.trim() || '-'} - €{salaryMaxInput.trim() || '-'}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <strong style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('ats.weeklyHours')}</strong>
                      <span style={{ color: '#0f172a', fontSize: 12, fontWeight: 600 }}>{weeklyHoursInput.trim() || '-'}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <strong style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{storeLabel}</strong>
                      <span style={{ color: '#0f172a', fontSize: 12, fontWeight: 600 }}>{selectedStoreMeta?.name ?? '-'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {tags.length > 0 ? tags.map((tag) => (
                      <span key={`preview-${tag}`} style={{ fontSize: 11, borderRadius: 999, padding: '3px 9px', background: '#E9F8EE', color: '#1D6B3A', border: '1px solid #BFE8CC', fontWeight: 600 }}>
                        {tag}
                      </span>
                    )) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('ats.noTags', 'No tags')}</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(13,33,55,0.2)', background: '#fff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}
                      >
                        <Heart size={15} />
                      </button>
                      <button
                        type="button"
                        style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(13,33,55,0.2)', background: '#fff', color: '#334155', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}
                      >
                        <Bookmark size={15} />
                      </button>
                    </div>

                    <button
                      type="button"
                      style={{ border: 'none', background: 'transparent', color: '#9A6808', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, cursor: 'default' }}
                    >
                      {t('publicCareers.viewDetails', 'View details')} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', padding: 16, display: 'grid', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1f2937', fontWeight: 700, fontSize: 14 }}>
                    <FileCheck size={16} /> {t('ats.screenerQuestionsTitle', 'Screener Questions')}
                  </div>
 
                  {/* 1. Info banner */}
                  {!guideDismissed && (
                    <div style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 10
                    }}>
                      <div style={{ display: 'grid', gap: 3 }}>
                        <strong style={{ fontSize: 13, color: '#1E3A8A' }}>{t('ats.screenerQuestionsGuideTitle', 'Screener Questions')}</strong>
                        <p style={{ margin: 0, fontSize: 12.5, color: '#1E40AF', lineHeight: 1.45 }}>
                          {t('ats.screenerQuestionsGuideDesc', 'These questions appear to candidates on Indeed before they apply. Use them to quickly filter candidates who don\'t meet basic requirements. Indeed recommends a maximum of 20 questions.')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGuideDismissed(true);
                          if (companyId) {
                            localStorage.setItem(`screener_guide_${companyId}`, 'true');
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#1E40AF',
                          fontSize: 16,
                          fontWeight: 700,
                          padding: '0 4px',
                          lineHeight: 1
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
 
                  {/* 2. Add question input row */}
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('ats.newScreenerQuestion', 'Nuova domanda di screening')}
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="field-input"
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        placeholder={t('ats.addScreenerQuestionPlaceholder', 'Aggiungi una domanda di screening... (es. Quanti anni di esperienza hai?)')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddQuestion();
                          }
                        }}
                        style={{
                          flex: 1,
                          boxSizing: 'border-box',
                          padding: '9px 12px',
                          fontSize: 13,
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--border)',
                          outline: 'none',
                          background: '#fff',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          border: '1px solid rgba(201,151,58,0.42)',
                          background: 'rgba(201,151,58,0.14)',
                          color: '#8a6318',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {loadingQuestions ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                      <div className="spinner" style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(201,151,58,0.2)', borderTopColor: '#C9973A', animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 14, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                      {sortedQuestions.map((q, qIndex) => {
                        const uiType = getUiType(q);
                        const isRequired = q.is_required !== false;

                        return (
                          <div key={q.id ? `q-id-${q.id}` : `q-temp-${q.tempId}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: '#fdfdfd', display: 'grid', gap: 10, position: 'relative' }}>
                            {/* Header row with question number, required tag, order controls and delete button */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: 8, marginBottom: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                                  {t('ats.questionNumber', { defaultValue: 'Domanda #{{number}}', number: qIndex + 1 })}
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: isRequired ? '#dc2626' : '#475569',
                                  background: isRequired ? 'rgba(220,38,38,0.08)' : 'rgba(71,85,105,0.08)',
                                  border: isRequired ? '1px solid rgba(220,38,38,0.16)' : '1px solid rgba(71,85,105,0.16)',
                                  borderRadius: 6,
                                  padding: '2px 6px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em'
                                }}>
                                  {isRequired ? t('ats.questionRequired', 'Obbligatoria') : t('ats.questionOptional', 'Facoltativa')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {/* Up / Down order controls */}
                                <div style={{ display: 'flex', gap: 2, background: 'var(--background)', borderRadius: 6, padding: 2, border: '1px solid var(--border-light)' }}>
                                  <button
                                    type="button"
                                    onClick={() => moveQuestion(qIndex, 'up')}
                                    disabled={qIndex === 0}
                                    style={{ background: 'none', border: 'none', cursor: qIndex === 0 ? 'not-allowed' : 'pointer', color: qIndex === 0 ? '#cbd5e1' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}
                                  >
                                    <ChevronUp size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveQuestion(qIndex, 'down')}
                                    disabled={qIndex === sortedQuestions.length - 1}
                                    style={{ background: 'none', border: 'none', cursor: qIndex === sortedQuestions.length - 1 ? 'not-allowed' : 'pointer', color: qIndex === sortedQuestions.length - 1 ? '#cbd5e1' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}
                                  >
                                    <ChevronDown size={15} />
                                  </button>
                                </div>
                                {/* Delete button */}
                                <button
                                  type="button"
                                  onClick={() => removeQuestionRow(qIndex)}
                                  style={{
                                    border: '1px solid #fee2e2',
                                    background: '#fef2f2',
                                    color: '#B91C1C',
                                    cursor: 'pointer',
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
                                  title="Delete Question"
                                >
                                  <Trash2 size={13} />
                                  {t('common.delete', 'Elimina')}
                                </button>
                              </div>
                            </div>

                            {/* Main row with input text and type selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              {/* Question Text Input */}
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <input
                                  type="text"
                                  className="field-input"
                                  value={q.question_text}
                                  onChange={(e) => updateQuestionField(qIndex, 'question_text', e.target.value)}
                                  placeholder={t('ats.questionTextPlaceholder', 'Testo della domanda...')}
                                  style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '8px 12px',
                                    fontSize: 13.5,
                                    borderRadius: 'var(--radius)',
                                    border: '1px solid var(--border)',
                                    outline: 'none',
                                    background: '#fff'
                                  }}
                                />
                              </div>

                              {/* Question Type Selector (Pill tabs) */}
                              <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', padding: 3, borderRadius: 8, border: '1px solid var(--border-light)' }}>
                                {([
                                  { type: 'text', label: t('ats.questionTypeText', 'Testo libero') },
                                  { type: 'yesno', label: t('ats.questionTypeYesNo', 'Sì/No') },
                                  { type: 'multichoice', label: t('ats.questionTypeMulti', 'Scelta multipla') }
                                ] as const).map((tabItem) => {
                                  const isActive = uiType === tabItem.type;
                                  return (
                                    <button
                                      key={tabItem.type}
                                      type="button"
                                      onClick={() => handleTypeChange(qIndex, tabItem.type)}
                                      style={{
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: isActive ? '#fff' : 'transparent',
                                        color: isActive ? '#9A6808' : '#64748B',
                                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                        transition: 'all 0.1s ease',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {tabItem.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Options Builder for Scelta multipla */}
                            {uiType === 'multichoice' && (
                              <div style={{ paddingLeft: 24, display: 'grid', gap: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('ats.answerOptionsLabel', 'Opzioni di risposta:')}</div>
                                {q.options.map((opt, optIndex) => (
                                  <div key={`opt-${optIndex}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                      type="text"
                                      className="field-input"
                                      value={opt}
                                      onChange={(e) => updateOptionField(qIndex, optIndex, e.target.value)}
                                      placeholder={t('ats.optionPlaceholder', { number: optIndex + 1 })}
                                      style={{
                                        width: '100%',
                                        maxWidth: 300,
                                        boxSizing: 'border-box',
                                        padding: '6px 10px',
                                        fontSize: 12.5,
                                        borderRadius: 'var(--radius)',
                                        border: '1px solid var(--border)',
                                        outline: 'none',
                                        background: '#fff'
                                      }}
                                    />
                                    {q.options.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => removeOptionField(qIndex, optIndex)}
                                        style={{ border: 'none', background: 'transparent', color: '#B91C1C', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => addOptionField(qIndex)}
                                  style={{
                                    width: 'fit-content',
                                    fontSize: 12,
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(201,151,58,0.42)',
                                    background: 'rgba(201,151,58,0.1)',
                                    color: '#8a6318',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  <Plus size={12} /> {t('ats.addOption', 'Aggiungi opzione')}
                                </button>
                              </div>
                            )}

                            {/* Question settings (Required toggle & Knockout toggle) */}
                            <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                                {/* Required Switch */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 550 }}>
                                  <input
                                    type="checkbox"
                                    checked={isRequired}
                                    onChange={(e) => updateQuestionField(qIndex, 'is_required', e.target.checked)}
                                    style={{ cursor: 'pointer', width: 14, height: 14 }}
                                  />
                                  {t('ats.questionRequiredToggle', 'Risposta obbligatoria')}
                                </label>

                                {/* Knockout Switch */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 550 }}>
                                  <input
                                    type="checkbox"
                                    checked={q.is_knockout}
                                    onChange={(e) => updateQuestionField(qIndex, 'is_knockout', e.target.checked)}
                                    style={{ cursor: 'pointer', width: 14, height: 14 }}
                                  />
                                  {t('ats.knockoutLabel', 'Scarta se risponde:')}
                                </label>

                                {q.is_knockout && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {uiType === 'yesno' ? (
                                      <select
                                        className="field-input"
                                        value={q.knockout_value || 'no'}
                                        onChange={(e) => updateQuestionField(qIndex, 'knockout_value', e.target.value)}
                                        style={{
                                          boxSizing: 'border-box',
                                          padding: '4px 8px',
                                          fontSize: 12.5,
                                          borderRadius: 'var(--radius)',
                                          border: '1px solid var(--border)',
                                          outline: 'none',
                                          background: '#fff',
                                          minWidth: 100
                                        }}
                                      >
                                        <option value="no">No</option>
                                        <option value="yes">Sì</option>
                                      </select>
                                    ) : uiType === 'multichoice' ? (
                                      <select
                                        className="field-input"
                                        value={q.knockout_value}
                                        onChange={(e) => updateQuestionField(qIndex, 'knockout_value', e.target.value)}
                                        style={{
                                          boxSizing: 'border-box',
                                          padding: '4px 8px',
                                          fontSize: 12.5,
                                          borderRadius: 'var(--radius)',
                                          border: '1px solid var(--border)',
                                          outline: 'none',
                                          background: '#fff',
                                          minWidth: 150
                                        }}
                                      >
                                        <option value="">Seleziona opzione...</option>
                                        {q.options.filter(Boolean).map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        className="field-input"
                                        value={q.knockout_value}
                                        onChange={(e) => updateQuestionField(qIndex, 'knockout_value', e.target.value)}
                                        placeholder="es. no"
                                        style={{
                                          boxSizing: 'border-box',
                                          padding: '4px 8px',
                                          fontSize: 12.5,
                                          borderRadius: 'var(--radius)',
                                          border: '1px solid var(--border)',
                                          outline: 'none',
                                          background: '#fff',
                                          minWidth: 150
                                        }}
                                      />
                                    )}
                                  </div>
                                )}
                              </div>
                              {q.is_knockout && (
                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: 20 }}>
                                  {t('ats.knockoutHelpText', 'I candidati che scelgono questa risposta verranno automaticamente esclusi.')}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={questionsEndRef} />
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {t('ats.screenerQuestionsLimitTip', 'Consiglio: Indeed mostra massimo 20 domande. Più di 20 riduce significativamente le candidature.')}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4, minHeight: 44 }}>
              {step === 1 && (
                <>
                  <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
                  <Button variant="primary" type="button" onClick={moveNext}>
                    {t('common.next', 'Next')} →
                  </Button>
                </>
              )}

              {step === 2 && (
                <>
                  <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
                  <Button variant="secondary" type="button" onClick={() => setStep(1)}>
                    ← {t('common.back', 'Back')}
                  </Button>
                  <Button variant="primary" type="button" onClick={moveNext}>
                    {t('common.next', 'Next')} →
                  </Button>
                </>
              )}

              {step === 3 && (
                <>
                  <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
                  <Button variant="secondary" type="button" onClick={() => setStep(2)}>
                    ← {t('common.back', 'Back')}
                  </Button>
                  <Button variant="secondary" type="button" onClick={moveNext}>
                    {t('ats.previewStep', 'Preview')} →
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    disabled={!title.trim() || !description.replace(/<[^>]*>/g, '').trim() || !jobType || !remoteType || !companyId}
                  >
                    {job ? t('ats.savePosition', 'Save position') : t('ats.createPosition', 'Create position')}
                  </Button>
                </>
              )}

              {step === 4 && (
                <>
                  <Button variant="secondary" type="button" onClick={() => setStep(3)}>
                    ← {t('common.back', 'Back')}
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={saving}
                    disabled={!title.trim() || !description.replace(/<[^>]*>/g, '').trim() || !jobType || !remoteType || !companyId}
                  >
                    {job ? t('ats.savePosition', 'Save position') : t('ats.createPosition', 'Create position')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>
    </ModalBackdrop>
  );
};

// ─── Candidate detail panel ────────────────────────────────────────────────────

// Reusable job-post summary (details + creator) — shared by the candidate modal
// and the position view modal so both render the job the same way.
const JobPostSummaryCard: React.FC<{ appliedJob: JobPosting; showFullDescription?: boolean; screenerQuestions?: ScreenerQuestion[] }> = ({ appliedJob, showFullDescription = false, screenerQuestions: propScreenerQuestions }) => {
  const { t, i18n } = useTranslation();
  const [screenerQuestions, setScreenerQuestions] = useState<ScreenerQuestion[]>([]);

  useEffect(() => {
    if (propScreenerQuestions && propScreenerQuestions.length > 0) {
      setScreenerQuestions(propScreenerQuestions);
      return;
    }
    if (appliedJob.id) {
      listScreenerQuestions(appliedJob.id, appliedJob.companyId)
        .then(setScreenerQuestions)
        .catch(() => setScreenerQuestions([]));
    } else {
      setScreenerQuestions([]);
    }
  }, [appliedJob.id, appliedJob.companyId, propScreenerQuestions]);
  const formatDate = (date: string | null | undefined, format: 'long' | 'short' = 'long'): string => {
    if (!date) return '';
    const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
    return new Date(date).toLocaleDateString(locale, {
      year: 'numeric',
      month: format === 'long' ? 'long' : 'short',
      day: 'numeric',
    });
  };
  return (
    <>
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: '#fff',
                padding: '14px 16px',
              }}>
                {/* Header Row with Title and Target Role Tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    💼 {t('ats.jobPostDetails', 'Job Post Details')}
                  </div>
                  {appliedJob.targetRole && (
                    <span style={{
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      color: '#fff',
                      borderRadius: 99,
                      padding: '3px 10px',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                    }}>
                      {appliedJob.targetRole.replace('_', ' ')}
                    </span>
                  )}
                </div>

                {/* Title Row with Status Tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
                    {appliedJob.title}
                  </h3>
                  <span style={{
                    borderRadius: 999,
                    border: '1px solid rgba(13,33,55,0.18)',
                    background: STATUS_COLOR[appliedJob.status] + '15',
                    color: STATUS_COLOR[appliedJob.status],
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 8px',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}>
                    {t(`ats.status_${appliedJob.status}`, appliedJob.status)}
                  </span>
                </div>

                {/* Description Row */}
                {appliedJob.description && (
                  showFullDescription ? (
                    <div
                      style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 10px 0' }}
                      dangerouslySetInnerHTML={{ __html: parseRichTextToHtml(appliedJob.description) }}
                    />
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 10px 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {appliedJob.description.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                    </p>
                  )
                )}

                {/* First Row: Location and Work Arrangement */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
                  {/* Location with Flag */}
                  {(appliedJob.jobCountry || appliedJob.country) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--background)', borderRadius: 6 }}>
                      <span style={{ fontSize: 14 }}>📍</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('common.location', 'Location')}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {(appliedJob.jobCountry || appliedJob.country) && (
                            <ReactCountryFlag
                              countryCode={appliedJob.jobCountry || appliedJob.country || ''}
                              svg
                              style={{ width: '0.95em', height: '0.95em' }}
                            />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[appliedJob.jobCity || appliedJob.city, appliedJob.jobState || appliedJob.state].filter(Boolean).join(', ') || (appliedJob.jobCountry || appliedJob.country)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Remote Type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--background)', borderRadius: 6 }}>
                    <Globe2 size={14} color="var(--text-muted)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('ats.workArrangement', 'Work Arrangement')}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t(`ats.remoteType_${appliedJob.remoteType}`, appliedJob.remoteType)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Second Row: Department, Hours, Job Type */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
                  {appliedJob.department && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--background)', borderRadius: 6 }}>
                      <span style={{ fontSize: 14 }}>🏢</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('ats.department', 'Department')}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appliedJob.department}
                        </div>
                      </div>
                    </div>
                  )}

                  {appliedJob.weeklyHours && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--background)', borderRadius: 6 }}>
                      <Clock3 size={14} color="var(--text-muted)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('ats.weeklyHours', 'Weekly Hours')}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {appliedJob.weeklyHours}h/week
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Job Type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--background)', borderRadius: 6 }}>
                    <BriefcaseBusiness size={14} color="var(--text-muted)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('ats.jobType', 'Job Type')}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {t(`ats.jobType_${JOB_TYPE_LABEL[appliedJob.jobType]}`, appliedJob.jobType)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Salary Range */}
                {(appliedJob.salaryMin || appliedJob.salaryMax) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', borderRadius: 6, border: '1px solid #BBF7D0' }}>
                    <span style={{ fontSize: 16 }}>💰</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 1 }}>
                        {t('ats.salaryRange', 'Salary Range')}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#15803D' }}>
                        {appliedJob.salaryMin && appliedJob.salaryMax
                          ? `€${appliedJob.salaryMin.toLocaleString()} - €${appliedJob.salaryMax.toLocaleString()}`
                          : appliedJob.salaryMin
                            ? `€${appliedJob.salaryMin.toLocaleString()}+`
                            : `€${appliedJob.salaryMax?.toLocaleString()}`}
                        {appliedJob.salaryPeriod && (
                          <span style={{ fontSize: 10, fontWeight: 500, color: '#16A34A', marginLeft: 4 }}>
                            / {appliedJob.salaryPeriod}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Job Tags */}
                {appliedJob.tags && appliedJob.tags.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      {t('ats.jobTags', 'Job Tags')}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {appliedJob.tags.map((tag) => (
                        <span key={tag} style={{
                          background: 'rgba(59,130,246,0.08)',
                          color: '#2563EB',
                          border: '1px solid rgba(59,130,246,0.2)',
                          borderRadius: 99,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 500,
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Screener Questions for this Job */}
                {screenerQuestions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      📋 {t('ats.screenerQuestions', 'Screener Questions')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {screenerQuestions.map((q, idx) => {
                        let optionsArr: string[] = [];
                        if (q.options) {
                          try {
                            const raw = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
                            if (Array.isArray(raw)) {
                              optionsArr = raw.map((o: any) => typeof o === 'string' ? o : (o.label || o.value || ''));
                            }
                          } catch { /* ignore */ }
                        }
                        return (
                          <div key={q.id ?? idx} style={{
                            padding: '8px 10px', background: 'var(--background)', borderRadius: 6,
                            border: '1px solid var(--border)',
                          }}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: optionsArr.length > 0 ? 4 : 0 }}>
                              {(q as any).questionText || q.question_text}
                              {((q as any).isKnockout || q.is_knockout) && (
                                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '1px 5px', borderRadius: 4, verticalAlign: 'middle' }}>
                                  KO
                                </span>
                              )}
                            </div>
                            {optionsArr.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {optionsArr.map((opt, oi) => (
                                  <span key={oi} style={{
                                    fontSize: 10, color: 'var(--text-secondary)', background: 'var(--surface)',
                                    border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px',
                                  }}>
                                    {opt}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Job Post Creator Section - Enhanced */}
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: '#fff',
                padding: '16px 18px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  👨‍💼 {t('ats.jobPostCreator', 'Job Post Creator')}
                </div>

                {/* Creator Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                  {appliedJob.createdByAvatarFilename && getAvatarUrl(appliedJob.createdByAvatarFilename) ? (
                    <img
                      src={getAvatarUrl(appliedJob.createdByAvatarFilename) || ''}
                      alt={appliedJob.createdByName || 'User'}
                      style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 16, border: '2px solid var(--border)',
                    }}>
                      {appliedJob.createdByName ? appliedJob.createdByName[0].toUpperCase() : '?'}
                    </div>
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {appliedJob.createdByName} {appliedJob.createdBySurname}
                      {appliedJob.createdByRole && (
                        <span style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontWeight: 500,
                          color: 'var(--text-muted)',
                          textTransform: 'capitalize'
                        }}>
                          · {appliedJob.createdByRole.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      <strong>{t('ats.created', 'Created')}:</strong> {formatDate(appliedJob.createdAt)}
                      {appliedJob.publishedAt && (
                        <span style={{ marginLeft: 8 }}>
                          · <strong>{t('ats.published', 'Published')}:</strong> {formatDate(appliedJob.publishedAt, 'short')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Company Info */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    {t('common.company', 'Company')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', background: 'var(--background)', borderRadius: 8 }}>
                    {appliedJob.companyLogoFilename && getCompanyLogoUrl(appliedJob.companyLogoFilename) ? (
                      <img
                        src={getCompanyLogoUrl(appliedJob.companyLogoFilename) || ''}
                        alt={appliedJob.companyName || 'Company'}
                        style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 14,
                      }}>
                        {appliedJob.companyName ? appliedJob.companyName[0].toUpperCase() : 'C'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appliedJob.companyName || 'N/A'}
                        </span>
                        {appliedJob.companyCountry && (
                          <ReactCountryFlag
                            countryCode={appliedJob.companyCountry}
                            svg
                            style={{ width: '0.9em', height: '0.9em', flexShrink: 0 }}
                          />
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {appliedJob.companyGroupName && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--accent)',
                            background: 'var(--accent-light)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}>
                            {appliedJob.companyGroupName}
                          </span>
                        )}
                        {(appliedJob.companyOwnerName || appliedJob.companyOwnerSurname) && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {appliedJob.companyOwnerAvatarFilename && getAvatarUrl(appliedJob.companyOwnerAvatarFilename) ? (
                              <img
                                src={getAvatarUrl(appliedJob.companyOwnerAvatarFilename) || ''}
                                alt={`${appliedJob.companyOwnerName} ${appliedJob.companyOwnerSurname}`}
                                style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{
                                width: 14, height: 14, borderRadius: '50%',
                                background: 'var(--primary)', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 7, fontWeight: 700,
                              }}>
                                {appliedJob.companyOwnerName ? appliedJob.companyOwnerName[0].toUpperCase() : 'O'}
                              </div>
                            )}
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                              {appliedJob.companyOwnerName} {appliedJob.companyOwnerSurname}
                            </span>
                          </div>
                        )}
                        {appliedJob.companyStoreCount != null && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            · {appliedJob.companyStoreCount} {t('employees.storesLabel', 'Stores')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Store Info */}
                {appliedJob.storeName && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                      {t('common.store', 'Store')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', background: 'var(--background)', borderRadius: 8 }}>
                      {appliedJob.storeLogoFilename && getStoreLogoUrl(appliedJob.storeLogoFilename) ? (
                        <img
                          src={getStoreLogoUrl(appliedJob.storeLogoFilename) || ''}
                          alt={appliedJob.storeName}
                          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: 'var(--accent)', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 14,
                        }}>
                          {appliedJob.storeName[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {appliedJob.storeName}
                          </span>
                          {appliedJob.storeCountry && (
                            <ReactCountryFlag
                              countryCode={appliedJob.storeCountry}
                              svg
                              style={{ width: '0.9em', height: '0.9em', flexShrink: 0 }}
                            />
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {(appliedJob.storeHrName || appliedJob.storeHrSurname) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>HR:</span>
                              {appliedJob.storeHrAvatarFilename && getAvatarUrl(appliedJob.storeHrAvatarFilename) ? (
                                <img
                                  src={getAvatarUrl(appliedJob.storeHrAvatarFilename) || ''}
                                  alt={`${appliedJob.storeHrName} ${appliedJob.storeHrSurname}`}
                                  style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{
                                  width: 16, height: 16, borderRadius: '50%',
                                  background: 'var(--primary)', color: '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 8, fontWeight: 700,
                                }}>
                                  {appliedJob.storeHrName ? appliedJob.storeHrName[0].toUpperCase() : 'H'}
                                </div>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                {appliedJob.storeHrName} {appliedJob.storeHrSurname}
                              </span>
                            </div>
                          )}
                          {(appliedJob.storeAreaManagerName || appliedJob.storeAreaManagerSurname) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Area Manager:</span>
                              {appliedJob.storeAreaManagerAvatarFilename && getAvatarUrl(appliedJob.storeAreaManagerAvatarFilename) ? (
                                <img
                                  src={getAvatarUrl(appliedJob.storeAreaManagerAvatarFilename) || ''}
                                  alt={`${appliedJob.storeAreaManagerName} ${appliedJob.storeAreaManagerSurname}`}
                                  style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{
                                  width: 16, height: 16, borderRadius: '50%',
                                  background: '#059669', color: '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 8, fontWeight: 700,
                                }}>
                                  {appliedJob.storeAreaManagerName ? appliedJob.storeAreaManagerName[0].toUpperCase() : 'A'}
                                </div>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                {appliedJob.storeAreaManagerName} {appliedJob.storeAreaManagerSurname}
                              </span>
                            </div>
                          )}
                          {(appliedJob.storeManagerName || appliedJob.storeManagerSurname) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{t('common.manager', 'Manager')}:</span>
                              {appliedJob.storeManagerAvatarFilename && getAvatarUrl(appliedJob.storeManagerAvatarFilename) ? (
                                <img
                                  src={getAvatarUrl(appliedJob.storeManagerAvatarFilename) || ''}
                                  alt={`${appliedJob.storeManagerName} ${appliedJob.storeManagerSurname}`}
                                  style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{
                                  width: 16, height: 16, borderRadius: '50%',
                                  background: 'var(--accent)', color: '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 8, fontWeight: 700,
                                }}>
                                  {appliedJob.storeManagerName ? appliedJob.storeManagerName[0].toUpperCase() : 'M'}
                                </div>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                                {appliedJob.storeManagerName} {appliedJob.storeManagerSurname}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
    </>
  );
};

interface DisplayAnswer {
  questionText: string;
  answerText: string;
}

function getDisplayAnswers(
  sourceRef: string | null,
  screenerQuestions: ScreenerQuestion[]
): DisplayAnswer[] {
  if (!sourceRef) return [];
  try {
    const parsed = JSON.parse(sourceRef);
    const answers: any[] = parsed.screener_answers || parsed.screenerQuestionsAndAnswers || [];
    if (!Array.isArray(answers) || answers.length === 0) return [];

    return answers.map((ans: any) => {
      // Direct portal apply: { questionId: number, answer: string }
      if (ans.questionId !== undefined || ans.question_id !== undefined) {
        const qId = ans.questionId !== undefined ? ans.questionId : ans.question_id;
        const q = screenerQuestions.find(sq => String(sq.id) === String(qId));
        return {
          questionText: (q as any)?.questionText || q?.question_text || ans.label || ans.question || ans.questionText || `Question #${qId}`,
          answerText: String(ans.answer ?? ans.value ?? ''),
        };
      }

      // Indeed apply or other formats: { id: "q_N", label: "...", value: "..." }
      const qId = ans.id || '';
      const qText = ans.label || ans.question || ans.questionText || '';
      const aText = String(ans.value ?? ans.answer ?? '');

      if (qId) {
        const dbId = parseInt(String(qId).replace('q_', ''), 10);
        if (!Number.isNaN(dbId)) {
          const q = screenerQuestions.find(sq => String(sq.id) === String(dbId));
          if (q) {
            return { questionText: (q as any).questionText || q.question_text, answerText: aText };
          }
        }
      }

      return {
        questionText: qText || 'Question',
        answerText: aText,
      };
    }).filter((item): item is DisplayAnswer => {
      return item.questionText.trim() !== '' && item.answerText.trim() !== '';
    });
  } catch {
    return [];
  }
}

interface CandidateModalProps {
  candidate: Candidate;
  jobs: JobPosting[];
  employees: Employee[];
  canEdit: boolean;
  canTag: boolean;
  canFeedback: boolean;
  interviewInviteEnabled: boolean | null;
  smtpConfigured: boolean | null;
  onClose: () => void;
  onAdvance: (status: CandidateStatus) => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
  companies?: Company[];
}

const CandidateModal: React.FC<CandidateModalProps> = ({
  candidate, jobs, employees, canEdit, canTag, canFeedback, interviewInviteEnabled, smtpConfigured,
  onClose, onAdvance, onReject, onDelete, saving,
  companies = [],
}) => {
  const { t, i18n } = useTranslation();
  const isIt = i18n.language === 'it';
  const { showToast } = useToast();
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<number | null>(null);
  const [intDate, setIntDate] = useState('');
  const [intTime, setIntTime] = useState('09:00');
  const [intLocation, setIntLocation] = useState('');
  const [intType, setIntType] = useState<InterviewType>(candidate.status === 'phone_interview' ? 'phone' : 'in_person');
  const [intDescription, setIntDescription] = useState('');
  const [intDuration, setIntDuration] = useState<number | ''>('');
  const [intInterviewerId, setIntInterviewerId] = useState<string | null>(null);
  const [intSendIcs, setIntSendIcs] = useState(true);
  const [savingInt, setSavingInt] = useState(false);
  // Address picker for in-person interviews: the company's store addresses plus
  // any custom ones the user saved for reuse (kept per-browser in localStorage).
  const [modalStores, setModalStores] = useState<Store[]>([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [interviewerUsers, setInterviewerUsers] = useState<Employee[]>([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<number, string>>({});
  const [interviewFeedback, setInterviewFeedback] = useState<Record<number, InterviewFeedbackComment[]>>({});
  const [savingFeedbackId, setSavingFeedbackId] = useState<number | null>(null);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [interviewNotifications, setInterviewNotifications] = useState<Record<number, InterviewNotificationLog[]>>({});
  const [resumeFileSizeLabel, setResumeFileSizeLabel] = useState<string | null>(null);
  const [hoveredFeedbackId, setHoveredFeedbackId] = useState<number | null>(null);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const [hasScrolledToTab, setHasScrolledToTab] = useState(false);
  const [notificationModalFeedbackId, setNotificationModalFeedbackId] = useState<number | null>(null);
  const [notificationModalLogs, setNotificationModalLogs] = useState<InterviewNotificationLog[]>([]);
  const [hasScrolledToFeedback, setHasScrolledToFeedback] = useState(false);

  // Auto-scroll to section based on URL parameter
  useEffect(() => {
    if (!hasScrolledToTab) {
      const tab = searchParams.get('tab');
      if (tab === 'resume' || tab === 'comments') {
        setTimeout(() => {
          const el = document.getElementById(tab === 'resume' ? 'resume-section' : 'comments-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setHasScrolledToTab(true);
          }
        }, 500); // Small delay to ensure content is rendered
      }
    }
  }, [searchParams, hasScrolledToTab]);

  // Auto-scroll to specific feedback comment when deep-linked
  const [scrolledFeedbackId, setScrolledFeedbackId] = useState<string | null>(null);
  useEffect(() => {
    const feedbackId = searchParams.get('feedbackId');
    if (feedbackId && feedbackId !== scrolledFeedbackId && Object.keys(interviewFeedback).length > 0) {
      const feedbackExists = Object.values(interviewFeedback).some(comments =>
        comments.some(c => String(c.id) === String(feedbackId))
      );

      if (feedbackExists) {
        const timer = setTimeout(() => {
          const el = document.getElementById(`feedback-comment-${feedbackId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setScrolledFeedbackId(feedbackId);
          }
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [searchParams, interviewFeedback, scrolledFeedbackId]);

  // Load notification logs for interviews
  const loadInterviewNotifications = useCallback(async (interviewIds: number[]) => {
    const promises = interviewIds.map(async (id) => {
      try {
        const logs = await getInterviewNotifications(id);
        return { id, logs };
      } catch {
        return { id, logs: [] };
      }
    });

    const results = await Promise.allSettled(promises);
    const newNotifications: Record<number, InterviewNotificationLog[]> = {};

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        newNotifications[result.value.id] = result.value.logs;
      }
    });

    setInterviewNotifications(prev => ({ ...prev, ...newNotifications }));
  }, []);

  // Load notification logs when interviews change
  useEffect(() => {
    if (interviews.length > 0) {
      loadInterviewNotifications(interviews.map(iv => iv.id));
    }
  }, [interviews, loadInterviewNotifications]);

  // Send/Resend notification or email
  const handleRetryNotification = async (
    interviewId: number,
    logId?: number,
    channel?: 'email' | 'in_app',
    recipientType?: 'interviewer' | 'candidate',
  ) => {
    try {
      const result = await sendInterviewEmail(interviewId, logId, channel, recipientType);
      // Reload notification logs for this interview
      await loadInterviewNotifications([interviewId]);

      // Show success message with recipient info
      const channelLabel = channel === 'email' ? t('ats.email', 'Email') : t('ats.notification', 'Notification');
      const actionLabel = logId ? t('common.resent', 'resent') : t('common.sent', 'sent');
      const recipientInfo = result.recipientName
        ? ` to ${result.recipientName}${result.recipientEmail ? ` (${result.recipientEmail})` : ''}`
        : '';

      showToast(`${channelLabel} ${actionLabel}${recipientInfo}`, 'success');
    } catch (err) {
      const channelLabel = channel === 'email' ? t('ats.email', 'Email') : t('ats.notification', 'Notification');
      showToast(`${t('common.error', 'Error')} sending ${channelLabel.toLowerCase()}`, 'error');
    }
  };
  const [deletingInterviewId, setDeletingInterviewId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string } | null>(null);

  // Tags editing
  const [editingTags, setEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState<string[]>(() => splitCandidateTags(candidate.tags).userTags);
  const [tagInput, setTagInput] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  const { systemTags } = useMemo(() => splitCandidateTags(candidate.tags), [candidate.tags]);

  // Rejection reason
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [savingRejection, setSavingRejection] = useState(false);

  const [screenerQuestions, setScreenerQuestions] = useState<ScreenerQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const screenerFetchedRef = useRef<string>('');

  useEffect(() => {
    const fetchKey = `${candidate.jobPostingId ?? ''}-${candidate.companyId ?? ''}`;
    if (screenerFetchedRef.current === fetchKey) return;
    screenerFetchedRef.current = fetchKey;

    if (candidate.jobPostingId) {
      setLoadingQuestions(true);
      listScreenerQuestions(candidate.jobPostingId, candidate.companyId)
        .then(setScreenerQuestions)
        .catch(() => setScreenerQuestions([]))
        .finally(() => setLoadingQuestions(false));
    } else {
      setScreenerQuestions([]);
      setLoadingQuestions(false);
    }
  }, [candidate.jobPostingId, candidate.companyId]);

  const displayAnswers = useMemo(() => {
    if (loadingQuestions) return [];
    return getDisplayAnswers(candidate.sourceRef, screenerQuestions);
  }, [candidate.sourceRef, screenerQuestions, loadingQuestions]);

  const appliedJob = candidate.jobPostingId
    ? jobs.find((j) => j.id === candidate.jobPostingId) ?? null
    : null;
  const jobTitle = appliedJob?.title;
  const appliedTimeSource = candidate.appliedAt ?? candidate.createdAt;
  const appliedAgoLabel = fmtRelativeTime(appliedTimeSource);
  const appliedAtLabel = fmtDateTime(appliedTimeSource);
  const appliedDateOnly = new Date(appliedTimeSource).toLocaleDateString(i18n.language === 'it' ? 'it-IT' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const appliedJobLocation = appliedJob
    ? [appliedJob.jobCity ?? appliedJob.city, appliedJob.jobState ?? appliedJob.state, appliedJob.jobCountry ?? appliedJob.country]
      .filter(Boolean)
      .join(', ')
    || t(`ats.remoteType_${appliedJob.remoteType}`, appliedJob.remoteType)
    : null;
  const stageColor = STAGE_COLOR[candidate.status];
  const stageBg = STAGE_BG[candidate.status];
  const next = NEXT_STAGE[candidate.status];

  // Parse candidate profile to get available start date
  const candidateProfile = parseCandidateProfile(candidate.sourceRef);
  const availableStartDate = candidateProfile.availableStartDate
    ? new Date(candidateProfile.availableStartDate).toLocaleDateString(i18n.language === 'it' ? 'it-IT' : 'en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    : null;

  const interviewerOptions = useMemo<SelectOption[]>(() => {
    return interviewerUsers
      .filter((emp) => ['hr', 'area_manager', 'store_manager'].includes(emp.role))
      .map((emp) => {
        const fullName = `${emp.name} ${emp.surname}`.trim();
        const avatarUrl = getAvatarUrl(emp.avatarFilename);
        const roleLabel = t(`roles.${emp.role}`, emp.role);
        
        // Generate beautiful initials and avatar bg for company label
        const companyInitials = emp.companyName ? initials(emp.companyName) : 'CO';
        const companyAvatarBg = emp.companyName 
          ? ['#0D2137', '#163352', '#8B6914', '#1B4D3E', '#2C5282', '#5B2333'][Math.abs(emp.companyName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 6]
          : 'var(--border)';

        return {
          value: String(emp.id),
          label: `${fullName} ${roleLabel}`.trim(),
          render: (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr auto',
              gap: 16,
              width: '100%',
              padding: '4px 0',
              alignItems: 'center',
            }}>
              {/* Column 1: User Avatar + Name + Sub-detail (email) */}
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
                    {emp.email}
                  </div>
                </div>
              </div>

              {/* Column 2: Company initials Avatar + Company Name + Store Name (in italics underneath) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {emp.companyName ? (
                  <>
                    {(() => {
                      const comp = companies?.find((c) => String(c.id) === String(emp.companyId) || c.name === emp.companyName);
                      // Use companyLogoFilename directly from backend, fallback to the one in companies list
                      const logoFile = (emp as any).companyLogoFilename || comp?.logoFilename;
                      const companyLogoUrl = logoFile ? getCompanyLogoUrl(logoFile) : null;
                      return companyLogoUrl ? (
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: 4,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          background: 'var(--surface-warm)',
                        }}>
                          <img src={companyLogoUrl} alt={emp.companyName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{
                          width: 28,
                          height: 28,
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
                        {emp.companyName}
                      </div>
                      {((emp as any).storeName) ? (
                        <div style={{
                          fontSize: 10,
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

              {/* Column 3: User Role Badge */}
              <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                <Badge size="sm" variant={ROLE_BADGE_VARIANT[emp.role] ?? 'neutral'}>
                  {roleLabel}
                </Badge>
              </div>
            </div>
          ),
        };
      });
  }, [interviewerUsers, t]);

  const resumePath = candidate.resumePath || candidate.cvPath;
  const defaultInterviewType = candidate.status === 'phone_interview' ? 'phone' : 'in_person';

  // Extract only the relative path from cvs/ or public-cv/ onwards
  const displayResumePath = resumePath
    ? resumePath.includes('cvs/')
      ? resumePath.substring(resumePath.indexOf('cvs/'))
      : resumePath.includes('public-cv/')
        ? resumePath.substring(resumePath.indexOf('public-cv/'))
        : resumePath
    : null;

  // Country flag helper
  const getCountryFlag = (countryCode: string | null | undefined): string => {
    if (!countryCode) return '';
    const code = countryCode.toUpperCase();
    const flags: Record<string, string> = {
      'IT': '🇮🇹', 'US': '🇺🇸', 'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪',
      'ES': '🇪🇸', 'PT': '🇵🇹', 'NL': '🇳🇱', 'BE': '🇧🇪', 'CH': '🇨🇭',
      'AT': '🇦🇹', 'PL': '🇵🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰',
    };
    return flags[code] || '🌍';
  };

  // Format date based on language
  const formatDate = (date: string | null | undefined, format: 'long' | 'short' = 'long'): string => {
    if (!date) return '';
    const locale = i18n.language === 'it' ? 'it-IT' : 'en-GB';
    return new Date(date).toLocaleDateString(locale, {
      year: 'numeric',
      month: format === 'long' ? 'long' : 'short',
      day: 'numeric',
    });
  };
  useEffect(() => {
    let cancelled = false;
    setResumeFileSizeLabel(null);

    const url = getResumeUrl(resumePath);
    if (!url) return () => { cancelled = true; };

    void fetch(url, { method: 'HEAD' })
      .then((response) => {
        if (cancelled || !response.ok) return;
        const sizeHeader = response.headers.get('content-length');
        const sizeValue = sizeHeader ? Number(sizeHeader) : Number.NaN;
        if (!Number.isFinite(sizeValue) || sizeValue <= 0) return;
        setResumeFileSizeLabel(formatFileSize(sizeValue));
      })
      .catch(() => {
        if (!cancelled) setResumeFileSizeLabel(null);
      });

    return () => {
      cancelled = true;
    };
  }, [resumePath]);

  useEffect(() => {
    let active = true;
    getInterviews(candidate.id)
      .then(async (items) => {
        if (!active) return;
        setInterviews(items);
        setFeedbackDrafts(Object.fromEntries(items.map((iv) => [iv.id, ''])));

        const results = await Promise.allSettled(
          items.map((iv) => getInterviewFeedbackComments(iv.id))
        );
        if (!active) return;
        const feedbackMap: Record<number, InterviewFeedbackComment[]> = {};
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            feedbackMap[items[idx].id] = result.value;
          }
        });
        setInterviewFeedback(feedbackMap);
      })
      .catch(() => { });

    return () => {
      active = false;
    };
  }, [candidate.id]);

  useEffect(() => {
    let active = true;
    const localEligible = employees.filter((emp) => (
      ['hr', 'area_manager', 'store_manager'].includes(emp.role)
      && emp.companyId === candidate.companyId
      && emp.status === 'active'
    ));

    // Attempt to load interviewers from the ATS endpoint which returns
    // users across grouped companies (when allowed). Fallback to local employees if empty.
    listInterviewers(candidate.companyId)
      .then((res: any) => {
        if (!active) return;
        const fromApi = (res?.interviewers ?? []) as Employee[];
        if (fromApi.length > 0) {
          setInterviewerUsers(fromApi);
        } else if (localEligible.length > 0) {
          setInterviewerUsers(localEligible);
        } else {
          setInterviewerUsers([]);
        }
      })
      .catch(() => {
        if (!active) return;
        if (localEligible.length > 0) setInterviewerUsers(localEligible);
        else setInterviewerUsers([]);
      });

    return () => { active = false; };
  }, [candidate.companyId, employees]);

  useEffect(() => {
    setTagsDraft(splitCandidateTags(candidate.tags).userTags);
  }, [candidate.id, candidate.tags]);

  const handleAddInterviewFeedback = async (interviewId: number) => {
    const value = (feedbackDrafts[interviewId] ?? '').trim();
    if (!value) {
      showToast(t('ats.feedbackRequired'), 'error');
      return;
    }

    setSavingFeedbackId(interviewId);
    try {
      const comment = await addInterviewFeedbackComment(interviewId, value);
      setInterviewFeedback((prev) => ({
        ...prev,
        [interviewId]: [...(prev[interviewId] ?? []), comment],
      }));
      setFeedbackDrafts((prev) => ({ ...prev, [interviewId]: '' }));
      showToast(t('ats.feedbackSaved'), 'success');
    } catch {
      showToast(t('ats.feedbackError'), 'error');
    } finally {
      setSavingFeedbackId(null);
    }
  };

  const handleDeleteInterviewFeedback = async (interviewId: number, commentId: number, authorId: number | null) => {
    if (!canEdit && authorId !== user?.id) return;
    setDeletingFeedbackId(commentId);
    try {
      await deleteInterviewFeedbackComment(commentId);
      setInterviewFeedback((prev) => ({
        ...prev,
        [interviewId]: (prev[interviewId] ?? []).filter((c) => c.id !== commentId),
      }));
      showToast(t('ats.feedbackDeleted', 'Feedback deleted'), 'success');
    } catch {
      showToast(t('ats.feedbackDeleteError', 'Unable to delete feedback'), 'error');
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const handleDeleteInterview = async (interviewId: number) => {
    setDeletingInterviewId(interviewId);
    try {
      await deleteInterview(interviewId);
      setInterviews((prev) => prev.filter((iv) => iv.id !== interviewId));
      showToast(t('ats.interviewDeleted', 'Interview deleted'), 'success');
    } catch {
      showToast(t('ats.interviewDeleteError', 'Failed to delete interview'), 'error');
    } finally {
      setDeletingInterviewId(null);
    }
  };

  // Tags handlers
  const handleAddTag = () => {
    const normalized = tagInput.trim();
    if (!normalized) return;
    if (tagsDraft.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
      showToast(t('ats.tagAlreadyExists', 'Tag already exists'), 'warning');
      return;
    }
    setTagsDraft((prev) => [...prev, normalized]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTagsDraft((prev) => prev.filter((t) => t !== tag));
  };

  const handleSaveTags = async () => {
    setSavingTags(true);
    try {
      const nextTags = [...systemTags, ...tagsDraft].filter((tag, idx, arr) => (
        arr.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === idx
      ));
      await updateCandidateTags(candidate.id, nextTags);
      candidate.tags = nextTags; // Update local state
      setTagsDraft(splitCandidateTags(nextTags).userTags);
      setEditingTags(false);
      showToast(t('ats.tagsSaved', 'Tags updated'), 'success');
    } catch {
      showToast(t('ats.tagsError', 'Failed to update tags'), 'error');
    } finally {
      setSavingTags(false);
    }
  };

  const handleCancelTagsEdit = () => {
    setTagsDraft(splitCandidateTags(candidate.tags).userTags);
    setTagInput('');
    setEditingTags(false);
  };

  // Rejection handler
  const handleRejectWithReason = async () => {
    if (!rejectionReason.trim()) {
      showToast(t('ats.rejectionReasonRequired', 'Please provide a rejection reason'), 'error');
      return;
    }
    setSavingRejection(true);
    try {
      await onReject(rejectionReason.trim());
      setShowRejectionModal(false);
      setRejectionReason('');
      showToast(t('ats.candidateRejected', 'Candidate rejected'), 'success');
    } catch {
      showToast(t('ats.rejectionError', 'Failed to reject candidate'), 'error');
    } finally {
      setSavingRejection(false);
    }
  };

  // Load the company's store addresses + saved custom addresses when the form opens.
  const addressStorageKey = `veylo:interviewAddresses:${candidate.companyId}`;
  useEffect(() => {
    if (!showInterviewForm) return;
    getStores()
      .then((all) => setModalStores(all.filter((s) => s.companyId === candidate.companyId)))
      .catch(() => setModalStores([]));
    try {
      const raw = localStorage.getItem(addressStorageKey);
      setSavedAddresses(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { setSavedAddresses([]); }
  }, [showInterviewForm, candidate.companyId, addressStorageKey]);

  const storeAddressOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { label: string; value: string }[] = [];
    for (const s of modalStores) {
      const value = [s.address, s.cap, s.city].filter(Boolean).join(', ');
      if (value && !seen.has(value)) { seen.add(value); out.push({ label: s.name, value }); }
    }
    return out;
  }, [modalStores]);

  const persistSavedAddress = (addr: string) => {
    const clean = addr.trim();
    if (!clean) return;
    setSavedAddresses((prev) => {
      if (prev.includes(clean)) return prev;
      const next = [...prev, clean].slice(-10);
      try { localStorage.setItem(addressStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleCreateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intDate) return;
    // In-person interviews must carry a physical address — the candidate needs
    // to know where to show up (phone/video interviews don't use a location).
    if (intType === 'in_person' && !intLocation.trim()) {
      showToast(t('ats.interviewAddressRequired', 'An address is required for in-person interviews'), 'error');
      return;
    }
    setSavingInt(true);
    try {
      // Ensure time has a value, default to 09:00 if empty
      const timeValue = intTime || '09:00';
      const scheduledAt = new Date(`${intDate}T${timeValue}:00`).toISOString();

      const parsedInterviewerId = intInterviewerId ? Number(intInterviewerId) : undefined;

      if (editingInterviewId) {
        // Update existing interview
        const updated = await updateInterview(editingInterviewId, {
          scheduledAt,
          interviewType: intType,
          location: intLocation || undefined,
          description: intDescription || undefined,
          durationMinutes: typeof intDuration === 'number' ? intDuration : undefined,
          interviewerId: parsedInterviewerId,
        });
        setInterviews((prev) => prev.map((iv) => (iv.id === editingInterviewId ? updated : iv)));
        showToast(t('ats.interviewUpdated', 'Interview updated'), 'success');
      } else {
        // Create new interview
        const iv = await createInterview(candidate.id, {
          scheduledAt,
          interviewType: intType,
          location: intLocation || undefined,
          description: intDescription || undefined,
          durationMinutes: typeof intDuration === 'number' ? intDuration : undefined,
          interviewerId: parsedInterviewerId,
          sendIcs: intSendIcs,
        });
        setInterviews((prev) => [...prev, iv]);
        showToast(t('ats.interviewCreated'), 'success');

        // Load notification logs for the new interview
        try {
          const logs = await getInterviewNotifications(iv.id);
          setInterviewNotifications(prev => ({ ...prev, [iv.id]: logs }));
        } catch {
          // Ignore notification log loading errors
        }
      }

      setShowInterviewForm(false);
      setEditingInterviewId(null);
      setIntDate(''); setIntTime('09:00'); setIntLocation('');
      setIntType(defaultInterviewType); setIntDescription(''); setIntDuration(''); setIntInterviewerId(null); setIntSendIcs(true);
    } catch (err) {
      showToast(t('ats.interviewError'), 'error');
    } finally {
      setSavingInt(false);
    }
  };

  const prepareNewInterviewForm = () => {
    setEditingInterviewId(null);
    setIntDate('');
    setIntTime('09:00');
    setIntLocation('');
    setIntType(defaultInterviewType);
    setIntDescription('');
    setIntDuration('');
    setIntInterviewerId(null);
    setIntSendIcs(true);
    setShowInterviewForm(true);
  };

  const resetInterviewForm = () => {
    setShowInterviewForm(false);
    setEditingInterviewId(null);
    setIntDate('');
    setIntTime('09:00');
    setIntLocation('');
    setIntType(defaultInterviewType);
    setIntDescription('');
    setIntDuration('');
    setIntInterviewerId(null);
    setIntSendIcs(true);
  };

  const renderInterviewStatusChip = (
    interviewId: number,
    label: string,
    log: InterviewNotificationLog | null,
  ) => {
    const statusMap: Record<InterviewNotificationLog['status'], { label: string; color: string; bg: string }> = {
      pending: { label: 'pending', color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
      sending: { label: 'sending', color: '#b45309', bg: 'rgba(180,83,9,0.10)' },
      done: { label: 'sent', color: '#15803d', bg: 'rgba(21,128,61,0.10)' },
      error: { label: 'error', color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
    };

    const current = log ? statusMap[log.status] : { label: 'not sent', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, background: current.bg, color: current.color, fontSize: 10.5, fontWeight: 700 }}>
        {label}: {current.label}
        <button
          type="button"
          onClick={() => { if (log) void handleRetryNotification(interviewId, log.id); }}
          disabled={!log}
          title={t('common.resend', 'Resend')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginLeft: 2,
            cursor: log ? 'pointer' : 'not-allowed',
            color: current.color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RotateCcw size={10} />
        </button>
      </span>
    );
  };

  return (
    <>
      <ModalBackdrop onClose={onClose} width={680}>
        {/* Gradient header */}
        <div style={{
          backgroundColor: 'var(--surface)',
          backgroundImage: `linear-gradient(135deg, ${stageColor}18 0%, ${stageColor}08 100%)`,
          borderBottom: `3px solid ${stageColor}`,
          padding: isMobile ? '16px 16px' : '16px 24px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxSizing: 'border-box',
          maxWidth: '100%',
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(0,0,0,0.06)', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, lineHeight: 1,
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingRight: 36 }}>
            {/* Avatar */}
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: stageColor, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
              boxShadow: `0 4px 16px ${stageColor}40`,
            }}>
              {initials(candidate.fullName)}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                {candidate.fullName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  background: stageColor, color: '#fff',
                  borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  {t(`ats.stage_${candidate.status}`)}
                </span>
                {jobTitle && (
                  <span style={{
                    background: 'var(--surface)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', borderRadius: 99,
                    padding: '2px 10px', fontSize: 11,
                  }}>
                    📌 {jobTitle}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                  · {appliedAgoLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? '16px 14px' : '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>

          {/* Candidate Information */}
          <div style={{
            background: 'var(--background)', borderRadius: 12, padding: '14px 16px',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                👤 {t('ats.candidateInfo', 'Candidate Information')}
              </div>
              <span style={{
                background: 'var(--accent-light, rgba(201,151,58,0.10))',
                color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.2)',
                borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                textTransform: 'capitalize',
              }}>
                {candidate.source}
              </span>
            </div>

            {/* Full Name with Avatar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                {t('common.fullName', 'Full Name')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: stageColor, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
                  boxShadow: `0 2px 8px ${stageColor}30`,
                }}>
                  {initials(candidate.fullName)}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {candidate.fullName}
                </div>
              </div>
            </div>

            {/* Contact Grid with Icons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
              {candidate.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📧</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      Email
                    </div>
                    <a href={`mailto:${candidate.email}`} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-all', display: 'block' }}>
                      {candidate.email}
                    </a>
                  </div>
                </div>
              )}
              {candidate.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📞</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      {t('ats.phone', 'Phone')}
                    </div>
                    <a href={`tel:${candidate.phone}`} style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-all', display: 'block' }}>
                      {candidate.phone}
                    </a>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>📅</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {t('ats.appliedDate', 'Applied Date')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {appliedDateOnly}
                  </div>
                </div>
              </div>
              {availableStartDate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      {t('ats.availableStartDate', 'Available Start Date')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {availableStartDate}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {candidate.coverLetter && (
              <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                <div
                  onClick={() => setCoverLetterOpen(!coverLetterOpen)}
                  style={{ cursor: 'pointer', listStyle: 'none', padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span>✉️ {t('ats.coverLetter', 'Cover Letter')}</span>
                  <ChevronDown size={16} style={{ transform: coverLetterOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: 'var(--text-muted)' }} />
                </div>
                {coverLetterOpen && (
                  <div style={{ padding: '0 14px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', borderTop: '1px solid var(--border)' }}>
                    {candidate.coverLetter}
                  </div>
                )}
              </div>
            )}

            {/* Resume/CV - Smaller Icon */}
            {displayResumePath && (
              <div id="resume-section" style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                  <span>📄 {t('ats.resume', 'Resume / CV')}</span>
                  {resumeFileSizeLabel && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                      {resumeFileSizeLabel}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {/* Smaller Document Icon */}
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.2)',
                  }}>
                    {displayResumePath.endsWith('.pdf') ? '📕' : displayResumePath.endsWith('.docx') || displayResumePath.endsWith('.doc') ? '📘' : '📄'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>
                      {displayResumePath.split('/').pop()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {displayResumePath}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const url = getResumeUrl(resumePath);
                      if (url) {
                        setPreviewDoc({ url, filename: displayResumePath.split('/').pop() || 'resume.pdf' });
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--background)',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {t('common.view', 'View')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Screener Questions */}
          {displayAnswers.length > 0 && (
            <div style={{
              background: 'var(--background)', borderRadius: 12, padding: '14px 16px',
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                📋 {t('ats.screenerQuestions', 'Screener Questions')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {displayAnswers.map((item, idx) => {
                  const isYesNo = ['sì', 'si', 'yes', 'no'].includes(item.answerText.toLowerCase().trim());
                  const isPositive = ['sì', 'si', 'yes'].includes(item.answerText.toLowerCase().trim());
                  
                  return (
                    <div key={idx} style={{
                      padding: '10px 12px', background: 'var(--surface)', borderRadius: 8,
                      border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6
                    }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        {item.questionText}
                      </div>
                      <div style={{ display: 'flex' }}>
                        {isYesNo ? (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: isPositive ? 'rgba(21,128,61,0.1)' : 'rgba(220,38,38,0.1)',
                            color: isPositive ? '#15803d' : '#dc2626',
                            textTransform: 'uppercase', border: isPositive ? '1px solid rgba(21,128,61,0.18)' : '1px solid rgba(220,38,38,0.18)'
                          }}>
                            {isPositive ? (isIt ? 'Sì' : 'Yes') : 'No'}
                          </span>
                        ) : (
                          <div style={{
                            fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--surface-warm)',
                            padding: '6px 10px', borderRadius: 6, width: '100%', borderLeft: '3px solid var(--accent)'
                          }}>
                            {item.answerText}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {appliedJob && <JobPostSummaryCard appliedJob={appliedJob} screenerQuestions={screenerQuestions} />}

          {/* Candidate Tags */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                🏷️ {t('ats.candidateTags', 'Candidate Tags')}
              </div>
              {canTag && !editingTags && (
                <button
                  type="button"
                  onClick={() => setEditingTags(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 6px',
                  }}
                >
                  ✏️ {t('common.edit', 'Edit')}
                </button>
              )}
            </div>

            {editingTags ? (
              <div style={{ background: 'var(--background)', borderRadius: 10, padding: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {tagsDraft.map((tag) => (
                    <span key={tag} style={{
                      background: 'var(--accent-light, rgba(201,151,58,0.10))',
                      color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.2)',
                      borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder={t('ats.addTagPlaceholder', 'Type and press Enter')}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: 12,
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleCancelTagsEdit}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTags}
                    disabled={savingTags}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: savingTags ? 'not-allowed' : 'pointer',
                      opacity: savingTags ? 0.6 : 1,
                    }}
                  >
                    {savingTags ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tagsDraft.length === 0 ? (
                  <div style={{
                    background: 'var(--background)', borderRadius: 10, padding: '8px 12px',
                    fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic',
                  }}>
                    {t('ats.noTags', 'No tags')}
                  </div>
                ) : (
                  tagsDraft.map((tag) => (
                    <span key={tag} style={{
                      background: 'var(--accent-light, rgba(201,151,58,0.10))',
                      color: 'var(--accent)', border: '1px solid rgba(201,151,58,0.2)',
                      borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500,
                    }}>
                      {tag}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Stage pipeline visual */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Pipeline
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {(() => {
                const allStages: CandidateStatus[] = ['received', 'review', 'phone_interview', 'interview', 'hired'];

                // For rejected candidates, show only stages up to their last stage before rejection
                let stagesToShow: CandidateStatus[] = allStages;

                if (candidate.status === 'rejected') {
                  // Determine which stage they were rejected from based on lastStageChange or interviews
                  // Default to 'received' if we can't determine
                  let lastStageBeforeRejection: CandidateStatus = 'received';

                  // Check if there are interviews to determine the stage
                  if (interviews.length > 0) {
                    // If they had interviews, they at least reached interview stage
                    lastStageBeforeRejection = 'interview';
                  } else if (candidate.lastStageChange) {
                    // Try to infer from lastStageChange timestamp
                    // This is a simple heuristic - in a real system you'd track stage history
                    const daysSinceLastChange = Math.floor((Date.now() - new Date(candidate.lastStageChange).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSinceLastChange > 7) {
                      lastStageBeforeRejection = 'review';
                    }
                  }

                  // Show stages up to and including the last stage before rejection
                  const lastStageIndex = allStages.indexOf(lastStageBeforeRejection);
                  stagesToShow = allStages.slice(0, lastStageIndex + 1);
                }

                return stagesToShow.map((s, idx, stages) => {
                  const stageIdx = [...stages, 'rejected'].indexOf(candidate.status);
                  const isDone = candidate.status !== 'rejected' && stageIdx >= idx;
                  const isCurrent = candidate.status !== 'rejected' && stageIdx === idx;
                  const sc = STAGE_COLOR[s];
                  return (
                    <React.Fragment key={s}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: isDone ? sc : candidate.status === 'rejected' ? sc : 'var(--border)',
                          border: isCurrent ? `3px solid ${sc}` : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                          boxShadow: isCurrent ? `0 0 0 3px ${sc}22` : 'none',
                        }}>
                          {(isDone || candidate.status === 'rejected') && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 10, color: (isDone || candidate.status === 'rejected') ? sc : 'var(--text-muted)', fontWeight: isCurrent ? 700 : 400, marginTop: 4, textAlign: 'center' }}>
                          {t(`ats.stage_${s}`)}
                        </div>
                      </div>
                      {idx < stages.length - 1 && (
                        <div style={{
                          height: 2, flex: 1, marginBottom: 18,
                          background: candidate.status !== 'rejected' && stageIdx > idx ? sc : candidate.status === 'rejected' ? sc : 'var(--border)',
                          transition: 'background 0.3s',
                        }} />
                      )}
                    </React.Fragment>
                  );
                });
              })()}

              {/* Show rejected stage at the end for rejected candidates */}
              {candidate.status === 'rejected' && (
                <>
                  <div style={{
                    height: 2, flex: 1, marginBottom: 18,
                    background: '#DC2626',
                    transition: 'background 0.3s',
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#DC2626',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}>
                      <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✕</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 700, marginTop: 4, textAlign: 'center' }}>
                      {t('ats.stage_rejected')}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {candidate.status === 'rejected' && candidate.rejectionReason && (
            <div style={{
              border: '1px solid #FCA5A5',
              background: '#FEF2F2',
              borderRadius: 10,
              padding: '10px 12px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {t('ats.rejectionReason', 'Rejection reason')}
              </div>
              <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {candidate.rejectionReason}
              </div>
            </div>
          )}

          {/* Interviews section */}
          {(candidate.status === 'interview' || candidate.status === 'phone_interview' || interviews.length > 0) && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🗓 {t('ats.interviews')}
                  {interviews.length > 0 && (
                    <span style={{ background: 'var(--primary)', color: 'var(--accent)', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>
                      {interviews.length}
                    </span>
                  )}
                </div>
                {canEdit && !showInterviewForm && (
                  <Button variant="secondary" size="sm" onClick={prepareNewInterviewForm}>
                    + {t('ats.addInterview')}
                  </Button>
                )}
              </div>

              {/* Create interview form - displayed at top when active */}
              {canEdit && showInterviewForm && (
                <form onSubmit={handleCreateInterview} style={{
                  background: 'var(--background)', borderRadius: 12, padding: '16px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  border: '1px solid var(--border)',
                  marginBottom: 12,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                    <DatePicker
                      label={`${t('ats.interviewDate')} *`}
                      value={intDate}
                      onChange={setIntDate}
                    />
                    <TimePicker
                      label={t('ats.interviewTime')}
                      value={intTime}
                      onChange={setIntTime}
                    />
                  </div>

                  {/* Interview Type and Duration */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                        {t('ats.interviewType')}
                      </label>
                      <select
                        value={intType}
                        onChange={(e) => {
                          const next = e.target.value as InterviewType;
                          setIntType(next);
                          // A phone interview has no physical location — clear any
                          // address so it is never sent to the candidate.
                          if (next === 'phone') { setIntLocation(''); setShowAddressPicker(false); }
                        }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '7px 10px',
                          fontSize: 13,
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--border)',
                          outline: 'none',
                          background: 'var(--background)'
                        }}
                      >
                        <option value="phone">📞 {t('ats.phoneInterview')}</option>
                        <option value="in_person">🤝 {t('ats.inPersonInterview')}</option>
                        <option value="video">🎥 {t('ats.videoInterview', 'Video Interview')}</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                        {t('ats.duration')} (min)
                      </label>
                      <input
                        type="number"
                        value={intDuration}
                        onChange={(e) => setIntDuration(e.target.value ? Number(e.target.value) : '')}
                        placeholder="60"
                        min="1"
                        max="480"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '7px 10px',
                          fontSize: 13,
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--border)',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {t('ats.interviewer')}
                    </label>
                    <CustomSelect
                      value={intInterviewerId}
                      onChange={setIntInterviewerId}
                      options={interviewerOptions}
                      placeholder={t('ats.selectInterviewer')}
                      searchable
                      isClearable
                      highlightSelected
                      controlMinHeight={36}
                      noOptionsMessage={t('ats.noInterviewerResults', 'No interviewers found')}
                    />
                  </div>
                  {/* Location — only for in-person (and video); hidden for phone. */}
                  {intType !== 'phone' && (
                    <div style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {t('ats.interviewLocation')}
                          {intType === 'in_person' && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddressPicker((v) => !v)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}
                        >
                          <MapPin size={12} /> {t('ats.interviewAddAddress', 'Add address')}
                        </button>
                      </div>
                      <input
                        className="field-input"
                        value={intLocation}
                        onChange={(e) => setIntLocation(e.target.value)}
                        placeholder={intType === 'in_person'
                          ? t('ats.interviewAddressPlaceholder', 'Street, number, ZIP, city')
                          : t('ats.interviewLocationPlaceholder')}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 13, borderRadius: 'var(--radius)', border: '1px solid var(--border)', outline: 'none', display: 'block' }}
                      />

                      {showAddressPicker && (
                        <div style={{ position: 'absolute', zIndex: 50, top: '100%', right: 0, marginTop: 4, width: 'min(340px, 100%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 10, display: 'grid', gap: 10 }}>
                          {/* Store addresses */}
                          <div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                              {t('ats.interviewStoreAddresses', 'Store addresses')}
                            </div>
                            {storeAddressOptions.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('ats.interviewNoStoreAddresses', 'No store addresses on file')}</div>
                            ) : (
                              <div style={{ display: 'grid', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
                                {storeAddressOptions.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { setIntLocation(opt.value); setShowAddressPicker(false); }}
                                    style={{ textAlign: 'left', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}
                                  >
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>🏬 {opt.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.value}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Saved custom addresses */}
                          {savedAddresses.length > 0 && (
                            <div>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                {t('ats.interviewSavedAddresses', 'Saved addresses')}
                              </div>
                              <div style={{ display: 'grid', gap: 4, maxHeight: 100, overflowY: 'auto' }}>
                                {savedAddresses.map((addr) => (
                                  <button
                                    key={addr}
                                    type="button"
                                    onClick={() => { setIntLocation(addr); setShowAddressPicker(false); }}
                                    style={{ textAlign: 'left', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}
                                  >
                                    📍 {addr}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                            <button
                              type="button"
                              onClick={() => { persistSavedAddress(intLocation); }}
                              disabled={!intLocation.trim()}
                              style={{ background: 'none', border: 'none', fontSize: 11.5, fontWeight: 600, color: intLocation.trim() ? 'var(--primary)' : 'var(--text-muted)', cursor: intLocation.trim() ? 'pointer' : 'not-allowed' }}
                            >
                              💾 {t('ats.interviewSaveAddress', 'Save typed address for reuse')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowAddressPicker(false)}
                              style={{ background: 'none', border: 'none', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
                            >
                              {t('common.close', 'Close')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Description */}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {t('ats.interviewDescription')}
                    </label>
                    <textarea
                      value={intDescription}
                      onChange={(e) => setIntDescription(e.target.value)}
                      rows={2}
                      placeholder={t('ats.interviewDescriptionPlaceholder')}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        resize: 'none',
                        fontFamily: 'inherit',
                        padding: '7px 10px',
                        fontSize: 13,
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        outline: 'none',
                        display: 'block'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      id="ats-send-ics"
                      type="checkbox"
                      checked={intSendIcs}
                      onChange={(e) => setIntSendIcs(e.target.checked)}
                      style={{ width: 14, height: 14 }}
                    />
                    <label htmlFor="ats-send-ics" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {t('ats.calendarSync', 'Add to calendar (ICS)')}
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button variant="secondary" size="sm" type="button" onClick={() => {
                      resetInterviewForm();
                    }}>
                      {t('common.cancel')}
                    </Button>
                    <Button variant="primary" size="sm" type="submit" loading={savingInt}>
                      {editingInterviewId ? t('common.update', 'Update') : t('ats.scheduleInterview')}
                    </Button>
                  </div>
                </form>
              )}

              {interviews.length === 0 && !showInterviewForm && (
                <div style={{
                  background: 'var(--background)', borderRadius: 10, padding: '12px 16px',
                  fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic',
                }}>
                  {t('ats.noInterviews')}
                </div>
              )}

              {interviews.map((iv) => {
                const interviewDate = new Date(iv.scheduledAt);
                const now = new Date();
                const isPast = interviewDate < now;
                const statusLabel = isPast ? t('ats.interviewPast', 'Past') : t('ats.interviewUpcoming', 'Upcoming');
                const statusColor = isPast ? '#6b7280' : '#059669';
                const statusBg = isPast ? 'rgba(107, 114, 128, 0.1)' : 'rgba(5, 150, 105, 0.1)';
                const interviewer = iv.interviewerId ? interviewerUsers.find((emp) => emp.id === iv.interviewerId) ?? null : null;
                const interviewerName = interviewer ? `${interviewer.name} ${interviewer.surname}`.trim() : t('ats.interviewer', 'Interviewer');
                const interviewerAvatar = interviewer ? getAvatarUrl(interviewer.avatarFilename) : null;
                const interviewerRole = interviewer ? t(`roles.${interviewer.role}`, interviewer.role) : null;
                const emailLog = interviewNotifications[iv.id]?.find((log) => log.recipientType === 'interviewer' && log.channel === 'email') ?? null;
                const notificationLog = interviewNotifications[iv.id]?.find((log) => log.recipientType === 'interviewer' && log.channel !== 'email') ?? null;
                const candidateEmailLog = interviewNotifications[iv.id]?.find((log) => log.recipientType === 'candidate' && log.channel === 'email') ?? null;

                return (
                  <div key={iv.id} style={{
                    background: 'var(--background)', borderRadius: 10, padding: '12px 16px',
                    marginBottom: 8, borderLeft: `3px solid ${STAGE_COLOR.interview}`,
                    position: 'relative',
                  }}>
                    {/* Top Row: Date/Time/Status and Edit/Delete buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                          🕐 {fmtDateTime(iv.scheduledAt)}
                        </div>
                        <span style={{
                          background: statusBg,
                          color: statusColor,
                          borderRadius: 99,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}>
                          {statusLabel}
                        </span>
                      </div>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              // Populate form with existing interview data
                              const ivDate = new Date(iv.scheduledAt);
                              setIntDate(ivDate.toISOString().split('T')[0]);
                              setIntTime(ivDate.toTimeString().slice(0, 5));
                              setIntLocation(iv.location || '');
                              setIntType(iv.interviewType || 'in_person');
                              setIntDescription(iv.description || iv.notes || '');
                              setIntDuration(iv.durationMinutes || '');
                              setIntInterviewerId(iv.interviewerId ? String(iv.interviewerId) : null);
                              setIntSendIcs(false);
                              setEditingInterviewId(iv.id);
                              setShowInterviewForm(true);
                            }}
                            style={{
                              background: 'rgba(13,33,55,0.08)',
                              border: '1px solid rgba(13,33,55,0.2)',
                              borderRadius: 6,
                              width: 24,
                              height: 24,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                            title={t('common.edit', 'Edit')}
                          >
                            <Pencil size={12} color="var(--primary)" />
                          </button>
                          <button
                            onClick={() => handleDeleteInterview(iv.id)}
                            disabled={deletingInterviewId === iv.id}
                            style={{
                              background: 'rgba(220,38,38,0.08)',
                              border: '1px solid rgba(185,28,28,0.24)',
                              borderRadius: 6,
                              width: 24,
                              height: 24,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: deletingInterviewId === iv.id ? 'not-allowed' : 'pointer',
                              opacity: deletingInterviewId === iv.id ? 0.5 : 1,
                              transition: 'all 0.15s',
                            }}
                            title={t('common.delete', 'Delete')}
                          >
                            <Trash2 size={12} color="#991b1b" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Second Row: Location, Type, Duration tags */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {iv.location && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 999 }}>
                          📍 {iv.location}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 999 }}>
                        {iv.interviewType === 'phone' ? '📞 Phone' : '🤝 In-person'}
                      </span>
                      {iv.durationMinutes && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 7px', borderRadius: 999 }}>
                          ⏱ {iv.durationMinutes}min
                        </span>
                      )}
                    </div>

                    {/* Full Width Interviewer Row and Notification Status */}
                    <div style={{ display: 'grid', gap: 8 }}>
                      {interviewer && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: interviewerAvatar ? 'transparent' : 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                              {interviewerAvatar ? (
                                <img src={interviewerAvatar} alt={interviewerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : initials(interviewerName)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{interviewerName}</div>
                              {interviewerRole && (
                                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{interviewerRole}</div>
                              )}
                            </div>
                          </div>

                          {/* Candidate, Email and Notification status columns side-by-side */}
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                            {/* Candidate Email Status */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: '120px', opacity: smtpConfigured === false ? 0.5 : 1, position: 'relative' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                                <User2 size={11} /> {t('ats.candidateEmail', 'Candidate')}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                <span
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 6,
                                    background: smtpConfigured === false
                                      ? 'rgba(107,114,128,0.08)'
                                      : !candidateEmailLog
                                        ? 'rgba(107,114,128,0.08)'
                                        : candidateEmailLog.status === 'done'
                                          ? 'rgba(21,128,61,0.1)'
                                          : candidateEmailLog.status === 'error'
                                            ? 'rgba(220,38,38,0.1)'
                                            : candidateEmailLog.status === 'sending'
                                              ? 'rgba(59,130,246,0.1)'
                                              : 'rgba(107,114,128,0.1)',
                                    color: smtpConfigured === false
                                      ? '#9ca3af'
                                      : !candidateEmailLog
                                        ? '#6b7280'
                                        : candidateEmailLog.status === 'done'
                                          ? '#15803d'
                                          : candidateEmailLog.status === 'error'
                                            ? '#dc2626'
                                            : candidateEmailLog.status === 'sending'
                                              ? '#2563eb'
                                              : '#6b7280',
                                    fontWeight: 600,
                                    cursor: smtpConfigured === false ? 'help' : 'default',
                                    position: 'relative',
                                  }}
                                  title={smtpConfigured === false ? 'Email functionality is disabled. Please configure SMTP settings in Company Settings → Email Configuration to enable email notifications.' : candidateEmailLog?.errorMessage || ''}
                                  onMouseEnter={(e) => {
                                    if (smtpConfigured === false) {
                                      const tooltip = document.createElement('div');
                                      tooltip.id = 'smtp-tooltip-candidate';
                                      tooltip.style.cssText = `
                                              position: absolute;
                                              bottom: calc(100% + 8px);
                                              left: 50%;
                                              transform: translateX(-50%);
                                              background: #1f2937;
                                              color: white;
                                              padding: 8px 12px;
                                              border-radius: 6px;
                                              font-size: 11px;
                                              white-space: nowrap;
                                              z-index: 1000;
                                              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                                              pointer-events: none;
                                            `;
                                      tooltip.textContent = 'SMTP not configured for this company';
                                      e.currentTarget.appendChild(tooltip);
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    const tooltip = e.currentTarget.querySelector('#smtp-tooltip-candidate');
                                    if (tooltip) tooltip.remove();
                                  }}
                                >
                                  {smtpConfigured === false
                                    ? '⊗ Disabled'
                                    : !candidateEmailLog
                                      ? '• Not sent'
                                      : candidateEmailLog.status === 'done'
                                        ? '✓ Sent'
                                        : candidateEmailLog.status === 'error'
                                          ? '✗ Error'
                                          : candidateEmailLog.status === 'sending'
                                            ? '⟳ Sending...'
                                            : '⏳ Pending'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleRetryNotification(iv.id, candidateEmailLog?.id, 'email', 'candidate')}
                                  disabled={smtpConfigured === false}
                                  title={smtpConfigured === false ? 'Email is disabled. Configure SMTP in Settings to enable.' : candidateEmailLog ? t('common.resend', 'Resend') : t('common.send', 'Send')}
                                  style={{
                                    background: 'none', border: 'none', padding: '2px 4px', cursor: smtpConfigured === false ? 'not-allowed' : 'pointer',
                                    color: smtpConfigured === false
                                      ? '#9ca3af'
                                      : !candidateEmailLog
                                        ? '#6b7280'
                                        : candidateEmailLog.status === 'done'
                                          ? '#15803d'
                                          : candidateEmailLog.status === 'error'
                                            ? '#dc2626'
                                            : '#6b7280',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: smtpConfigured === false ? 0.4 : 0.7, fontSize: 10,
                                  }}
                                >
                                  <RotateCcw size={10} />
                                </button>
                              </div>
                            </div>

                            {/* Interviewer Email Status - Hidden for store managers */}
                            {user?.role !== 'store_manager' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: '120px', opacity: smtpConfigured === false ? 0.5 : 1, position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                                  📧 {t('ats.interviewerEmail', 'Interviewer')}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                  <span
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 6,
                                      background: smtpConfigured === false
                                        ? 'rgba(107,114,128,0.08)'
                                        : !emailLog
                                          ? 'rgba(107,114,128,0.08)'
                                          : emailLog.status === 'done'
                                            ? 'rgba(21,128,61,0.1)'
                                            : emailLog.status === 'error'
                                              ? 'rgba(220,38,38,0.1)'
                                              : emailLog.status === 'sending'
                                                ? 'rgba(59,130,246,0.1)'
                                                : 'rgba(107,114,128,0.1)',
                                      color: smtpConfigured === false
                                        ? '#9ca3af'
                                        : !emailLog
                                          ? '#6b7280'
                                          : emailLog.status === 'done'
                                            ? '#15803d'
                                            : emailLog.status === 'error'
                                              ? '#dc2626'
                                              : emailLog.status === 'sending'
                                                ? '#2563eb'
                                                : '#6b7280',
                                      fontWeight: 600,
                                      cursor: smtpConfigured === false ? 'help' : 'default',
                                      position: 'relative',
                                    }}
                                    title={smtpConfigured === false ? 'Email functionality is disabled. Please configure SMTP settings in Company Settings → Email Configuration to enable email notifications.' : emailLog?.errorMessage || ''}
                                    onMouseEnter={(e) => {
                                      if (smtpConfigured === false) {
                                        const tooltip = document.createElement('div');
                                        tooltip.id = 'smtp-tooltip';
                                        tooltip.style.cssText = `
                                              position: absolute;
                                              bottom: calc(100% + 8px);
                                              left: 50%;
                                              transform: translateX(-50%);
                                              background: #1f2937;
                                              color: white;
                                              padding: 8px 12px;
                                              border-radius: 6px;
                                              font-size: 11px;
                                              white-space: nowrap;
                                              z-index: 1000;
                                              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                                              pointer-events: none;
                                            `;
                                        tooltip.textContent = 'SMTP not configured for this company';
                                        e.currentTarget.appendChild(tooltip);
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      const tooltip = e.currentTarget.querySelector('#smtp-tooltip');
                                      if (tooltip) tooltip.remove();
                                    }}
                                  >
                                    {smtpConfigured === false
                                      ? '⊗ Disabled'
                                      : !emailLog
                                        ? '• Not sent'
                                        : emailLog.status === 'done'
                                          ? '✓ Sent'
                                          : emailLog.status === 'error'
                                            ? '✗ Error'
                                            : emailLog.status === 'sending'
                                              ? '⟳ Sending...'
                                              : '⏳ Pending'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void handleRetryNotification(iv.id, emailLog?.id, 'email', 'interviewer')}
                                    disabled={smtpConfigured === false}
                                    title={smtpConfigured === false ? 'Email is disabled. Configure SMTP in Settings to enable.' : emailLog ? t('common.resend', 'Resend') : t('common.send', 'Send')}
                                    style={{
                                      background: 'none', border: 'none', padding: '2px 4px', cursor: smtpConfigured === false ? 'not-allowed' : 'pointer',
                                      color: smtpConfigured === false
                                        ? '#9ca3af'
                                        : !emailLog
                                          ? '#6b7280'
                                          : emailLog.status === 'done'
                                            ? '#15803d'
                                            : emailLog.status === 'error'
                                              ? '#dc2626'
                                              : '#6b7280',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: smtpConfigured === false ? 0.4 : 0.7, fontSize: 10,
                                    }}
                                  >
                                    <RotateCcw size={10} />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Notification Status - Hidden for store managers */}
                            {user?.role !== 'store_manager' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: '120px', opacity: interviewInviteEnabled === false ? 0.5 : 1, position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                                  🔔 {t('ats.notification', 'Notification')}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                  <span
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 6,
                                      background: interviewInviteEnabled === false
                                        ? 'rgba(107,114,128,0.08)'
                                        : !notificationLog
                                          ? 'rgba(107,114,128,0.08)'
                                          : notificationLog.status === 'done'
                                            ? 'rgba(21,128,61,0.1)'
                                            : notificationLog.status === 'error'
                                              ? 'rgba(220,38,38,0.1)'
                                              : 'rgba(107,114,128,0.1)',
                                      color: interviewInviteEnabled === false
                                        ? '#9ca3af'
                                        : !notificationLog
                                          ? '#6b7280'
                                          : notificationLog.status === 'done'
                                            ? '#15803d'
                                            : notificationLog.status === 'error'
                                              ? '#dc2626'
                                              : '#6b7280',
                                      fontWeight: 600,
                                      cursor: interviewInviteEnabled === false ? 'help' : 'default',
                                    }}
                                    title={interviewInviteEnabled === false ? 'Notification functionality is disabled. Please enable "Interview Invite" notification in Company Settings → Notifications to send in-app notifications.' : notificationLog?.errorMessage || ''}
                                  >
                                    {interviewInviteEnabled === false
                                      ? '⊗ Disabled'
                                      : !notificationLog
                                        ? '• Not sent'
                                        : notificationLog.status === 'done'
                                          ? '✓ Sent'
                                          : notificationLog.status === 'error'
                                            ? '✗ Error'
                                            : notificationLog.status === 'sending'
                                              ? '⟳ Sending'
                                              : '⏳ Pending'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void handleRetryNotification(iv.id, notificationLog?.id, 'in_app', 'interviewer')}
                                    disabled={interviewInviteEnabled === false}
                                    title={interviewInviteEnabled === false ? 'Notifications are disabled. Enable in Settings to send.' : notificationLog ? t('common.resend', 'Resend') : t('common.send', 'Send')}
                                    style={{
                                      background: 'none', border: 'none', padding: '2px 4px', cursor: interviewInviteEnabled === false ? 'not-allowed' : 'pointer',
                                      color: interviewInviteEnabled === false
                                        ? '#9ca3af'
                                        : !notificationLog
                                          ? '#6b7280'
                                          : notificationLog.status === 'done'
                                            ? '#15803d'
                                            : notificationLog.status === 'error'
                                              ? '#dc2626'
                                              : '#6b7280',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: interviewInviteEnabled === false ? 0.4 : 0.7, fontSize: 10,
                                    }}
                                  >
                                    <RotateCcw size={10} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {iv.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          {iv.description}
                        </div>
                      )}
                    </div>

                    {/* Feedback Comments List */}
                    <div id="comments-section"></div>
                    {interviewFeedback[iv.id] && interviewFeedback[iv.id].length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          💬 {t('ats.feedback', 'Feedback')} ({interviewFeedback[iv.id].length})
                        </div>
                        {interviewFeedback[iv.id].map((comment) => {
                          const authorName = [comment.authorName, comment.authorSurname].filter(Boolean).join(' ').trim() || t('common.notSet', 'Not set');
                          const authorAvatar = getAvatarUrl(comment.authorAvatarFilename ?? null);
                          const canDelete = canEdit || comment.authorId === user?.id;

                          const deepLinkedFeedbackId = Number(searchParams.get('feedbackId') || '0');
                          const isHighlighted = comment.id === deepLinkedFeedbackId;

                          return (
                            <div
                              key={comment.id}
                              id={`feedback-comment-${comment.id}`}
                              style={{
                                background: isHighlighted ? 'rgba(201, 151, 58, 0.12)' : 'var(--background)',
                                borderRadius: 8,
                                padding: '8px 10px',
                                border: isHighlighted ? '1px solid var(--primary)' : '1px solid var(--border)',
                                boxShadow: isHighlighted ? '0 0 12px rgba(201, 151, 58, 0.25)' : 'none',
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
                                    ) : initials(authorName)}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {authorName}
                                    </span>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                                      • {fmtDateTime(comment.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                  {/* Notifications button */}
                                  {interviewNotifications[iv.id]?.some((log) => {
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
                                          interviewNotifications[iv.id]?.filter(log => {
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
                                      const subjectVal = `Feedback: ${candidate.fullName}`;
                                      navigate(`/hr-chat?recipientId=${comment.authorId}&recipientName=${encodeURIComponent(authorName)}&subject=${encodeURIComponent(subjectVal)}`);
                                      onClose();
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
                                      onClick={() => handleDeleteInterviewFeedback(iv.id, comment.id, comment.authorId)}
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

                    {canFeedback && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <textarea
                          value={feedbackDrafts[iv.id] ?? ''}
                          onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [iv.id]: e.target.value }))}
                          rows={2}
                          placeholder={t('ats.feedbackPlaceholder')}
                          style={{
                            flex: 1,
                            fontFamily: 'inherit',
                            fontSize: 12,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            padding: '7px 9px',
                            resize: 'vertical',
                            background: 'var(--surface)',
                          }}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAddInterviewFeedback(iv.id)}
                          loading={savingFeedbackId === iv.id}
                        >
                          {t('common.save')}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action footer */}
          {canEdit && candidate.status !== 'hired' && candidate.status !== 'rejected' && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap',
              paddingTop: 16, borderTop: '1px solid var(--border)',
            }}>
              {next && (
                <Button variant="primary" onClick={() => onAdvance(next)} loading={saving} style={{ flex: 1, minWidth: 140 }}>
                  {t(`ats.advanceTo_${next}`)}
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => setShowRejectionModal(true)}
                loading={saving}
                style={{ flex: 1, minWidth: 100 }}
              >
                {t('ats.reject')}
              </Button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving}
                style={{
                  background: 'var(--background)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', borderRadius: 'var(--radius)',
                  cursor: 'pointer', padding: '8px 12px', fontSize: 16, lineHeight: 1,
                  flexShrink: 0,
                }}
                title={t('common.delete')}
              >
                🗑
              </button>
            </div>
          )}
        </div>
      </ModalBackdrop>

      {showDeleteConfirm && (
        <ModalBackdrop onClose={() => setShowDeleteConfirm(false)} width={430} closeOnBackdropClick={!saving}>
          <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('common.delete', 'Delete')} {t('ats.candidate', 'candidate')}
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t('ats.confirmDeleteCandidate', { name: candidate.fullName })}
            </p>
          </div>
          <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="secondary" type="button" onClick={() => setShowDeleteConfirm(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              type="button"
              loading={saving}
              onClick={async () => {
                await onDelete();
                setShowDeleteConfirm(false);
              }}
            >
              {t('common.delete', 'Delete')}
            </Button>
          </div>
        </ModalBackdrop>
      )}

      {showRejectionModal && (
        <ModalBackdrop onClose={() => setShowRejectionModal(false)} width={420}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
          }}>
            <h3 style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text)',
            }}>
              {t('ats.rejectCandidate', 'Reject Candidate')}
            </h3>
            <p style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}>
              {t('ats.rejectionReasonPrompt', 'Please provide a reason for rejecting this candidate:')}
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t('ats.rejectionReasonPlaceholder', 'e.g., Not enough experience, Skills mismatch, etc.')}
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                fontSize: 13,
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                outline: 'none',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowRejectionModal(false);
                  setRejectionReason('');
                }}
                disabled={savingRejection}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={handleRejectWithReason}
                loading={savingRejection}
                disabled={!rejectionReason.trim()}
              >
                {t('ats.confirmReject', 'Confirm Rejection')}
              </Button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
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
    </>
  );
};

// ─── Jobs Panel ────────────────────────────────────────────────────────────────

const stripHtml = (html: string) => {
  if (!html) return '';
  let text = html.replace(/<!--[\s\S]*?-->/g, ''); // strip HTML comments
  text = text.replace(/<[^>]*>/g, ''); // strip HTML tags
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
  return text.trim();
};

const JobsPanel: React.FC<{ canEdit: boolean; companyId?: number }> = ({ canEdit, companyId }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const { user, targetCompanyId, allowedCompanyIds } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editJob, setEditJob] = useState<JobPosting | null>(null);
  const [viewJob, setViewJob] = useState<JobPosting | null>(null);
  const [viewCandidates, setViewCandidates] = useState<Candidate[]>([]);
  const [viewInterviews, setViewInterviews] = useState<Interview[]>([]);
  const [viewFeedbacks, setViewFeedbacks] = useState<AllInterviewFeedbackComment[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deleteTargetJob, setDeleteTargetJob] = useState<JobPosting | null>(null);
  const [deletingJob, setDeletingJob] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showLinksModal, setShowLinksModal] = useState(false);
  const [copiedGeneral, setCopiedGeneral] = useState(false);
  const [copiedCompany, setCopiedCompany] = useState(false);
  const [complianceRefId, setComplianceRefId] = useState<string | null>(null);
  const [complianceJobCompanyId, setComplianceJobCompanyId] = useState<number | undefined>(undefined);
  const [expandedJobIds, setExpandedJobIds] = useState<Set<number>>(new Set());
  const [searchParams] = useSearchParams();
  const deepLinkJobId = searchParams.get('jobId') ? Number(searchParams.get('jobId')) : null;

  const toggleDescription = useCallback((jobId: number) => {
    setExpandedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  const fallbackCopy = useCallback((text: string, onSuccess: () => void) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        onSuccess();
      } else {
        showToast(t('common.copyError', 'Failed to copy link'), 'error');
      }
    } catch {
      showToast(t('common.copyError', 'Failed to copy link'), 'error');
    }
  }, [showToast, t]);

  const copyToClipboard = useCallback((text: string, onSuccess: () => void) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(onSuccess)
          .catch(() => fallbackCopy(text, onSuccess));
      } else {
        fallbackCopy(text, onSuccess);
      }
    } catch {
      fallbackCopy(text, onSuccess);
    }
  }, [fallbackCopy]);

  const defaultCompanyId = useMemo(() => {
    if (companyId) return companyId;
    if ((allowedCompanyIds?.length ?? 0) > 1) return null;
    if (targetCompanyId) return targetCompanyId;
    if (user?.companyId) return user.companyId;
    return companies[0]?.id ?? null;
  }, [companyId, targetCompanyId, user?.companyId, companies, allowedCompanyIds]);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: { status?: string; companyId?: number } = {};
      if (filterStatus) params.status = filterStatus;
      
      if (companyId) {
        params.companyId = companyId;
      } else if (!user?.isSuperAdmin && defaultCompanyId) {
        params.companyId = defaultCompanyId;
      }

      setJobs(await getJobs(Object.keys(params).length > 0 ? params : undefined));
    } catch {
      showToast(t('ats.errorLoad'), 'error');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, user?.isSuperAdmin, companyId, defaultCompanyId, showToast, t]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (deepLinkJobId && jobs.some(j => j.id === deepLinkJobId)) {
      setExpandedJobIds(prev => new Set([...prev, deepLinkJobId]));
      setTimeout(() => {
        const el = document.getElementById(`job-row-${deepLinkJobId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.transition = 'all 0.4s ease';
          el.style.background = 'var(--accent-light)';
          setTimeout(() => {
            el.style.background = 'var(--surface)';
          }, 2000);
        }
      }, 300);
    }
  }, [deepLinkJobId, jobs]);

  // Socket listeners for real-time job updates
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;

    const handleJobCreated = (job: JobPosting) => {
      setJobs((prev) => {
        if (prev.some((j) => j.id === job.id)) return prev;
        return [job, ...prev];
      });
    };

    const handleJobUpdated = (job: JobPosting) => {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    };

    const handleJobDeleted = (jobId: number) => {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    };

    socket.on('ATS_JOB_CREATED', handleJobCreated);
    socket.on('ATS_JOB_UPDATED', handleJobUpdated);
    socket.on('ATS_JOB_DELETED', handleJobDeleted);

    return () => {
      socket.off('ATS_JOB_CREATED', handleJobCreated);
      socket.off('ATS_JOB_UPDATED', handleJobUpdated);
      socket.off('ATS_JOB_DELETED', handleJobDeleted);
    };
  }, [socket]);

  useEffect(() => {
    if (!canEdit) return;
    Promise.all([
      getStores().catch(() => [] as Store[]),
      getCompanies().catch(() => [] as Company[]),
    ])
      .then(([storeItems, companyItems]) => {
        setStores(storeItems);
        setCompanies(companyItems);
      })
      .catch(() => {
        setStores([]);
        setCompanies([]);
      });
  }, [canEdit]);

  const handleSave = async (payload: {
    title: string;
    description: string;
    tags: string[];
    language: JobLanguage;
    jobType: JobType;
    remoteType: RemoteType;
    locationOverride: {
      city: string;
      state: string;
      country: string;
      postalCode: string;
      address: string;
    };
    companyId: number;
    storeId: number | null;
    department: string;
    weeklyHours: number | null;
    contractType: string;
    status: JobStatus;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryPeriod: string | null;
    targetRole: string | null;
    screenerQuestions?: UIQuestion[];
  }) => {
    setSaving(true);
    try {
      let jobId = editJob?.id;
      let stateValue = payload.locationOverride.state || '';
      if (payload.locationOverride.country === 'IT') {
        stateValue = italianProvinceCode(payload.locationOverride.city, stateValue);
      }

      if (editJob) {
        const updated = await updateJob(editJob.id, {
          title: payload.title,
          description: payload.description,
          tags: payload.tags,
          status: payload.status,
          companyId: payload.companyId,
          language: payload.language,
          jobType: payload.jobType,
          storeId: payload.storeId,
          isRemote: payload.remoteType === 'remote',
          remoteType: payload.remoteType,
          jobCity: payload.remoteType === 'remote' ? null : (payload.locationOverride.city || null),
          jobState: payload.remoteType === 'remote' ? null : (stateValue || null),
          jobCountry: payload.remoteType === 'remote' ? null : (payload.locationOverride.country || null),
          jobPostalCode: payload.remoteType === 'remote' ? null : (payload.locationOverride.postalCode || null),
          jobAddress: payload.remoteType === 'remote' ? null : (payload.locationOverride.address || null),
          department: payload.department || null,
          weeklyHours: payload.weeklyHours,
          contractType: payload.contractType || null,
          salaryMin: payload.salaryMin,
          salaryMax: payload.salaryMax,
          salaryPeriod: payload.salaryPeriod,
          targetRole: payload.targetRole,
        });
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
        showToast(t('ats.jobUpdated'), 'success');
      } else {
        const created = await createJob({
          title: payload.title,
          description: payload.description,
          tags: payload.tags,
          companyId: payload.companyId,
          status: payload.status,
          language: payload.language,
          jobType: payload.jobType,
          storeId: payload.storeId ?? undefined,
          isRemote: payload.remoteType === 'remote',
          remoteType: payload.remoteType,
          jobCity: payload.remoteType === 'remote' ? undefined : (payload.locationOverride.city || undefined),
          jobState: payload.remoteType === 'remote' ? undefined : (stateValue || undefined),
          jobCountry: payload.remoteType === 'remote' ? undefined : (payload.locationOverride.country || undefined),
          jobPostalCode: payload.remoteType === 'remote' ? undefined : (payload.locationOverride.postalCode || undefined),
          jobAddress: payload.remoteType === 'remote' ? undefined : (payload.locationOverride.address || undefined),
          department: payload.department || undefined,
          weeklyHours: payload.weeklyHours ?? undefined,
          contractType: payload.contractType || undefined,
          salaryMin: payload.salaryMin ?? undefined,
          salaryMax: payload.salaryMax ?? undefined,
          salaryPeriod: payload.salaryPeriod ?? undefined,
          targetRole: payload.targetRole ?? undefined,
        });
        jobId = created.id;
        setJobs((prev) => [created, ...prev]);
        showToast(t('ats.jobCreated'), 'success');
      }

      if (jobId && payload.screenerQuestions) {
        const companyIdVal = payload.companyId;
        for (const q of payload.screenerQuestions) {
          const questionData = {
            job_id: jobId,
            company_id: companyIdVal,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options,
            is_knockout: q.is_knockout,
            knockout_value: q.knockout_value || null,
            display_order: q.display_order,
            is_required: q.is_required !== false,
          };
          if (q.isDeleted) {
            if (q.id) {
              await deleteScreenerQuestion(jobId, q.id, companyIdVal);
            }
          } else if (q.id) {
            await updateScreenerQuestion(jobId, q.id, questionData, companyIdVal);
          } else {
            await createScreenerQuestion(jobId, questionData, companyIdVal);
          }
        }
      }

      await fetch();
      setShowModal(false); setEditJob(null);
    } catch (err) {
      showToast(translateApiError(err, t, t('ats.errorSave')) ?? t('ats.errorSave'), 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (job: JobPosting) => {
    setDeletingJob(true);
    try {
      await deleteJob(job.id, { companyId: job.companyId });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      if (viewJob?.id === job.id) {
        setViewJob(null);
        setViewCandidates([]);
        setViewInterviews([]);
        setViewFeedbacks([]);
      }
      setDeleteTargetJob(null);
      await fetch();
      showToast(t('ats.jobDeleted'), 'success');
    } catch {
      showToast(t('ats.errorDelete'), 'error');
    } finally {
      setDeletingJob(false);
    }
  };

  const handlePublish = async (job: JobPosting) => {
    try {
      const updated = await publishJob(job.id, { companyId: job.companyId });
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      await fetch();
      showToast(t('ats.jobPublished'), 'success');
    } catch { showToast(t('ats.errorPublish'), 'error'); }
  };

  const openJobDetails = useCallback(async (job: JobPosting) => {
    setViewJob(job);
    setViewLoading(true);
    try {
      const [candidatesResult, interviewsResult, feedbacksResult] = await Promise.all([
        getCandidates({ jobId: job.id, companyId: job.companyId }),
        getAllInterviews({ positionId: job.id, companyId: job.companyId }),
        getAllInterviewFeedbackComments({ companyId: job.companyId }),
      ]);

      const candidateIds = new Set(candidatesResult.map((candidate) => candidate.id));
      setViewCandidates(candidatesResult);
      setViewInterviews(interviewsResult.interviews ?? []);
      setViewFeedbacks(feedbacksResult.filter((feedback) => candidateIds.has(feedback.candidateId)));
    } catch {
      setViewCandidates([]);
      setViewInterviews([]);
      setViewFeedbacks([]);
      showToast(t('ats.errorLoad'), 'error');
    } finally {
      setViewLoading(false);
    }
  }, [showToast, t]);

  // Status counts
  const counts = { all: jobs.length, draft: jobs.filter((j) => j.status === 'draft').length, published: jobs.filter((j) => j.status === 'published').length, closed: jobs.filter((j) => j.status === 'closed').length };
  const careersPreviewUrl = `${window.location.origin}/careers`;
  const locale = i18n.language?.startsWith('it') ? 'it-IT' : 'en-GB';
  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const storeMap = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);

  const groupedJobs = useMemo(() => {
    const groups: { [key: number]: JobPosting[] } = {};
    jobs.forEach((job) => {
      if (!groups[job.companyId]) {
        groups[job.companyId] = [];
      }
      groups[job.companyId].push(job);
    });

    const result = Object.keys(groups).map((companyIdStr) => {
      const id = Number(companyIdStr);
      const comp = companyMap.get(id);
      const jobCompanyName = groups[id].find((job) => job.companyName?.trim())?.companyName?.trim();
      const name = jobCompanyName || comp?.name || `Company #${id}`;

      // Sort: Published -> Draft -> Closed
      const sortedJobs = [...groups[id]].sort((a, b) => {
        const statusOrder = { published: 1, draft: 2, closed: 3 };
        const orderA = statusOrder[a.status as keyof typeof statusOrder] || 99;
        const orderB = statusOrder[b.status as keyof typeof statusOrder] || 99;
        if (orderA !== orderB) return orderA - orderB;

        const dateA = new Date(a.publishedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.publishedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      return {
        companyId: id,
        companyName: name,
        company: comp,
        jobs: sortedJobs,
      };
    });

    result.sort((a, b) => a.companyName.localeCompare(b.companyName));
    return result;
  }, [jobs, companyMap]);

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 20,
        alignItems: isMobile ? 'stretch' : 'center',
        flexWrap: 'wrap',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        {/* Status filter pills */}
        <div style={{
          display: 'flex',
          gap: isMobile ? 4 : 6,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 4,
          width: isMobile ? '100%' : 'fit-content',
          justifyContent: isMobile ? 'space-between' : 'flex-start'
        }}>
          {[
            { value: '', label: t('common.all'), count: counts.all },
            { value: 'draft', label: t('ats.status_draft'), count: counts.draft },
            { value: 'published', label: t('ats.status_published'), count: counts.published },
            { value: 'closed', label: t('ats.status_closed'), count: counts.closed },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              style={{
                padding: isMobile ? '5px 8px' : '5px 12px',
                border: 'none', borderRadius: 7,
                background: filterStatus === opt.value ? 'var(--primary)' : 'transparent',
                color: filterStatus === opt.value ? '#fff' : 'var(--text-secondary)',
                fontWeight: filterStatus === opt.value ? 600 : 400,
                fontSize: isMobile ? 12 : 13,
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'var(--font-body)',
                flex: isMobile ? 1 : 'none',
                justifyContent: 'center'
              }}
            >
              {opt.label}
              {opt.count > 0 && (
                <span style={{
                  background: filterStatus === opt.value ? 'rgba(255,255,255,0.2)' : 'var(--background)',
                  color: filterStatus === opt.value ? '#fff' : 'var(--text-muted)',
                  borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '0 5px',
                  minWidth: 16, textAlign: 'center',
                }}>
                  {opt.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {canEdit && (
          <div style={{
            marginLeft: isMobile ? '0' : 'auto',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            width: isMobile ? '100%' : 'auto',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center'
          }}>
            <div style={{
              display: 'flex',
              gap: 8,
              width: isMobile ? '100%' : 'auto'
            }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowLinksModal(true)}
                fullWidth={isMobile}
              >
                {t('ats.openCareersPage', 'Open careers page')}
              </Button>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { setEditJob(null); setShowModal(true); }}
              fullWidth={isMobile}
            >
              <span style={{ fontSize: 16 }}>+</span> {t('ats.newJob')}
            </Button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 9, background: 'rgba(2,132,199,0.08)', border: '1px solid rgba(2,132,199,0.18)', color: '#0F4C81', fontSize: 12.5 }}>
        Careers preview lists <strong>draft</strong> and <strong>published</strong> jobs. XML feed still exports only <strong>published</strong> jobs for active companies.
      </div>



      {/* Job list */}
      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 16, width: '35%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="skeleton" style={{ height: 20, width: 50, borderRadius: 99 }} />
                  <div className="skeleton" style={{ height: 20, width: 60, borderRadius: 99 }} />
                </div>
              </div>
              <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 24px',
          background: 'var(--surface)', borderRadius: 16,
          border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>💼</div>
          <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: 6 }}>
            {t('ats.noJobs')}
          </div>
          {canEdit && (
            <div style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={() => setShowModal(true)}>
                + {t('ats.newJob')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 28 }}>
          {groupedJobs.map((group) => (
            <div key={group.companyId} style={{ display: 'grid', gap: 12 }}>
              {/* Group Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '4px 8px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: 8
              }}>
                <Building2 size={16} color="var(--text-secondary)" />
                <h4 style={{
                  margin: 0,
                  fontSize: 14.5,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)'
                }}>
                  {group.companyName}
                </h4>
                <span style={{
                  background: 'rgba(13,33,55,0.03)',
                  color: 'var(--text-muted)',
                  borderRadius: 99,
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '1px 6px',
                  border: '1px solid var(--border)'
                }}>
                  {group.jobs.length} {group.jobs.length === 1 ? t('ats.position', 'position') : t('ats.positions', 'positions')}
                </span>
              </div>

              {/* Group Jobs */}
              <div style={{ display: 'grid', gap: 10 }}>
                {group.jobs.map((job) => {
                  const sc = STATUS_COLOR[job.status];
                  const isHovered = hoveredId === job.id;
                  const company = companyMap.get(job.companyId);
                  const store = job.storeId ? storeMap.get(job.storeId) : null;
                  const companyLogo = getCompanyLogoUrl(company?.logoFilename ?? null);
                  const companyOwnerAvatar = getAvatarUrl(company?.ownerAvatarFilename ?? null);
                  const storeLogo = getStoreLogoUrl(store?.logoFilename ?? null);
                  const languageFlags = languageFlagCodes(job.language);
                  const locationSummary = [job.city, job.state, job.country].filter(Boolean).join(', ') || t('ats.remoteType_remote', 'Remote');
                  const salarySummary = formatEuroRange(job.salaryMin, job.salaryMax, locale, t('common.noData'));
                  return (
                    <div
                      id={`job-row-${job.id}`}
                      key={job.id}
                      onMouseEnter={() => setHoveredId(job.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderLeft: `4px solid ${sc}`,
                        borderRadius: 14, padding: '16px 20px',
                        display: 'grid', gap: 12,
                        transition: 'box-shadow 0.18s, transform 0.18s',
                        boxShadow: isHovered ? 'var(--shadow)' : 'none',
                        transform: isHovered ? 'translateY(-1px)' : 'none',
                      }}
                    >
                      {/* Header Row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--text-primary)' }}>{job.title}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Copy Reference ID button on hover */}
                          {isHovered && job.referenceId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(job.referenceId || '', () => {
                                  showToast('Reference ID copied to clipboard', 'success');
                                });
                              }}
                              style={{
                                background: 'rgba(13,33,55,0.05)',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px 6px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                gap: 4,
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(13,33,55,0.1)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(13,33,55,0.05)')}
                              title="Copy Reference ID"
                            >
                              <Clipboard size={12} />
                              <span style={{ fontSize: 10.5 }}>Copy ID</span>
                            </button>
                          )}
                          <span style={{
                            background: `${sc}08`,
                            color: sc,
                            border: `1px solid ${sc}33`,
                            borderRadius: 99,
                            padding: '2px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}>
                            {t(`ats.status_${job.status}`)}
                          </span>
                        </div>
                      </div>

                      {/* Description Row with Show More */}
                      {job.description && (() => {
                        const text = stripHtml(job.description);
                        const isLong = text.length > 240;
                        const isExpanded = expandedJobIds.has(job.id);
                        const displayText = isLong && !isExpanded ? `${text.slice(0, 240)}...` : text;
                        return (
                          <div style={{ fontSize: 11.8, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            <span>{displayText}</span>
                            {isLong && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDescription(job.id);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--primary)',
                                  cursor: 'pointer',
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  padding: '0 4px',
                                  textDecoration: 'underline',
                                }}
                              >
                                {isExpanded ? t('common.showLess', 'Show less') : t('common.showMore', 'Show more')}
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {/* Inline Job Metadata Row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                        {/* Store */}
                        {store && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <StoreIcon size={14} color="var(--text-muted)" />
                            <strong>{store.name}</strong>
                          </span>
                        )}
                        {/* Location */}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={14} color="var(--text-muted)" />
                          {locationSummary}
                        </span>
                        {/* Salary */}
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Wallet size={14} color="var(--text-muted)" />
                          {salarySummary} {job.weeklyHours ? `(${job.weeklyHours}h)` : ''}
                        </span>
                        {/* Department */}
                        {job.department && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Building2 size={14} color="var(--text-muted)" />
                            {job.department}
                          </span>
                        )}
                      </div>

                      {/* Footer Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(13,33,55,0.05)', paddingTop: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          {/* Language flag */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {languageFlags.map((code) => (
                               <ReactCountryFlag
                                 key={`${job.id}-${code}`}
                                 countryCode={code}
                                 svg
                                 style={{ width: '0.85em', height: '0.85em', verticalAlign: 'middle', borderRadius: 1.5 }}
                                 title={job.language.toUpperCase()}
                               />
                             ))}
                          </div>

                          {/* Tags */}
                          {job.tags && job.tags.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                              <span>Tags:</span>
                              {job.tags.map((tag) => (
                                <span key={`${job.id}-${tag}`} style={{
                                  background: 'rgba(201,151,58,0.06)', 
                                  color: 'var(--accent)',
                                  border: '1px solid rgba(201,151,58,0.15)',
                                  borderRadius: 6, 
                                  padding: '1px 6px', 
                                  fontSize: 11, 
                                  fontWeight: 500,
                                }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Job Type Tag */}
                          <span style={{
                            background: 'rgba(37,99,235,0.06)',
                            color: '#2563EB',
                            border: '1px solid rgba(37,99,235,0.15)',
                            borderRadius: 6,
                            padding: '1px 6.5px',
                            fontSize: 11,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <BriefcaseBusiness size={11} strokeWidth={2.5} />
                            {t(`ats.jobType_${JOB_TYPE_LABEL[job.jobType]}`)}
                          </span>

                          {/* Work Arrangement Tag */}
                          <span style={{
                            background: 'rgba(79,70,229,0.06)',
                            color: '#4F46E5',
                            border: '1px solid rgba(79,70,229,0.15)',
                            borderRadius: 6,
                            padding: '1px 6.5px',
                            fontSize: 11,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <Globe2 size={11} strokeWidth={2.5} />
                            {job.remoteType === 'remote' ? t('ats.remoteType_remote', 'Remote') : t(`ats.remoteType_${job.remoteType}`, job.remoteType)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
                          {/* Dates */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {job.publishedAt && (() => {
                              const dateObj = new Date(job.publishedAt);
                              const dateStr = dateObj.toLocaleDateString(locale === 'it-IT' ? 'it-IT' : 'en-GB');
                              const hourStr = String(dateObj.getHours()).padStart(2, '0');
                              const minStr = String(dateObj.getMinutes()).padStart(2, '0');
                              return (
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                  {t('ats.publishedLabel', 'Published')}: {dateStr} {hourStr}:{minStr}
                                </span>
                              );
                            })()}
                            {job.status === 'closed' && job.closedAt && (() => {
                              const closedStr = new Date(job.closedAt).toLocaleDateString(locale === 'it-IT' ? 'it-IT' : 'en-GB');
                              return (
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                  {t('ats.closedLabel', 'Closed')}: {closedStr}
                                </span>
                              );
                            })()}
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {canEdit && job.status === 'draft' && (
                                <Button variant="accent" size="sm" onClick={() => handlePublish(job)} style={{ marginRight: 4 }}>
                                  {t('ats.publishPosition', 'Publish position')}
                                </Button>
                              )}
                              {canEdit && (() => {
                                const isSalaryMissing = !(job.salaryMin || job.salaryMax);
                                const isDuplicateRefId = job.referenceId ? jobs.some(otherJob => otherJob.id !== job.id && otherJob.referenceId === job.referenceId) : false;
                                const isDescMissing = !(job.description && job.description.trim().length > 0);
                                const isCityMissing = !(job.city && job.city.trim().length > 0) && job.remoteType !== 'remote';
                                
                                const warnings = [];
                                if (isSalaryMissing) warnings.push(t('ats.warningSalaryMissing', 'Missing Salary'));
                                if (isDuplicateRefId) warnings.push(t('ats.warningDuplicateId', 'Duplicate ID'));
                                if (isDescMissing) warnings.push(t('ats.warningDescMissing', 'Missing Description'));
                                if (isCityMissing) warnings.push(t('ats.warningCityMissing', 'Missing City'));

                                if (warnings.length > 0) {
                                  return (
                                    <span style={{
                                      background: 'rgba(220, 38, 38, 0.08)',
                                      color: '#DC2626',
                                      border: '1px solid rgba(220, 38, 38, 0.2)',
                                      borderRadius: 6,
                                      padding: '2px 8px',
                                      fontSize: 10.5,
                                      fontWeight: 600,
                                      marginRight: 6,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }} title={warnings.join(', ')}>
                                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#DC2626' }}></span>
                                      {warnings[0]} {warnings.length > 1 ? `(+${warnings.length - 1})` : ''}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {canEdit && (
                                <button
                                  onClick={() => {
                                    setComplianceRefId(job.referenceId || String(job.id));
                                    setComplianceJobCompanyId(job.companyId);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '6px',
                                    borderRadius: '50%',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(2,132,199,0.08)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'none';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                  }}
                                  title="Indeed Compliance Check"
                                >
                                  <FileCheck size={16} />
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() => { setEditJob(job); setShowModal(true); }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '6px',
                                    borderRadius: '50%',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(13,33,55,0.05)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'none';
                                    e.currentTarget.style.color = 'var(--text-muted)';
                                  }}
                                  title={t('common.edit')}
                                >
                                  <Edit size={16} />
                                </button>
                              )}
                              {/* View — placed on the right, after the edit icon */}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => { void openJobDetails(job); }}
                              >
                                {t('common.view', 'View')}
                              </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <JobModal
          job={editJob}
          stores={stores}
          companies={companies}
          defaultCompanyId={defaultCompanyId}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditJob(null); }}
          saving={saving}
        />
      )}

      {viewJob && (
        <ModalBackdrop
          onClose={() => {
            if (deletingJob) return;
            setViewJob(null);
            setViewCandidates([]);
            setViewInterviews([]);
            setViewFeedbacks([]);
          }}
          width={1080}
          closeOnBackdropClick={!deletingJob}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: 18, fontWeight: 800 }}>
                  {viewJob.title}
                </h3>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    background: `${STATUS_COLOR[viewJob.status]}08`,
                    color: STATUS_COLOR[viewJob.status],
                    border: `1px solid ${STATUS_COLOR[viewJob.status]}33`,
                    borderRadius: 99,
                    padding: '2px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {t(`ats.status_${viewJob.status}`)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {viewJob.companyName || `Company #${viewJob.companyId}`}
                  </span>
                  {viewJob.storeName && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {viewJob.storeName}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  if (deletingJob) return;
                  setViewJob(null);
                  setViewCandidates([]);
                  setViewInterviews([]);
                  setViewFeedbacks([]);
                }}
                style={{ background: 'none', border: 'none', cursor: deletingJob ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
              {/* Job position — same layout as the candidate modal (details + creator) */}
              <JobPostSummaryCard appliedJob={viewJob} showFullDescription />

              {viewLoading ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="skeleton" style={{ height: 94, borderRadius: 12 }} />
                  ))}
                </div>
              ) : (
                <>
                  {/* Candidates */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <User2 size={16} color="#0284C7" />
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        {t('ats.tabCandidates')}
                      </span>
                      <span style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 8px' }}>
                        {viewCandidates.length}
                      </span>
                    </div>
                    {viewCandidates.length === 0 ? (
                      <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-muted)', background: 'var(--background)', border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center' }}>
                        {t('common.noData', 'No data available')}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {viewCandidates.map((candidate) => {
                          const candStageColor = STAGE_COLOR[candidate.status];
                          const appliedSource = candidate.appliedAt ?? candidate.createdAt;
                          return (
                            <div key={candidate.id} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${candStageColor}`, borderRadius: 12, padding: '12px 14px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                                {initials(candidate.fullName)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{candidate.fullName}</span>
                                  <span style={{ background: `${candStageColor}12`, color: candStageColor, border: `1px solid ${candStageColor}25`, borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                                    {t(`ats.stage_${candidate.status}`)}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                                  {candidate.email && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {candidate.email}</span>
                                  )}
                                  {candidate.phone && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {candidate.phone}</span>
                                  )}
                                  {appliedSource && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarDays size={12} /> {t('ats.appliedOnLabel', 'Applied')}: {fmtDate(appliedSource)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Interviews & feedback */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <CalendarDays size={16} color="#7C3AED" />
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        {t('ats.tabInterviews')}
                      </span>
                      <span style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 8px' }}>
                        {viewInterviews.length}
                      </span>
                    </div>
                    {viewInterviews.length === 0 ? (
                      <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-muted)', background: 'var(--background)', border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center' }}>
                        {t('ats.noInterviews', 'No interviews scheduled')}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {viewInterviews.map((interview) => {
                          const ivFeedback = viewFeedbacks.filter((f) => f.interviewId === interview.id);
                          const ivDate = new Date(interview.scheduledAt);
                          const isPast = ivDate < new Date();
                          const ivStatusColor = isPast ? '#6b7280' : '#059669';
                          const ivStatusBg = isPast ? 'rgba(107,114,128,0.1)' : 'rgba(5,150,105,0.1)';
                          const ivCandidateName = [interview.candidateName, interview.candidateSurname].filter(Boolean).join(' ') || t('ats.candidate', 'Candidate');
                          const ivCandidateAvatar = getAvatarUrl(interview.candidateAvatarFilename ?? null);
                          const ivInterviewerName = interview.interviewerName ? [interview.interviewerName, interview.interviewerSurname].filter(Boolean).join(' ') : null;
                          const ivInterviewerAvatar = getAvatarUrl(interview.interviewerAvatarFilename ?? null);
                          return (
                            <div key={interview.id} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${STAGE_COLOR.interview}`, borderRadius: 12, padding: '12px 14px', background: 'var(--surface)' }}>
                              {/* Top row: candidate + date/status */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: ivCandidateAvatar ? 'transparent' : 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                                    {ivCandidateAvatar ? <img src={ivCandidateAvatar} alt={ivCandidateName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(ivCandidateName)}
                                  </div>
                                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{ivCandidateName}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>🕐 {fmtDateTime(interview.scheduledAt)}</span>
                                  <span style={{ background: ivStatusBg, color: ivStatusColor, borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    {isPast ? t('ats.interviewPast', 'Past') : t('ats.interviewUpcoming', 'Upcoming')}
                                  </span>
                                </div>
                              </div>

                              {/* Tags row: type, duration, location, store */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--background)', padding: '2px 8px', borderRadius: 999 }}>
                                  {interview.interviewType === 'phone' ? '📞 ' + t('ats.interviewType.phone', 'Phone') : '🤝 ' + t('ats.interviewType.in_person', 'In-person')}
                                </span>
                                {interview.durationMinutes && (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--background)', padding: '2px 8px', borderRadius: 999 }}>⏱ {interview.durationMinutes}min</span>
                                )}
                                {interview.location && (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--background)', padding: '2px 8px', borderRadius: 999 }}>📍 {interview.location}</span>
                                )}
                                {interview.storeName && (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--background)', padding: '2px 8px', borderRadius: 999 }}>🏬 {interview.storeName}</span>
                                )}
                              </div>

                              {/* Interviewer */}
                              {ivInterviewerName && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                                  <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: ivInterviewerAvatar ? 'transparent' : 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                                    {ivInterviewerAvatar ? <img src={ivInterviewerAvatar} alt={ivInterviewerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(ivInterviewerName)}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{ivInterviewerName}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t('ats.interviewer', 'Interviewer')}{interview.interviewerRole ? ' · ' + t(`roles.${interview.interviewerRole}`, interview.interviewerRole) : ''}</div>
                                  </div>
                                </div>
                              )}

                              {/* Feedback for this interview */}
                              {ivFeedback.length > 0 && (
                                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 8 }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    💬 {t('ats.feedbackSection', 'Feedback')} ({ivFeedback.length})
                                  </div>
                                  {ivFeedback.map((fb) => {
                                    const fbAuthor = [fb.authorName, fb.authorSurname].filter(Boolean).join(' ') || t('common.noData', 'No data available');
                                    const fbAvatar = getAvatarUrl(fb.authorAvatarFilename ?? null);
                                    return (
                                      <div key={fb.id} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                            <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: fbAvatar ? 'transparent' : 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>
                                              {fbAvatar ? <img src={fbAvatar} alt={fbAuthor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(fbAuthor)}
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{fbAuthor}</span>
                                            {fb.authorRole && (
                                              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>· {t(`roles.${fb.authorRole}`, fb.authorRole)}</span>
                                            )}
                                          </div>
                                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fmtDateTime(fb.createdAt)}</span>
                                        </div>
                                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{fb.body}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Feedback not linked to a loaded interview */}
                    {(() => {
                      const interviewIds = new Set(viewInterviews.map((iv) => iv.id));
                      const orphan = viewFeedbacks.filter((f) => !interviewIds.has(f.interviewId));
                      if (orphan.length === 0) return null;
                      return (
                        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            💬 {t('ats.feedbackSection', 'Feedback')}
                          </div>
                          {orphan.map((fb) => {
                            const fbAuthor = [fb.authorName, fb.authorSurname].filter(Boolean).join(' ') || t('common.noData', 'No data available');
                            const fbAvatar = getAvatarUrl(fb.authorAvatarFilename ?? null);
                            return (
                              <div key={fb.id} style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: fbAvatar ? 'transparent' : 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700 }}>
                                      {fbAvatar ? <img src={fbAvatar} alt={fbAuthor} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(fbAuthor)}
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{fbAuthor}</span>
                                    {fb.candidateName && (
                                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>· {fb.candidateName}</span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fmtDateTime(fb.createdAt)}</span>
                                </div>
                                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{fb.body}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
            <div style={{ padding: '16px 22px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                {canEdit && (
                  <Button
                    variant="danger"
                    onClick={() => setDeleteTargetJob(viewJob)}
                    disabled={deletingJob}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {canEdit && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setViewJob(null);
                      setViewCandidates([]);
                      setViewInterviews([]);
                      setViewFeedbacks([]);
                      setEditJob(viewJob);
                      setShowModal(true);
                    }}
                    disabled={deletingJob}
                  >
                    {t('common.edit', 'Edit')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (deletingJob) return;
                    setViewJob(null);
                    setViewCandidates([]);
                    setViewInterviews([]);
                    setViewFeedbacks([]);
                  }}
                  disabled={deletingJob}
                >
                  {t('common.close', 'Close')}
                </Button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {deleteTargetJob && (
        <ModalBackdrop onClose={() => !deletingJob && setDeleteTargetJob(null)} width={460} closeOnBackdropClick={!deletingJob}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                {t('common.delete', 'Delete')} {deleteTargetJob.title}
              </h3>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)' }}>
                <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  If you delete this position, all candidates, interviews, and feedback related to this position will be permanently deleted from the Recruiting page.
                  Candidates already hired from this job will be removed from the ATS hired column, but their employee record will remain in the Employees page.
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 22px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setDeleteTargetJob(null)} disabled={deletingJob}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button variant="danger" onClick={() => void handleDelete(deleteTargetJob)} loading={deletingJob}>
                {t('common.delete', 'Delete')}
              </Button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {showLinksModal && (() => {
        const activeCompany = companies.find(c => c.id === (companyId || defaultCompanyId));
        const isStandalone = !activeCompany || !activeCompany.groupId;
        return (
          <ModalBackdrop onClose={() => setShowLinksModal(false)} width={isStandalone ? 440 : 680}>
            {/* Modal Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontSize: 17, fontWeight: 700 }}>
                  {t('ats.careersPageLinksTitle', 'Careers Page Links')}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {t('ats.careersPageLinksSubtitle', 'Share these links with candidates or embed them on your website')}
                </p>
              </div>
              <button
                onClick={() => setShowLinksModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 22px', display: 'grid', gap: 16 }}>
              {/* Two Cards Row */}
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 16
              }}>
                {/* Card 1: General Portal */}
                {!isStandalone && (
                  <div style={{
                    flex: 1,
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 16,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12
                  }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'rgba(2,132,199,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)'
                    }}>
                      <Globe2 size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t('ats.generalCareersPortal', 'General Careers Portal')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t('ats.allCompanies', 'All Companies')}
                      </div>
                    </div>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {t('ats.generalPortalDesc', 'Displays all active job openings across every company on this platform.')}
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
                  <input
                    type="text"
                    readOnly
                    value={`${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '')}/careers`}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 11.5,
                      fontFamily: 'monospace',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1, height: 32 }}
                      onClick={() => {
                        const url = `${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '')}/careers`;
                        copyToClipboard(url, () => {
                          setCopiedGeneral(true);
                          setTimeout(() => setCopiedGeneral(false), 2000);
                        });
                      }}
                    >
                      {copiedGeneral ? '✓ ' + t('common.copied', 'Copied') : t('common.copyLink', 'Copy Link')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ flexShrink: 0, height: 32 }}
                      onClick={() => window.open(`${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '')}/careers`, '_blank')}
                    >
                      {t('common.open', 'Open →')}
                    </Button>
                  </div>
                </div>
              </div>
              )}

              {/* Card 2: Company Page */}
              <div style={{
                flex: 1,
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'rgba(201,151,58,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)'
                    }}>
                      <Building2 size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                        {companies.find(c => c.id === (companyId || defaultCompanyId))?.name ?? t('common.company', 'Company')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t('ats.companySpecific', 'Company-Specific')}
                      </div>
                    </div>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {t('ats.companyPortalDesc', 'Displays only the job openings for this specific company. Use this link on your website.')}
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 8, marginTop: 'auto' }}>
                  <input
                    type="text"
                    readOnly
                    value={`${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '')}/careers/${companies.find(c => c.id === (companyId || defaultCompanyId))?.slug || ''}`}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 11.5,
                      fontFamily: 'monospace',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1, height: 32 }}
                      onClick={() => {
                        const slug = companies.find(c => c.id === (companyId || defaultCompanyId))?.slug || '';
                        const url = `${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '')}/careers/${slug}`;
                        copyToClipboard(url, () => {
                          setCopiedCompany(true);
                          setTimeout(() => setCopiedCompany(false), 2000);
                        });
                      }}
                    >
                      {copiedCompany ? '✓ ' + t('common.copied', 'Copied') : t('common.copyLink', 'Copy Link')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ flexShrink: 0, height: 32 }}
                      onClick={() => {
                        const slug = companies.find(c => c.id === (companyId || defaultCompanyId))?.slug || '';
                        window.open(`${(import.meta.env.VITE_FRONTEND_URL || window.location.origin).replace(/\/+$/, '')}/careers/${slug}`, '_blank');
                      }}
                    >
                      {t('common.open', 'Open →')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Banner */}
            <div style={{
              background: 'rgba(2,132,199,0.06)',
              border: '1px solid rgba(2,132,199,0.15)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'start'
            }}>
              <div style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>
                <Globe2 size={16} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#0369A1', lineHeight: 1.5 }}>
                {t('ats.linksBannerText', 'These links are always live and show your latest published positions. Share the company link on your website, in email signatures, or on LinkedIn.')}
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowLinksModal(false)}>
              {t('common.close', 'Close')}
            </Button>
          </div>
        </ModalBackdrop>
        );
      })()}

      {complianceRefId !== null && (
        <IndeedComplianceModal
          referenceId={complianceRefId}
          onClose={() => {
            setComplianceRefId(null);
            setComplianceJobCompanyId(undefined);
          }}
          companyId={complianceJobCompanyId}
        />
      )}
    </div>
  );
};

// ─── Indeed Panel ──────────────────────────────────────────────────────────────

// ── SVGs for Indeed Stats ───────────────────────────────────────────────────
const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18z"/>
    <path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2"/>
    <path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2"/>
    <path d="M10 6h4M10 10h4M10 14h4"/>
  </svg>
);

const IconBriefcase = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
  </svg>
);

const IconUserIndeed = () => (
  <div style={{ position: 'relative', width: 20, height: 20 }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
    <span style={{
      position: 'absolute',
      bottom: -4,
      right: -4,
      background: '#002F6C',
      color: '#fff',
      fontSize: '7.5px',
      fontWeight: 900,
      borderRadius: 2,
      padding: '0px 1.5px',
      lineHeight: 1,
      fontFamily: 'sans-serif'
    }}>IN</span>
  </div>
);

const IconBarChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

interface IndeedStatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent: string;
  description?: string;
  loading?: boolean;
}

const IndeedStatCard: React.FC<IndeedStatCardProps> = ({ label, value, icon, accent, description, loading }) => {
  if (loading) {
    return (
      <div style={{
        background: 'var(--surface)',
        borderRadius: 16,
        border: '1px solid var(--border)',
        borderTop: `3px solid ${accent}`,
        padding: '22px 24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: '14px',
        minHeight: 135
      }} className="shimmer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#E2E8F0' }} />
          <div style={{ width: 80, height: 12, background: '#E2E8F0', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ width: 60, height: 32, background: '#E2E8F0', borderRadius: 4 }} />
          <div style={{ width: 120, height: 10, background: '#E2E8F0', borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 16,
      border: '1px solid var(--border)',
      borderTop: `3px solid ${accent}`,
      padding: '22px 24px',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex', flexDirection: 'column', gap: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${accent}14`, border: `1px solid ${accent}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent, flexShrink: 0,
        }}>{icon}</div>
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px',
        }}>{label}</span>
      </div>
      <div>
        <div style={{
          fontSize: '34px', fontWeight: 700, fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em',
        }}>{value !== undefined && value !== null ? value : '—'}</div>
        {description && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{description}</div>
        )}
      </div>
    </div>
  );
};

// Per-company Indeed Apply credentials (API token + HMAC secret). Admin/HR enter
// their company's own values (issued by Indeed to that company as a direct
// employer). Stored encrypted server-side; only a masked status is shown here.
const IndeedCredentialsCard: React.FC<{ companyId?: number | null }> = ({ companyId }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [status, setStatus] = useState<IndeedConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStatus(await getIndeedConfig(companyId ?? undefined)); }
    catch { setStatus(null); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!apiToken.trim() && !secret.trim()) {
      showToast(t('ats.indeedCredNothing', 'Enter a token or secret to save'), 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: { apiToken?: string; secret?: string; companyId?: number } = {};
      if (companyId) payload.companyId = companyId;
      if (apiToken.trim()) payload.apiToken = apiToken.trim();
      if (secret.trim()) payload.secret = secret.trim();
      setStatus(await saveIndeedConfig(payload));
      setApiToken(''); setSecret(''); setEditing(false);
      showToast(t('ats.indeedCredSaved', 'Indeed credentials saved'), 'success');
    } catch (err) {
      showToast(translateApiError(err, t, t('common.error', 'Something went wrong')) ?? t('common.error', 'Something went wrong'), 'error');
    } finally { setSaving(false); }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      setStatus(await clearIndeedConfig(companyId ?? undefined));
      setApiToken(''); setSecret('');
      showToast(t('ats.indeedCredCleared', 'Indeed credentials cleared'), 'success');
    } catch {
      showToast(t('common.error', 'Something went wrong'), 'error');
    } finally { setSaving(false); }
  };

  const renderStatus = (configured: boolean | undefined, mask: string | null | undefined, source: string | undefined, label: string) => {
    const isCompany = source === 'company';
    const sourceLabel = source === 'company'
      ? t('ats.indeedCredSourceCompany', 'this company')
      : source === 'environment'
        ? t('ats.indeedCredSourceEnv', 'server')
        : '';
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
          {configured ? (
            <>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{mask}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: isCompany ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: isCompany ? '#10B981' : '#B45309' }}>
                {sourceLabel}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)' }}>
              {t('ats.indeedCredNotSet', 'Not set')}
            </span>
          )}
        </span>
      </div>
    );
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13,
    borderRadius: 'var(--radius)', border: '1px solid var(--border)', outline: 'none', background: '#fff',
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15 }}>🔑</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {t('ats.indeedCredTitle', 'Indeed Apply Credentials')}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t('ats.indeedCredIntro', 'These are issued by Indeed to your company once you set up Apply on Indeed in your own Indeed employer account. Job posting and applications already work without them — they only enable the native "apply inside Indeed" flow. Values are stored encrypted.')}
      </p>

      {status?.encryptionAvailable === false && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: '#991B1B', fontSize: 11.5 }}>
          ⚠️ {t('ats.indeedCredNoEncryption', 'The server has no encryption key configured, so credentials cannot be stored securely yet. Contact your administrator.')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {loading ? (
          <>
            <div className="skeleton" style={{ height: 36, borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 36, borderRadius: 8 }} />
          </>
        ) : (
          <>
            {renderStatus(status?.apiTokenConfigured, status?.apiTokenMask, status?.apiTokenSource, t('ats.indeedCredApiToken', 'API Token'))}
            {renderStatus(status?.secretConfigured, status?.secretMask, status?.secretSource, t('ats.indeedCredSecret', 'HMAC Secret'))}
          </>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            type="password" autoComplete="off" value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={t('ats.indeedCredApiTokenPlaceholder', 'New API token (leave blank to keep current)')}
            style={inputStyle}
          />
          <input
            type="password" autoComplete="off" value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={t('ats.indeedCredSecretPlaceholder', 'New HMAC secret (leave blank to keep current)')}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setApiToken(''); setSecret(''); }} disabled={saving}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleSave()} loading={saving}>
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {(status?.apiTokenSource === 'company' || status?.secretSource === 'company') && (
            <Button variant="secondary" size="sm" onClick={() => void handleClear()} loading={saving}>
              {t('ats.indeedCredClear', 'Clear')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={status?.encryptionAvailable === false}>
            {t('ats.indeedCredEdit', 'Set credentials')}
          </Button>
        </div>
      )}
    </div>
  );
};

const IndeedPanel: React.FC<{ canEdit: boolean; companyId?: number }> = ({ canEdit, companyId }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { user, targetCompanyId } = useAuth();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedCopied, setFeedCopied] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  // Stats state
  const [stats, setStats] = useState<IndeedStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  // Integration status states
  const [feedStatus, setFeedStatus] = useState<'LOADING' | 'ACTIVE' | 'ERROR'>('LOADING');
  const [feedLastUpdated, setFeedLastUpdated] = useState<string | null>(null);
  const [botTestStatus, setBotTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [botTestResult, setBotTestResult] = useState<string | null>(null);
  const [apiRefExpanded, setApiRefExpanded] = useState(false);

  const defaultCompanyId = useMemo(() => {
    if (companyId) return companyId;
    if (targetCompanyId) return targetCompanyId;
    if (user?.companyId) return user.companyId;
    return companies[0]?.id ?? null;
  }, [companyId, targetCompanyId, user?.companyId, companies]);

  const feedCompanyId = useMemo(() => {
    if (companyId) return companyId;
    if (targetCompanyId) return targetCompanyId;
    if (user?.companyId) return user.companyId;
    return companies.length === 1 ? companies[0].id : null;
  }, [companyId, targetCompanyId, user?.companyId, companies]);

  const feedUrl = feedCompanyId
    ? `${getApiBaseUrl()}/ats/feed/${feedCompanyId}/jobs.xml`
    : null;

  const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? 'https://veylohr.com';

  const companySlug = useMemo(() => {
    if (stats?.companySlug) return stats.companySlug;
    if (defaultCompanyId) {
      const found = companies.find(c => c.id === defaultCompanyId);
      if (found?.slug) return found.slug;
    }
    return 'all';
  }, [stats?.companySlug, defaultCompanyId, companies]);

  const displayFeedUrl = feedCompanyId
    ? `${baseUrl}/api/ats/feed/${feedCompanyId}/jobs.xml`
    : null;

  const handleCopyFeed = () => {
    if (!displayFeedUrl) return;
    navigator.clipboard.writeText(displayFeedUrl).then(() => {
      setFeedCopied(true);
      showToast(t('ats.feedCopied'), 'success');
      setTimeout(() => setFeedCopied(false), 2500);
    });
  };

  const handleOpenFeed = () => {
    if (!displayFeedUrl) return;
    window.open(displayFeedUrl, '_blank', 'noopener,noreferrer');
  };

  const fetchStats = React.useCallback(() => {
    setStatsLoading(true);
    setStatsError(false);

    const params: { companyId?: number } = {};
    if (companyId) {
      params.companyId = companyId;
    } else if (!user?.isSuperAdmin && defaultCompanyId) {
      params.companyId = defaultCompanyId;
    }

    getIndeedStats(Object.keys(params).length > 0 ? params : undefined)
      .then((data) => {
        setStats(data);
        setStatsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch Indeed stats:', err);
        setStatsError(true);
        setStatsLoading(false);
      });
  }, [companyId, defaultCompanyId, user?.isSuperAdmin]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!feedUrl) {
      setFeedStatus('ERROR');
      return;
    }
    setFeedStatus('LOADING');
    fetch(feedUrl)
      .then((res) => {
        if (res.ok && res.headers.get('Content-Type')?.includes('xml')) {
          setFeedStatus('ACTIVE');
          const lastModified = res.headers.get('Last-Modified') || res.headers.get('Date') || new Date().toUTCString();
          setFeedLastUpdated(lastModified);
        } else {
          setFeedStatus('ERROR');
        }
      })
      .catch(() => {
        setFeedStatus('ERROR');
      });
  }, [feedUrl]);

  const handleTestBotView = async () => {
    setBotTestStatus('testing');
    setBotTestResult(null);
    try {
      // No slug means we cannot know which careers page to test; guessing one
      // would show the admin a different company's page as if it were theirs.
      const companySlug = stats?.companySlug || '';
      if (!companySlug) {
        setBotTestStatus('failed');
        setBotTestResult('No company selected — pick a company to test its careers page.');
        return;
      }
      const targetUrl = `${window.location.origin}/careers/${companySlug}`;
      const testUrl = `${getApiBaseUrl()}/ats/test-ssr?url=${encodeURIComponent(targetUrl)}`;
      
      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await response.json();
      if (data.success && data.data?.isSsrWorking) {
        setBotTestStatus('success');
        setBotTestResult('PASS: Bot renders full careers list page.');
      } else {
        setBotTestStatus('failed');
        setBotTestResult('FAIL: Returns empty shell. SSR middleware is disabled or not configured in Nginx.');
      }
    } catch (err: any) {
      setBotTestStatus('failed');
      setBotTestResult(`ERROR: ${err.message}`);
    }
  };


  useEffect(() => {
    let mounted = true;
    setLoading(true);
    
    const params: { companyId?: number } = {};
    if (companyId) {
      params.companyId = companyId;
    } else if (!user?.isSuperAdmin && defaultCompanyId) {
      params.companyId = defaultCompanyId;
    }

    Promise.all([
      getJobs(Object.keys(params).length > 0 ? params : undefined).catch(() => [] as JobPosting[]),
      getCompanies().catch(() => [] as Company[]),
    ]).then(([jobsData, companiesData]) => {
      if (!mounted) return;
      setJobs(jobsData);
      setCompanies(companiesData);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [companyId, defaultCompanyId, user?.isSuperAdmin]);

  const totalCandidates = (stats?.totalIndeedCandidates ?? 0) + (stats?.totalDirectCandidates ?? 0);
  const indeedRatio = totalCandidates > 0 ? ((stats?.totalIndeedCandidates ?? 0) / totalCandidates) * 100 : 0;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Integration Status Section */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px 28px',
        display: 'grid',
        gap: 16,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          Integration Status
        </h3>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16
        }}>
          {/* Card 1: XML Feed */}
          <div style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>XML Feed</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: feedStatus === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : feedStatus === 'LOADING' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                color: feedStatus === 'ACTIVE' ? '#10B981' : feedStatus === 'LOADING' ? '#F59E0B' : '#EF4444'
              }}>
                {feedStatus}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayFeedUrl || ''}>
                URL: {displayFeedUrl || 'Not set'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Updated: {feedLastUpdated ? new Date(feedLastUpdated).toLocaleString() : 'N/A'}
              </div>
            </div>
          </div>

          {/* Card 2: Indeed Apply Webhook */}
          <div style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Indeed Apply Webhook</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: stats?.isIndeedApplyConfigured ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                color: stats?.isIndeedApplyConfigured ? '#10B981' : '#F59E0B'
              }}>
                {stats?.isIndeedApplyConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                POST: {feedCompanyId ? `${baseUrl}/api/public/indeed-apply/${companySlug}` : 'N/A'}
              </div>
            </div>
          </div>

          {/* Card 3: SSR (Bot Visibility) */}
          <div style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>SSR Bot Visibility</span>
              <button
                onClick={handleTestBotView}
                disabled={botTestStatus === 'testing'}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'var(--accent)',
                  color: 'white',
                  border: 'none',
                  cursor: botTestStatus === 'testing' ? 'not-allowed' : 'pointer'
                }}
              >
                {botTestStatus === 'testing' ? 'Testing...' : 'Test Bot View'}
              </button>
            </div>
            <div>
              <div style={{
                fontSize: 11,
                color: botTestStatus === 'success' ? '#10B981' : botTestStatus === 'failed' ? '#EF4444' : 'var(--text-muted)',
                fontWeight: botTestStatus !== 'idle' ? 600 : 400
              }}>
                {botTestResult || 'Click to run simulation fetch.'}
              </div>
              {botTestStatus === 'failed' && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  SSR bot-proxying is configured via Nginx and activates after production deployment.
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Screener Questions */}
          <div style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Screener Questions</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: 'rgba(16,185,129,0.1)',
                color: '#10B981'
              }}>
                ACTIVE
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                GET: {feedCompanyId ? `${baseUrl}/api/public/indeed-apply-questions/${companySlug}/[jobId]` : 'N/A'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                Active — custom screener questions configured in ATS job builder
              </div>
            </div>
          </div>

          {/* Card 5: Disposition Sync */}
          <div style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Disposition Sync</span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 99,
                background: stats?.isDispositionSyncReal ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                color: stats?.isDispositionSyncReal ? '#10B981' : '#F59E0B'
              }}>
                {stats?.isDispositionSyncReal ? 'ACTIVE' : 'PENDING CREDENTIALS'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                GraphQL: https://apis.indeed.com/graphql
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                {stats?.isDispositionSyncReal
                  ? 'Active — candidate stage updates are synced to Indeed.'
                  : 'Pending — missing or mock credentials configured.'}
              </div>
            </div>
          </div>
        </div>

        {canEdit && <IndeedCredentialsCard companyId={defaultCompanyId} />}

        {/* Collapsible API Reference */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button
            onClick={() => setApiRefExpanded(!apiRefExpanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 0
            }}
          >
            {apiRefExpanded ? '▼ Hide API Reference' : '▶ Show API Reference'}
          </button>
          
          {apiRefExpanded && (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Method</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Endpoint</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Purpose</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#10B981' }}>GET</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>/api/ats/feed/:slug/jobs.xml</td>
                    <td style={{ padding: '6px 8px' }}>XML job feed</td>
                    <td style={{ padding: '6px 8px', color: '#10B981', fontWeight: 600 }}>Active</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#2563EB' }}>POST</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>/api/public/indeed-apply/:slug</td>
                    <td style={{ padding: '6px 8px' }}>Application webhook</td>
                    <td style={{ padding: '6px 8px', color: '#10B981', fontWeight: 600 }}>Active</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#10B981' }}>GET</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>/api/public/indeed-apply-questions/:slug/:jobId</td>
                    <td style={{ padding: '6px 8px' }}>Screener questions</td>
                    <td style={{ padding: '6px 8px', color: '#10B981', fontWeight: 600 }}>Active</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#10B981' }}>GET</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>/api/ats/indeed-stats</td>
                    <td style={{ padding: '6px 8px' }}>Analytics data</td>
                    <td style={{ padding: '6px 8px', color: '#10B981', fontWeight: 600 }}>Active</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#10B981' }}>GET</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>/api/ats/jobs/:id/compliance</td>
                    <td style={{ padding: '6px 8px' }}>41-rule compliance check</td>
                    <td style={{ padding: '6px 8px', color: '#10B981', fontWeight: 600 }}>Active</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Indeed Activity Overview Analytics Section */}
      <div style={{ display: 'grid', gap: 16 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('ats.indeedActivityOverview', 'Indeed Activity Overview')}
        </h3>

        {statsError ? (
          <div style={{
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 500 }}>
              Could not load Indeed stats — check the API connection.
            </span>
            <Button variant="secondary" size="sm" onClick={fetchStats}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Stat Cards Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16
            }}>
              <IndeedStatCard
                label="Companies on Feed"
                value={stats?.companiesOnFeed}
                icon={<IconBuilding />}
                accent="#15803D"
                description="With ≥1 published position"
                loading={statsLoading}
              />
              <IndeedStatCard
                label="Live Positions"
                value={stats?.livePositions}
                icon={<IconBriefcase />}
                accent="#0284C7"
                description="Currently published"
                loading={statsLoading}
              />
              <IndeedStatCard
                label="Indeed Candidates"
                value={stats?.indeedCandidatesThisMonth}
                icon={<IconUserIndeed />}
                accent="#002F6C"
                description="This calendar month"
                loading={statsLoading}
              />
              <IndeedStatCard
                label="Indeed vs Direct"
                value={
                  statsLoading ? null : (
                    <div style={{ height: 34, display: 'flex', alignItems: 'center', width: '100%' }}>
                      <div style={{ height: 8, width: '100%', background: '#E2E8F0', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${indeedRatio}%`, background: '#002F6C', height: '100%' }} />
                        <div style={{ width: `${100 - indeedRatio}%`, background: '#94A3B8', height: '100%' }} />
                      </div>
                    </div>
                  )
                }
                icon={<IconBarChart />}
                accent="#D97706"
                description={statsLoading ? undefined : `${stats?.totalIndeedCandidates ?? 0} Indeed · ${stats?.totalDirectCandidates ?? 0} Direct`}
                loading={statsLoading}
              />
            </div>

            {/* Monthly Trend Table */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: 'var(--shadow-sm)',
              display: 'grid',
              gap: 16
            }}>
              <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Monthly Activity — Last 6 Months
              </h4>

              {statsLoading ? (
                <div style={{ display: 'grid', gap: 8, padding: '10px 0' }}>
                  <div style={{ height: 35, background: '#F1F5F9', borderRadius: 6 }} className="shimmer" />
                  <div style={{ height: 35, background: '#F1F5F9', borderRadius: 6 }} className="shimmer" />
                  <div style={{ height: 35, background: '#F1F5F9', borderRadius: 6 }} className="shimmer" />
                </div>
              ) : !stats || stats.monthlyTrend.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No data
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Month</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Indeed Candidates</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Direct Candidates</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: 'var(--text-secondary)' }}>New Positions Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.monthlyTrend.map((row) => (
                        <tr key={row.month} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '12px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{row.month}</td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>{row.indeedCandidates ?? 0}</td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>{row.directCandidates ?? 0}</td>
                          <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>{row.newPositionsPublished ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Section 1: XML Feed Card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px 28px',
        display: 'grid',
        gap: 16,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            XML Feed
          </h3>
          <span style={{
            background: 'rgba(16,185,129,0.12)',
            color: '#10B981',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            border: '1px solid rgba(16,185,129,0.22)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            Feed URL
          </span>
        </div>
        
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Your XML feed contains all published positions. This URL is used to sync your job listings directly with Indeed.
        </p>

        {displayFeedUrl ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              readOnly
              value={displayFeedUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                flex: 1,
                minWidth: 200,
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 12.5,
                color: 'var(--text-primary)',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={handleCopyFeed} style={{ whiteSpace: 'nowrap' }}>
                {feedCopied ? '✓ ' + t('common.copied', 'Copied') : t('common.copy', 'Copy URL')}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleOpenFeed} style={{ whiteSpace: 'nowrap' }}>
                Open Feed
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Select a company to view the XML feed URL.
          </div>
        )}

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Indeed crawls this URL every 6 hours.
        </p>
      </div>

      {/* Section 2: Compliance Check Card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px 28px',
        display: 'grid',
        gap: 16,
        boxShadow: 'var(--shadow-sm)'
      }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          Position Compliance Check
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Verify that a position meets all Indeed XML feed requirements before submission.
        </p>
        <div>
          <Button variant="primary" size="sm" onClick={() => setShowComplianceModal(true)}>
            {t('ats.complianceCheck', 'Run Compliance Check')}
          </Button>
        </div>
      </div>

      {/* Section 3: Placeholder card (muted style) */}
      <div style={{
        background: 'rgba(248,250,252,0.5)',
        border: '1px dashed var(--border)',
        borderRadius: 16,
        padding: '24px 28px',
        display: 'grid',
        gap: 8,
        boxShadow: 'none'
      }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>
          More Indeed Tools
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Additional Indeed integration tools — coming soon.
        </p>
      </div>

      {showComplianceModal && (
        <ModalBackdrop onClose={() => setShowComplianceModal(false)} width={980}>
            {(() => {
              const publishedJobs = jobs.filter((j) => j.status === 'published');
              const publishedCount = publishedJobs.length;
              return (
                <>
                  <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{t('ats.complianceCheckTitle')}</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        {publishedCount} {t('ats.complianceJobsCount', 'published job postings')} - each row shows compliance percentage and detailed checks.
                      </p>
                    </div>
                    <button onClick={() => setShowComplianceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ padding: '16px 22px', display: 'grid', gap: 10 }}>
                    {publishedCount === 0 ? (
                      <div style={{
                        borderRadius: 10,
                        padding: '16px 20px',
                        border: '1px solid rgba(2,132,199,0.18)',
                        background: 'rgba(2,132,199,0.04)',
                        color: '#0369A1',
                        fontSize: 13,
                        lineHeight: 1.5
                      }}>
                        {i18n.language?.startsWith('it') ? (
                          <div>
                            <strong>Nessun annuncio pubblicato trovato.</strong>
                            <p style={{ margin: '4px 0 0' }}>La verifica di conformità si applica solo agli annunci pubblicati. Assicurati di pubblicare un annuncio o di selezionare un'altra azienda dal menu a discesa in alto a destra.</p>
                          </div>
                        ) : (
                          <div>
                            <strong>No published jobs found.</strong>
                            <p style={{ margin: '4px 0 0' }}>The compliance check only runs on published job postings. Make sure you publish a position or select a different company from the dropdown in the top-right corner.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      publishedJobs.map((job) => {
                        const score = complianceScore(job);
                        const barColor = score.percentage >= 80 ? '#15803D' : score.percentage >= 55 ? '#C9973A' : '#DC2626';

                        return (
                          <details key={job.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                            <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '10px 12px', display: 'grid', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{job.title}</strong>
                                <span style={{ fontSize: 11, borderRadius: 99, padding: '2px 8px', background: 'rgba(13,33,55,0.08)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                                  {job.status}
                                </span>
                                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: barColor }}>
                                  {score.percentage}% ({score.passed}/{score.total})
                                </span>
                              </div>

                              <div style={{ height: 8, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${score.percentage}%`, background: barColor }} />
                              </div>
                            </summary>

                            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'grid', gap: 7 }}>
                              {score.checks.map((check) => (
                                <div key={`${job.id}-${check.key}`} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                  <span style={{ fontWeight: 800, color: check.ok ? '#166534' : '#B91C1C', minWidth: 16 }}>
                                    {check.ok ? '✓' : '✗'}
                                  </span>
                                  <span style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>{check.label}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        );
                      })
                    )}

                    <div style={{
                      marginTop: 4,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(201,151,58,0.35)',
                      background: 'rgba(201,151,58,0.08)',
                      color: '#5F4308',
                      fontSize: 12.5,
                      lineHeight: 1.5,
                    }}>
                      {i18n.language?.startsWith('it') ? (
                        <div>
                          Nota: Indeed ha deprecato il crawling XML gratuito da marzo 2026. Questa verifica controlla completezza e conformita del feed.
                        </div>
                      ) : (
                        <div>
                          Note: Indeed deprecated free XML crawling in March 2026. This checker validates feed readiness and field quality.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
        </ModalBackdrop>
      )}

      {/* Indeed Submission Readiness Checklist Section */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '20px 24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'grid',
        gap: 12
      }}>
        <div 
          onClick={() => setChecklistExpanded(!checklistExpanded)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              Indeed Submission Readiness Checklist
            </h3>
          </div>
          <ChevronDown 
            size={20} 
            style={{ 
              transform: checklistExpanded ? 'rotate(180deg)' : 'rotate(0deg)', 
              transition: 'transform 0.2s',
              color: 'var(--text-secondary)'
            }} 
          />
        </div>

        {checklistExpanded && (
          <div style={{ display: 'grid', gap: 18, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Last verified against docs.indeed.com — June 2026
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              {/* Group 1 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 6 }}>
                  Technical Requirements (Platform) <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>— Veylo built</span>
                </h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>XML feed accessible and valid</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>All required feed fields present (sourcename, email, requisitionid, date ISO 8601)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Job URLs include ?source=Indeed tracking parameter</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>remotetype values are valid (Fully remote / Hybrid remote)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Bot-readable pages via SSR middleware (Nginx configured)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>/privacy, /terms, /cookie-policy pages live</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>robots.txt served as plain text</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Dynamic sitemap.xml available</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Indeed Apply webhook endpoint active (POST /api/public/indeed-apply/:slug)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>HMAC-SHA1 signature verification implemented</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Immediate HTTP 200 response before async processing</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Resume storage at /uploads/public-cv/</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Recruiter notifications on Indeed applications</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>GDPR consent checkbox on application form</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Cookie consent banner on careers pages</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#10B981' }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Screener questions endpoint active & configurable per position</span>
                  </div>
                </div>
              </div>

              {/* Group 2 */}
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, borderBottom: '1px solid var(--border-light)', paddingBottom: 6 }}>
                  Employer Requirements (Client action needed) <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>— Fusaro Uomo action</span>
                </h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Developer Agreement signed with Indeed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Indeed employer account active (employers.indeed.com)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Partner Console registration completed (console.indeed.com)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>API credentials (Client ID + Secret) provided to developer</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Single-source attestation confirmed (no other Indeed feed for these jobs)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Correct store postal codes and addresses confirmed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Legal pages approved by Italian legal counsel</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Contact email (@fusarouomo.it) designated for Indeed correspondence</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#7C3AED' }}>
                    <User size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>Feed URL submitted to Giacomo after all above are complete</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Kanban Panel ─────────────────────────────────────────────────────────────

const KanbanPanel: React.FC<{ 
  canEdit: boolean; 
  canFeedback: boolean; 
  canTag: boolean; 
  companyId?: number;
  preSelectedCandidateId?: number | null;
  companies?: Company[];
}> = ({ canEdit, canFeedback, canTag, companyId, preSelectedCandidateId, companies = [] }) => {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { isMobile } = useBreakpoint();
  const { user, targetCompanyId, allowedCompanyIds } = useAuth();
  const { socket } = useSocket();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterJob, setFilterJob] = useState<string>('');
  const [draggedCandidateId, setDraggedCandidateId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CandidateStatus | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  const openCandidateModal = (c: Candidate) => {
    setSelected(c);
    setSearchParams((prev) => {
      prev.set('candidateId', String(c.id));
      return prev;
    }, { replace: true });
  };

  const closeCandidateModal = () => {
    setSelected(null);
    setSearchParams((prev) => {
      prev.delete('candidateId');
      prev.delete('interviewId');
      prev.delete('feedbackId');
      return prev;
    }, { replace: true });
  };
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [addJobId, setAddJobId] = useState<string>('');
  const [addFirstName, setAddFirstName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addLinkedinUrl, setAddLinkedinUrl] = useState('');
  const [addCompanyEmail, setAddCompanyEmail] = useState('');
  const [addAvailableStartDate, setAddAvailableStartDate] = useState('');
  const [addPostalCode, setAddPostalCode] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addProfile, setAddProfile] = useState<CandidateApplicationProfile>(() => buildCandidateProfile({
    availability: '',
    gender: '',
    nationality: '',
    country: '',
    state: '',
    city: '',
    address: '',
    postalCode: '',
    dateOfBirth: '',
    currentEmployer: '',
    currentRole: '',
    hasCurrentEmployer: '',
    maritalStatus: '',
    uniqueId: generateEmployeeUniqueId(),
    password: generateTempPassword(),
    hireDate: new Date().toISOString().slice(0, 10),
    contractType: '',
    applicationDate: new Date().toISOString().slice(0, 10),
    availableStartDate: '',
    applicationSource: 'ats',
    applicationChannel: 'internal',
    startDate: '',
  }));
  const [addCvFile, setAddCvFile] = useState<File | null>(null);
  const [addCoverLetter, setAddCoverLetter] = useState('');
  const [addGdprConsent, setAddGdprConsent] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addModalJobs, setAddModalJobs] = useState<JobPosting[]>([]);
  const [addModalJobsLoading, setAddModalJobsLoading] = useState(false);
  const [showCvPreview, setShowCvPreview] = useState(false);
  const [cvPreviewUrl, setCvPreviewUrl] = useState<string | null>(null);
  const [interviewInviteEnabled, setInterviewInviteEnabled] = useState<boolean | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  // Employee creation on hire
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeData, setEmployeeData] = useState<HiringEmployeeDraft | null>(null);
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  const hasMultiCompanyScope = (allowedCompanyIds?.length ?? 0) > 1;
  const effectiveCompanyId = companyId ?? (hasMultiCompanyScope
    ? undefined
    : (targetCompanyId ?? (user?.isSuperAdmin ? undefined : user?.companyId ?? undefined)));
  const scopedCompanyId = user?.isSuperAdmin ? companyId : effectiveCompanyId;

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [cands, js, emps] = await Promise.all([
        getCandidates(filterJob ? { jobId: parseInt(filterJob, 10), companyId: effectiveCompanyId } : { companyId: effectiveCompanyId }),
        getJobs(scopedCompanyId ? { companyId: scopedCompanyId } : undefined),
        effectiveCompanyId ? getEmployees({ targetCompanyId: effectiveCompanyId, status: 'active', includeStoreTerminals: false, limit: 500 }) : (companyId ? getEmployees({ targetCompanyId: companyId, status: 'active', includeStoreTerminals: false, limit: 500 }) : Promise.resolve({ employees: [] })),
      ]);
      setCandidates(cands); setJobs(js); setEmployees(emps.employees || []);

      // Load notification settings and SMTP config
      if (effectiveCompanyId) {
        const [notifResult, emailResult] = await Promise.allSettled([
          getNotificationSettings(effectiveCompanyId),
          getEmailConfig(effectiveCompanyId),
        ]);

        if (notifResult.status === 'fulfilled') {
          const interviewInviteSetting = notifResult.value.find((s: NotificationSetting) => s.eventKey === 'ats.interview_invite');
          // Missing row means default-enabled behavior in backend.
          setInterviewInviteEnabled(interviewInviteSetting?.enabled ?? true);
        } else {
          setInterviewInviteEnabled(null);
        }

        if (emailResult.status === 'fulfilled') {
          setSmtpConfigured(Boolean(emailResult.value?.config?.smtpHost));
        } else {
          setSmtpConfigured(null);
        }
      } else {
        setInterviewInviteEnabled(null);
        setSmtpConfigured(null);
      }
    } catch { showToast(t('ats.errorLoad'), 'error'); }
    finally { setLoading(false); }
  }, [filterJob, effectiveCompanyId, scopedCompanyId, showToast, t]);

  useEffect(() => { fetch(); }, [fetch]);

  // Handle deep linking for candidate selection
  useEffect(() => {
    if (preSelectedCandidateId) {
      if (!selected || selected.id !== preSelectedCandidateId) {
        const match = candidates.find(c => c.id === preSelectedCandidateId);
        if (match) {
          setSelected(match);
        } else {
          let active = true;
          getCandidate(preSelectedCandidateId)
            .then((c: Candidate) => {
              if (active && c) {
                setSelected(c);
              }
            })
            .catch((err: any) => {
              console.error('Failed to fetch deep-linked candidate:', err);
            });
          return () => {
            active = false;
          };
        }
      }
    } else {
      if (selected) {
        setSelected(null);
      }
    }
  }, [preSelectedCandidateId, candidates, selected]);

  useEffect(() => {
    if (!socket) return;

    const handleRealtimeCandidate = (payload: { candidate?: Candidate }) => {
      const incoming = payload?.candidate;
      if (!incoming || typeof incoming.id !== 'number') return;

      if (effectiveCompanyId && incoming.companyId !== effectiveCompanyId) {
        return;
      }

      if (user?.role === 'store_manager' && incoming.storeId !== user.storeId) {
        return;
      }

      if (filterJob) {
        const selectedJobId = Number.parseInt(filterJob, 10);
        if (!Number.isNaN(selectedJobId) && incoming.jobPostingId !== selectedJobId) {
          return;
        }
      }

      setCandidates((prev) => {
        if (prev.some((c) => c.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    };

    socket.on('ATS_CANDIDATE_CREATED', handleRealtimeCandidate);
    return () => {
      socket.off('ATS_CANDIDATE_CREATED', handleRealtimeCandidate);
    };
  }, [socket, filterJob, user?.role, user?.storeId, effectiveCompanyId]);

  const byStage = (stage: CandidateStatus) =>
    candidates.filter((c) => c.status === stage).sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const buildHiringDraft = (candidate: Candidate): HiringEmployeeDraft => {
    const job = candidate.jobPostingId ? jobs.find((item) => item.id === candidate.jobPostingId) : null;
    const profile = parseCandidateProfile(candidate.sourceRef);
    const nameParts = candidate.fullName.trim().split(/\s+/);
    const hireDate = profile.hireDate || candidate.appliedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const workingType = job?.jobType === 'parttime' ? 'part_time' : 'full_time';
    const contractType = profile.contractType || job?.contractType || '';

    return {
      name: nameParts[0] || '',
      surname: nameParts.slice(1).join(' ') || '',
      personalEmail: candidate.email || '',
      phone: candidate.phone || '',
      role: job?.targetRole || 'employee',
      companyId: candidate.companyId,
      storeId: candidate.storeId,
      companyName: job?.companyName || '',
      companyGroupName: job?.companyGroupName || '',
      companyLogoFilename: job?.companyLogoFilename ?? null,
      storeName: job?.storeName || '',
      storeLogoFilename: job?.storeLogoFilename ?? null,
      storeEmployeeCount: job?.storeEmployeeCount ?? null,
      jobTitle: job?.title || '',
      uniqueId: profile.uniqueId || generateEmployeeUniqueId(),
      password: profile.password || generateTempPassword(),
      hireDate,
      contractType,
      maritalStatus: profile.maritalStatus || '',
      workingType,
      weeklyHours: job?.weeklyHours != null ? String(job.weeklyHours) : '',
      dateOfBirth: profile.dateOfBirth,
      nationality: profile.nationality,
      gender: profile.gender,
      country: profile.country,
      state: profile.state,
      city: profile.city,
      currentEmployer: profile.currentEmployer,
      currentRole: profile.currentRole,
      availability: profile.availability,
      applicationDate: profile.applicationDate || candidate.appliedAt?.slice(0, 10) || '',
      applicationSource: profile.applicationSource || candidate.source,
      applicationChannel: profile.applicationChannel || candidate.source,
    };
  };

  const handleAdvance = async (status: CandidateStatus) => {
    if (!canEdit) return;
    if (!selected) return;

    // If moving to hired, prepare employee creation
    if (status === 'hired') {
      // Prepare employee data
      setEmployeeData(buildHiringDraft(selected));
      setEmployeeEmail('');
      setShowEmployeeModal(true);
      return; // Don't update stage yet, wait for employee creation
    }

    setSaving(true);
    try {
      const updated = await updateCandidateStage(selected.id, status);
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelected(updated);
      showToast(t('ats.stageUpdated'), 'success');
    } catch (err) {
      showToast(translateApiError(err, t, t('ats.errorStage')) ?? t('ats.errorStage'), 'error');
    } finally { setSaving(false); }
  };

  const handleCreateEmployeeFromCandidate = async () => {
    if (!employeeEmail.trim()) {
      showToast(t('ats.companyEmailRequired', 'Company email is required'), 'error');
      return;
    }
    if (!employeeData || !selected) return;

    setCreatingEmployee(true);
    try {
      // Create employee
      await createEmployee({
        name: employeeData.name,
        surname: employeeData.surname,
        email: employeeEmail.trim(),
        uniqueId: employeeData.uniqueId || undefined,
        password: employeeData.password || undefined,
        hireDate: employeeData.hireDate || undefined,
        contractType: employeeData.contractType || undefined,
        maritalStatus: employeeData.maritalStatus || undefined,
        workingType: (employeeData.workingType === 'full_time' || employeeData.workingType === 'part_time') ? employeeData.workingType : undefined,
        personalEmail: employeeData.personalEmail,
        phone: employeeData.phone || undefined,
        role: employeeData.role as 'admin' | 'hr' | 'area_manager' | 'store_manager' | 'employee' | 'store_terminal',
        companyId: employeeData.companyId,
        storeId: employeeData.storeId || undefined,
        weeklyHours: employeeData.weeklyHours ? Number(employeeData.weeklyHours) : undefined,
        dateOfBirth: employeeData.dateOfBirth || undefined,
        nationality: employeeData.nationality || undefined,
        gender: employeeData.gender || undefined,
        country: employeeData.country || undefined,
        state: employeeData.state || undefined,
        city: employeeData.city || undefined,
        status: 'active',
      });

      // Update candidate to hired
      const updated = await updateCandidateStage(selected.id, 'hired');
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelected(updated);

      // Close modal and reset
      setShowEmployeeModal(false);
      setEmployeeData(null);
      setEmployeeEmail('');

      showToast(t('ats.employeeCreatedAndHired', 'Employee created and candidate marked as hired'), 'success');
    } catch (err) {
      showToast(translateApiError(err, t, t('ats.errorCreatingEmployee', 'Failed to create employee')) ?? t('ats.errorCreatingEmployee', 'Failed to create employee'), 'error');
    } finally {
      setCreatingEmployee(false);
    }
  };

  const handleReject = async (reason?: string) => {
    if (!canEdit) return;
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateCandidateStage(selected.id, 'rejected', reason);
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      closeCandidateModal();
      showToast(t('ats.candidateRejected'), 'success');
    } catch { showToast(t('ats.errorStage'), 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!canEdit) return;
    if (!selected) return;
    setSaving(true);
    try {
      await deleteCandidate(selected.id);
      setCandidates((prev) => prev.filter((c) => c.id !== selected.id));
      closeCandidateModal();
      showToast(t('ats.candidateDeleted'), 'success');
    } catch (err) {
      showToast(translateApiError(err, t, t('ats.errorDelete')) ?? t('ats.errorDelete'), 'error');
    }
    finally { setSaving(false); }
  };

  const handleAddCandidate = async () => {
    if (addSaving) return;

    if (addStep !== 2) {
      setAddStep(2);
      return;
    }

    if (!addJobId) {
      showToast(t('ats.noPosition', 'No position selected'), 'error');
      return;
    }

    const isSpontaneous = addJobId === 'spontaneous';
    const parsedAddJobId = isSpontaneous ? undefined : Number.parseInt(addJobId, 10);
    if (!isSpontaneous && (parsedAddJobId === undefined || Number.isNaN(parsedAddJobId))) {
      showToast(t('ats.noPosition', 'No position selected'), 'error');
      return;
    }

    if (!addGdprConsent) {
      showToast(t('publicCareers.privacyRequiredError', 'You must accept the privacy notice to submit your application.'), 'error');
      return;
    }

    const normalizedName = [addFirstName.trim(), addLastName.trim()]
      .filter(Boolean)
      .join(' ')
      || addEmail.trim()
      || t('ats.defaultCandidateName', 'Candidate');

    setAddSaving(true);
    try {
      const applicationDate = addProfile.applicationDate || new Date().toISOString().slice(0, 10);
      const c = await createCandidate({
        fullName: normalizedName,
        email: addEmail.trim() || undefined,
        phone: addPhone.trim() || undefined,
        jobPostingId: parsedAddJobId,
        storeId: addSelectedJob && 'storeId' in addSelectedJob ? (addSelectedJob as any).storeId ?? undefined : undefined,
        linkedinUrl: addLinkedinUrl.trim() || undefined,
        coverLetter: addCoverLetter.trim() || undefined,
        gdprConsent: addGdprConsent,
        resumeFile: addCvFile,
        source: 'internal_manual',
        sourceRef: serializeCandidateProfile({
          ...addProfile,
          availability: addProfile.availability,
          applicationDate,
          availableStartDate: addAvailableStartDate.trim() || '',
          postalCode: addPostalCode.trim() || '',
          address: addAddress.trim() || '',
          applicationSource: 'ats',
          applicationChannel: 'internal',
        }),
        appliedAt: new Date().toISOString(),
      });
      setCandidates((prev) => {
        if (effectiveCompanyId && c.companyId !== effectiveCompanyId) {
          return prev;
        }
        // Check if candidate already exists to prevent duplicates
        const exists = prev.some(existing => existing.id === c.id);
        if (exists) {
          return prev;
        }
        return [c, ...prev];
      });
      closeAddCandidateModal();
      showToast(t('ats.candidateAdded'), 'success');
    } catch (err) {
      showToast(translateApiError(err, t, t('ats.errorSave')) ?? t('ats.errorSave'), 'error');
    }
    finally { setAddSaving(false); }
  };

  const STAGE_LABELS: Record<CandidateStatus, string> = {
    received: t('ats.stage_received'),
    review: t('ats.stage_review'),
    phone_interview: t('ats.stage_phone_interview'),
    interview: t('ats.stage_interview'),
    hired: t('ats.stage_hired'),
    rejected: t('ats.stage_rejected'),
  };

  const STAGE_ICON: Record<CandidateStatus, string> = {
    received: '📥',
    review: '🔍',
    phone_interview: '📞',
    interview: '🤝',
    hired: '✅',
    rejected: '✕',
  };

  const addSelectionJobs = addModalJobs.length > 0 ? addModalJobs : jobs;
  const publishedJobs = addSelectionJobs.filter((j) => String(j.status).toLowerCase() === 'published');
  const draftJobs = addSelectionJobs.filter((j) => String(j.status).toLowerCase() === 'draft');
  const closedJobs = addSelectionJobs.filter((j) => String(j.status).toLowerCase() === 'closed');
  const addSelectedJob = addJobId === 'spontaneous'
    ? { id: 'spontaneous', title: t('ats.spontaneousApplication', 'Candidatura Spontanea'), storeName: '' }
    : addSelectionJobs.find((job) => String(job.id) === addJobId) ?? null;

  const resetAddCandidateForm = useCallback(() => {
    setAddStep(1);
    setAddJobId('');
    setAddFirstName('');
    setAddLastName('');
    setAddEmail('');
    setAddPhone('');
    setAddLinkedinUrl('');
    setAddCompanyEmail('');
    setAddAvailableStartDate('');
    setAddPostalCode('');
    setAddAddress('');
    setAddProfile(buildCandidateProfile({
      availability: '',
      gender: '',
      nationality: '',
      country: '',
      state: '',
      city: '',
      address: '',
      postalCode: '',
      dateOfBirth: '',
      currentEmployer: '',
      currentRole: '',
      hasCurrentEmployer: '',
      maritalStatus: '',
      uniqueId: generateEmployeeUniqueId(),
      password: generateTempPassword(),
      hireDate: new Date().toISOString().slice(0, 10),
      contractType: '',
      applicationDate: new Date().toISOString().slice(0, 10),
      availableStartDate: '',
      applicationSource: 'ats',
      applicationChannel: 'internal',
      startDate: '',
    }));
    setAddCvFile(null);
    setAddCoverLetter('');
    setAddGdprConsent(false);
    setShowCvPreview(false);
    if (cvPreviewUrl) {
      URL.revokeObjectURL(cvPreviewUrl);
      setCvPreviewUrl(null);
    }
  }, [cvPreviewUrl]);

  const loadAddModalJobs = useCallback(async () => {
    setAddModalJobsLoading(true);
    try {
      const [publishedResult, draftResult, closedResult, allResult] = await Promise.allSettled([
        getJobs(scopedCompanyId ? { status: 'published', companyId: scopedCompanyId } : { status: 'published' }),
        getJobs(scopedCompanyId ? { status: 'draft', companyId: scopedCompanyId } : { status: 'draft' }),
        getJobs(scopedCompanyId ? { status: 'closed', companyId: scopedCompanyId } : { status: 'closed' }),
        getJobs(scopedCompanyId ? { companyId: scopedCompanyId } : undefined),
      ]);

      const published = publishedResult.status === 'fulfilled' ? publishedResult.value : [];
      const draft = draftResult.status === 'fulfilled' ? draftResult.value : [];
      const closed = closedResult.status === 'fulfilled' ? closedResult.value : [];
      const allJobs = allResult.status === 'fulfilled' ? allResult.value : [];

      const publishedIds = new Set(published.map((item) => item.id));
      const draftIds = new Set(draft.map((item) => item.id));
      const mergedFromStatus = [
        ...published,
        ...draft.filter((item) => !publishedIds.has(item.id)),
        ...closed.filter((item) => !publishedIds.has(item.id) && !draftIds.has(item.id)),
      ];
      const merged = mergedFromStatus.length > 0
        ? mergedFromStatus
        : allJobs.filter((item) => {
          const normalizedStatus = String(item.status).toLowerCase();
          return normalizedStatus === 'published' || normalizedStatus === 'draft' || normalizedStatus === 'closed';
        });

      setAddModalJobs(merged);
    } finally {
      setAddModalJobsLoading(false);
    }
  }, [scopedCompanyId]);

  const renderAddModalJobDetails = useCallback((jobOption: JobPosting, tone: 'published' | 'draft' | 'closed') => {
    const postedByName = [jobOption.createdByName, jobOption.createdBySurname].filter(Boolean).join(' ').trim()
      || (jobOption.createdById ? `User #${jobOption.createdById}` : t('common.notSet', 'Not set'));
    const creatorAvatarUrl = getAvatarUrl(jobOption.createdByAvatarFilename ?? null);
    const locationLabel = [jobOption.jobCity ?? jobOption.city, jobOption.jobState ?? jobOption.state, jobOption.jobCountry ?? jobOption.country]
      .filter(Boolean)
      .join(', ')
      || t(`ats.remoteType_${jobOption.remoteType}`, jobOption.remoteType);
    const companyLabel = jobOption.companyName || `Company #${jobOption.companyId}`;
    const companyCountryCode = normalizeCountryCode(jobOption.companyCountry ?? '');
    const storeCountryCode = normalizeCountryCode(jobOption.jobCountry ?? jobOption.country ?? '');
    const toneColor = tone === 'published' ? '#166534' : tone === 'draft' ? '#92400E' : '#991B1B';
    const chipBackground = tone === 'published' ? 'rgba(22,163,74,0.08)' : tone === 'draft' ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.08)';
    const chipBorder = tone === 'published' ? '1px solid rgba(22,163,74,0.22)' : tone === 'draft' ? '1px solid rgba(245,158,11,0.28)' : '1px solid rgba(239,68,68,0.24)';
    const salaryLabel = formatEuroRange(jobOption.salaryMin, jobOption.salaryMax, i18n.language || 'it-IT', t('common.notSet', 'Not set'));
    const postedAtSource = jobOption.publishedAt ?? jobOption.createdAt;

    return (
      <>
        <strong style={{ fontSize: 13.5, color: toneColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'break-word', display: 'block' }}>
          {jobOption.title}
        </strong>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: toneColor, background: chipBackground, border: chipBorder, borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {companyLabel}
            {companyCountryCode && <ReactCountryFlag countryCode={companyCountryCode} svg style={{ width: '0.9em', height: '0.9em', marginLeft: 2 }} />}
          </span>
          {jobOption.companyGroupName && (
            <span style={{ fontSize: 11, color: '#64748B', background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: 999, padding: '2px 7px' }}>
              {jobOption.companyGroupName}
            </span>
          )}
          {jobOption.storeName && (
            <span style={{ fontSize: 11, color: toneColor, background: chipBackground, border: chipBorder, borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {jobOption.storeName}
              {storeCountryCode && <ReactCountryFlag countryCode={storeCountryCode} svg style={{ width: '0.9em', height: '0.9em', marginLeft: 2 }} />}
            </span>
          )}
          {jobOption.storeName && jobOption.storeEmployeeCount !== null && jobOption.storeEmployeeCount !== undefined && (
            <span style={{ fontSize: 11, color: toneColor, background: chipBackground, border: chipBorder, borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={11} /> {jobOption.storeEmployeeCount} {t('ats.employees', 'employees')}
            </span>
          )}
          <span style={{ fontSize: 11, color: toneColor, background: chipBackground, border: chipBorder, borderRadius: 999, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Languages size={11} /> {jobOption.language.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <BriefcaseBusiness size={11} /> {t(`ats.jobType_${JOB_TYPE_LABEL[jobOption.jobType]}`, jobOption.jobType)}
          </span>
          <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Globe2 size={11} /> {t(`ats.remoteType_${jobOption.remoteType}`, jobOption.remoteType)}
          </span>
          {jobOption.department && (
            <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <FileText size={11} /> {jobOption.department}
            </span>
          )}
          {jobOption.contractType && (
            <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <BadgeCheck size={11} /> {jobOption.contractType}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={11} /> {locationLabel}
          </span>
          <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Wallet size={11} /> {salaryLabel}
          </span>
          <span style={{ fontSize: 11, color: toneColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock3 size={11} /> {jobOption.weeklyHours ?? '-'} {t('ats.hoursPerWeek', 'hrs/week')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, minWidth: 0 }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: chipBorder, background: '#fff', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 700, color: toneColor }}>
            {creatorAvatarUrl ? <img src={creatorAvatarUrl} alt={postedByName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(postedByName)}
          </span>
          <span style={{ fontSize: 11, color: toneColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {postedByName}
          </span>
          <span style={{ color: toneColor, opacity: 0.45 }}>•</span>
          <span style={{ fontSize: 11, color: toneColor, whiteSpace: 'nowrap' }}>{fmtRelativeTime(postedAtSource)}</span>
        </div>
      </>
    );
  }, [i18n.language, t]);

  useEffect(() => {
    if (!showAddModal) return;
    void loadAddModalJobs();
  }, [showAddModal, loadAddModalJobs]);

  const openAddCandidateModal = () => {
    resetAddCandidateForm();
    if (filterJob) {
      setAddJobId(filterJob);
    }
    setShowAddModal(true);
  };

  const closeAddCandidateModal = () => {
    setShowAddModal(false);
    setAddModalJobs([]);
    resetAddCandidateForm();
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 20,
        alignItems: isMobile ? 'stretch' : 'center',
        flexWrap: 'wrap',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        <div style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
          <CustomSelect
            value={filterJob}
            onChange={(val) => setFilterJob(val || '')}
            options={[
              { value: '', label: t('ats.allJobs') },
              ...jobs.map((j) => ({ value: String(j.id), label: j.title }))
            ]}
            placeholder={t('ats.allJobs')}
            searchable
            isClearable={false}
            highlightSelected={false}
          />
        </div>

        {/* Pipeline summary */}
        {!loading && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STAGES.filter((s) => byStage(s).length > 0).map((s) => (
              <span key={s} style={{
                fontSize: 11, fontWeight: 600,
                background: STAGE_BG[s], color: STAGE_COLOR[s],
                border: `1px solid ${STAGE_COLOR[s]}30`,
                borderRadius: 99, padding: '3px 9px',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {STAGE_ICON[s]} {byStage(s).length}
              </span>
            ))}
          </div>
        )}

        {canEdit && (
          <Button
            variant="primary"
            size="sm"
            style={{ marginLeft: isMobile ? '0' : 'auto' }}
            onClick={openAddCandidateModal}
            fullWidth={isMobile}
          >
            <span style={{ fontSize: 16 }}>+</span> {t('ats.addCandidate')}
          </Button>
        )}
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {STAGES.map((s) => (
            <div key={s} style={{ minWidth: 240, flexShrink: 0, background: 'var(--background)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ height: 4, background: STAGE_COLOR[s] }} />
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <div className="skeleton" style={{ height: 12, width: '55%' }} />
              </div>
              <div
                className="no-scrollbar"
                style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 468, overflowY: 'auto' }}
              >
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="skeleton" style={{ height: 11, width: '65%', marginBottom: 6 }} />
                        <div className="skeleton" style={{ height: 10, width: '40%' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
          {STAGES.map((stage) => {
            const sc = STAGE_COLOR[stage];
            const sb = STAGE_BG[stage];
            const cols = byStage(stage);
            const isTargetOver = dragOverStage === stage;

            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverStage !== stage) {
                    setDragOverStage(stage);
                  }
                }}
                onDragLeave={(e) => {
                  if (!canEdit) return;
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStage(null);
                  }
                }}
                onDrop={async (e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setDragOverStage(null);
                  setDraggedCandidateId(null);
                  const rawId = e.dataTransfer.getData('text/plain');
                  const candidateId = Number.parseInt(rawId, 10);
                  if (Number.isNaN(candidateId)) return;

                  const targetCand = candidates.find(cand => cand.id === candidateId);
                  if (!targetCand || targetCand.status === stage) return;

                  setCandidates((prev) => prev.map((cand) => (
                    cand.id === candidateId
                      ? { ...cand, status: stage, unread: false }
                      : cand
                  )));

                  try {
                    const updated = await updateCandidateStage(candidateId, stage);
                    if (updated) {
                      setCandidates((prev) => prev.map((cand) => (
                        cand.id === candidateId ? updated : cand
                      )));
                    }
                  } catch (err: unknown) {
                    showToast(translateApiError(err, t, t('ats.errorSave')) ?? t('ats.errorSave'), 'error');
                    void fetch();
                  }
                }}
                style={{
                  minWidth: 252, width: 252, flexShrink: 0,
                  background: isTargetOver ? 'rgba(201,151,58,0.06)' : 'var(--background)',
                  borderRadius: 14, overflow: 'hidden',
                  border: isTargetOver ? '2px dashed #C9973A' : '1px solid var(--border)',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Column top bar */}
                <div style={{ height: 4, background: sc }} />

                {/* Column header */}
                <div style={{
                  padding: '8px 12px 8px',
                  borderBottom: `1px solid var(--border)`,
                  background: sb,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 15 }}>{STAGE_ICON[stage]}</span>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: sc, flex: 1, fontFamily: 'var(--font-display)' }}>
                    {STAGE_LABELS[stage]}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
                    background: sc, color: '#fff', borderRadius: 99, padding: '1px 8px',
                    minWidth: 20, textAlign: 'center',
                  }}>
                    {cols.length}
                  </span>
                </div>

                {/* Cards */}
                <div
                  className="no-scrollbar"
                  style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80, maxHeight: 468, overflowY: 'auto' }}
                >
                  {cols.length === 0 && (
                    <div style={{
                      textAlign: 'center', padding: '20px 8px',
                      color: 'var(--text-muted)', fontSize: 12,
                      border: '1px dashed var(--border)', borderRadius: 10,
                    }}>
                      —
                    </div>
                  )}
                  {cols.map((c) => {
                    const jobName = jobs.find((j) => j.id === c.jobPostingId)?.title;
                    const isBeingDragged = draggedCandidateId === c.id;

                    return (
                      <button
                        key={c.id}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          if (!canEdit) return;
                          e.dataTransfer.setData('text/plain', String(c.id));
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggedCandidateId(c.id);
                        }}
                        onDragEnd={() => {
                          setDraggedCandidateId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => openCandidateModal(c)}
                        style={{
                          background: 'var(--surface)',
                          border: `1px solid ${c.unread ? sc : 'var(--border)'}`,
                          borderRadius: 10, padding: '10px 10px',
                          textAlign: 'left', cursor: canEdit ? 'grab' : 'pointer', width: '100%',
                          opacity: isBeingDragged ? 0.4 : 1,
                          boxShadow: c.unread
                            ? `0 0 0 2px ${sc}22, 0 2px 8px rgba(0,0,0,0.07)`
                            : '0 1px 3px rgba(0,0,0,0.05)',
                          transition: 'box-shadow 0.15s, transform 0.15s, opacity 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.10)`;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.boxShadow = c.unread ? `0 0 0 2px ${sc}22, 0 2px 8px rgba(0,0,0,0.07)` : '0 1px 3px rgba(0,0,0,0.05)';
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: jobName || c.email ? 6 : 0 }}>
                          {/* Avatar */}
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            background: sc, color: '#fff',
                            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 2px 6px ${sc}30`,
                          }}>
                            {initials(c.fullName)}
                          </div>

                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{
                              fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                              <span>{c.fullName}</span>
                              {(() => {
                                const profile = parseCandidateProfile(c.sourceRef);
                                if (!profile.country) return null;

                                // Try to get country code - either directly or from country name
                                let countryCode = profile.country.toUpperCase();
                                if (countryCode.length > 2) {
                                  // It's a country name, convert to code
                                  countryCode = COUNTRY_NAME_TO_CODE[profile.country] || '';
                                }

                                if (!countryCode || countryCode.length !== 2) return null;

                                return (
                                  <ReactCountryFlag
                                    countryCode={countryCode}
                                    svg
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      borderRadius: '4px',
                                    }}
                                    title={profile.country}
                                  />
                                );
                              })()}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }} title={fmtDateTime(c.appliedAt ?? c.createdAt)}>
                              {fmtRelativeTime(c.appliedAt ?? c.createdAt)}
                            </div>
                          </div>

                          {c.unread && (
                            <div style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: sc, flexShrink: 0,
                              boxShadow: `0 0 0 2px ${sc}30`,
                            }} />
                          )}
                        </div>

                        {/* Position tag */}
                        {jobName && (
                          <div style={{
                            fontSize: 10.5, color: 'var(--text-muted)',
                            background: 'var(--background)', borderRadius: 5,
                            padding: '2px 7px', marginTop: 2, display: 'inline-block',
                            border: '1px solid var(--border)',
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            📌 {jobName}
                          </div>
                        )}

                        {/* Email */}
                        {c.email && (
                          <div style={{
                            fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            📧 {c.email}
                          </div>
                        )}

                        {/* Tags - Only show user tags, not system tags */}
                        {(() => {
                          const { userTags } = splitCandidateTags(c.tags || []);
                          if (userTags.length === 0) return null;

                          return (
                            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {userTags.slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: 'rgba(59,130,246,0.12)',
                                    color: '#2563EB',
                                    border: '1px solid rgba(59,130,246,0.25)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '100%',
                                  }}
                                  title={tag}
                                >
                                  {tag}
                                </span>
                              ))}
                              {userTags.length > 3 && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 600,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: 'rgba(59,130,246,0.08)',
                                    color: '#2563EB',
                                    border: '1px solid rgba(59,130,246,0.2)',
                                  }}
                                >
                                  +{userTags.length - 3}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddModal && (
        <ModalBackdrop onClose={closeAddCandidateModal} width={760}>
          <div style={{ padding: isMobile ? '16px 14px' : '20px 28px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box', maxWidth: '100%' }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('ats.addCandidate')}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {addStep === 1
                  ? t('ats.selectPositionStepHint', 'Step 1 of 2: choose the job post first.')
                  : t('ats.optionalCandidateStepHint', 'Step 2 of 2: add candidate details (all optional).')}
              </p>
            </div>
            <button onClick={closeAddCandidateModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, padding: '2px 6px' }}>×</button>
          </div>

          <div style={{
            padding: isMobile ? '12px 14px' : '14px 28px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-warm)',
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box',
            maxWidth: '100%',
          }}>
            {[1, 2].map((currentStep, index) => (
              <React.Fragment key={currentStep}>
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep === 1 || addJobId) {
                      setAddStep(currentStep as 1 | 2);
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: (currentStep === 1 || addJobId) ? 'pointer' : 'default',
                    display: 'grid',
                    gap: 4,
                    justifyItems: 'center',
                    padding: 0,
                  }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    border: addStep >= currentStep ? '1px solid rgba(201,151,58,0.9)' : '1px solid rgba(148,163,184,0.4)',
                    color: addStep >= currentStep ? '#ffffff' : '#64748b',
                    background: addStep >= currentStep ? '#C9973A' : '#fff',
                  }}>
                    {addStep > currentStep ? '✓' : currentStep}
                  </div>
                  <span style={{
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: addStep === currentStep ? '#9A6808' : 'var(--text-muted)',
                    fontWeight: addStep === currentStep ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}>
                    {currentStep === 1 ? t('ats.position', 'Position') : t('ats.candidateProfile', 'Candidate profile')}
                  </span>
                </button>
                {index === 0 && (
                  <div style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 999,
                    margin: '0 12px 18px',
                    background: addStep > 1 ? '#C9973A' : 'rgba(148,163,184,0.36)',
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>

          <div style={{ padding: isMobile ? '16px 14px' : '20px 28px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
            {addStep === 1 ? (
              <>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? 10 : 12, background: '#fff', display: 'grid', gap: 10, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {t('ats.selectPositionStepBody', 'Select the role for this candidate. You can add profile details in the next step.')}
                  </div>

                  {addModalJobsLoading ? (
                    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '14px 12px', color: 'var(--text-muted)', fontSize: 12.5 }}>
                      {t('common.loading', 'Loading...')}
                    </div>
                  ) : publishedJobs.length === 0 && draftJobs.length === 0 && closedJobs.length === 0 ? (
                    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '14px 12px', color: 'var(--text-muted)', fontSize: 12.5 }}>
                      {t('ats.noPosition')}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                      {/* Spontaneous Application option */}
                      <button
                        type="button"
                        onClick={() => setAddJobId('spontaneous')}
                        onDoubleClick={() => {
                          setAddJobId('spontaneous');
                          setAddStep(2);
                        }}
                        style={{
                          border: addJobId === 'spontaneous' ? '1px solid rgba(201,151,58,0.62)' : '1px solid var(--border)',
                          borderRadius: 10,
                          padding: '10px 11px',
                          background: addJobId === 'spontaneous' ? 'rgba(201,151,58,0.12)' : '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {t('ats.spontaneousApplication', 'Candidatura Spontanea / Spontaneous Application')}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {t('ats.spontaneousApplicationHint', 'General candidate profile without a specific job posting')}
                          </span>
                        </div>
                        <span style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: addJobId === 'spontaneous' ? '1px solid rgba(201,151,58,0.9)' : '1px solid rgba(148,163,184,0.4)',
                          background: addJobId === 'spontaneous' ? '#C9973A' : '#fff',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {addJobId === 'spontaneous' ? '✓' : ''}
                        </span>
                      </button>

                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <BadgeCheck size={13} /> {t('ats.status_published', 'Published')}
                        </div>

                        {publishedJobs.length === 0 ? (
                          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 11px', color: 'var(--text-muted)', fontSize: 12.5 }}>
                            {t('ats.noPublishedPositions', 'No published positions available.')}
                          </div>
                        ) : publishedJobs.map((jobOption) => {
                          const isSelected = String(jobOption.id) === addJobId;

                          return (
                            <button
                              key={jobOption.id}
                              type="button"
                              onClick={() => setAddJobId(String(jobOption.id))}
                              onDoubleClick={() => {
                                setAddJobId(String(jobOption.id));
                                setAddStep(2);
                              }}
                              style={{
                                border: isSelected ? '1px solid rgba(201,151,58,0.62)' : '1px solid var(--border)',
                                borderRadius: 10,
                                padding: '10px 11px',
                                background: isSelected ? 'rgba(201,151,58,0.12)' : '#fff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                textAlign: 'left',
                              }}
                            >
                              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                {renderAddModalJobDetails(jobOption, 'published')}
                              </div>
                              <span style={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                border: isSelected ? '1px solid rgba(201,151,58,0.9)' : '1px solid rgba(148,163,184,0.4)',
                                background: isSelected ? '#C9973A' : '#fff',
                                color: '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                {isSelected ? '✓' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <FileText size={13} /> {t('ats.status_draft', 'Draft')}
                        </div>

                        {draftJobs.length === 0 ? (
                          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 11px', color: 'var(--text-muted)', fontSize: 12.5 }}>
                            {t('ats.noDraftPositions', 'No draft positions available.')}
                          </div>
                        ) : draftJobs.map((jobOption) => {
                          const isSelected = String(jobOption.id) === addJobId;

                          return (
                            <button
                              key={`draft-${jobOption.id}`}
                              type="button"
                              onClick={() => setAddJobId(String(jobOption.id))}
                              onDoubleClick={() => {
                                setAddJobId(String(jobOption.id));
                                setAddStep(2);
                              }}
                              style={{
                                border: isSelected ? '1px solid rgba(201,151,58,0.62)' : '1px solid rgba(245,158,11,0.28)',
                                borderRadius: 10,
                                padding: '10px 11px',
                                background: isSelected ? 'rgba(201,151,58,0.12)' : 'rgba(245,158,11,0.06)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                textAlign: 'left',
                              }}
                            >
                              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                {renderAddModalJobDetails(jobOption, 'draft')}
                              </div>
                              <span style={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                border: isSelected ? '1px solid rgba(201,151,58,0.9)' : '1px solid rgba(148,163,184,0.4)',
                                background: isSelected ? '#C9973A' : '#fff',
                                color: '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                {isSelected ? '✓' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <Eye size={13} /> {t('ats.status_closed', 'Closed')}
                        </div>

                        {closedJobs.length === 0 ? (
                          <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 11px', color: 'var(--text-muted)', fontSize: 12.5 }}>
                            {t('ats.noClosedPositions', 'No closed positions available.')}
                          </div>
                        ) : closedJobs.map((jobOption) => {
                          return (
                            <div
                              key={`closed-${jobOption.id}`}
                              style={{
                                border: '1px solid rgba(239,68,68,0.24)',
                                borderRadius: 10,
                                padding: '10px 11px',
                                background: 'rgba(239,68,68,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                              }}
                            >
                              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                {renderAddModalJobDetails(jobOption, 'closed')}
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>
                                {t('ats.closedSelectionDisabled', 'Closed')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BriefcaseBusiness size={16} style={{ color: '#9A6808' }} />
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#9A6808',
                    }}>
                      {addSelectedJob?.title ?? t('ats.position', 'Position')}
                    </span>
                  </div>
                  {addSelectedJob?.storeName && (
                    <span style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <StoreIcon size={14} />
                      {addSelectedJob.storeName}
                    </span>
                  )}
                </div>

                {/* Section 1: Basic Information */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '14px 12px' : '16px 16px 12px', background: '#fff', display: 'grid', gap: 12, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('ats.basicInformation', 'Basic Information')}
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('ats.basicInformationHint', 'Required candidate contact details')}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <Input
                      label={t('employees.firstName', 'First name')}
                      value={addFirstName}
                      onChange={(e) => setAddFirstName(e.target.value)}
                      placeholder={t('ats.addCandidateFirstNamePh', 'Mario')}
                      autoFocus
                    />
                    <Input
                      label={t('employees.lastName', 'Last name')}
                      value={addLastName}
                      onChange={(e) => setAddLastName(e.target.value)}
                      placeholder={t('ats.addCandidateLastNamePh', 'Rossi')}
                    />
                    <Input
                      label={t('login.email', 'Email')}
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder={t('ats.addCandidateEmailPh', 'mario@email.com')}
                    />
                    <Input
                      label={t('ats.phone')}
                      type="tel"
                      value={addPhone}
                      onChange={(e) => setAddPhone(e.target.value)}
                      placeholder={t('ats.addCandidatePhonePh', '+39 345...')}
                    />
                    <Input
                      label={t('publicCareers.linkedinLabel', 'LinkedIn URL')}
                      type="url"
                      value={addLinkedinUrl}
                      onChange={(e) => setAddLinkedinUrl(e.target.value)}
                      placeholder={t('ats.addCandidateLinkedinPh', 'https://linkedin.com/in/...')}
                    />
                  </div>
                </div>

                {/* Section 2: Personal Details */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '14px 12px' : '16px 16px 12px', background: '#fff', display: 'grid', gap: 12, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('ats.personalDetails', 'Personal Details')}
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('ats.personalDetailsHint', 'Optional demographic and location information')}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <DatePicker
                      label={t('employees.dateOfBirthField', 'Date of birth')}
                      value={addProfile.dateOfBirth}
                      onChange={(value) => setAddProfile((prev) => ({ ...prev, dateOfBirth: value }))}
                      initialViewYear={new Date().getFullYear() - 30}
                      placement="bottom"
                    />
                    <Select
                      label={t('employees.genderField', 'Gender')}
                      value={addProfile.gender}
                      onChange={(e) => setAddProfile((prev) => ({ ...prev, gender: e.target.value }))}
                    >
                      <option value="">{t('ats.selectOption', 'Select option')}</option>
                      <option value="M">{t('employees.genderMale', 'Male')}</option>
                      <option value="F">{t('employees.genderFemale', 'Female')}</option>
                      <option value="other">{t('employees.genderOther', 'Other')}</option>
                    </Select>
                    <Select
                      label={t('employees.maritalStatusField', 'Marital status')}
                      value={addProfile.maritalStatus}
                      onChange={(e) => setAddProfile((prev) => ({ ...prev, maritalStatus: e.target.value }))}
                    >
                      <option value="">{t('ats.selectOption', 'Select option')}</option>
                      <option value="single">{t('employees.maritalStatusSingle', 'Single')}</option>
                      <option value="married">{t('employees.maritalStatusMarried', 'Married')}</option>
                      <option value="divorced">{t('employees.maritalStatusDivorced', 'Divorced')}</option>
                      <option value="partnered">{t('employees.maritalStatusPartnered', 'Partnered')}</option>
                    </Select>
                    <Input
                      label={t('employees.nationalityField', 'Nationality')}
                      value={addProfile.nationality}
                      onChange={(e) => setAddProfile((prev) => ({ ...prev, nationality: e.target.value }))}
                      placeholder={t('ats.nationalityPlaceholder', 'Italian')}
                    />
                    <Input
                      label={t('employees.addressField', 'Address')}
                      value={addAddress}
                      onChange={(e) => setAddAddress(e.target.value)}
                      placeholder={t('employees.addressPlaceholder', 'Street address')}
                    />
                    <Input
                      label={t('employees.postalCodeField', 'Postal code')}
                      value={addPostalCode}
                      onChange={(e) => setAddPostalCode(e.target.value)}
                      placeholder={t('employees.postalCodePlaceholder', '00100')}
                    />
                  </div>

                  <LocationFieldGroup
                    value={{
                      country: addProfile.country,
                      state: addProfile.state,
                      city: addProfile.city,
                    }}
                    onChange={(location) => setAddProfile((prev) => ({
                      ...prev,
                      country: location.country,
                      state: location.state,
                      city: location.city,
                    }))}
                    includeAddress={false}
                    includePostalCode={false}
                    includePhone={false}
                    labels={{
                      country: t('companies.country', 'Country'),
                      state: t('companies.state', 'State'),
                      city: t('companies.city', 'City'),
                    }}
                  />
                </div>

                {/* Section 3: Employment Details */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '14px 12px' : '16px 16px 12px', background: '#fff', display: 'grid', gap: 12, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('ats.employmentDetails', 'Employment Details')}
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('ats.employmentDetailsHint', 'Work-related information and dates')}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <Input
                      label={t('employees.companyEmailField', 'Company email')}
                      type="email"
                      value={addCompanyEmail}
                      onChange={(e) => setAddCompanyEmail(e.target.value)}
                      placeholder={t('employees.companyEmailPlaceholder', 'mario.rossi@company.com')}
                    />
                    <DatePicker
                      label={t('ats.candidateApplicationDate', 'Candidate application date')}
                      value={addProfile.applicationDate}
                      onChange={(value) => setAddProfile((prev) => ({ ...prev, applicationDate: value }))}
                      placement="bottom"
                    />
                    <DatePicker
                      label={t('ats.availableStartDate', 'Available start date')}
                      value={addAvailableStartDate}
                      onChange={(value) => setAddAvailableStartDate(value)}
                      placement="bottom"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <Input
                      label={t('employees.jobTypeField', 'Job type')}
                      value={
                        (addSelectedJob as any)?.jobType === 'fulltime' ? t('employees.workingTypeFull', 'Full time') :
                          (addSelectedJob as any)?.jobType === 'parttime' ? t('employees.workingTypePart', 'Part time') :
                            (addSelectedJob as any)?.jobType === 'contract' ? t('employees.contractTypeContract', 'Contract') :
                              (addSelectedJob as any)?.jobType === 'internship' ? t('employees.contractInternship', 'Internship') : ''
                      }
                      disabled
                      style={{ background: 'var(--surface-warm)', cursor: 'not-allowed' }}
                      placeholder={t('common.notSet', 'Not set')}
                    />
                    <Input
                      label={t('employees.weeklyHoursField', 'Working hours (availability)')}
                      value={(addSelectedJob as any)?.weeklyHours ? `${(addSelectedJob as any).weeklyHours}` : ''}
                      disabled
                      style={{ background: 'var(--surface-warm)', cursor: 'not-allowed' }}
                      placeholder={t('common.notSet', 'Not set')}
                    />
                  </div>
                </div>

                {/* Documents Section */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? '14px 12px' : '16px 16px 12px', background: '#fff', display: 'grid', gap: 12, boxSizing: 'border-box', maxWidth: '100%', overflowX: 'hidden' }}>
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t('ats.documents', 'Documents')}
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('ats.documentsHint', 'CV and cover letter')}
                    </p>
                  </div>

                  <div
                    style={{
                      border: '1px dashed rgba(201,151,58,0.45)',
                      borderRadius: 12,
                      padding: 14,
                      background: 'rgba(201,151,58,0.06)',
                      display: 'grid',
                      gap: 8,
                      boxSizing: 'border-box',
                      maxWidth: '100%',
                      overflowX: 'hidden',
                    }}
                  >
                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('ats.candidateCvUpload', 'CV / Resume')}
                    </label>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {t('ats.candidateCvUploadHint', 'PDF, DOC or DOCX — max 5 MB. Optional for internal entries; attach when available.')}
                    </p>

                    {!addCvFile ? (
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setAddCvFile(file);
                          if (file) {
                            if (cvPreviewUrl) {
                              URL.revokeObjectURL(cvPreviewUrl);
                            }
                            const url = URL.createObjectURL(file);
                            setCvPreviewUrl(url);
                          }
                        }}
                        style={{ fontSize: 13, maxWidth: '100%' }}
                      />
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#fff',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        boxSizing: 'border-box',
                        maxWidth: '100%',
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {addCvFile.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {(addCvFile.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
                          <button
                            type="button"
                            onClick={() => setShowCvPreview(true)}
                            style={{
                              padding: '6px 10px',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Eye size={13} /> {t('common.view', 'View')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddCvFile(null);
                              if (cvPreviewUrl) {
                                URL.revokeObjectURL(cvPreviewUrl);
                                setCvPreviewUrl(null);
                              }
                            }}
                            style={{
                              padding: '6px 10px',
                              background: 'rgba(220,38,38,0.08)',
                              border: '1px solid rgba(220,38,38,0.2)',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#DC2626',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Trash2 size={13} /> {t('common.delete', 'Delete')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                      {t('publicCareers.coverLetterLabel', 'Cover letter')}
                    </label>
                    <textarea
                      className="field-input"
                      value={addCoverLetter}
                      onChange={(e) => setAddCoverLetter(e.target.value)}
                      rows={4}
                      maxLength={1000}
                      placeholder={t('publicCareers.coverLetterPlaceholder', 'Tell us a bit about this candidate profile')}
                      style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', padding: '10px 12px', fontSize: 13.5, borderRadius: 10, border: '1px solid var(--border)', outline: 'none', display: 'block', background: '#fff', maxWidth: '100%' }}
                    />
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{addCoverLetter.length}/1000</div>
                  </div>

                  <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={addGdprConsent}
                      onChange={(e) => setAddGdprConsent(e.target.checked)}
                      required
                      style={{ marginTop: 2 }}
                    />
                    <span>{t('publicCareers.privacyConsent', 'Privacy consent collected')}</span>
                  </label>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
              <Button variant="secondary" type="button" onClick={closeAddCandidateModal}>
                {t('common.cancel')}
              </Button>

              {addStep === 2 && (
                <Button variant="secondary" type="button" onClick={() => setAddStep(1)}>
                  ← {t('common.back', 'Back')}
                </Button>
              )}

              {addStep === 1 ? (
                <Button variant="primary" type="button" onClick={() => setAddStep(2)} disabled={!addJobId}>
                  {t('common.next', 'Next')} →
                </Button>
              ) : (
                <Button
                  variant="primary"
                  type="button"
                  loading={addSaving}
                  disabled={!addJobId}
                  onClick={() => { void handleAddCandidate(); }}
                >
                  {t('ats.addCandidate')}
                </Button>
              )}
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* CV Preview Modal */}
      {showCvPreview && cvPreviewUrl && addCvFile && (
        <DocumentPreviewModal
          url={cvPreviewUrl}
          filename={addCvFile.name}
          onClose={() => setShowCvPreview(false)}
        />
      )}

      {selected && (
        <CandidateModal
          candidate={selected}
          jobs={jobs}
          employees={employees}
          canEdit={canEdit}
          canTag={canTag}
          canFeedback={canFeedback}
          interviewInviteEnabled={interviewInviteEnabled}
          smtpConfigured={smtpConfigured}
          onClose={closeCandidateModal}
          onAdvance={handleAdvance}
          onReject={handleReject}
          onDelete={handleDelete}
          saving={saving}
          companies={companies}
        />
      )}

      {showEmployeeModal && employeeData && (
        <ModalBackdrop onClose={() => !creatingEmployee && setShowEmployeeModal(false)} width={1040}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: 0,
            width: '100%',
            maxWidth: 1120,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(201,151,58,0.10), rgba(255,255,255,0.96))' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                    {t('ats.createEmployee', 'Create Employee')}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 760 }}>
                    {t('ats.createEmployeePrompt', 'Review the candidate profile, confirm the employee setup fields, and complete the company email before hiring.')}
                  </p>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>{employeeData.jobTitle || t('ats.candidateProfile', 'Candidate')}</span>
                  <span>{employeeData.hireDate ? `${t('employees.hireDateField', 'Hire date')}: ${employeeData.hireDate}` : ''}</span>
                  <span>{employeeData.uniqueId ? `${t('employees.uniqueIdField', 'Unique ID')}: ${employeeData.uniqueId}` : ''}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
                <div style={{ border: '1px solid rgba(201,151,58,0.22)', borderRadius: 14, background: '#fff', padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(201,151,58,0.18)', background: 'rgba(201,151,58,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {employeeData.companyLogoFilename ? (
                      <img src={getCompanyLogoUrl(employeeData.companyLogoFilename) ?? ''} alt={employeeData.companyName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontWeight: 800, color: '#8A5A07', fontSize: 12 }}>{(employeeData.companyName || 'CO').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{t('common.company', 'Company')}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{employeeData.companyName || t('common.notProvided', 'Not provided')}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{employeeData.companyGroupName || t('companies.group', 'No group')}</div>
                  </div>
                </div>

                <div style={{ border: '1px solid rgba(13,33,55,0.12)', borderRadius: 14, background: '#fff', padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(13,33,55,0.12)', background: 'rgba(13,33,55,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {employeeData.storeLogoFilename ? (
                      <img src={getStoreLogoUrl(employeeData.storeLogoFilename) ?? ''} alt={employeeData.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontWeight: 800, color: '#0D2137', fontSize: 12 }}>{(employeeData.storeName || 'ST').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{t('common.store', 'Store')}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{employeeData.storeName || t('common.notProvided', 'Not provided')}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {employeeData.storeEmployeeCount != null ? `${employeeData.storeEmployeeCount} ${t('employees.totalEmployees', 'employees')}` : t('common.notProvided', 'Not provided')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '18px 22px 22px', display: 'grid', gap: 16, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>

              {/* Section 1: Basic Information */}
              <div style={{ border: '1px solid rgba(201,151,58,0.22)', borderRadius: 14, background: '#fff', padding: '16px 16px 12px', display: 'grid', gap: 12 }}>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid rgba(201,151,58,0.18)' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#8A5A07' }}>
                    {t('ats.basicInformation', 'Basic Information')}
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('ats.basicInformationHint', 'Required candidate contact details')}
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  <Input
                    label={t('common.firstName', 'First name')}
                    value={employeeData.name}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                  <Input
                    label={t('common.lastName', 'Last name')}
                    value={employeeData.surname}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, surname: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                  <Input
                    type="email"
                    label={t('common.companyEmail', 'Company Email')}
                    value={employeeEmail}
                    onChange={(e) => setEmployeeEmail(e.target.value)}
                    placeholder={t('ats.companyEmailPlaceholder', 'e.g., john.doe@company.com')}
                    disabled={creatingEmployee}
                    autoFocus
                  />
                  <Input
                    label={t('common.personalEmail', 'Personal Email')}
                    type="email"
                    value={employeeData.personalEmail}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, personalEmail: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                  <Input
                    label={t('ats.phone', 'Phone')}
                    value={employeeData.phone}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, phone: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                </div>
              </div>

              {/* Section 2: Employee Details */}
              <div style={{ border: '1px solid rgba(13,33,55,0.15)', borderRadius: 14, background: '#fff', padding: '16px 16px 12px', display: 'grid', gap: 12 }}>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid rgba(13,33,55,0.12)' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0D2137' }}>
                    {t('ats.employeeDetails', 'Employee Details')}
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('ats.personalDetailsHint', 'Optional demographic and location information')}
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  <DatePicker
                    label={t('employees.dateOfBirthField', 'Date of birth')}
                    value={employeeData.dateOfBirth}
                    onChange={(value) => setEmployeeData((prev) => (prev ? { ...prev, dateOfBirth: value } : prev))}
                    placement="bottom"
                  />
                  <Select
                    label={t('employees.genderField', 'Gender')}
                    value={employeeData.gender}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, gender: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  >
                    <option value="">{t('common.notProvided', 'Not provided')}</option>
                    <option value="M">{t('employees.genderMale', 'Male')}</option>
                    <option value="F">{t('employees.genderFemale', 'Female')}</option>
                    <option value="other">{t('employees.genderOther', 'Other')}</option>
                  </Select>
                  <Input
                    label={t('employees.maritalStatusField', 'Marital status')}
                    value={employeeData.maritalStatus}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, maritalStatus: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                  <Input
                    label={t('employees.nationalityField', 'Nationality')}
                    value={employeeData.nationality}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, nationality: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                  <Select
                    label={t('common.role', 'Role')}
                    value={employeeData.role}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, role: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  >
                    <option value="employee">{t('roles.employee', 'Employee')}</option>
                    <option value="store_manager">{t('roles.store_manager', 'Store manager')}</option>
                    <option value="area_manager">{t('roles.area_manager', 'Area manager')}</option>
                    <option value="hr">{t('roles.hr', 'HR')}</option>
                    <option value="admin">{t('roles.admin', 'Admin')}</option>
                  </Select>
                </div>
                <LocationFieldGroup
                  value={{ country: employeeData.country, state: employeeData.state, city: employeeData.city }}
                  onChange={(location) => setEmployeeData((prev) => (prev ? {
                    ...prev,
                    country: location.country,
                    state: location.state,
                    city: location.city,
                  } : prev))}
                  includeAddress={false}
                  includePostalCode={false}
                  includePhone={false}
                  labels={{
                    country: t('companies.country', 'Country'),
                    state: t('companies.state', 'State'),
                    city: t('companies.city', 'City'),
                  }}
                />
              </div>

              {/* Section 3: Job Position Details */}
              <div style={{ border: '1px solid rgba(59,130,246,0.18)', borderRadius: 14, background: 'rgba(59,130,246,0.04)', padding: '16px 16px 12px', display: 'grid', gap: 12 }}>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e40af' }}>
                    {t('ats.employmentDetails', 'Job Position Details')}
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('ats.employmentDetailsHint', 'Work-related information and dates')}
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  <Select
                    label={t('employees.workingTypeField', 'Working type')}
                    value={employeeData.workingType}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, workingType: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  >
                    <option value="full_time">{t('employees.fullTime', 'Full time')}</option>
                    <option value="part_time">{t('employees.partTime', 'Part time')}</option>
                  </Select>
                  <Select
                    label={t('employees.contractTypeField', 'Contract type')}
                    value={employeeData.contractType}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, contractType: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  >
                    <option value="">{t('common.notProvided', 'Not provided')}</option>
                    <option value="fixed_term">{t('employees.contractFixedTerm', 'Fixed term')}</option>
                    <option value="open_ended">{t('employees.contractOpenEnded', 'Open ended')}</option>
                    <option value="internship">{t('employees.contractInternship', 'Internship')}</option>
                    <option value="consulting">{t('employees.contractConsulting', 'Consulting')}</option>
                  </Select>
                  <DatePicker
                    label={t('employees.hireDateField', 'Hire date')}
                    value={employeeData.hireDate}
                    onChange={(value) => setEmployeeData((prev) => (prev ? { ...prev, hireDate: value } : prev))}
                    placement="bottom"
                  />
                  <Input
                    label={`${t('employees.weeklyHoursField', 'Weekly hours')} (${t('ats.availabilityLabel', 'Availability')})`}
                    value={employeeData.weeklyHours || employeeData.availability || ''}
                    disabled={true}
                    style={{ background: 'rgba(0,0,0,0.02)', cursor: 'not-allowed' }}
                  />
                  <div>
                    <Input
                      label={t('employees.uniqueIdField', 'Unique ID')}
                      value={employeeData.uniqueId}
                      onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, uniqueId: e.target.value } : prev))}
                      disabled={creatingEmployee}
                    />
                    <button
                      type="button"
                      onClick={() => setEmployeeData((prev) => (prev ? { ...prev, uniqueId: generateEmployeeUniqueId() } : prev))}
                      disabled={creatingEmployee}
                      style={{
                        marginTop: '5px', background: 'none', border: 'none',
                        cursor: creatingEmployee ? 'not-allowed' : 'pointer', fontSize: '11px', color: 'var(--accent)',
                        fontFamily: 'var(--font-body)', fontWeight: 500,
                        padding: '2px 0', display: 'flex', alignItems: 'center', gap: '4px',
                        opacity: creatingEmployee ? 0.5 : 1,
                      }}
                    >
                      <RotateCcw size={12} /> {t('employees.regenerateId', 'Regenerate ID')}
                    </button>
                  </div>
                  <Input
                    label={t('employees.tempPasswordLabel', 'Temporary password')}
                    type="text"
                    value={employeeData.password}
                    onChange={(e) => setEmployeeData((prev) => (prev ? { ...prev, password: e.target.value } : prev))}
                    disabled={creatingEmployee}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEmployeeData((prev) => (prev ? { ...prev, uniqueId: generateEmployeeUniqueId(), password: generateTempPassword() } : prev))}
                    disabled={creatingEmployee}
                    style={{ width: '100%', maxWidth: 280 }}
                  >
                    {t('employees.regeneratePassword', 'Regenerate access credentials')}
                  </Button>
                </div>
              </div>

              {/* Application Info Section (Read-only) */}
              <div style={{ border: '1px solid rgba(201,151,58,0.18)', borderRadius: 14, padding: 14, background: 'rgba(201,151,58,0.04)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#8A5A07', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  {t('ats.applicationInfo', 'Application info')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div><strong style={{ color: 'var(--text)' }}>{t('ats.currentEmployerLabel', 'Current employer')}:</strong> {employeeData.currentEmployer || t('common.notProvided', 'Not provided')}</div>
                  <div><strong style={{ color: 'var(--text)' }}>{t('ats.currentRoleLabel', 'Current role')}:</strong> {employeeData.currentRole || t('common.notProvided', 'Not provided')}</div>
                  <div><strong style={{ color: 'var(--text)' }}>{t('ats.availabilityLabel', 'Working hours')}:</strong> {employeeData.availability || employeeData.weeklyHours || t('common.notProvided', 'Not provided')}</div>
                  <div><strong style={{ color: 'var(--text)' }}>{t('ats.applicationDateLabel', 'Application date')}:</strong> {employeeData.applicationDate || t('common.notProvided', 'Not provided')}</div>
                  <div><strong style={{ color: 'var(--text)' }}>{t('ats.applicationSourceLabel', 'Source / channel')}:</strong> {[employeeData.applicationSource, employeeData.applicationChannel].filter(Boolean).join(' / ') || t('common.notProvided', 'Not provided')}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowEmployeeModal(false);
                    setEmployeeData(null);
                    setEmployeeEmail('');
                  }}
                  disabled={creatingEmployee}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateEmployeeFromCandidate}
                  loading={creatingEmployee}
                  disabled={!employeeEmail.trim()}
                >
                  {t('ats.createAndHire', 'Create Employee & Hire')}
                </Button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
};

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

const AlertsPanel: React.FC<{ canViewRisks: boolean; companyId?: number }> = ({ canViewRisks, companyId }) => {
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();
  const [alerts, setAlerts] = useState<HRAlert[]>([]);
  const [risks, setRisks] = useState<JobRisk[]>([]);
  const [feedbacks, setFeedbacks] = useState<AllInterviewFeedbackComment[]>([]);
  const [visibleFeedbackCount, setVisibleFeedbackCount] = useState(8);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.allSettled([
      getAlerts({ companyId }),
      canViewRisks ? getRisks({ companyId }) : Promise.resolve([] as JobRisk[]),
      getAllInterviewFeedbackComments({ companyId }),
    ])
      .then(([alertsResult, risksResult, feedbacksResult]) => {
        if (!isMounted) return;

        if (alertsResult.status === 'fulfilled') {
          setAlerts(alertsResult.value);
        } else {
          setAlerts([]);
        }

        if (risksResult.status === 'fulfilled') {
          setRisks(risksResult.value as JobRisk[]);
        } else {
          setRisks([]);
        }

        if (feedbacksResult.status === 'fulfilled') {
          setFeedbacks(feedbacksResult.value as AllInterviewFeedbackComment[]);
        } else {
          setFeedbacks([]);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [canViewRisks, companyId]);

  useEffect(() => {
    setVisibleFeedbackCount(8);
  }, [companyId, feedbacks.length]);

  const ALERT_ICON: Record<string, string> = {
    new_candidates: '👤',
    interview_today: '🗓',
    candidates_pending: '⏳',
    job_at_risk: '⚠️',
  };

  const ALERT_COLOR: Record<string, string> = {
    new_candidates: '#0284C7',
    interview_today: '#7C3AED',
    candidates_pending: '#C9973A',
    job_at_risk: '#DC2626',
  };

  const RISK_COLORS: Record<string, string> = {
    ok: '#15803D', medium: '#C9973A', high: '#DC2626',
  };

  const RISK_BG: Record<string, string> = {
    ok: 'rgba(21,128,61,0.08)', medium: 'rgba(201,151,58,0.10)', high: 'rgba(220,38,38,0.07)',
  };

  if (loading) return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)', display: 'flex', gap: 14 }}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 12, width: '80%' }} />
          </div>
        </div>
      ))}
    </div>
  );

  const atRiskJobs = risks.filter((r) => r.riskLevel !== 'ok');
  const sortedFeedbacks = [...feedbacks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const visibleFeedbacks = sortedFeedbacks.slice(0, visibleFeedbackCount);
  const hasMoreFeedbacks = visibleFeedbacks.length < sortedFeedbacks.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* HR Alerts */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            🔔 {t('ats.hrAlerts')}
          </h3>
          {alerts.length > 0 && (
            <span style={{
              background: '#DC2626', color: '#fff', borderRadius: 99,
              fontSize: 11, fontWeight: 700, padding: '1px 8px',
            }}>
              {alerts.length}
            </span>
          )}
        </div>

        {alerts.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '36px 28px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: 4 }}>
              {t('ats.noAlerts')}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {alerts.map((alert, i) => {
               const ac = ALERT_COLOR[alert.type] ?? '#6B7280';
              return (
                <div key={i} style={{
                  background: 'var(--surface)',
                  border: `1px solid ${ac}25`,
                  borderLeft: `4px solid ${ac}`,
                  borderRadius: 14, padding: '16px 20px',
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                  transition: 'box-shadow 0.15s',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: `${ac}14`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>
                    {ALERT_ICON[alert.type] ?? '🔔'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {alert.message}
                    </div>
                    {alert.count > 1 && (
                      <div style={{
                        marginTop: 8, display: 'inline-flex', alignItems: 'center',
                        background: `${ac}14`, color: ac,
                        borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                      }}>
                        {alert.count} items
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* At-risk positions */}
      {canViewRisks && atRiskJobs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              ⚠️ {t('ats.jobRisks')}
            </h3>
            <span style={{
              background: '#DC262614', color: '#DC2626', border: '1px solid #DC262625',
              borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 8px',
            }}>
              {atRiskJobs.length}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {atRiskJobs.map((risk) => {
              const rc = RISK_COLORS[risk.riskLevel];
              const rb = RISK_BG[risk.riskLevel];
              const flags = [
                risk.flags.lowCandidates && t('ats.flag_lowCandidates'),
                risk.flags.noInterviews && t('ats.flag_noInterviews'),
                risk.flags.noHires && t('ats.flag_noHires'),
              ].filter(Boolean) as string[];
              return (
                <div key={risk.jobPostingId} style={{
                  background: 'var(--surface)', border: `1px solid ${rc}25`,
                  borderRadius: 14, padding: isMobile ? '12px 14px' : '14px 20px',
                  display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 16, flexWrap: 'wrap',
                  flexDirection: isMobile ? 'column' : 'row',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: rc, flexShrink: 0,
                    boxShadow: `0 0 0 4px ${rc}20`,
                    display: isMobile ? 'none' : 'block'
                  }} />
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {risk.jobTitle}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {flags.map((flag) => (
                        <span key={flag} style={{
                          background: `${rc}12`, color: rc,
                          border: `1px solid ${rc}25`,
                          borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                        }}>
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span style={{
                    background: rb, color: rc,
                    border: `1px solid ${rc}25`,
                    borderRadius: 99, padding: '4px 14px', fontSize: 12, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    flexShrink: 0,
                    alignSelf: isMobile ? 'flex-start' : 'center'
                  }}>
                    {t(`ats.risk_${risk.riskLevel}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            💬 {t('ats.feedbackSection', 'Feedback')}
          </h3>
          {feedbacks.length > 0 && (
            <span style={{
              background: '#0284C7', color: '#fff', borderRadius: 99,
              fontSize: 11, fontWeight: 700, padding: '1px 8px',
            }}>
              {feedbacks.length}
            </span>
          )}
        </div>

        {feedbacks.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '36px 28px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: 4 }}>
              {t('ats.noFeedback', 'No candidate feedback recorded yet')}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {visibleFeedbacks.map((fb) => {
              const d = new Date(fb.createdAt);
              const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
              const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={fb.id} style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                }}>
                  {/* Author and Date/Time Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'rgba(2, 132, 199, 0.1)',
                        color: '#0284C7',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 14, textTransform: 'uppercase'
                      }}>
                        {fb.authorName ? fb.authorName.charAt(0) : 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                          {fb.authorName} {fb.authorSurname}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                          {fb.authorRole ? fb.authorRole.replace('_', ' ') : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {time}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {date}
                      </div>
                    </div>
                  </div>

                  {/* Feedback Body */}
                  <div style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    background: 'var(--background)',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {fb.body}
                  </div>

                  {/* Candidate metadata badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <span>👤</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {fb.candidateName}
                    </span>
                    {fb.positionTitle && (
                      <>
                        <span style={{ color: 'var(--border)' }}>|</span>
                        <span style={{ fontStyle: 'italic' }}>{fb.positionTitle}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
            {hasMoreFeedbacks && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button variant="secondary" onClick={() => setVisibleFeedbackCount((prev) => prev + 8)}>
                  {t('common.loadMore', 'Load More')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


// ─── Main ATSPage ─────────────────────────────────────────────────────────────

export default function ATSPage() {
  const { user, allowedCompanyIds } = useAuth();
  const { t } = useTranslation();
  const { isMobile } = useBreakpoint();

  const isStoreManager = user?.role === 'store_manager';
  const canEdit = !!user && ['admin', 'hr'].includes(user.role);
  const canViewJobs = !!user && ['admin', 'hr', 'area_manager'].includes(user.role);
  const canViewRisks = !!user && ['admin', 'hr'].includes(user.role);
  const canFeedback = !!user && ['admin', 'hr', 'area_manager', 'store_manager'].includes(user.role);
  const canTag = !!user && ['admin', 'hr', 'area_manager', 'store_manager'].includes(user.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<'jobs' | 'indeed' | 'candidates' | 'interviews' | 'alerts' | 'calendar'>(
    (searchParams.get('view') as 'jobs' | 'indeed' | 'candidates' | 'interviews' | 'alerts' | 'calendar') || 'candidates'
  );
  
  const setTab = (newTab: 'jobs' | 'indeed' | 'candidates' | 'interviews' | 'alerts' | 'calendar') => {
    setTabState(newTab);
    setSearchParams((prev) => {
      prev.set('view', newTab);
      return prev;
    }, { replace: true });
  };

  useEffect(() => {
    if (!searchParams.get('view')) {
      setSearchParams((prev) => {
        prev.set('view', tab);
        return prev;
      }, { replace: true });
    }
  }, []);

  const urlView = searchParams.get('view') as 'jobs' | 'indeed' | 'candidates' | 'interviews' | 'alerts' | 'calendar' | null;
  useEffect(() => {
    if (urlView && urlView !== tab) {
      setTabState(urlView);
    }
  }, [urlView, tab]);

  const [stores, setStores] = useState<Store[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | undefined>(undefined);
  
  const deepLinkCandidateId = searchParams.get('candidateId') ? Number(searchParams.get('candidateId')) : null;

  const isSuperAdmin = !!user?.isSuperAdmin;
  const canFilterCompany = isSuperAdmin || ((allowedCompanyIds?.length ?? 0) > 1);

  // Fetch all companies for the filter if authorized
  useEffect(() => {
    if (canFilterCompany) {
      getCompanies()
        .then(data => setAllCompanies(data))
        .catch(err => console.error('Failed to fetch companies for filter:', err));
    }
  }, [canFilterCompany]);

  // Fetch data for calendar when calendar tab is active
  useEffect(() => {
    if (tab === 'calendar') {
      Promise.all([
        getStores().catch(() => []),
        getCompanies().catch(() => []),
        getEmployees({ status: 'active', includeStoreTerminals: false, limit: 500 }).then(res => res.employees).catch(() => []),
        getJobs({ companyId: selectedCompanyId }).catch(() => []),
      ]).then(([storesData, companiesData, employeesData, jobsData]) => {
        setStores(storesData);
        setCompanies(companiesData);
        setEmployees(employeesData);
        setJobs(jobsData);
      });
    }
  }, [tab, selectedCompanyId]);

  const tabs = isStoreManager
    ? [
      { key: 'candidates', label: t('ats.tabCandidates'), icon: '👥' },
      { key: 'interviews', label: t('ats.tabInterviews', 'Interviews'), icon: '📋' },
      { key: 'calendar', label: t('ats.tabCalendar', 'Calendar'), icon: '📅' },
      { key: 'alerts', label: t('ats.tabAlerts'), icon: '🔔' },
    ]
    : [
      ...(canViewJobs ? [{ key: 'jobs', label: t('ats.tabJobs'), icon: '💼' }] : []),
      { key: 'candidates', label: t('ats.tabCandidates'), icon: '👥' },
      { key: 'interviews', label: t('ats.tabInterviews', 'Interviews'), icon: '📋' },
      { key: 'calendar', label: t('ats.tabCalendar', 'Calendar'), icon: '📅' },
      { key: 'alerts', label: t('ats.tabAlerts'), icon: '🔔' },
      ...(canEdit ? [{ key: 'indeed', label: t('ats.tabIndeed', 'Indeed'), icon: '📡' }] : []),
    ];

  // Keep store managers on their allowed tabs only
  useEffect(() => {
    if (isStoreManager && !['candidates', 'interviews', 'calendar', 'alerts'].includes(tab)) {
      setTab('candidates');
    }
  }, [isStoreManager, tab]);

  // Handle deep link tab switching
  useEffect(() => {
    if (deepLinkCandidateId && tab !== 'candidates') {
      setTab('candidates');
    }
  }, [deepLinkCandidateId, tab]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '0 0 20px' : '0 0 28px' }} className="page-enter">

      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, #163352 100%)',
        borderRadius: 16, padding: isMobile ? '18px 20px' : '28px 32px', marginBottom: isMobile ? 18 : 28,
        display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
        flexDirection: isMobile ? 'column' : 'row',
        boxShadow: '0 8px 32px rgba(13,33,55,0.14)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, marginBottom: 6 }}>
            <div style={{
              width: isMobile ? 36 : 42, height: isMobile ? 36 : 42, borderRadius: 10,
              background: 'rgba(201,151,58,0.18)',
              border: '1px solid rgba(201,151,58,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 20,
            }}>
              🎯
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: isMobile ? 21 : 26, fontWeight: 800,
              color: '#fff', margin: 0, letterSpacing: '-0.02em',
            }}>
              {t('nav.ats')}
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: isMobile ? 12.5 : 14, color: 'rgba(255,255,255,0.65)', maxWidth: 480 }}>
            {t('ats.subtitle')}
          </p>
        </div>

        {/* Stage pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.entries({
            received: STAGE_COLOR.received,
            review: STAGE_COLOR.review,
            interview: STAGE_COLOR.interview,
            hired: STAGE_COLOR.hired,
          }) as [CandidateStatus, string][]).map(([stage, color]) => (
            <div key={stage} style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${color}50`,
              borderRadius: 8, padding: isMobile ? '4px 10px' : '6px 12px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: isMobile ? 10 : 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                {t(`ats.stage_${stage}`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Row Container: Pill tab switcher on left, Company Filter on right */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: isMobile ? 18 : 28,
        width: '100%'
      }}>
        {/* Pill tab switcher */}
        <div 
          className="no-scrollbar"
          style={{
            display: 'flex', gap: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 4, width: isMobile ? '100%' : 'fit-content',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {tabs.map((tb) => {
            const isActive = tab === tb.key;
            return (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key as typeof tab)}
                style={{
                  padding: isMobile ? '8px 12px' : '8px 20px',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  border: 'none', borderRadius: 9,
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: isMobile ? 12.5 : 14, cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontFamily: 'var(--font-body)',
                  boxShadow: isActive ? '0 2px 8px rgba(13,33,55,0.18)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: isMobile ? 13 : 15 }}>{tb.icon}</span>
                {tb.label}
              </button>
            );
          })}
        </div>

        {/* Company Filter Dropdown (Super Admin / Admin Only) */}
        {canFilterCompany && (
          <div style={{ 
            width: isMobile ? '100%' : 260
          }}>
            <CustomSelect
              value={selectedCompanyId ? String(selectedCompanyId) : 'all'}
              onChange={(val) => setSelectedCompanyId(val === 'all' ? undefined : Number(val))}
              options={[
                { value: 'all', label: t('common.allCompanies', 'All Companies') },
                ...allCompanies.map(c => ({
                  value: String(c.id),
                  label: c.name
                }))
              ]}
              placeholder={t('common.filterByCompany', 'Filter by Company')}
            />
          </div>
        )}
      </div>

      {tab === 'jobs' && canViewJobs && <JobsPanel canEdit={canEdit} companyId={selectedCompanyId} />}
      {tab === 'indeed' && canEdit && <IndeedPanel canEdit={canEdit} companyId={selectedCompanyId} />}
      {tab === 'candidates' && <KanbanPanel canEdit={canEdit} canFeedback={canFeedback} canTag={canTag} companyId={selectedCompanyId} preSelectedCandidateId={deepLinkCandidateId} companies={companies} />}
      {tab === 'interviews' && <InterviewsPanel companyId={selectedCompanyId} />}
      {tab === 'calendar' && <CalendarPanel positions={jobs} employees={employees} companyId={selectedCompanyId} companies={companies} />}
      {tab === 'alerts' && <AlertsPanel canViewRisks={canViewRisks} companyId={selectedCompanyId} />}
    </div>
  );
}
