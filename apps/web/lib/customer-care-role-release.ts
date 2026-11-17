import type { ConfirmRequest } from "@/components/ui/ConfirmDialog";

/**
 * Tắt role CSKH = mọi học sinh người đó đang chăm sóc mất Người chăm sóc ngay
 * (CONTEXT.md «Người chăm sóc (học sinh)», follow-up 13/11 mục 2.1). Backend gỡ
 * `customer_care_service` trong cùng transaction với đổi role; UI chỉ hỏi xác
 * nhận trước, nói rõ số học sinh bị ảnh hưởng.
 */
export function isRemovingCustomerCareRole(
  currentRoles: readonly string[],
  nextRoles: Iterable<string>,
): boolean {
  if (!currentRoles.includes("customer_care")) return false;
  for (const role of nextRoles) {
    if (role === "customer_care") return false;
  }
  return true;
}

/**
 * Hộp xác nhận khi tắt role CSKH; `null` nếu chắc chắn không còn học sinh.
 * `studentCount = null` (không đếm được) vẫn hỏi, câu chữ không kèm số.
 */
export function buildCustomerCareReleaseConfirm(params: {
  staffName: string;
  studentCount: number | null;
}): ConfirmRequest | null {
  if (params.studentCount !== null && params.studentCount <= 0) return null;
  const name = params.staffName.trim() || "Nhân sự này";
  const students =
    params.studentCount === null
      ? "mọi học sinh người này đang chăm sóc"
      : `${params.studentCount} học sinh này`;
  const lead =
    params.studentCount === null
      ? `${name} có thể đang chăm sóc học sinh.`
      : `${name} đang chăm sóc ${params.studentCount} học sinh.`;
  return {
    title: "Tắt role CSKH?",
    description: `${lead} Tắt role CSKH thì ${students} mất Người chăm sóc ngay (chờ Trưởng phòng giao lại); bật lại role cũng không trả học sinh về. Buổi học đã ghi giữ nguyên hoa hồng.`,
    confirmLabel: "Tắt role và gỡ học sinh",
    cancelLabel: "Giữ nguyên",
    variant: "destructive",
  };
}

/** Toast sau khi lưu: báo số học sinh vừa mất Người chăm sóc (nếu có). */
export function formatCustomerCareReleasedToast(count: number): string | null {
  return count > 0 ? `${count} học sinh đã mất Người chăm sóc.` : null;
}
