import type { BonusPaymentStatus } from "@/dtos/bonus.dto";
import type { StaffStatus } from "@/dtos/staff.dto";

/**
 * Quản lý đội Sale & CSKH của Trưởng phòng Sale & CSKH (#271). Backend đã lọc
 * field nhạy cảm: không email, SĐT, CCCD, ngày sinh, địa chỉ, ngân hàng, lương.
 */

export type SaleCsTeamRole = "sale" | "customer_care";

/** `members`: thành viên đội. `candidates`: nhân sự khác để bật role Sale/CSKH. */
export type SaleCsTeamScope = "members" | "candidates";

export interface SaleCsTeamPermissions {
  canEditRoles: boolean;
  canLockAccount: boolean;
  canEditProfile: boolean;
  /** Thêm/sửa/xoá/sao/ảnh thành tích (nhân sự dưới cấp). */
  canEditAchievements: boolean;
  /** Đổi tên đăng nhập — cùng phạm vi khoá tài khoản (16/11). */
  canEditAccountHandle: boolean;
}

export interface SaleCsTeamMember {
  id: string;
  fullName: string;
  lastName: string | null;
  firstName: string | null;
  avatarUrl: string | null;
  roles: string[];
  status: StaffStatus;
  /** `null` khi nhân sự chưa có tài khoản đăng nhập. */
  accountLocked: boolean | null;
  university: string | null;
  highSchool: string | null;
  /** % mặc định của CSKH (phân số 0–0.99), chỉ đọc; `null` nếu không phải CSKH. */
  customerCareDefaultProfitPercent: number | null;
  managedBy: { id: string; fullName: string } | null;
  customerCareStudentCount: number;
  /** Tỉnh/TP — cột «Tỉnh» ở danh sách `/staff/staffs`. */
  province: string | null;
  /** Số thành tích — nút «Xem thành tích» ở danh sách. */
  achievementCount: number;
  permissions: SaleCsTeamPermissions;
}

/**
 * Chi tiết thành viên (trang `/staff/staffs/:id`, bố cục như admin): thêm
 * handle, link Google Meet. Không có email, SĐT, CCCD, ngày sinh, địa chỉ,
 * ngân hàng, QR (#270).
 */
export interface SaleCsTeamMemberDetail extends SaleCsTeamMember {
  accountHandle: string | null;
  googleMeetLink: string | null;
}

export interface SaleCsTeamPage<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export interface SaleCsTeamListParams {
  page: number;
  limit: number;
  search?: string;
  role?: "" | SaleCsTeamRole;
  status?: "" | StaffStatus;
  scope?: SaleCsTeamScope;
}

/** Trợ cấp sale — không có số tiền / trạng thái thanh toán. */
export interface SaleCsTeamSaleAllowance {
  id: string;
  month: string;
  note: string | null;
  createdAt: string;
  student: { id: string; fullName: string } | null;
}

export interface SaleCsTeamBonus {
  id: string;
  workType: string;
  amount: number;
  status: BonusPaymentStatus;
  note: string | null;
  month: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** ISO thời điểm tạo. */
  createdAt: string;
}

export interface UpdateSaleCsTeamRolesPayload {
  roles: SaleCsTeamRole[];
}

export interface SaleCsTeamRolesResult {
  id: string;
  roles: string[];
  /** Số học sinh vừa mất Người chăm sóc do tắt role CSKH (follow-up 13/11 mục 2.1). */
  releasedCustomerCareStudentCount: number;
}

export interface UpdateSaleCsTeamAccountStatusPayload {
  locked: boolean;
}

export interface SaleCsTeamAccountStatusResult {
  id: string;
  accountLocked: boolean;
}

/** Hồ sơ chuyên môn — chỉ họ tên + trường. */
export interface UpdateSaleCsTeamProfilePayload {
  lastName?: string;
  firstName?: string;
  university?: string;
  highSchool?: string;
}
