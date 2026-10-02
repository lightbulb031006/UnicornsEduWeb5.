import type { StudentSelfClassItem } from "@/dtos/student.dto";
import { formatCurrency } from "@/lib/class.helpers";

/**
 * Helper format học phí dùng chung cho dashboard học sinh (`/student`) và trang
 * học phí riêng (`/student/tuition`).
 */

export function getClassStatusLabel(
  status?: StudentSelfClassItem["class"]["status"],
): string {
  if (status === "running") return "Đang mở";
  if (status === "ended") return "Đã kết thúc";
  return "—";
}

export function getTuitionSourceLabel(
  source?: StudentSelfClassItem["tuitionPackageSource"],
): string {
  if (source === "custom") return "Mức riêng";
  if (source === "class") return "Theo lớp";
  return "Chưa thiết lập";
}

export function getTuitionSourceClass(
  source?: StudentSelfClassItem["tuitionPackageSource"],
): string {
  if (source === "custom") {
    return "bg-primary/10 text-primary ring-primary/20";
  }
  if (source === "class") {
    return "bg-info/10 text-info ring-info/20";
  }
  return "bg-bg-tertiary text-text-secondary ring-border-default";
}

export function formatTuitionPerSession(value?: number | null): string {
  return value != null ? formatCurrency(value) : "Chưa thiết lập";
}

export function formatTuitionPackage(item: StudentSelfClassItem): string {
  if (
    item.effectiveTuitionPackageTotal != null &&
    item.effectiveTuitionPackageSession != null
  ) {
    return `${formatCurrency(item.effectiveTuitionPackageTotal)} / ${item.effectiveTuitionPackageSession} buổi`;
  }
  if (item.effectiveTuitionPackageTotal != null) {
    return formatCurrency(item.effectiveTuitionPackageTotal);
  }
  if (item.effectiveTuitionPackageSession != null) {
    return `${item.effectiveTuitionPackageSession} buổi`;
  }
  return "Không áp dụng";
}
