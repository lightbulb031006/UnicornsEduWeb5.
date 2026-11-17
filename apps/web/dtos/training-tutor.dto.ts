import type { BonusPaymentStatus } from "@/dtos/bonus.dto";
import type { StaffStatus } from "@/dtos/staff.dto";

/** Hồ sơ gia sư Ban Đào Tạo xem (backend đã lọc field nhạy cảm và tiền). */
export interface TrainingTutorSummary {
  id: string;
  fullName: string;
  status: StaffStatus;
  /**
   * Role nhân sự (không phải PII). Ngoài Admin, backend chỉ trả ba role Gia sư /
   * Ban Chuyên môn / Đào tạo (#278).
   */
  roles: string[];
  avatarUrl: string | null;
  university: string | null;
  highSchool: string | null;
  achievementCount: number;
  /** Chỉ có khi người xem là Trưởng ban Đào tạo (#278). */
  management?: TrainingHeadTutorManagement;
}

/** Cờ quyền backend tính cho Trưởng ban Đào tạo trên từng nhân sự (#278). */
export interface TrainingHeadTutorPermissions {
  canEditRoles: boolean;
  canEditProfile: boolean;
  canChangeStatus: boolean;
  canLockAccount: boolean;
  /** Đổi tên đăng nhập — cùng phạm vi khoá tài khoản (16/11). */
  canEditAccountHandle: boolean;
  canManageMeetLink: boolean;
  canViewBonuses: boolean;
}

export interface TrainingHeadTutorManagement {
  /** Thuộc ba nhóm, không phải chính mình, Admin hay người mang role trưởng. */
  isSubordinate: boolean;
  /** Còn role ngoài ba nhóm (bị ẩn) — dùng khi tắt hết ba role. */
  hasOtherRoles: boolean;
  /** `null` khi không phải cấp dưới. */
  accountLocked: boolean | null;
  permissions: TrainingHeadTutorPermissions;
}

/** Chi tiết: thêm họ / tên (form hồ sơ) và link Meet — `null` nếu không phải cấp dưới. */
export interface TrainingHeadTutorDetailManagement
  extends TrainingHeadTutorManagement {
  lastName: string | null;
  firstName: string | null;
  googleMeetLink: string | null;
  /** Tên đăng nhập — `null` nếu không phải cấp dưới hoặc chưa có tài khoản (16/11). */
  accountHandle: string | null;
}

export interface TrainingTutorClass {
  id: string;
  name: string;
}

/** Dòng danh sách gia sư: hồ sơ + Lớp đang dạy. */
export interface TrainingTutorListItem extends TrainingTutorSummary {
  currentClasses: TrainingTutorClass[];
}

export interface TrainingTutorDetail
  extends Omit<TrainingTutorListItem, "management"> {
  management?: TrainingHeadTutorDetailManagement;
  /** Lớp đã nghỉ: lớp từng dạy nay không còn dạy, không phân biệt lý do. */
  pastClasses: TrainingTutorClass[];
  taughtSessionCount: number;
}

export interface TrainingTutorSession {
  id: string;
  /** ISO date `YYYY-MM-DDT00:00:00.000Z`. */
  date: string;
  /** Giờ tường dạng ISO `1970-01-01THH:mm:ss.000Z`. */
  startTime: string | null;
  endTime: string | null;
  class: TrainingTutorClass;
}

export interface TrainingTutorPage<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export interface TrainingTutorListParams {
  page: number;
  limit: number;
  search?: string;
  status?: "" | StaffStatus;
  /** `all` = nhân sự ba nhóm Gia sư / Ban Chuyên môn / Đào tạo — chỉ Trưởng ban Đào tạo. Mặc định chỉ gia sư. */
  scope?: TrainingTutorScope;
  /** Chỉ với `scope=all`: lọc một nhóm. Rỗng = cả ba nhóm. */
  role?: "" | TrainingTutorRoleFilter;
}

export type TrainingTutorScope = "tutors" | "all";

/** Ba nhóm Trưởng ban Đào tạo quản lý: Gia sư, Ban Chuyên môn, Đào tạo (#278). */
export type TrainingTutorRoleFilter = "teacher" | "lesson_plan" | "training";

/**
 * GET /training/tutors/role-candidates — nhân sự thường ngoài ba nhóm (không
 * admin/role trưởng, không phải chính mình, đang hoạt động) để Trưởng ban Đào
 * tạo bật role (follow-up 13/11 mục 2.2). Chỉ họ tên + role hiện có.
 */
export interface TrainingRoleCandidate {
  id: string;
  fullName: string;
  roles: string[];
}

export interface TrainingRoleCandidateParams {
  page: number;
  limit: number;
  search?: string;
}

/** PATCH /staff/:id/training-roles — trạng thái đích của role gia sư/chuyên môn/đào tạo. */
export interface UpdateStaffTrainingRolesPayload {
  roles: string[];
}

export interface StaffTrainingRolesResult {
  id: string;
  roles: string[];
}

/** GET /training/tutors/:id/bonuses — thưởng cấp dưới, chỉ xem (#278). */
export interface TrainingTutorBonus {
  id: string;
  workType: string;
  amount: number;
  status: BonusPaymentStatus;
  note: string | null;
  month: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

/** PATCH /training/tutors/:id/professional-profile — chỉ hồ sơ chuyên môn. */
export interface UpdateTrainingTutorProfilePayload {
  lastName?: string;
  firstName?: string;
  university?: string;
  highSchool?: string;
}

export interface UpdateTrainingTutorStatusPayload {
  status: StaffStatus;
  reason?: string;
}

export interface TrainingTutorStatusResult {
  id: string;
  status: StaffStatus;
}

export interface TrainingTutorAccountStatusResult {
  id: string;
  accountLocked: boolean;
}
