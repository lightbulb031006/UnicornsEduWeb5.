export type LessonTabId = "overview" | "work" | "exercises";
export type LessonUpsertMode = "create" | "edit";
export type LessonTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";
export type LessonTaskPriority = "low" | "medium" | "high";
export type LessonOutputStatus = "pending" | "completed" | "cancelled";
export type LessonPaymentStatus = "pending" | "paid";
export type LessonOutputDifficultyBand =
  | "easy"
  | "medium"
  | "hard"
  | "very_hard"
  | "extreme";
export type LessonStaffStatus = "active" | "inactive";
export type LessonStaffRole =
  | "admin"
  | "teacher"
  | "assistant"
  | "lesson_plan"
  | "lesson_plan_head"
  | "accountant"
  | "accountant_income"
  | "accountant_expense"
  | "communication"
  | "technical"
  | "customer_care"
  | "training";

export interface LessonOverviewSummary {
  resourceCount: number;
  taskCount: number;
  openTaskCount: number;
  completedTaskCount: number;
}

export interface LessonListMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LessonResourceItem {
  id: string;
  title: string | null;
  description: string | null;
  resourceLink: string;
  lessonTaskId: string | null;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonTaskCreator {
  id: string;
  fullName: string;
  roles: LessonStaffRole[];
  status: LessonStaffStatus;
}

export interface LessonTaskAssignee {
  id: string;
  fullName: string;
  roles: LessonStaffRole[];
  status: LessonStaffStatus;
}

export interface LessonTaskStaffOption {
  id: string;
  fullName: string;
  roles: LessonStaffRole[];
  status: LessonStaffStatus;
}

export interface LessonTaskOption {
  id: string;
  title: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
  dueDate: string | null;
}

export interface LessonResourceOption {
  id: string;
  title: string | null;
  resourceLink: string;
  tags: string[];
  lessonTaskId: string | null;
  lessonTaskTitle: string | null;
}

export interface LessonTaskItem {
  id: string;
  title: string | null;
  description: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
  dueDate: string | null;
  /** Legacy creator staff; task coordination uses `assignees`. */
  createdByStaff: LessonTaskCreator | null;
  /** Unified execution staff for this lesson task. */
  assignees: LessonTaskAssignee[];
  /** Legacy output-level staff summary; not a separate task coordination group. */
  outputAssignees: LessonTaskAssignee[];
}

export interface LessonResourcePreview {
  id: string;
  title: string | null;
  resourceLink: string;
}

export interface LessonOutputProgress {
  total: number;
  completed: number;
}

export interface LessonOutputListItem {
  id: string;
  lessonName: string;
  contestUploaded: string | null;
  date: string;
  /** Nhân sự nhận thanh toán / đứng tên output. */
  staffId: string | null;
  /** Display name for `staffId`, not task execution staff. */
  staffDisplayName: string | null;
  status: LessonOutputStatus;
  paymentStatus: LessonPaymentStatus;
}

export interface LessonTaskDetail extends LessonTaskItem {
  outputs: LessonOutputListItem[];
  outputProgress: LessonOutputProgress;
  resourcePreview: LessonResourcePreview[];
  contestUploadedSummary: string[];
}

export interface LessonOverviewResponse {
  summary: LessonOverviewSummary;
  resources: LessonResourceItem[];
  resourcesMeta: LessonListMeta;
  tasks: LessonTaskItem[];
  tasksMeta: LessonListMeta;
}

export interface LessonWorkSummary {
  taskCount: number;
  outputCount: number;
  pendingOutputCount: number;
  completedOutputCount: number;
  cancelledOutputCount: number;
}

export interface LessonWorkOutputItem extends LessonOutputListItem {
  updatedAt: string;
  task: LessonOutputTaskSummary | null;
  tags: string[];
  level: string | null;
  link: string | null;
  /** Link gốc — fallback khi `link` trống (copy / mở ngoài) */
  originalLink: string | null;
  cost: number;
}

export interface LessonWorkResponse {
  summary: LessonWorkSummary;
  outputs: LessonWorkOutputItem[];
  outputsMeta: LessonListMeta;
}

export interface LessonOutputStaffStatsSummary {
  days: number;
  staff: LessonOutputStaff;
  outputCount: number;
  pendingOutputCount: number;
  completedOutputCount: number;
  cancelledOutputCount: number;
  unpaidCostTotal: number;
}

export interface LessonOutputStaffStatsResponse {
  summary: LessonOutputStaffStatsSummary;
  outputs: LessonWorkOutputItem[];
}

export interface LessonOverviewQueryParams {
  resourcePage: number;
  resourceLimit: number;
  taskPage: number;
  taskLimit: number;
}

export interface LessonWorkQueryParams {
  page: number;
  limit: number;
  /** Lọc theo tháng (1–12), dùng cùng `year`. */
  year?: number;
  month?: number;
  search?: string;
  tag?: string;
  staffId?: string;
  /** `all` hoặc bỏ qua = không lọc theo trạng thái output */
  outputStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Lọc level 0–5 (tab Bài tập / API `GET /lesson-work`) */
  level?: string;
}

export interface CreateLessonResourcePayload {
  title: string;
  resourceLink: string;
  description?: string | null;
  lessonTaskId?: string | null;
  tags?: string[];
}

export interface UpdateLessonResourcePayload {
  title?: string;
  resourceLink?: string;
  description?: string | null;
  lessonTaskId?: string | null;
  tags?: string[];
}

export interface CreateLessonTaskPayload {
  title: string;
  description?: string | null;
  status?: LessonTaskStatus;
  priority?: LessonTaskPriority;
  dueDate?: string | null;
  /** Deprecated: merged into `assigneeStaffIds` by the backend for legacy callers. */
  createdByStaffId?: string | null;
  assigneeStaffIds?: string[] | null;
}

export interface UpdateLessonTaskPayload {
  title?: string;
  description?: string | null;
  status?: LessonTaskStatus;
  priority?: LessonTaskPriority;
  dueDate?: string | null;
  /** Deprecated: merged into `assigneeStaffIds` by the backend for legacy callers. */
  createdByStaffId?: string | null;
  assigneeStaffIds?: string[] | null;
}

export interface LessonOutputTaskSummary {
  id: string;
  title: string | null;
  status: LessonTaskStatus;
  priority: LessonTaskPriority;
}

export interface LessonOutputStaff {
  id: string;
  fullName: string;
  roles: LessonStaffRole[];
  status: LessonStaffStatus;
}

export interface LessonOutputStaffOption {
  id: string;
  fullName: string;
  roles: LessonStaffRole[];
  status: LessonStaffStatus;
}

export interface LessonOutputItem {
  id: string;
  lessonTaskId: string | null;
  lessonName: string;
  originalTitle: string | null;
  source: string | null;
  originalLink: string | null;
  level: string | null;
  difficultyBand: LessonOutputDifficultyBand | null;
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
  tags: string[];
  cost: number;
  date: string;
  contestUploaded: string | null;
  link: string | null;
  /** Nhân sự nhận thanh toán / đứng tên output. */
  staffId: string | null;
  staff: LessonOutputStaff | null;
  status: LessonOutputStatus;
  paymentStatus: LessonPaymentStatus;
  task: LessonOutputTaskSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLessonOutputPayload {
  /** Bỏ qua hoặc `null` khi tạo output chưa gắn lesson task. */
  lessonTaskId?: string | null;
  lessonName: string;
  originalTitle?: string | null;
  source?: string | null;
  originalLink?: string | null;
  level?: string | null;
  difficultyBand?: LessonOutputDifficultyBand | null;
  includesTest?: boolean;
  includesSolution?: boolean;
  includesLectureVideo?: boolean;
  tags?: string[];
  cost?: number;
  paymentStatus?: LessonPaymentStatus;
  date: string;
  contestUploaded?: string | null;
  link?: string | null;
  /** Nhân sự nhận thanh toán / đứng tên output, không phải nhóm điều phối task. */
  staffId?: string | null;
  status?: LessonOutputStatus;
}

export interface UpdateLessonOutputPayload {
  lessonTaskId?: string | null;
  lessonName?: string;
  originalTitle?: string | null;
  source?: string | null;
  originalLink?: string | null;
  level?: string | null;
  difficultyBand?: LessonOutputDifficultyBand | null;
  includesTest?: boolean;
  includesSolution?: boolean;
  includesLectureVideo?: boolean;
  tags?: string[];
  cost?: number;
  paymentStatus?: LessonPaymentStatus;
  date?: string;
  contestUploaded?: string | null;
  link?: string | null;
  staffId?: string | null;
  status?: LessonOutputStatus;
}

export interface BulkUpdateLessonOutputPaymentStatusPayload {
  outputIds: string[];
  paymentStatus: LessonPaymentStatus;
}

export interface BulkUpdateLessonOutputPaymentStatusResult {
  requestedCount: number;
  updatedCount: number;
}
