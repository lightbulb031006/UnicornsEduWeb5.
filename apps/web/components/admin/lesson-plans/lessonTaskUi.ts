"use client";

import { createElement, type ReactNode } from "react";
import type {
  LessonPaymentStatus,
  LessonOutputStatus,
  LessonTaskPriority,
  LessonTaskStatus,
} from "@/dtos/lesson.dto";
import { ROLE_LABELS } from "@/lib/staff.constants";
import {
  formatVnDate,
  formatVnDateTime,
} from "@/lib/formatters";
export const LESSON_TASK_STATUS_LABELS: Record<LessonTaskStatus, string> = {
  pending: "Chưa bắt đầu",
  in_progress: "Đang làm",
  completed: "Hoàn thành",
  cancelled: "Hủy",
};

export const LESSON_TASK_PRIORITY_LABELS: Record<LessonTaskPriority, string> = {
  low: "Thấp",
  medium: "Vừa",
  high: "Cao",
};

export const LESSON_OUTPUT_STATUS_LABELS: Record<LessonOutputStatus, string> = {
  pending: "Chưa xong",
  completed: "Hoàn thành",
  cancelled: "Hủy",
};

export const LESSON_PAYMENT_STATUS_META = {
  pending: {
    label: "Chưa thanh toán",
    dotClassName: "bg-error",
    badgeClassName: "bg-error/15 text-error ring-error/25",
    pillClassName:
      "border border-error/25 bg-error/10 text-error shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
  paid: {
    label: "Đã thanh toán",
    dotClassName: "bg-success",
    badgeClassName: "bg-success/15 text-success ring-success/25",
    pillClassName:
      "border border-success/25 bg-success/10 text-success shadow-[inset_0_1px_0_color-mix(in_srgb,var(--ue-bg-surface)_35%,transparent)]",
  },
} satisfies Record<
  LessonPaymentStatus,
  {
    label: string;
    dotClassName: string;
    badgeClassName: string;
    pillClassName: string;
  }
>;

export const LESSON_PAYMENT_STATUS_LABELS: Record<LessonPaymentStatus, string> = {
  pending: LESSON_PAYMENT_STATUS_META.pending.label,
  paid: LESSON_PAYMENT_STATUS_META.paid.label,
};

export const DEFAULT_BULK_LESSON_PAYMENT_STATUS: LessonPaymentStatus = "paid";

export function renderLessonPaymentStatusOptionLabel(
  status: LessonPaymentStatus,
): ReactNode {
  const meta = LESSON_PAYMENT_STATUS_META[status];

  return createElement(
    "span",
    {
      className: `inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pillClassName}`,
    },
    createElement("span", {
      className: `size-2 rounded-full ${meta.dotClassName}`,
      "aria-hidden": true,
    }),
    meta.label,
  );
}

export const LESSON_PAYMENT_STATUS_OPTIONS = (
  [
    { value: "pending", label: renderLessonPaymentStatusOptionLabel("pending") },
    { value: "paid", label: renderLessonPaymentStatusOptionLabel("paid") },
  ] as const
).map((option) => ({
  value: option.value,
  label: option.label,
}));

export function getLessonPaymentStatusLabel(
  status: LessonPaymentStatus | string | null | undefined,
): string {
  if (status === "pending" || status === "paid") {
    return LESSON_PAYMENT_STATUS_META[status].label;
  }

  return status ? String(status) : "—";
}

export function formatLessonDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return formatVnDateTime(parsed);
}

export function formatLessonDateOnly(value: string | null | undefined) {
  if (!value) return "Chưa đặt";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return formatVnDate(parsed);
}

export function lessonTaskStatusChipClass(status: LessonTaskStatus) {
  if (status === "completed")
    return "bg-success/15 text-success ring-success/25";
  if (status === "in_progress") return "bg-info/15 text-info ring-info/25";
  if (status === "cancelled") return "bg-error/15 text-error ring-error/25";
  return "bg-warning/15 text-warning ring-warning/25";
}

export function lessonTaskPriorityChipClass(priority: LessonTaskPriority) {
  if (priority === "high") return "bg-error/12 text-error ring-error/20";
  if (priority === "medium")
    return "bg-primary/12 text-primary ring-primary/20";
  return "bg-bg-secondary text-text-secondary ring-border-default";
}

export function lessonOutputStatusChipClass(status: LessonOutputStatus) {
  if (status === "completed")
    return "bg-success/15 text-success ring-success/25";
  if (status === "cancelled") return "bg-error/15 text-error ring-error/25";
  return "bg-warning/15 text-warning ring-warning/25";
}

export function lessonPaymentStatusChipClass(status: LessonPaymentStatus) {
  return LESSON_PAYMENT_STATUS_META[status].badgeClassName;
}

export function formatLessonStaffRoleLabel(roles: string[]) {
  if (roles.length === 0) {
    return "Chưa có vai trò";
  }

  return roles
    .slice(0, 2)
    .map((role) => ROLE_LABELS[role] ?? role)
    .join(" · ");
}

export function formatLessonStaffStatusLabel(status: "active" | "inactive") {
  return status === "active" ? "Hoạt động" : "Ngừng";
}
