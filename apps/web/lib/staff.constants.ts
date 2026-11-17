/** Tên workspace task/output (sản phẩm công việc của Ban Chuyên môn). Chỉ IT. */
export const LESSON_PLAN_LABEL = "Giáo án học sinh giỏi";

/** Nhãn role `lesson_plan` (Ban Chuyên môn). Enum và dữ liệu giữ nguyên. */
export const LESSON_PLAN_ROLE_LABEL = "Ban Chuyên môn";

/** Nhãn role `lesson_plan_head`. */
export const LESSON_PLAN_HEAD_ROLE_LABEL = "Trưởng ban Chuyên môn";

/** Nhãn hiển thị cho role nhân sự (dùng ở list và detail). */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Giáo viên",
  sale_customer_care_head: "Trưởng phòng Sale & CSKH",
  lesson_plan: LESSON_PLAN_ROLE_LABEL,
  lesson_plan_head: LESSON_PLAN_HEAD_ROLE_LABEL,
  accountant_income: "Kế toán thu",
  accountant_expense: "Kế toán chi",
  communication: "Truyền thông",
  technical: "Kỹ thuật",
  customer_care: "CSKH",
  training: "Đào Tạo",
  training_head: "Trưởng ban Đào tạo",
  sale: "Sale",
};
