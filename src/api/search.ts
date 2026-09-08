import apiClient from './client';

export interface CompanySearchResult {
  id: number;
  name: string;
  slug: string;
  logoFilename?: string;
  storeCount?: number;
  employeeCount?: number;
  groupName?: string;
}

export interface EmployeeSearchResult {
  id: number;
  name: string;
  surname: string;
  email: string;
  uniqueId: string;
  role: string;
  avatarFilename?: string | null;
  companyId: number;
  companyName: string;
}

export interface CandidateSearchResult {
  id: number;
  fullName: string;
  email?: string;
  phone?: string;
  status: string;
  companyId: number;
  companyName: string;
  jobTitle?: string;
}

export interface JobSearchResult {
  id: number;
  title: string;
  status: string;
  companyId: number;
  companyName: string;
}

export interface StoreSearchResult {
  id: number;
  name: string;
  code: string;
  address?: string;
  companyId: number;
  companyName: string;
  isActive: boolean;
}

export interface OnboardingSearchResult {
  id: number;
  name?: string; // templates
  description?: string; // templates
  category?: string; // templates
  taskType?: string; // templates
  priority?: string; // templates
  companyId: number;
  companyName: string;
  onboardingType: 'template' | 'task';
  // individual task properties
  taskName?: string;
  taskDescription?: string;
  taskCategory?: string;
  taskPriority?: string;
  completed?: boolean;
  completedAt?: string;
  employeeId?: number; // tasks
  employeeName?: string; // tasks
  employeeSurname?: string; // tasks
  employeeEmail?: string; // tasks
  employeeRole?: string; // tasks
}

export interface MessageSearchResult {
  id: number;
  subject: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  companyId: number;
  companyName: string;
  senderId: number;
  senderName: string;
  senderSurname: string;
  senderRole: string;
  recipientId: number;
  recipientName: string;
  recipientSurname: string;
  recipientRole: string;
}

export interface DocumentSearchResult {
  id: number;
  fileName: string;
  mimeType?: string;
  uploadedAt: string;
  requiresSignature: boolean;
  signedAt?: string;
  categoryName?: string;
  employeeName: string;
  employeeSurname: string;
  employeeRole: string;
  companyId: number;
  companyName: string;
}

export interface GlobalSearchResults {
  companies: CompanySearchResult[];
  employees: EmployeeSearchResult[];
  candidates: CandidateSearchResult[];
  jobs: JobSearchResult[];
  stores: StoreSearchResult[];
  onboarding: OnboardingSearchResult[];
  messages: MessageSearchResult[];
  documents: DocumentSearchResult[];
}

export async function searchGlobal(q: string, module: string = 'all', roleFilter?: string): Promise<GlobalSearchResults> {
  const { data } = await apiClient.get('/search', { params: { q, module, roleFilter } });
  return data.data;
}
