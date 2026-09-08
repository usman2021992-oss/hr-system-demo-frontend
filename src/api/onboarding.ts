import apiClient from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingTemplate {
  id: number;
  companyId: number;
  companyName?: string;
  name: string;
  description: string | null;
  taskType: 'day1' | 'week1' | 'month1' | 'ongoing';
  sortOrder: number;
  isActive: boolean;
  category:
    | 'profile_setup'
    | 'hr_compliance'
    | 'system_access'
    | 'training'
    | 'operations'
    | 'scheduling_shifts'
    | 'performance'
    | 'communication'
    | 'it_tools'
    | 'inventory'
    | 'customer_service'
    | 'finance_payroll'
    | 'hr_docs'
    | 'it_setup'
    | 'meeting'
    | 'other';
  dueDays: number | null;
  linkUrl: string | null;
  priority: 'high' | 'medium' | 'low';
  createdByUserId: number | null;
  createdByName: string | null;
  createdByAvatarFilename: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingTask {
  id: number;
  employeeId: number;
  templateId: number;
  templateName: string;
  templateDescription: string | null;
  templateTaskType: 'day1' | 'week1' | 'month1' | 'ongoing';
  templateCategory: OnboardingTemplate['category'];
  templateLinkUrl: string | null;
  templatePriority: 'high' | 'medium' | 'low';
  assignedByUserId: number | null;
  assignedByName: string | null;
  assignedByAvatarFilename: string | null;
  completed: boolean;
  completedAt: string | null;
  completionNote: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingProgress {
  total: number;
  completed: number;
  percentage: number;
  tasks: OnboardingTask[];
}

export interface EmployeeOnboardingOverview {
  employeeId: number;
  companyId: number;
  companyName: string;
  name: string;
  surname: string;
  email: string;
  role: 'admin' | 'hr' | 'area_manager' | 'store_manager' | 'employee';
  storeId: number | null;
  storeName: string | null;
  avatarFilename: string | null;
  total: number;
  completed: number;
  percentage: number;
  hasTasksAssigned: boolean;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function getTemplates(includeInactive = false, targetCompanyId?: number): Promise<OnboardingTemplate[]> {
  const params: Record<string, unknown> = {};
  if (includeInactive) params.include_inactive = true;
  if (targetCompanyId != null) params.target_company_id = targetCompanyId;

  const { data } = await apiClient.get('/onboarding/templates', {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return data.data.templates as OnboardingTemplate[];
}

export async function createTemplate(payload: {
  companyId?: number;
  name: string;
  description?: string;
  taskType?: OnboardingTemplate['taskType'];
  sortOrder?: number;
  category?: OnboardingTemplate['category'];
  dueDays?: number | null;
  linkUrl?: string | null;
  priority?: OnboardingTemplate['priority'];
}): Promise<OnboardingTemplate> {
  const { data } = await apiClient.post('/onboarding/templates', {
    company_id: payload.companyId,
    name: payload.name,
    description: payload.description ?? null,
    task_type: payload.taskType ?? 'day1',
    sort_order: payload.sortOrder ?? 0,
    category: payload.category ?? 'other',
    due_days: payload.dueDays ?? null,
    link_url: payload.linkUrl ?? null,
    priority: payload.priority ?? 'medium',
  });
  return data.data.template as OnboardingTemplate;
}

export async function updateTemplate(
  id: number,
  payload: {
    targetCompanyId?: number;
    name?: string;
    description?: string;
    taskType?: OnboardingTemplate['taskType'];
    sortOrder?: number;
    isActive?: boolean;
    category?: OnboardingTemplate['category'];
    dueDays?: number | null;
    linkUrl?: string | null;
    priority?: OnboardingTemplate['priority'];
  },
): Promise<OnboardingTemplate> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined)        body.name = payload.name;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.taskType !== undefined)    body.task_type = payload.taskType;
  if (payload.sortOrder !== undefined)   body.sort_order = payload.sortOrder;
  if (payload.isActive !== undefined)    body.is_active = payload.isActive;
  if (payload.category !== undefined)    body.category = payload.category;
  if (payload.dueDays !== undefined)     body.due_days = payload.dueDays;
  if (payload.linkUrl !== undefined)     body.link_url = payload.linkUrl;
  if (payload.priority !== undefined)    body.priority = payload.priority;
  if (payload.targetCompanyId !== undefined) body.target_company_id = payload.targetCompanyId;
  const { data } = await apiClient.patch(`/onboarding/templates/${id}`, body);
  return data.data.template as OnboardingTemplate;
}

export async function deleteTemplate(id: number, targetCompanyId?: number): Promise<{ deleted: boolean; deactivated: boolean }> {
  const { data } = await apiClient.delete(`/onboarding/templates/${id}`, {
    params: targetCompanyId != null ? { target_company_id: targetCompanyId } : undefined,
  });
  return data.data as { deleted: boolean; deactivated: boolean };
}

// ---------------------------------------------------------------------------
// Employee Tasks
// ---------------------------------------------------------------------------

export async function getEmployeeTasks(employeeId: number): Promise<OnboardingProgress> {
  const { data } = await apiClient.get(`/onboarding/employees/${employeeId}/tasks`);
  return data.data.progress as OnboardingProgress;
}

export async function assignTasks(
  employeeId: number,
  templateIds?: number[],
): Promise<{ assigned: number }> {
  const { data } = await apiClient.post(
    `/onboarding/employees/${employeeId}/tasks/assign`,
    templateIds ? { template_ids: templateIds } : {},
  );
  return data.data as { assigned: number };
}

export async function completeTask(taskId: number, note?: string): Promise<OnboardingTask> {
  const { data } = await apiClient.patch(
    `/onboarding/tasks/${taskId}/complete`,
    note ? { note } : {},
  );
  return data.data.task as OnboardingTask;
}

// ---------------------------------------------------------------------------
// Overview (admin)
// ---------------------------------------------------------------------------

export async function getOnboardingOverview(targetCompanyId?: number): Promise<EmployeeOnboardingOverview[]> {
  const { data } = await apiClient.get('/onboarding/overview', {
    params: targetCompanyId != null ? { target_company_id: targetCompanyId } : undefined,
  });
  return data.data.overview as EmployeeOnboardingOverview[];
}

export interface OnboardingStats {
  totalEmployees: number;
  notStarted: number;
  inProgress: number;
  complete: number;
  avgPercentage: number;
}

export async function getOnboardingStats(targetCompanyId?: number): Promise<OnboardingStats> {
  const { data } = await apiClient.get('/onboarding/stats', {
    params: targetCompanyId != null ? { target_company_id: targetCompanyId } : undefined,
  });
  return data.data.stats as OnboardingStats;
}

export async function uncompleteTask(taskId: number): Promise<OnboardingTask> {
  const { data } = await apiClient.patch(`/onboarding/tasks/${taskId}/uncomplete`);
  return data.data.task as OnboardingTask;
}

export async function bulkAssignAll(targetCompanyId?: number): Promise<{ employees: number; tasks: number }> {
  const { data } = await apiClient.post('/onboarding/bulk-assign', targetCompanyId != null ? { target_company_id: targetCompanyId } : {});
  return data.data as { employees: number; tasks: number };
}

export async function sendReminder(employeeId: number): Promise<{ sent: boolean }> {
  const { data } = await apiClient.post(`/onboarding/employees/${employeeId}/remind`);
  return data.data as { sent: boolean };
}
