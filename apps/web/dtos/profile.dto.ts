import type { StaffGender, StaffStatus } from "./staff.dto";
import type { StudentStatus, StudentGender } from "./student.dto";

/** Staff record as returned in full profile (camelCase from API). */
export interface ProfileStaffInfoDto {
  id: string;
  /** Derived from linked User during rollout. Read User name fields as canonical. */
  fullName: string;
  cccdNumber: string | null;
  cccdIssuedDate?: string | null;
  cccdIssuedPlace?: string | null;
  ethnicity?: string | null;
  gender?: StaffGender | null;
  currentAddress?: string | null;
  birthDate?: string | null;
  university?: string | null;
  highSchool?: string | null;
  specialization?: string | null;
  bankAccount?: string | null;
  bankQrLink?: string | null;
  personalAchievementLink?: string | null;
  status: StaffStatus;
  roles: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Student record as returned in full profile (camelCase from API). */
export interface ProfileStudentInfoDto {
  id: string;
  fullName: string;
  email?: string | null;
  school?: string | null;
  province?: string | null;
  birthYear?: number | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  status: StudentStatus;
  gender: StudentGender;
  goal?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** User as returned in full profile (snake_case for DB-mapped fields). */
export interface ProfileUserDto {
  id: string;
  email: string;
  phone?: string | null;
  roleType: string;
  status?: string;
  accountHandle: string;
  avatarUrl?: string | null;
  fullName?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  province?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  dataConsentAcceptedAt?: string | null;
  dataConsentVersion?: string | null;
  requiresStaffDataConsent?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Full profile: GET /auth/me/full */
export interface FullProfileDto {
  id: string;
  email: string;
  phone?: string | null;
  roleType: string;
  status?: string;
  accountHandle: string;
  avatarUrl?: string | null;
  fullName?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  province?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  dataConsentAcceptedAt?: string | null;
  dataConsentVersion?: string | null;
  requiresStaffDataConsent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  staffInfo?: ProfileStaffInfoDto | null;
  studentInfo?: ProfileStudentInfoDto | null;
}

/** Payload to update current user basic info: PATCH /auth/me */
export interface UpdateMyProfileDto {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  province?: string;
  accountHandle?: string;
}

/** Payload to update current user's staff: PATCH /users/me/staff */
export interface UpdateMyStaffProfileDto {
  cccd_number?: string;
  ethnicity?: string;
  gender?: StaffGender;
  current_address?: string;
  cccd_issued_date?: string;
  cccd_issued_place?: string;
  birth_date?: string;
  university?: string;
  high_school?: string;
  specialization?: string;
  bank_account?: string;
  bank_qr_link?: string;
  personal_achievement_link?: string | null;
}

/** Payload to update current user's student: PATCH /auth/me/student */
export interface UpdateMyStudentProfileDto {
  full_name?: string;
  email?: string;
  school?: string;
  province?: string;
  birth_year?: number;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  status?: StudentStatus;
  gender?: StudentGender;
  goal?: string;
}
