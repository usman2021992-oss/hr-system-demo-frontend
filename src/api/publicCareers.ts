import apiClient from './client';
import { JobLanguage, JobType, RemoteType } from './ats';

export type PublicJobStatus = 'draft' | 'published' | 'closed';

export interface PublicCompany {
  id: number;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  groupName?: string | null;
  logoFilename?: string | null;
  bannerFilename?: string | null;
  ownerUserId?: number | null;
  ownerName?: string | null;
  ownerSurname?: string | null;
  ownerAvatarFilename?: string | null;
  openRolesCount?: number;
  companyEmail?: string | null;
}

export interface PublicHiringContact {
  id: number;
  name: string;
  surname: string | null;
  role: string;
  avatarFilename: string | null;
  storeId: number | null;
  storeName: string | null;
}

export interface PublicStoreOption {
  id: number;
  companyId: number;
  name: string;
}

export interface PublicJob {
  id: number;
  status: PublicJobStatus;
  companyId: number;
  companyName: string;
  companySlug: string;
  companyCountry?: string | null;
  storeId: number | null;
  storeName: string | null;
  title: string;
  description: string | null;
  tags: string[];
  language: JobLanguage;
  jobType: JobType;
  department: string | null;
  weeklyHours: number | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  isRemote: boolean;
  remoteType: RemoteType;
  jobCity: string | null;
  jobState: string | null;
  jobCountry: string | null;
  jobPostalCode: string | null;
  jobAddress: string | null;
  publishedAt: string | null;
  createdAt: string;
  companyGroupName?: string | null;
  companyLogoFilename?: string | null;
  companyBannerFilename?: string | null;
  storeCode?: string | null;
  storeLogoFilename?: string | null;
  storeEmployeeCount?: number | null;
  applicantsCount: number;
  postedBy?: PublicHiringContact | null;
  location: {
    address: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };
}

