/** Tên hiển thị của Giáo án; role `lesson_plan` và dữ liệu giữ nguyên. */
export const LESSON_PLAN_LABEL = "Giáo án học sinh giỏi";

/** Nhãn hiển thị cho role nhân sự (dùng ở list và detail). */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Giáo viên",
  assistant: "Trợ lí",
  lesson_plan: LESSON_PLAN_LABEL,
  lesson_plan_head: "Trưởng giáo án",
  accountant: "Kế toán",
  accountant_income: "Kế toán thu",
  accountant_expense: "Kế toán chi",
  communication: "Truyền thông",
  technical: "Kỹ thuật",
  customer_care: "CSKH",
  training: "Đào Tạo",
};
