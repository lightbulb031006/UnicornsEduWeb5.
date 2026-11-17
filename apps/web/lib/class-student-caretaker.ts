import type { AdminShellAccess } from "@/lib/admin-shell-access";
import {
  buildStaffRoleDetailHref,
  type AdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import type { ClassStudentCaretaker } from "@/dtos/class.dto";

export function resolveClassStudentCaretakerHref(options: {
  routeBase: AdminLikeRouteBase;
  caretaker: ClassStudentCaretaker | null | undefined;
  access: Pick<
    AdminShellAccess,
    "isAdmin" | "isAssistant" | "isAccountantExpense" | "isCustomerCare"
  >;
  viewerStaffId?: string | null;
}): string | null {
  const caretakerId = options.caretaker?.id?.trim();
  if (!caretakerId) {
    return null;
  }

  if (options.access.isAdmin || options.access.isAccountantExpense) {
    return buildStaffRoleDetailHref(
      options.routeBase,
      "customer_care",
      caretakerId,
    );
  }

  // #267: admin shell chặn Trưởng phòng Sale & CSKH khỏi
  // `/admin/customer_care_detail/*` (gate đẩy về `/admin/students`). Trang chi
  // tiết CSKH của Trưởng phòng nằm ở staff shell (#271).
  if (options.access.isAssistant) {
    return buildStaffRoleDetailHref("/staff", "customer_care", caretakerId);
  }

  const viewerStaffId = options.viewerStaffId?.trim();
  if (
    options.access.isCustomerCare &&
    viewerStaffId &&
    viewerStaffId === caretakerId
  ) {
    return options.routeBase === "/staff"
      ? "/staff/customer-care-detail"
      : buildStaffRoleDetailHref(options.routeBase, "customer_care", caretakerId);
  }

  return null;
}

/**
 * Link trang hồ sơ gia sư từ card «Gia sư phụ trách». Trang nhân sự
 * đầy đủ (`/admin/staffs/:id`, `/staff/staffs/:id`) chỉ cho Admin và Kế toán chi;
 * các trưởng chỉ xem được bản giới hạn theo phạm vi ở `/staff/staffs/:id`, gia
 * sư lớp có thể nằm ngoài phạm vi đó nên role khác trả `null` (card không bấm
 * được) — trước đây card luôn đẩy tới
 * `/admin/staffs/:id` và gate đưa Trưởng phòng Sale & CSKH về `/admin/students`.
 */
export function resolveClassTeacherHref(options: {
  routeBase: AdminLikeRouteBase;
  teacherId: string | null | undefined;
  access: Pick<AdminShellAccess, "isAdmin" | "isAccountantExpense">;
  /**
   * Trưởng ban Đào tạo: gia sư lớp luôn trong phạm vi hồ sơ giới hạn
   * `/staff/staffs/:id` (#270) — Trưởng ban không vào admin shell.
   */
  viewerIsTrainingHead?: boolean;
}): string | null {
  const teacherId = options.teacherId?.trim();
  if (!teacherId) {
    return null;
  }
  const path = `/staffs/${encodeURIComponent(teacherId)}`;
  if (options.access.isAdmin) {
    // Admin luôn vào được admin shell, kể cả khi đang mở lớp từ staff shell.
    return `/admin${path}`;
  }
  if (options.access.isAccountantExpense) {
    return `${options.routeBase}${path}`;
  }
  if (options.viewerIsTrainingHead) {
    return `/staff${path}`;
  }
  return null;
}
