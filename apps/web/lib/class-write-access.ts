import { SALE_CS_HEAD_ROLE } from "@/lib/sale-cs-head-access";

/**
 * #274 — quyền tạo lớp / sửa Thông tin lớp theo role (khớp
 * `apps/api/src/class/class-write-field-policy.ts`). Web chỉ ẩn UI; backend
 * vẫn chặn 403 khi gửi trường ngoài quyền.
 *
 * - Admin: mọi phần (lịch, cách thu, trạng thái, không điểm danh…).
 * - Trưởng ban Đào tạo: thông tin lớp + gia sư + Quản lý lớp + lương gia sư.
 * - Trưởng phòng Sale & CSKH: thông tin lớp + học phí + học sinh.
 * - Kiêm cả hai: hợp hai phần.
 */
export type ClassWriteAccess = {
  isAdmin: boolean;
  /** Được tạo lớp và sửa Thông tin lớp (tên, khoá học, sĩ số). */
  canWriteClassInfo: boolean;
  /** Gia sư, Quản lý lớp, lương gia sư (trợ cấp, scale, % vận hành). */
  canEditTeachersAndPay: boolean;
  /** Học phí lớp + học sinh khi tạo lớp. */
  canEditTuitionAndStudents: boolean;
  /** Lịch học, cách thu học phí, trạng thái, không điểm danh, kết thúc/xoá lớp. */
  canEditAdminOnlyFields: boolean;
  /** Staff id của người dùng (để ẩn chính mình khỏi danh sách gia sư). */
  staffId: string | null;
};

export const TRAINING_HEAD_ROLE = "training_head" as const;

export function resolveClassWriteAccess(input: {
  isAdmin: boolean;
  staffRoles: readonly string[] | null | undefined;
  staffId?: string | null;
}): ClassWriteAccess {
  const roles = input.staffRoles ?? [];
  const isAdmin = input.isAdmin || roles.includes("admin");
  const isTrainingHead = roles.includes(TRAINING_HEAD_ROLE);
  const isSaleCsHead = roles.includes(SALE_CS_HEAD_ROLE);
  return {
    isAdmin,
    canWriteClassInfo: isAdmin || isTrainingHead || isSaleCsHead,
    canEditTeachersAndPay: isAdmin || isTrainingHead,
    canEditTuitionAndStudents: isAdmin || isSaleCsHead,
    canEditAdminOnlyFields: isAdmin,
    staffId: input.staffId ?? null,
  };
}

export const ADMIN_CLASS_WRITE_ACCESS: ClassWriteAccess = resolveClassWriteAccess({
  isAdmin: true,
  staffRoles: [],
});