function buildCatalogFromJobs(jobs: PublicJob[], company?: PublicCompany): { companies: PublicCompany[]; stores: PublicStoreOption[]; tags: string[] } {
  const companyMap = new Map<number, PublicCompany>();
  const storesMap = new Map<number, PublicStoreOption>();
  const tagsSet = new Set<string>();

  if (company) {
    companyMap.set(company.id, company);
  }

  for (const job of jobs) {
    if (!companyMap.has(job.companyId)) {
      companyMap.set(job.companyId, {
        id: job.companyId,
        name: job.companyName,
        slug: job.companySlug,
        city: job.location.city,
        state: job.location.state,
        country: job.companyCountry ?? job.location.country,
        address: job.location.address,
        groupName: job.companyGroupName ?? null,
        logoFilename: job.companyLogoFilename ?? null,
        bannerFilename: job.companyBannerFilename ?? null,
        openRolesCount: 0,
      });
    }

    if (job.storeId && job.storeName && !storesMap.has(job.storeId)) {
      storesMap.set(job.storeId, {
        id: job.storeId,
        companyId: job.companyId,
        name: job.storeName,
      });
    }

    for (const tag of job.tags) {
      const normalized = tag.trim();
      if (normalized) tagsSet.add(normalized);
    }
  }

  return {
    companies: Array.from(companyMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    stores: Array.from(storesMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    tags: Array.from(tagsSet.values()).sort((a, b) => a.localeCompare(b)),
  };
}

export async function getPublicCompany(companySlug: string): Promise<PublicCompany> {
  const { data } = await apiClient.get(`/public/companies/${companySlug}`);
  return data.data.company as PublicCompany;
}

export async function getPublicJobsCatalog(companySlug?: string): Promise<{ jobs: PublicJob[]; companies: PublicCompany[]; stores: PublicStoreOption[]; tags: string[] }> {
  if (companySlug && companySlug.trim() !== '') {
    const { data } = await apiClient.get(`/public/${encodeURIComponent(companySlug)}/jobs`);
    const jobs = (data.data.jobs ?? []) as PublicJob[];
    const company = (data.data.company ?? undefined) as PublicCompany | undefined;
    const derived = buildCatalogFromJobs(jobs, company);
    return {
      jobs,
      companies: derived.companies,
      stores: derived.stores,
      tags: derived.tags,
    };
  }

  const { data } = await apiClient.get('/public/jobs');
  const jobs = (data.data.jobs ?? []) as PublicJob[];
  const derived = buildCatalogFromJobs(jobs);
  return {
    jobs,
    companies: derived.companies,
    stores: derived.stores,
    tags: derived.tags,
  };
}

export async function getPublicJobDetail(jobId: number, companySlug?: string): Promise<{ company: PublicCompany; job: PublicJob; hiringTeam: PublicHiringContact[] }> {
  const endpoint = companySlug && companySlug.trim() !== ''
    ? `/public/${encodeURIComponent(companySlug)}/jobs/${jobId}`
    : `/public/jobs/${jobId}`;

  const { data } = await apiClient.get(endpoint);
  return {
    company: data.data.company as PublicCompany,
    job: data.data.job as PublicJob,
    hiringTeam: (data.data.hiringTeam ?? []) as PublicHiringContact[],
  };
}

export async function applyToPublicJob(params: {
  jobId: number;
  fullName: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  coverLetter?: string;
  resume: File;
  gdprConsent: boolean;
  applicantLocale?: string;
  utmSource?: string;
  availability?: string;
  gender?: string;
  nationality?: string;
  country?: string;
  state?: string;
  city?: string;
  address?: string;
  dateOfBirth?: string;
  currentEmployer?: string;
  currentRole?: string;
  maritalStatus?: string;
  hasCurrentEmployer?: string;
  applicationDate?: string;
  startDate?: string;
  postalCode?: string;
  screenerAnswers?: Array<{ questionId: number; answer: string }>;
}): Promise<void> {
  const formData = new FormData();
  formData.append('full_name', params.fullName);
  formData.append('email', params.email);
  if (params.phone) formData.append('phone', params.phone);
  if (params.linkedinUrl) formData.append('linkedin_url', params.linkedinUrl);
  if (params.coverLetter) formData.append('cover_letter', params.coverLetter);
  if (params.applicantLocale) formData.append('applicant_locale', params.applicantLocale);
  if (params.availability) formData.append('availability', params.availability);
  if (params.gender) formData.append('gender', params.gender);
  if (params.nationality) formData.append('nationality', params.nationality);
  if (params.country) formData.append('country', params.country);
  if (params.state) formData.append('state', params.state);
  if (params.city) formData.append('city', params.city);
  if (params.address) formData.append('address', params.address);
  if (params.dateOfBirth) formData.append('date_of_birth', params.dateOfBirth);
  if (params.currentEmployer) formData.append('current_employer', params.currentEmployer);
  if (params.currentRole) formData.append('current_role', params.currentRole);
  if (params.maritalStatus) formData.append('marital_status', params.maritalStatus);
  if (params.hasCurrentEmployer) formData.append('has_current_employer', params.hasCurrentEmployer);
  if (params.applicationDate) formData.append('application_date', params.applicationDate);
  if (params.startDate) formData.append('start_date', params.startDate);
  if (params.postalCode) formData.append('postal_code', params.postalCode);
  if (params.screenerAnswers) {
    formData.append('screener_answers', JSON.stringify(params.screenerAnswers));
  }
  formData.append('gdpr_consent', params.gdprConsent ? 'true' : 'false');
  formData.append('resume', params.resume);

  await apiClient.post(`/public/jobs/${params.jobId}/apply`, formData, {
    params: {
      utm_source: params.utmSource ?? 'direct',
    },
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export interface LegalDocument {
  id: number;
  documentKey: string;
  language: string;
  title: string;
  content: string;
  platformCompanyName?: string | null;
  platformCompanyEmail?: string | null;
  updatedAt: string;
  updatedByName: string | null;
}

export async function getPublicLegalDocument(key: string, lang = 'it'): Promise<LegalDocument> {
  const { data } = await apiClient.get(`/public/legal-documents/${key}`, { params: { lang } });
  return data.data.document as LegalDocument;
}

export async function updateLegalDocument(key: string, params: { 
  language: string; 
  title: string; 
  content: string;
  platformCompanyName?: string;
  platformCompanyEmail?: string;
}): Promise<LegalDocument> {
  const { data } = await apiClient.put(`/public/legal-documents/${key}`, params);
  return data.data.document as LegalDocument;
}

export interface PublicScreenerQuestionOption {
  label: string;
  value: string;
  isKnockout?: boolean;
}

export interface PublicScreenerQuestion {
  id: string;
  type: string; // 'radio' | 'checkbox' | 'text' | 'number'
  label: string;
  required: boolean;
  isKnockout?: boolean;
  options?: PublicScreenerQuestionOption[];
}

export async function getPublicJobScreenerQuestions(
  companySlug: string,
  jobId: number
): Promise<PublicScreenerQuestion[]> {
  const { data } = await apiClient.get<{ questions: PublicScreenerQuestion[] }>(
    `/public/indeed-apply-questions/${companySlug}/${jobId}`
  );
  return data.questions || [];
}

