/** Role type trên user (phân quyền chính). */
export type UserRoleType = "admin" | "staff" | "student" | "guest";

/** Role chi tiết trên hồ sơ nhân sự (StaffInfo.roles). */
export type StaffRole =
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

export interface CreateUserPayload {
  email: string;
  phone?: string;
  password: string;
  first_name?: string;
  last_name?: string;
  province?: string;
  accountHandle: string;
  roleType?: UserRoleType;
  staffRoles?: StaffRole[];
  emailVerified?: boolean;
}

export type StudentGender = "male" | "female";
export type StudentStatus = "active" | "inactive" | "drop_out";

export interface CreateStudentUserPayload {
  email: string;
  phone: string;
  password: string;
  first_name: string;
  last_name: string;
  province?: string;
  accountHandle: string;
  birth_year?: number;
  gender?: StudentGender;
  school?: string;
  parent_name?: string;
  parent_phone?: string;
  goal?: string;
  status?: StudentStatus;
  class_ids: string[];
  emailVerified?: boolean;
}

export interface CreateUserResponse {
  message: string;
}

export type UserStatus = "active" | "inactive" | "pending";

export interface UpdateUserPayload {
  id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  roleType?: UserRoleType;
  status?: UserStatus;
  linkId?: string;
  province?: string;
  accountHandle?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  staffRoles?: StaffRole[];
}

/** Một dòng user trong danh sách (admin). */
export interface UserListItem {
  id: string;
  email: string;
  phone?: string | null;
  roleType: UserRoleType;
  status: UserStatus | string;
  accountHandle: string;
  first_name?: string | null;
  last_name?: string | null;
  province?: string | null;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  staffInfo?: { id: string } | null;
  studentInfo?: { id: string } | null;
}

export interface UserListMeta {
  total: number;
  page: number;
  limit: number;
}

export interface UserListResponse {
  data: UserListItem[];
  meta: UserListMeta;
}

/** User chi tiết (có staffInfo khi cần phân quyền nhân sự). */
export interface UserDetailWithStaff extends UserListItem {
  staffInfo?: { id: string; roles?: StaffRole[] } | null;
  studentInfo?: { id: string } | null;
}
